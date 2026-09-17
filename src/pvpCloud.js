// 対人戦（PvP）の Cloudflare 版クライアント。
//
// サーバー（cloudflare/roomCore.js）が唯一の Game を持ち、参加者全員
// （ホスト含む）はこの WebSocket 経由で「公開状態・自分の手札・演出／質問
// イベント」を受け取り、「サイコロ／スペル」「質問の回答」「演出のACK」を
// 送るだけの薄いクライアントになる。旧 Firestore 版のゲスト（src/pvp.js
// の GuestHostListener / GuestActionSender）と同じ意味論なので、main.js の
// pvpGuestHandlers / applyPvpPublicState をそのまま流用できる。
//
// 有効化: ビルド時に VITE_PVP_SERVER_URL（例 https://chinu-quest2-pvp.xxx.workers.dev）
// を与える。未設定ならホストは従来の Firestore 中継で対戦を始める。
// ゲストは部屋文書の engineUrl（ホストが書く）を優先するので、ホストだけが
// 新ビルドでも参加者はつながる。
import { auth, firebaseReady } from './firebase.js';
import { PvpContiguousAckTracker } from './pvpQueue.js';

// 演出イベント（回答を返さないもの）の再生が、この時間を過ぎても終わらなければ
// 「詰まり」とみなして飛ばし、次のイベントへ進む。画像・音声が GitHub Pages 等から
// 届かない／tween が解けない等、原因が何であれ盤面全体を止めないための番犬。
// どのイベントで詰まったかはサーバーへ `clientStall` として送り、Worker のログで
// 追える。質問（wantValue）には適用しない（人が考える時間はサーバー側で管理）。
export const PLAYBACK_STALL_MS = 12000;

export function pvpCloudServerUrl() {
  const raw = import.meta.env?.VITE_PVP_SERVER_URL;
  return typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
}

export function pvpCloudEnabled() {
  return !!pvpCloudServerUrl();
}

/** Firebase の ID トークン（サーバー側で署名検証して uid を取り出す）。 */
async function idToken() {
  if (!firebaseReady || !auth?.currentUser) throw new Error('ログイン状態を確認できませんでした');
  return auth.currentUser.getIdToken();
}

function isLocalDev(serverUrl) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(serverUrl);
}

/**
 * ホスト専用: 開始設定（参加者・デッキ・CPU・同盟）をサーバーへ送って
 * 部屋の Game を起動する。成功後にロビー側で status:'battling' を書けば、
 * 参加者は connectCloudPvp で合流できる。
 */
export async function startCloudPvpRoom(serverUrl, roomCode, config, { uid } = {}) {
  const url = new URL(`${serverUrl}/api/rooms/${encodeURIComponent(roomCode)}/start`);
  const headers = { 'Content-Type': 'application/json' };
  if (isLocalDev(serverUrl) && uid) {
    url.searchParams.set('uid', uid);
  } else {
    headers.Authorization = `Bearer ${await idToken()}`;
  }
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(config) });
  let body = null;
  try { body = await response.json(); } catch { /* 本文なし */ }
  if (!response.ok) throw new Error(body?.error || `対戦サーバーが応答しませんでした (${response.status})`);
  return body;
}

/**
 * 参加者の常時接続。切れたら指数バックオフで再接続し、サーバーは再接続時に
 * 完全な状態＋未ACKイベントを welcome で送り直す（旧 Firestore 版の
 * ackedThrough 復元と同じ）。
 *
 * handlers: main.js の pvpGuestHandlers（type → prompt関数）。
 * callbacks:
 *   onWelcome({playerId, room})  接続／再接続のたび
 *   onState(publicState)         差分マージ済みの公開状態
 *   onHand(hand)                 自分の手札
 *   onFinished(result)           決着／終了
 *   onStatus(text|null)          接続状態の表示用（切断中など）
 *   onNotice(text)               サーバーからの通知（AI代行への切替など）
 *   onPlaybackStall({type,id})   演出が PLAYBACK_STALL_MS 以内に終わらず飛ばした時
 *   onFastForward()              未回答の質問をサーバーが打ち切った時
 */
export class CloudPvpConnection {
  constructor(serverUrl, roomCode, uid, handlers, callbacks = {}) {
    this.serverUrl = serverUrl;
    this.roomCode = roomCode;
    this.uid = uid;
    this.handlers = handlers;
    this.callbacks = callbacks;
    this.socket = null;
    this.destroyed = false;
    this.state = null;
    this.playerId = null;
    this.room = null;
    this.queue = [];
    this.pumping = false;
    this.tracker = new PvpContiguousAckTracker();
    this.currentEventId = null;
    this.lastInteractiveAnswer = null;
    this.retryMs = 500;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.stallMs = Number(callbacks.stallMs) > 0 ? Number(callbacks.stallMs) : PLAYBACK_STALL_MS;
    this._onVisible = () => {
      // モバイルはバックグラウンドで接続が切れやすい。前面復帰の瞬間に再接続する。
      if (!document.hidden && !this.destroyed && (!this.socket || this.socket.readyState > 1)) this._connect();
    };
    document.addEventListener('visibilitychange', this._onVisible);
  }

  async _socketUrl() {
    const url = new URL(`${this.serverUrl}/ws`);
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
    url.searchParams.set('room', this.roomCode);
    if (isLocalDev(this.serverUrl)) url.searchParams.set('uid', this.uid);
    else url.searchParams.set('token', await idToken());
    return url.toString();
  }

  async connect() {
    await this._connect();
    return this;
  }

  async _connect() {
    if (this.destroyed || (this.socket && this.socket.readyState <= 1)) return;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    let url;
    try {
      url = await this._socketUrl();
    } catch (error) {
      this.callbacks.onStatus?.(error?.message || '接続できませんでした');
      this._scheduleReconnect();
      return;
    }
    if (this.destroyed) return;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.retryMs = 500;
      this.callbacks.onStatus?.(null);
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => { try { socket.send(JSON.stringify({ t: 'ping' })); } catch { /* noop */ } }, 20000);
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      this._handleMessage(message);
    });
    const onGone = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      if (this.destroyed || this.finished) return;
      this.callbacks.onStatus?.('対戦サーバーへ再接続しています…');
      this._scheduleReconnect();
    };
    socket.addEventListener('close', onGone);
    socket.addEventListener('error', onGone);
  }

  _scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this._connect();
    }, this.retryMs);
    this.retryMs = Math.min(10000, this.retryMs * 2);
  }

  _handleMessage(message) {
    switch (message.t) {
      case 'welcome': {
        this.playerId = message.playerId;
        this.room = message.room;
        // 再接続時: サーバーが ACK 済みと知っている水位までは再生済みとして
        // 飛ばし、未ACK分だけを FIFO で再生する。回答待ちだった古い質問は
        // サーバー側で打ち切られている（AI代行）ので、開いたままにしない。
        const ackedThrough = Number(message.ackedThrough) || 0;
        if (this.currentEventId != null && ackedThrough >= this.currentEventId) {
          try { this.callbacks.onFastForward?.(this.currentEventId); } catch { /* 復帰処理を止めない */ }
        }
        this.queue = this.queue.filter((event) => event.id > ackedThrough);
        this.tracker.advanceBase(ackedThrough);
        this.callbacks.onWelcome?.({ playerId: message.playerId, room: message.room });
        if (message.state) {
          this.state = message.state;
          this.callbacks.onState?.(this.state);
        }
        if (Array.isArray(message.hand)) this.callbacks.onHand?.(message.hand);
        // 切断中に処理・回答したイベントの ACK は届いていない可能性がある。
        // 現在の水位と直近の回答を送り直し、サーバー側で待っている質問を
        // 45秒のタイムアウト前に解決させる（サーバーは切断猶予中も質問を
        // 保持している）。
        if (this.tracker.ackedThrough > 0 || this.lastInteractiveAnswer) {
          this._send({ t: 'ack', through: this.tracker.ackedThrough, value: this.lastInteractiveAnswer });
        }
        this._enqueueEvents(message.events || []);
        break;
      }
      case 'state': {
        // サーバーは重い tiles / turnHand を変わった時だけ載せる。手元の
        // 完全な状態へマージして、以降は常に完全な publicState を渡す。
        this.state = { ...(this.state || {}), ...message.state };
        this.callbacks.onState?.(this.state);
        break;
      }
      case 'hand':
        this.callbacks.onHand?.(Array.isArray(message.hand) ? message.hand : []);
        break;
      case 'events':
        this.tracker.advanceBase(Number(message.ackedThrough) || 0);
        this._enqueueEvents(message.events || []);
        break;
      case 'notice':
        this.callbacks.onNotice?.(String(message.text || ''));
        break;
      case 'finished':
        this.finished = message.result;
        this.callbacks.onFinished?.(message.result);
        break;
      default:
        break;
    }
  }

  _enqueueEvents(events) {
    for (const event of events) {
      if (!event || !this.tracker.noteReceived(event.id)) continue;
      this.queue.push(event);
    }
    void this._pump();
  }

  /** 質問も演出も必ず到着順に1件ずつ再生する（旧 GuestHostListener._pumpBatch と同じ）。 */
  async _pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0 && !this.destroyed) {
        const event = this.queue.shift();
        this.currentEventId = event.id;
        let result = null;
        try {
          const handler = this.handlers[event.type];
          if (!handler) {
            result = null;
          } else if (event.wantValue) {
            result = await handler(event.payload, { queueDepth: this.queue.length });
          } else {
            // 演出は番犬付きで待つ。時間切れなら飛ばして進む（結果は不要）。
            result = await this._withStallGuard(event, handler(event.payload, { queueDepth: this.queue.length }));
          }
        }
        catch (error) {
          console.error('PvP event failed', event.type, error);
          this._send({ t: 'clientError', eventType: event.type, eventId: event.id });
          try { this.callbacks.onPlaybackError?.({ type: event.type, id: event.id }); } catch { /* Continue the queue. */ }
        }
        if (event.wantValue) this.lastInteractiveAnswer = { id: event.id, v: result ?? null };
        const ackedThrough = this.tracker.markProcessed(event.id);
        this.currentEventId = null;
        if (this.destroyed) break;
        // サーバーが待つイベント（ack）と、キューを飲み干した時だけ書く。
        // 回答は常に同梱し、途中の ACK が落ちても回答が消えないようにする。
        if (event.ack || this.queue.length === 0) {
          this._send({ t: 'ack', through: ackedThrough, value: this.lastInteractiveAnswer });
        }
      }
    } finally {
      this.pumping = false;
    }
    if (this.queue.length > 0) void this._pump();
  }

  _withStallGuard(event, promise) {
    let timer = null;
    const guard = new Promise((resolve) => {
      timer = setTimeout(() => {
        console.warn('PvP playback stalled, skipping', event.type, event.id);
        this._send({ t: 'clientStall', eventType: event.type, eventId: event.id });
        try { this.callbacks.onPlaybackStall?.({ type: event.type, id: event.id }); } catch { /* 続行 */ }
        resolve(null);
      }, this.stallMs);
    });
    return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(timer)), guard]);
  }

  _send(message) {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) return false;
    try { socket.send(JSON.stringify(message)); return true; } catch { return false; }
  }

  /** 本人の手番の自発的操作（{type:'rollDice', steps} / {type:'useSpell', cardId}）。 */
  sendAction(action) {
    return this._send({ t: 'action', action });
  }

  /** ホスト用コマンド（{t:'ban', playerId} / {t:'waitCut', rate} / {t:'leave'}）。 */
  sendCommand(message) {
    return this._send(message);
  }

  destroy() {
    this.destroyed = true;
    document.removeEventListener('visibilitychange', this._onVisible);
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    this.queue.length = 0;
    if (this.currentEventId != null) {
      try { this.callbacks.onFastForward?.(this.currentEventId); } catch { /* 終了処理を止めない */ }
    }
    this.currentEventId = null;
    const socket = this.socket;
    this.socket = null;
    try { socket?.close(1000, 'leave'); } catch { /* noop */ }
  }
}
