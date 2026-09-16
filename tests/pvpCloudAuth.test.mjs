// cloudflare/firebaseAuth.js（Firebase IDトークンのRS256検証）の検証。
// 自前で鍵ペアを作り、Googleの公開鍵エンドポイントを fetch の差し替えで
// 模倣する。署名・aud・iss・exp のどれが欠けても通らないことを確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFirebaseIdToken, resetFirebaseKeyCache } from '../cloudflare/firebaseAuth.js';

const PROJECT = 'chinuquest-test';

function b64url(bytes) {
  const text = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeSigner() {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  const kid = 'kid-1';
  const fetchImpl = async () => new Response(JSON.stringify({ keys: [{ kty: 'RSA', kid, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' }] }), {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
  const sign = async (payload, { alg = 'RS256', keyId = kid } = {}) => {
    const header = b64url(JSON.stringify({ alg, kid: keyId, typ: 'JWT' }));
    const body = b64url(JSON.stringify(payload));
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, new TextEncoder().encode(`${header}.${body}`)));
    return `${header}.${body}.${b64url(signature)}`;
  };
  return { fetchImpl, sign };
}

function claims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'uid-123', iat: now - 10, exp: now + 3600, ...overrides };
}

test('正しく署名されたIDトークンから uid を取り出す', async () => {
  resetFirebaseKeyCache();
  const { fetchImpl, sign } = await makeSigner();
  const result = await verifyFirebaseIdToken(await sign(claims()), PROJECT, { fetchImpl });
  assert.deepEqual(result, { uid: 'uid-123' });
});

test('署名・aud・iss・期限のどれが壊れても拒否する', async () => {
  resetFirebaseKeyCache();
  const { fetchImpl, sign } = await makeSigner();
  const other = await makeSigner(); // 別の鍵で署名したトークン
  await assert.rejects(verifyFirebaseIdToken(await other.sign(claims()), PROJECT, { fetchImpl }), /署名/);
  await assert.rejects(verifyFirebaseIdToken(await sign(claims({ aud: 'someone-else' })), PROJECT, { fetchImpl }), /プロジェクト/);
  await assert.rejects(verifyFirebaseIdToken(await sign(claims({ iss: 'https://evil.example/x' })), PROJECT, { fetchImpl }), /発行者/);
  await assert.rejects(verifyFirebaseIdToken(await sign(claims({ exp: Math.floor(Date.now() / 1000) - 5 })), PROJECT, { fetchImpl }), /有効期限/);
  await assert.rejects(verifyFirebaseIdToken(await sign(claims({ sub: '' })), PROJECT, { fetchImpl }), /uid/);
  await assert.rejects(verifyFirebaseIdToken(await sign(claims(), { alg: 'none' }), PROJECT, { fetchImpl }), /アルゴリズム/);
  await assert.rejects(verifyFirebaseIdToken('not-a-jwt', PROJECT, { fetchImpl }), /形式/);
});

test('未知の kid は公開鍵を取り直してから判定する', async () => {
  resetFirebaseKeyCache();
  const { fetchImpl, sign } = await makeSigner();
  let fetches = 0;
  const counting = async (...args) => { fetches += 1; return fetchImpl(...args); };
  await verifyFirebaseIdToken(await sign(claims()), PROJECT, { fetchImpl: counting });
  assert.equal(fetches, 1);
  await verifyFirebaseIdToken(await sign(claims()), PROJECT, { fetchImpl: counting });
  assert.equal(fetches, 1, '有効期限内はキャッシュを使う');
  await assert.rejects(verifyFirebaseIdToken(await sign(claims(), { keyId: 'kid-unknown' }), PROJECT, { fetchImpl: counting }), /署名鍵/);
  assert.equal(fetches, 2, '未知の kid で1回だけ取り直す');
});
