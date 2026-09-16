// チヌクエスト2 対人戦サーバー（Cloudflare Workers + Durable Objects）。
//
// 役割は「Firebase の ID トークンを検証して uid を確定し、部屋コードで
// Durable Object へ振り分ける」だけ。ゲーム進行は cloudflare/room.js
// （PvpRoomDO）→ cloudflare/roomCore.js。
//
// ルート:
//   GET  /health                      稼働確認
//   POST /api/rooms/{code}/start      ホストが開始設定（参加者・デッキ）を送る
//   GET  /ws?room={code}&token={jwt}  参加者の WebSocket
//
// ログイン画面・ロビー（部屋作成／参加／招待）は今まで通り Firebase
// （Auth + Firestore）のまま。ここへ来るのは「対戦開始」以降だけ。
import { verifyFirebaseIdToken } from './firebaseAuth.js';

export { PvpRoomDO } from './room.js';

const ROOM_CODE = /^[0-9A-Z]{3,8}$/;

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && (allowed.length === 0 || allowed.includes(origin))) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  if (!origin || allowed.length === 0) return true;
  return allowed.includes(origin);
}

function json(data, status, extraHeaders = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...extraHeaders } });
}

/**
 * 本人確認。通常は Firebase ID トークン（Authorization: Bearer / ?token=）。
 * ローカル開発（wrangler dev + Firebase エミュレータ）では本物の署名鍵で
 * 検証できないので、DEV_ALLOW_UNVERIFIED_UID=1 の時だけ `?uid=` /
 * `x-dev-uid` を信用する。本番の vars には絶対に入れないこと。
 */
async function authenticate(request, env, url) {
  if (env.DEV_ALLOW_UNVERIFIED_UID === '1') {
    const devUid = url.searchParams.get('uid') || request.headers.get('x-dev-uid');
    if (devUid && /^[A-Za-z0-9_-]{1,128}$/.test(devUid)) return { uid: devUid };
  }
  const bearer = request.headers.get('Authorization') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : url.searchParams.get('token');
  if (!token) throw new Error('ログインが必要です');
  return verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID);
}

// デッキ40枚×最大4人にカスタムカードの画像（data URL）が混ざり得るので上限は広め。
async function readJson(request, limit = 8_000_000) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) { await reader.cancel(); throw new Error('リクエストが大きすぎます'); }
    text += decoder.decode(part.value, { stream: true });
  }
  text += decoder.decode();
  const body = JSON.parse(text || '{}');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('本文が不正です');
  return body;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (path === '/health') return json({ ok: true, service: 'chinu-quest2-pvp' }, 200, cors);
    if (!originAllowed(request, env)) return json({ error: 'Origin not allowed' }, 403, cors);

    const startMatch = /^\/api\/rooms\/([^/]+)\/start$/.exec(path);
    if (startMatch) {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
      const code = decodeURIComponent(startMatch[1]).toUpperCase();
      if (!ROOM_CODE.test(code)) return json({ error: '部屋コードが不正です' }, 400, cors);
      let uid;
      try { ({ uid } = await authenticate(request, env, url)); } catch (error) { return json({ error: error?.message || '認証に失敗しました' }, 401, cors); }
      let body;
      try { body = await readJson(request); } catch (error) { return json({ error: error?.message || '本文が不正です' }, 400, cors); }
      body.roomCode = code;
      const stub = env.ROOM.get(env.ROOM.idFromName(code), { locationHint: 'apac' });
      const response = await stub.fetch('https://room/init', {
        method: 'POST',
        headers: { 'x-uid': uid, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors)) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    }

    const statusMatch = /^\/api\/rooms\/([^/]+)\/status$/.exec(path);
    if (statusMatch) {
      const code = decodeURIComponent(statusMatch[1]).toUpperCase();
      if (!ROOM_CODE.test(code)) return json({ error: '部屋コードが不正です' }, 400, cors);
      try { await authenticate(request, env, url); } catch (error) { return json({ error: error?.message || '認証に失敗しました' }, 401, cors); }
      const stub = env.ROOM.get(env.ROOM.idFromName(code), { locationHint: 'apac' });
      const response = await stub.fetch('https://room/status');
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors)) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    }

    if (path === '/ws') {
      if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('WebSocket required', { status: 426 });
      }
      const code = (url.searchParams.get('room') || '').trim().toUpperCase();
      if (!ROOM_CODE.test(code)) return json({ error: '部屋コードが不正です' }, 400, cors);
      let uid;
      try { ({ uid } = await authenticate(request, env, url)); } catch (error) { return json({ error: error?.message || '認証に失敗しました' }, 401, cors); }
      const headers = new Headers(request.headers);
      headers.set('x-uid', uid);
      const stub = env.ROOM.get(env.ROOM.idFromName(code), { locationHint: 'apac' });
      return stub.fetch(new Request('https://room/ws', { method: 'GET', headers }));
    }

    return json({ error: 'Not found' }, 404, cors);
  },
};
