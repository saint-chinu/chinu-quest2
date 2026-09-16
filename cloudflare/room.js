// 対人戦の部屋 = Durable Object 1つ。中身のロジックは roomCore.js に全部
// あり、ここは「WebSocket ⇔ core」「storage ⇔ core」の接着だけを担う。
//
// - 部屋コード（Firestore の pvpRooms/{code} と同じ3桁）を idFromName に
//   使うので、同じコードなら必ず同じ DO に着く（ディレクトリ不要）。
// - WebSocket は hibernation API ではなく通常の accept() で持つ。対戦中の
//   Game は Promise チェーンとタイマーで進行しており、休止すると消えて
//   しまう。接続が1本でも残る間はメモリに留めておきたい（試合は長くても
//   1時間程度、部屋数も少ない）。
// - 再デプロイや障害で DO が再起動した時は、Game が最後に通知した
//   「安全地点」（サイコロ／スペルを選べる瞬間の exportState）から再開する。
import { DurableObject } from 'cloudflare:workers';
import { PvpRoomCore, normalizeRoomConfig } from './roomCore.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

// 終了した部屋の保存データを消すまでの猶予（結果表示のための再接続を許す）。
const FINISHED_RETENTION_MS = 10 * 60 * 1000;
// 誰も接続していない対戦中の部屋を諦めるまでの時間（全員が閉じた＝放棄）。
const ABANDON_AFTER_MS = 30 * 60 * 1000;

export class PvpRoomDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = null;
    this.sockets = new Map(); // WebSocket → uid
    this.socketByUid = new Map(); // uid → WebSocket
    this.lastActivityAt = Date.now();
  }

  // ── core との接着 ────────────────────────────────────────────────
  _io() {
    return {
      send: (uid, message) => {
        const socket = this.socketByUid.get(uid);
        if (!socket) return;
        try { socket.send(JSON.stringify(message)); } catch { /* 切断直後など */ }
      },
      persist: (record) => {
        this.ctx.waitUntil(this.ctx.storage.put('record', record));
      },
      onFinished: (result) => {
        this.ctx.waitUntil((async () => {
          await this.ctx.storage.put('finished', { result, at: Date.now() });
          await this.ctx.storage.setAlarm(Date.now() + FINISHED_RETENTION_MS);
        })());
      },
      log: (message) => { if (this.env.PVP_DEBUG_LOG === '1') console.log(`[room ${this.core?.config?.roomCode}] ${message}`); },
    };
  }

  /** メモリに core が無ければ storage から再開を試みる。 */
  async _ensureCore() {
    if (this.core) return this.core;
    const finished = await this.ctx.storage.get('finished');
    const record = await this.ctx.storage.get('record');
    if (!record) return null;
    const core = new PvpRoomCore(this._io());
    if (finished) {
      core.config = record.config;
      core.status = 'finished';
      core.finishResult = finished.result;
      this.core = core;
      return core;
    }
    try {
      core.resume(record.config, record.snapshot, { waitCutRate: record.waitCutRate || 0 });
    } catch (error) {
      console.warn('部屋の再開に失敗しました', error);
      await this.ctx.storage.deleteAll();
      return null;
    }
    this.core = core;
    return core;
  }

  // ── HTTP（Worker からの内部呼び出し） ─────────────────────────────
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') return this._handleInit(request);
    if (url.pathname === '/status') return this._handleStatus();
    if (url.pathname === '/ws') return this._handleWebSocket(request);
    return new Response('Not found', { status: 404 });
  }

  async _handleInit(request) {
    const hostUid = request.headers.get('x-uid') || '';
    let config;
    try {
      config = normalizeRoomConfig(await request.json(), { hostUid });
    } catch (error) {
      return json({ error: error?.message || '開始設定が不正です' }, 400);
    }
    const existing = await this._ensureCore();
    if (existing && existing.status === 'battling') {
      const busy = existing.config.playerConfigs.some((p) => p.uid && this.socketByUid.has(p.uid));
      if (busy && existing.config.hostUid !== hostUid) return json({ error: 'その部屋コードは対戦中です' }, 409);
      existing.finish({ reason: 'replaced' });
    }
    // 前の試合の残骸（接続・保存データ）を片付けてから新しい試合を始める。
    for (const socket of this.sockets.keys()) { try { socket.close(1000, 'replaced'); } catch { /* noop */ } }
    this.sockets.clear();
    this.socketByUid.clear();
    this.core?.destroy();
    this.core = null;
    await this.ctx.storage.deleteAll();
    const core = new PvpRoomCore(this._io());
    try {
      core.start(config);
    } catch (error) {
      console.error('部屋の開始に失敗しました', error);
      return json({ error: '部屋を開始できませんでした' }, 500);
    }
    this.core = core;
    this.lastActivityAt = Date.now();
    await this.ctx.storage.put('record', { config, snapshot: null, waitCutRate: 0, savedAt: Date.now() });
    await this.ctx.storage.setAlarm(Date.now() + ABANDON_AFTER_MS);
    return json({ ok: true, room: core.roomSummary() });
  }

  async _handleStatus() {
    const core = await this._ensureCore();
    return json({
      status: core?.status ?? 'idle',
      online: core ? [...this.socketByUid.keys()].length : 0,
      turnCount: core?.game?.turnCount ?? 0,
    });
  }

  async _handleWebSocket(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const uid = request.headers.get('x-uid') || '';
    const core = await this._ensureCore();
    if (!core) return json({ error: 'その部屋は開始していないか、終了しています' }, 404);
    if (!core.isParticipant(uid)) return json({ error: 'この部屋の参加者ではありません' }, 403);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    // 同じ uid の古い接続（再読込前のタブ等）は置き換える。
    const previous = this.socketByUid.get(uid);
    if (previous) {
      this.sockets.delete(previous);
      try { previous.close(1000, 'superseded'); } catch { /* noop */ }
    }
    this.sockets.set(server, uid);
    this.socketByUid.set(uid, server);
    this.lastActivityAt = Date.now();
    server.addEventListener('message', (event) => {
      this.lastActivityAt = Date.now();
      let message;
      try { message = JSON.parse(typeof event.data === 'string' ? event.data : ''); } catch { return; }
      try { core.handleMessage(uid, message); } catch (error) { console.warn('メッセージ処理に失敗', error); }
    });
    const onGone = () => {
      if (this.sockets.get(server) !== uid) return; // 置き換え済み
      this.sockets.delete(server);
      if (this.socketByUid.get(uid) === server) this.socketByUid.delete(uid);
      try { core.disconnect(uid); } catch (error) { console.warn('切断処理に失敗', error); }
      if (this.sockets.size === 0 && core.status === 'battling') {
        this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + ABANDON_AFTER_MS));
      }
    };
    server.addEventListener('close', onGone);
    server.addEventListener('error', onGone);
    try {
      core.connect(uid);
    } catch (error) {
      onGone();
      try { server.close(1008, error?.message || 'rejected'); } catch { /* noop */ }
      return json({ error: error?.message || '接続できません' }, 403);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  /** 終了後の保存データ掃除、または放棄された対戦の打ち切り。 */
  async alarm() {
    const finished = await this.ctx.storage.get('finished');
    if (finished) {
      if (this.sockets.size === 0) {
        this.core?.destroy();
        this.core = null;
        await this.ctx.storage.deleteAll();
      } else {
        await this.ctx.storage.setAlarm(Date.now() + FINISHED_RETENTION_MS);
      }
      return;
    }
    if (this.sockets.size === 0 && Date.now() - this.lastActivityAt >= ABANDON_AFTER_MS - 1000) {
      if (this.core?.status === 'battling') this.core.finish({ reason: 'abandoned' });
      this.core?.destroy();
      this.core = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + ABANDON_AFTER_MS);
  }
}
