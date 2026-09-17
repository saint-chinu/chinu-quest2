// Cloudflare 版 PvP（cloudflare/roomCore.js）のヘッドレス検証。
// DO / WebSocket は使わず、io.send を横取りする「ボットクライアント」で
// 実際の Game を 1 試合完走させる。クライアント側の意味論（イベントの
// FIFO 再生・ACK 水位・質問への回答）は src/pvpCloud.js と同じにしてある。
import test from 'node:test';
import assert from 'node:assert/strict';
import { PvpRoomCore, normalizeRoomConfig, ASK_HOOKS, BROADCAST_HOOKS, stripUndefined } from '../cloudflare/roomCore.js';
import { buildStarterCardList, buildCharacterDeckList } from '../src/battleCards.js';
import { PvpContiguousAckTracker } from '../src/pvpQueue.js';
import { readFileSync } from 'node:fs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 質問には「何もしない」で答え、自分の手番なら必ずサイコロを振るボット。 */
class BotClient {
  constructor(uid, { answer = null } = {}) {
    this.uid = uid;
    this.core = null;
    this.playerId = null;
    this.state = null;
    this.hand = [];
    this.received = [];
    this.finished = null;
    this.tracker = new PvpContiguousAckTracker();
    this.answer = answer;
    this.connected = false;
  }
  attach(core) { this.core = core; }
  receive(message) {
    this.received.push(message);
    if (message.t === 'welcome') {
      this.playerId = message.playerId;
      if (message.state) this.state = message.state;
      this.hand = message.hand ?? [];
      this.tracker.advanceBase(message.ackedThrough || 0);
      for (const event of message.events || []) this._handleEvent(event);
      this._maybeRoll();
    } else if (message.t === 'state') {
      this.state = { ...(this.state || {}), ...message.state };
      this._maybeRoll();
    } else if (message.t === 'hand') {
      this.hand = message.hand;
    } else if (message.t === 'events') {
      this.tracker.advanceBase(message.ackedThrough || 0);
      for (const event of message.events) this._handleEvent(event);
    } else if (message.t === 'finished') {
      this.finished = message.result;
    }
  }
  _handleEvent(event) {
    if (!this.tracker.noteReceived(event.id)) return;
    let value = null;
    if (event.wantValue) {
      value = this.answer ? this.answer(event) : defaultAnswer(event.type);
    }
    const through = this.tracker.markProcessed(event.id);
    if (event.ack) this.core.handleMessage(this.uid, { t: 'ack', through, value: event.wantValue ? { id: event.id, v: value } : null });
  }
  _maybeRoll() {
    const s = this.state;
    if (!s || !this.connected || s.currentPlayerId !== this.playerId || !s.awaitingRoll || s.isBusy) return;
    // 同じ状態で二重に振らない（rollDice 側でも弾かれるが送信を抑える）。
    const marker = `${s.currentPlayerId}:${s.tilesRevision}:${this.received.length}`;
    if (this._lastRollMarker === marker) return;
    this._lastRollMarker = marker;
    this.core.handleMessage(this.uid, { t: 'action', action: { type: 'rollDice', steps: 1 + Math.floor(Math.random() * 6) } });
  }
  connect() { this.connected = true; this.core.connect(this.uid); }
  disconnect() { this.connected = false; this.core.disconnect(this.uid); }
}

function defaultAnswer(type) {
  if (type === 'landCommand') return 'end';
  if (type === 'landSubmenu') return 'back';
  if (type === 'confirmAction' || type === 'confirmMove') return false;
  return null;
}

function makeConfig({ humans = 2, cpus = 0, goalCurrency = 1000, mapId = 'hitode' } = {}) {
  const playerConfigs = [];
  for (let i = 0; i < humans; i += 1) {
    playerConfigs.push({ uid: `u${i}`, name: `人${i}`, color: 0x111111 + i, deckList: buildCharacterDeckList('hitode') });
  }
  for (let i = 0; i < cpus; i += 1) {
    playerConfigs.push({ isCPU: true, name: `CPU${i}`, color: 0x222222 + i, deckList: buildCharacterDeckList('madai') });
  }
  return normalizeRoomConfig({ roomCode: '123', mapId, goalCurrency, playerConfigs }, { hostUid: 'u0' });
}

function makeRoom(config, bots, extraIo = {}) {
  const byUid = new Map(bots.map((bot) => [bot.uid, bot]));
  const persisted = [];
  const core = new PvpRoomCore({
    disconnectGraceMs: 300, // テストでは猶予を短くする（本番15秒）
    // 本番は WebSocket なので受信は必ず非同期。同期に配ると Game の
    // _notifyState の最中にボットが rollDice を呼ぶ再入が起きてしまう。
    send: (uid, message) => {
      const text = JSON.stringify(message);
      setTimeout(() => byUid.get(uid)?.receive(JSON.parse(text)), 0);
    },
    persist: (record) => persisted.push(record),
    ...extraIo,
  });
  for (const bot of bots) bot.attach(core);
  core.persisted = persisted;
  core.pendingConfig = config;
  return core;
}

async function waitFor(predicate, { timeoutMs = 20000, step = 5 } = {}) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('待機がタイムアウトしました');
    await sleep(step);
  }
}

test('フック対応表はホスト側 relayable の型名を網羅している', () => {
  const askTypes = Object.values(ASK_HOOKS);
  assert.ok(askTypes.includes('landCommand') && askTypes.includes('pickBattleItem') && askTypes.includes('chooseBranch'));
  const castTypes = Object.values(BROADCAST_HOOKS).map((s) => s.type);
  assert.ok(castTypes.includes('pieceMove') && castTypes.includes('battleOutcome') && castTypes.includes('bankruptcy'));
  assert.equal(BROADCAST_HOOKS.onShrineEffect.awaitDone, true);
  assert.equal(BROADCAST_HOOKS.onPieceMove.awaitMover, true);
  assert.deepEqual(stripUndefined({ a: undefined, b: [undefined, 1], c: { d: undefined } }), { a: null, b: [null, 1], c: { d: null } });
});

test('normalizeRoomConfig は40枚デッキ・先頭ホスト・uid重複を検証する', () => {
  const ok = makeConfig({ humans: 2 });
  assert.equal(ok.playerConfigs.length, 2);
  assert.equal(ok.playerConfigs[0].uid, 'u0');
  assert.throws(() => normalizeRoomConfig({ roomCode: '123', mapId: 'hitode', playerConfigs: [{ uid: 'x', name: 'a', deckList: [] }, { uid: 'y', name: 'b', deckList: [] }] }, { hostUid: 'x' }), /40枚/);
  assert.throws(() => normalizeRoomConfig({ roomCode: '123', mapId: 'hitode', playerConfigs: [
    { uid: 'y', name: 'a', deckList: buildCharacterDeckList('hitode') }, { uid: 'x', name: 'b', deckList: buildCharacterDeckList('hitode') },
  ] }, { hostUid: 'x' }), /ホスト本人/);
  assert.throws(() => normalizeRoomConfig({ roomCode: '123', mapId: 'hitode', playerConfigs: [
    { uid: 'x', name: 'a', deckList: buildCharacterDeckList('hitode') }, { uid: 'x', name: 'b', deckList: buildCharacterDeckList('hitode') },
  ] }, { hostUid: 'x' }), /重複/);
});

test('人間ボット1人＋CPU1体の対戦が Worker 相当の環境で決着まで走る', async () => {
  const bot = new BotClient('u0');
  const core = makeRoom(makeConfig({ humans: 1, cpus: 1, goalCurrency: 1000 }), [bot]);
  core.start(core.pendingConfig);
  bot.connect();
  await waitFor(() => bot.state);
  assert.equal(bot.playerId, 0);
  assert.ok(bot.state, '接続時に完全な publicState が届く');
  assert.ok(Array.isArray(bot.state.tiles) && bot.state.tiles.length > 0);
  assert.equal(bot.hand.length, 4, '初期手札が本人にだけ届く');
  await waitFor(() => bot.finished || core.game.turnCount > 200, { timeoutMs: 60000 });
  assert.ok(bot.finished, `決着せず（turnCount=${core.game.turnCount}）`);
  assert.equal(core.status, 'finished');
  assert.equal(bot.finished.reason, 'settled');
  assert.equal(bot.finished.players.length, 2);
  assert.ok(bot.finished.players.every((p) => Number.isFinite(p.endingAssetsShare)));
  assert.ok(bot.received.some((m) => m.t === 'events' && m.events.some((e) => e.type === 'pieceMove')), '歩行演出が配信された');
  assert.ok(core.persisted.length > 0, '安全地点で persist が呼ばれた');
  const record = core.persisted[core.persisted.length - 1];
  assert.equal(record.snapshot.version, 2);
  assert.equal(record.config.roomCode, '123');
  core.destroy();
});

test('全員がつながるまで最初の手番を始めず、未接続の相手への質問は捨てない', async () => {
  const a = new BotClient('u0');
  const b = new BotClient('u1');
  const core = makeRoom(makeConfig({ humans: 2, goalCurrency: 50000 }), [a, b]);
  core.start(core.pendingConfig);
  assert.equal(core.started, false, '誰もつながっていない間は init しない');
  a.connect();
  await sleep(10);
  assert.equal(core.started, false, 'ホストだけでは始めない');
  assert.equal(core.game.turnCount, 0);
  // まだ来ていない参加者への質問は「オフライン」ではなく保留（welcome で届く）
  const pending = core._enqueue('u1', 'cardReveal', { x: 1 }, 'value');
  assert.equal(core.channels.get('u1').outbox.length, 1);
  b.connect();
  await waitFor(() => b.received.some((m) => m.t === 'welcome' && m.events.length === 1));
  assert.equal(core.started, true, '全員がつながったら開始');
  assert.equal(await pending, null, '保留していた質問がボットに届いて回答された');
  assert.equal(core.game.players[1].isCPU, false, '接続前の質問で AI 化しない');
  core.destroy();
});

test('切断でAI代行へ切り替わり、再接続で次の手番境界に人間へ戻る', async () => {
  const a = new BotClient('u0');
  const b = new BotClient('u1');
  const core = makeRoom(makeConfig({ humans: 2, goalCurrency: 50000 }), [a, b]);
  core.start(core.pendingConfig);
  a.connect();
  b.connect();
  await waitFor(() => core.game.turnCount >= 2, { timeoutMs: 30000 });
  b.disconnect();
  const playerB = core.game.players[1];
  const channel = core.channels.get('u1');
  assert.equal(channel.offline, true);
  assert.equal(playerB.isCPU, false, '切断直後は猶予中でまだ人間のまま');
  await waitFor(() => channel.abandoned === true, { timeoutMs: 5000 });
  assert.equal(playerB.isCPU, true, '猶予が切れたら AI 代行');
  assert.equal(playerB.pvpAutoCpu, true);
  assert.equal(channel.outbox.length, 0, '猶予切れで未ACKの演出列を捨てる');
  // 猶予切れ後の fire 演出は積まれない・value は即 reject される
  await assert.rejects(core._enqueue('u1', 'landCommand', {}, 'value'), /オフライン/);
  b.connect();
  await waitFor(() => b.received.some((m) => m.t === 'welcome'));
  assert.equal(playerB.pvpHumanRestorePending, true);
  const turnAtReconnect = core.game.turnCount;
  await waitFor(() => core.game.turnCount >= turnAtReconnect + 3 || playerB.isCPU === false, { timeoutMs: 30000 });
  assert.equal(playerB.isCPU, false, '手番境界で人間操作へ戻る');
  assert.equal(playerB.pvpAutoCpu, false);
  core.destroy();
});

test('切断猶予内に戻れば AI 化せず、保留していた質問がそのまま届く', async () => {
  const a = new BotClient('u0');
  const b = new BotClient('u1');
  const core = makeRoom(makeConfig({ humans: 2, goalCurrency: 50000 }), [a, b]);
  core.start(core.pendingConfig);
  a.connect();
  b.connect();
  await waitFor(() => core.started);
  b.disconnect();
  const playerB = core.game.players[1];
  // 猶予中の質問は捨てられず保留される
  const pending = core._enqueue('u1', 'confirmMove', { x: 1 }, 'value');
  assert.equal(core.channels.get('u1').outbox.some((e) => e.type === 'confirmMove'), true);
  await sleep(50);
  assert.equal(playerB.isCPU, false);
  b.connect();
  assert.equal(await pending, false, '再接続後にボットが答えた');
  assert.equal(core.channels.get('u1').abandoned, false);
  assert.equal(playerB.isCPU, false, '猶予内の復帰では AI 化しない');
  core.handleMessage('u1', { t: 'leave' });
  assert.equal(playerB.isCPU, true, '明示的な退出は猶予なしで AI 代行');
  core.destroy();
});

test('サイコロ待ちで切断→AI化しても盤面が止まらない（CPU手番を起動する）', async () => {
  const a = new BotClient('u0');
  const b = new BotClient('u1');
  const core = makeRoom(makeConfig({ humans: 2, goalCurrency: 50000 }), [a, b]);
  core.start(core.pendingConfig);
  a.connect();
  b.connect();
  await waitFor(() => core.started);
  // b の手番でサイコロ待ちになるまで待ち、その瞬間に b のボットを黙らせて切断する
  b.connected = false; // 以後サイコロを振らない
  await waitFor(() => core.game.currentPlayer.id === 1 && core.game.awaitingRoll && !core.game.isBusy, { timeoutMs: 30000 });
  const turn = core.game.turnCount;
  core.disconnect('u1');
  await waitFor(() => core.channels.get('u1').abandoned, { timeoutMs: 5000 });
  assert.equal(core.game.players[1].isCPU, true);
  await waitFor(() => core.game.turnCount > turn, { timeoutMs: 15000 });
  assert.ok(core.game.turnCount > turn, 'AI がサイコロを振って手番が進んだ');
  // BAN でも同じ（ホストがサイコロ待ちの相手を BAN）
  core.destroy();
});

test('接続したまま質問に答えなかった人は、このターンだけAI代行で次の手番に人間へ戻る', async () => {
  const a = new BotClient('u0');
  const b = new BotClient('u1', { answer: (event) => (event.type === 'chooseBranch' ? undefined : defaultAnswer(event.type)) });
  // b は chooseBranch に「答えない」（undefined を返すと value ACK を送らないようにする）
  b._handleEvent = function (event) {
    if (!this.tracker.noteReceived(event.id)) return;
    if (event.wantValue && event.type === 'chooseBranch') { this.tracker.markProcessed(event.id); return; } // 無応答
    let value = null;
    if (event.wantValue) value = defaultAnswer(event.type);
    const through = this.tracker.markProcessed(event.id);
    if (event.ack) this.core.handleMessage(this.uid, { t: 'ack', through, value: event.wantValue ? { id: event.id, v: value } : null });
  };
  const core = makeRoom(makeConfig({ humans: 2, goalCurrency: 50000 }), [a, b], { askTimeoutMs: 400 });
  core.start(core.pendingConfig);
  a.connect(); b.connect();
  await waitFor(() => core.started);
  const playerB = core.game.players[1];
  // b の手番で分岐（hitode はスタート直後に分岐がある）→ 無応答 → タイムアウト
  await waitFor(() => playerB.isCPU === true, { timeoutMs: 30000 });
  assert.equal(playerB.pvpAutoCpu, true);
  assert.equal(playerB.pvpHumanRestorePending, true, '接続中なので復帰予約が立つ');
  assert.ok(b.received.some((m) => m.t === 'notice'), 'クライアントへ通知が届く');
  await waitFor(() => playerB.isCPU === false, { timeoutMs: 30000 });
  assert.equal(playerB.pvpAutoCpu, false, '次の手番境界で人間へ戻る');
  core.destroy();
});

test('ACK 水位でアウトボックスが痩せ、再接続時は未ACK分だけ再送される', async () => {
  const sent = [];
  const core = new PvpRoomCore({ send: (uid, message) => sent.push({ uid, message: JSON.parse(JSON.stringify(message)) }) });
  const config = makeConfig({ humans: 2, goalCurrency: 50000 });
  core.config = config;
  core._createGame();
  core.status = 'battling';
  core.connect('u0');
  await sleep(1);
  const p1 = core._enqueue('u0', 'diceResult', { steps: 3 }, 'fire');
  const p2 = core._enqueue('u0', 'pieceMove', { playerId: 0 }, 'done');
  const p3 = core._enqueue('u0', 'landCommand', { a0: 1, a1: { x: undefined } }, 'value');
  const ids = core.channels.get('u0').outbox.map((e) => e.id);
  assert.equal(ids.length, 3);
  assert.ok(ids[0] < ids[1] && ids[1] < ids[2], 'id は単調増加');
  assert.equal(core.channels.get('u0').outbox[2].payload.a1.x, null, 'undefined は null へ均す');
  await p1;
  core.handleMessage('u0', { t: 'ack', through: ids[1] });
  await p2;
  assert.deepEqual(core.channels.get('u0').outbox.map((e) => e.id), [ids[2]]);
  sent.length = 0;
  core.connect('u0'); // 再接続（同一uid）
  await sleep(1);
  const welcome = sent.find((m) => m.message.t === 'welcome').message;
  assert.deepEqual(welcome.events.map((e) => e.id), [ids[2]], '未ACKの質問だけ再送');
  assert.equal(welcome.ackedThrough, ids[1]);
  core.handleMessage('u0', { t: 'ack', through: ids[2], value: { id: ids[2], v: 'summon' } });
  assert.equal(await p3, 'summon');
  assert.equal(core.channels.get('u0').outbox.length, 0);
  core.destroy();
});

test('ホスト以外は BAN／待機カット／退出終了ができない', async () => {
  const a = new BotClient('u0');
  const b = new BotClient('u1');
  const core = makeRoom(makeConfig({ humans: 2, goalCurrency: 50000 }), [a, b]);
  core.start(core.pendingConfig);
  a.connect();
  b.connect();
  core.handleMessage('u1', { t: 'ban', playerId: 0 });
  assert.equal(core.game.players[0].banned, undefined);
  core.handleMessage('u1', { t: 'waitCut', rate: 0.5 });
  assert.equal(core.waitCutRate, 0);
  core.handleMessage('u0', { t: 'waitCut', rate: 0.5 });
  assert.equal(core.waitCutRate, 0.5);
  await waitFor(() => b.state?.waitCutRate === 0.5);
  assert.equal(b.state.waitCutRate, 0.5, '待機カットは全員の state に載る');
  core.handleMessage('u0', { t: 'ban', playerId: 1 });
  assert.equal(core.game.players[1].banned, true);
  assert.equal(core.game.players[1].isCPU, true);
  core.handleMessage('u1', { t: 'leave' });
  assert.equal(core.status, 'battling', 'ゲストの退出では終わらない');
  core.handleMessage('u0', { t: 'leave' });
  assert.equal(core.status, 'finished');
  await waitFor(() => a.finished);
  assert.equal(a.finished.reason, 'hostLeft');
  assert.equal(b.finished?.reason, undefined, '退出済みゲストには届かない（再接続時に welcome の後で届く）');
  b.connect();
  await waitFor(() => b.finished);
  assert.equal(b.finished.reason, 'hostLeft');
  core.destroy();
});

test('保存した安全地点から resume して進行を続けられる', async () => {
  const bot = new BotClient('u0');
  const core = makeRoom(makeConfig({ humans: 1, cpus: 1, goalCurrency: 50000 }), [bot]);
  core.start(core.pendingConfig);
  bot.connect();
  await waitFor(() => core.persisted.length >= 2);
  const record = core.persisted[core.persisted.length - 1];
  core.destroy();
  const bot2 = new BotClient('u0');
  const resumed = makeRoom(record.config, [bot2]);
  resumed.resume(record.config, record.snapshot, { waitCutRate: record.waitCutRate });
  bot2.connect();
  await waitFor(() => bot2.state);
  assert.equal(record.snapshot.turnCount >= 1, true);
  const before = record.snapshot.turnCount;
  await waitFor(() => resumed.game.turnCount > before + 1, { timeoutMs: 30000 });
  resumed.destroy();
});

// ── 配線の静的チェック（main.js / pvpCloud.js / worker.js） ─────────────
const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const cloudSrc = readFileSync(new URL('../src/pvpCloud.js', import.meta.url), 'utf8');
const workerSrc = readFileSync(new URL('../cloudflare/worker.js', import.meta.url), 'utf8');
const gameSrc = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');

test('main.js: Cloudflare対戦ではホストも「盤面はリモート」として扱う', () => {
  assert.ok(mainSrc.includes('function pvpBoardIsRemote()'));
  assert.ok(!mainSrc.includes('const isPvpGuest = pvpMatch && !pvpMatch.isHost;'), '旧判定が残っていない');
  assert.ok(mainSrc.includes("await beginPvpMatch(pvpSession.roomCode, { engine: 'cloud', engineUrl: serverUrl });"));
  assert.ok(mainSrc.includes("const cloudRoom = room.engine === 'cloud';"));
  assert.ok(mainSrc.includes('if (cloudRoom) ensureCloudPvpMatch(session, room);'));
  assert.ok(mainSrc.includes('if (pvpMatch.cloud) {\n    startCloudPvpConnection();\n    return;\n  }'));
  // ホスト権限の操作はサーバーへ依頼する
  assert.ok(mainSrc.includes("pvpMatch.connection?.sendCommand({ t: 'ban', playerId: target.id })"));
  assert.ok(mainSrc.includes("pvpMatch.connection?.sendCommand({ t: 'waitCut', rate: selectedPvpWaitCutRate })"));
  assert.ok(mainSrc.includes("pvpMatch.connection?.sendCommand({ t: 'leave' })"));
  // 復帰: Cloudflare対戦はホストも対象
  assert.ok(mainSrc.includes("(room.hostUid !== currentUserId || room.engine === 'cloud')"));
  // 未設定時は従来の Firestore 中継のまま
  assert.ok(mainSrc.includes('if (pvpCloudEnabled()) {'));
  assert.ok(mainSrc.includes('const relay = new HostGuestRelay(pvpSession.roomCode);'));
});

test('pvpCloud.js: 演出と質問を到着順に1件ずつ再生し、ACK と回答を同梱する', () => {
  assert.ok(cloudSrc.includes('new PvpContiguousAckTracker()'));
  assert.ok(cloudSrc.includes("this._send({ t: 'ack', through: ackedThrough, value: this.lastInteractiveAnswer });"));
  assert.ok(cloudSrc.includes("if (event.wantValue) this.lastInteractiveAnswer = { id: event.id, v: result ?? null };"));
  assert.ok(cloudSrc.includes('VITE_PVP_SERVER_URL'));
  assert.ok(cloudSrc.includes("url.searchParams.set('token', await idToken())"), '本番は Firebase ID トークンで接続する');
  assert.ok(cloudSrc.includes("this._send({ t: 'ack', through: this.tracker.ackedThrough, value: this.lastInteractiveAnswer });"), '再接続時に水位と回答を送り直す');
});

test('worker.js: 開始・WebSocket は認証必須、部屋コードで DO へ振り分ける', () => {
  assert.ok(workerSrc.includes("env.ROOM.get(env.ROOM.idFromName(code)"));
  assert.ok(workerSrc.includes('verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID)'));
  assert.ok(workerSrc.includes("env.DEV_ALLOW_UNVERIFIED_UID === '1'"), '開発時の uid 直指定は明示フラグでのみ');
  assert.ok(workerSrc.includes("headers.set('x-uid', uid);"));
});

test('game.js は three.js / Firebase に依存せず読み込める（Worker で束ねられる）', () => {
  assert.ok(gameSrc.includes("from './sceneConstants.js'"));
  assert.ok(!gameSrc.includes("from './scene.js'"));
  const catalogSrc = readFileSync(new URL('../src/cardCatalog.js', import.meta.url), 'utf8');
  assert.ok(catalogSrc.includes("from './customCardStore.js'"));
  assert.ok(!catalogSrc.includes("from './customCards.js'"));
});


test('ステージ8・人間2人・ホスト初手5: 5歩→移動完了→土地コマンドの順で届く', async () => {
  const a = new BotClient('u0');
  const b = new BotClient('u1');
  const core = makeRoom(makeConfig({ humans: 2, goalCurrency: 50000, mapId: 'chin-harbor' }), [a,b]);
  const handle = core.handleMessage.bind(core);
  core.handleMessage = (uid, message) => handle(uid, message.t === 'action' && message.action?.type === 'rollDice'
    ? {...message, action: {...message.action, steps:5}} : message);
  try {
    core.start(core.pendingConfig);
    core.game.currentPlayerIndex = 0;
    a.connect(); b.connect();
    await waitFor(() => a.received.some(m => m.events?.some(e => e.type === 'landCommand')));
    const events = a.received.flatMap(m => m.events || []);
    const land = events.findIndex(e => e.type === 'landCommand');
    const before = events.slice(0,land);
    assert.equal(before.filter(e => e.type === 'pieceStep').length, 5);
    assert.ok(before.findIndex(e => e.type === 'moveComplete') > before.findLastIndex(e => e.type === 'pieceMove'));
  } finally { core.destroy(); }
});
