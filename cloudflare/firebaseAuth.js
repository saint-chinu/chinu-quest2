// Firebase Authentication の ID トークン検証（Cloudflare Worker 用、依存なし）。
//
// ログインは今まで通り Firebase（メール/パスワード or 匿名）で行い、対戦
// サーバーへは `auth.currentUser.getIdToken()` の JWT を渡す。ここでは
// Google の公開鍵（JWK）で RS256 署名を検証し、iss / aud / exp を確認して
// uid（sub）を取り出す。Firebase Admin SDK は Worker で動かないので、
// 検証手順を自前で実装している（公式ドキュメント「IDトークンを検証する
// (サードパーティのJWTライブラリを使用)」の条件と同じ）。
//
// 公開鍵は数時間ごとにローテーションされる。Cache-Control の max-age に
// 従ってモジュール内にキャッシュし、未知の kid が来た時だけ取り直す。
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let keyCache = { keys: new Map(), expiresAt: 0 };

function base64UrlDecode(text) {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJsonSegment(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
}

async function loadKeys(fetchImpl, force = false) {
  const now = Date.now();
  if (!force && keyCache.keys.size > 0 && now < keyCache.expiresAt) return keyCache.keys;
  const response = await fetchImpl(JWK_URL, { cf: { cacheTtl: 3600 } });
  if (!response.ok) throw new Error(`公開鍵の取得に失敗しました (${response.status})`);
  const body = await response.json();
  const keys = new Map();
  for (const jwk of body.keys || []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    keys.set(jwk.kid, key);
  }
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') || '')?.[1]) || 3600;
  keyCache = { keys, expiresAt: now + Math.max(60, maxAge) * 1000 };
  return keys;
}

/**
 * 検証済みなら `{ uid }` を返し、それ以外は Error を投げる。
 * `fetchImpl` はテスト用の差し替え口。
 */
export async function verifyFirebaseIdToken(token, projectId, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (typeof token !== 'string' || token.split('.').length !== 3) throw new Error('IDトークンの形式が不正です');
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID が未設定です');
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  const header = decodeJsonSegment(headerB64);
  const payload = decodeJsonSegment(payloadB64);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('IDトークンのアルゴリズムが不正です');
  let keys = await loadKeys(fetchImpl);
  if (!keys.has(header.kid)) keys = await loadKeys(fetchImpl, true);
  const key = keys.get(header.kid);
  if (!key) throw new Error('IDトークンの署名鍵が見つかりません');
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, base64UrlDecode(signatureB64), data);
  if (!valid) throw new Error('IDトークンの署名が一致しません');
  const nowSec = Math.floor(now / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) throw new Error('IDトークンの有効期限が切れています');
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) throw new Error('IDトークンの発行時刻が不正です');
  if (payload.aud !== projectId) throw new Error('IDトークンの対象プロジェクトが一致しません');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('IDトークンの発行者が一致しません');
  const uid = typeof payload.sub === 'string' ? payload.sub : '';
  if (!uid || uid.length > 128) throw new Error('IDトークンのuidが不正です');
  return { uid };
}

/** テスト用: 鍵キャッシュを捨てる。 */
export function resetFirebaseKeyCache() {
  keyCache = { keys: new Map(), expiresAt: 0 };
}
