// 対人戦（PvP）の「サーバー権威」コア。Cloudflare Durable Object の中で
// 唯一の Game インスタンスを回し、参加者全員（ホスト含む）を WebSocket の
// 薄いクライアントとして扱う。
//
// 旧構成（src/pvp.js）は「部屋を作ったブラウザだけが本物の Game を持ち、
// Firestore の onSnapshot を中継に使う」ホスト権威モデルだった。ここは
// その HostGuestRelay / HostParticipantActionListener / handlePvpSync
// （src/main.js）を、Firestore 往復の無い WebSocket 版として1か所に
// まとめ直したもの。クライアント側の挙動（イベントの FIFO 再生・ACK
// 水位・質問の回答・publicState の差分適用）は旧ゲスト実装と同じ意味論を
// 保っているので、src/main.js の pvpGuestHandlers / applyPvpPublicState
// をそのまま再利用できる。
//
// このファイルは Cloudflare の API に一切依存しない（送信・永続化・乱数は
// コンストラクタで注入する）。node --test で完全にヘッドレスに検証できる
// （tests/pvpCloud.test.mjs）。DO への接着は cloudflare/room.js。
import { createBoard } from '../src/board.js';
import { Game } from '../src/game.js';
import { speedState } from '../src/utils.js';
import { pvpSequenceBase } from '../src/pvpQueue.js';

// 演出待ち（tween/delay）を実質ゼロにする。サーバーは絵を出さないので、
// 進行を律速するのは「操作する本人の画面が追いついたか（done ACK）」と
// 「質問への回答」だけでよい（tools/simulate.mjs と同じ考え方）。
// speedState はモジュール共有なので、同じ isolate 上の全部屋に効く
// （どの部屋も同じ値なので問題ない。waitCutRate は部屋ごとに持ち、
// publicState へ載せる直前に差し替える - 下の _publish 参照）。
speedState.multiplier = 20000;
speedState.waitCutRate = 0;

// utils.js の tween は requestAnimationFrame で刻む。Worker / Node には
// 無いので setTimeout で代用する（tools/simulate.mjs と同じ）。
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

// ── scene.js の代役 ────────────────────────────────────────────────
// game.js が触るのは tile.mesh.material.color.set / player.mesh.position.set /
// tile.unitMesh 程度。形だけ本物と同じにして、残りは何を呼ばれてもmeshを返す
// Proxy で受け流す（tools/simulate.mjs と同じ方式）。
const vec = () => ({ x: 0, y: 0, z: 0, set() {}, copy() {}, lerp() {}, clone() { return vec(); } });
const mesh = () => ({
  position: vec(), scale: vec(), rotation: vec(), userData: {}, visible: true,
  material: { color: { set() {} }, opacity: 1 }, add() {}, remove() {},
});
export function makeHeadlessScene(tiles) {
  const base = {
    focus: { x: 0, z: 0 },
    buildBoard(list) { for (const t of list) { t.mesh = mesh(); t.borderMesh = mesh(); } },
    createPiece: () => mesh(),
    createPieceFromImage: () => mesh(),
    createUnitIcon: () => mesh(),
    createOwnerLabel: () => mesh(),
    isOutsideSafeView: () => false,
    setFocusImmediate() {},
    panTo() {},
  };
  base.buildBoard(tiles);
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => mesh()) });
}

// ── Game のフックとクライアントへ流すイベント型の対応 ─────────────────
// src/main.js の startBattle が relayable(...) で張っている対応表と同一。
// ask   : 手番プレイヤー本人への質問（回答値が返る）。Game は最後の引数に
//         player.id を付けて呼ぶ（onLandCommand/onShopPurchase だけ途中に
//         追加引数を挟む - payload は {a0,a1} 形にまとめる）。
// cast  : 全員へ流す演出（投げっぱなし）。awaitDone のものだけ、次の
//         イベントが追い越さないよう全員の再生完了を待つ。
export const ASK_HOOKS = {
  onCardReveal: 'cardReveal',
  onDiscardChoice: 'discardChoice',
  onLandCommand: 'landCommand',
  onPickMonsterCard: 'pickMonsterCard',
  onConfirmAction: 'confirmAction',
  onPickLevelUp: 'pickLevelUp',
  onConfirmMove: 'confirmMove',
  onOfudaMarket: 'ofudaMarket',
  onPickDebtRecovery: 'pickDebtRecovery',
  onPickBrowseTile: 'pickBrowseTile',
  onLandSubmenu: 'landSubmenu',
  onPickAbilityTarget: 'pickAbilityTarget',
  onPickTransformTarget: 'pickTransformTarget',
  onPickCardType: 'pickCardType',
  onChooseBranch: 'chooseBranch',
  onPickMoveDirection: 'pickMoveDirection',
  onPickElement: 'pickElement',
  onShopPurchase: 'shopPurchase',
  onPickBattleItem: 'pickBattleItem',
};
export const BROADCAST_HOOKS = {
  onSpellUse: { type: 'spellUse' },
  onSpellCastEffect: { type: 'spellCastEffect' },
  onSpellComplete: { type: 'spellComplete' },
  onSummonEffect: { type: 'summonEffect' },
  onTargetEffect: { type: 'targetEffect' },
  onShrineEffect: { type: 'shrineEffect', awaitDone: true },
  onWarpEffect: { type: 'warpEffect' },
  onTurnFocus: { type: 'turnFocus' },
  onTollPayment: { type: 'tollPayment' },
  onMoveDestination: { type: 'moveDestination' },
  // 歩行は「操作する本人」の画面だけ追いつくのを待つ（旧relayableの
  // awaitOnlyUid と同じ）。観戦側まで待つと本人の土地コマンド表示が遅れる。
  onPieceMove: { type: 'pieceMove', awaitMover: true },
  onPieceStep: { type: 'pieceStep' },
  onMoveComplete: { type: 'moveComplete' },
  onDiceResult: { type: 'diceResult' },
  onLandLoss: { type: 'landLoss' },
  onLandSale: { type: 'landSale' },
  onLandChain: { type: 'landChain' },
  onLandLevelUp: { type: 'landLevelUp' },
  onUnitGrowth: { type: 'unitGrowth' },
  onCheckpoint: { type: 'checkpoint' },
  onGoalBonus: { type: 'goalBonus' },
  onGoalAchieved: { type: 'goalAchieved' },
  onBankruptcy: { type: 'bankruptcy' },
  onBattleSceneEnter: { type: 'battleSceneEnter' },
  onBattleEquip: { type: 'battleEquip' },
  onBattleItemDestroy: { type: 'battleItemDestroy' },
  onBattleItemSteal: { type: 'battleItemSteal' },
  onBattleTraitReveal: { type: 'battleTraitReveal' },
  onBattleLightningRod: { type: 'battleLightningRod' },
  onBattleAttack: { type: 'battleAttack' },
  onBattleRetreat: { type: 'battleRetreat' },
  onBattleOutcome: { type: 'battleOutcome' },
  onDamageEffect: { type: 'damageEffect' },
};

// 質問の回答待ち（人が考える時間）と、演出の同期待ち（画面合わせだけ）。
// done（演出の同期待ち）は旧 HostGuestRelay と同じ4秒。一度時間切れした相手は
// degraded として以後の done を待たず、応答が届いた時点で自動復帰する。
// 質問の回答待ち。旧 Firestore 版のゲストは45秒だったが、ホストは無制限だった。
// WS 版では全員がこの制限を受けるので、召喚カードを読み比べる時間を見て少し長め。
// 過ぎても接続中なら次の手番で人間へ戻る（_askHook 参照）。
export const ASK_TIMEOUT_MS = 60000;
export const DONE_TIMEOUT_MS = 4000;
// 開始猶予: ホストが /start を叩いてから参加者が WebSocket でつなぐまで
// （Firestore の status 伝播＋盤面構築）数秒かかる。全員が一度つながるか、
// この時間が過ぎたら最初の手番を始める。つながらなかった人は初回の質問で
// 45秒待ったのち AI 代行になる。
export const START_GRACE_MS = 20000;
// 切断猶予: スマホのアプリ切替や電波の揺れで WebSocket は数秒単位で切れる。
// 切れた瞬間に AI 代行へ切り替えると、自分の手番が「何もしない」で流れて
// しまう（旧 Firestore 版には30秒のハートビート猶予があった）。この間は
// 演出・質問をアウトボックスに積んだまま待ち、戻ってきたら welcome で
// まとめて届ける。過ぎたら未回答の質問を諦めて AI 代行にする。
export const DISCONNECT_GRACE_MS = 15000;

/** JSON に載せる前に undefined を null へ均す（キーは保つ。受信側は ?? で既定値を取る）。 */
export function stripUndefined(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripUndefined);
  const out = {};
  for (const [key, entry] of Object.entries(value)) out[key] = stripUndefined(entry);
  return out;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * ホスト（部屋作成者）がPOSTしてくる開始設定の検証と正規化。
 * playerConfigs は Game にそのまま渡せる形（deckList はカード定義の配列）。
 * uid は人間参加者だけが持ち、WebSocket 接続の本人確認に使う。
 */
export function normalizeRoomConfig(input, { hostUid }) {
  if (!input || typeof input !== 'object') throw new Error('開始設定が不正です');
  const roomCode = String(input.roomCode || '').trim().toUpperCase();
  if (!/^[0-9A-Z]{3,8}$/.test(roomCode)) throw new Error('部屋コードが不正です');
  const mapId = String(input.mapId || '');
  if (!mapId) throw new Error('ステージが未指定です');
  const configs = Array.isArray(input.playerConfigs) ? input.playerConfigs : [];
  if (configs.length < 2 || configs.length > 4) throw new Error('参加人数は2〜4人です');
  const playerConfigs = configs.map((cfg, index) => {
    if (!cfg || typeof cfg !== 'object') throw new Error('参加者情報が不正です');
    const name = String(cfg.name || '').slice(0, 10) || `P${index + 1}`;
    const deckList = Array.isArray(cfg.deckList) ? cfg.deckList.filter((card) => card && typeof card === 'object') : [];
    if (deckList.length !== 40) throw new Error(`${name}のデッキが40枚ではありません`);
    const isCPU = !!cfg.isCPU;
    const uid = isCPU ? null : String(cfg.uid || '');
    if (!isCPU && !uid) throw new Error(`${name}のuidがありません`);
    return {
      uid,
      name,
      isCPU,
      color: Number.isFinite(Number(cfg.color)) ? Number(cfg.color) : 0x2ec4b6,
      allianceId: cfg.allianceId ?? null,
      deckList: clone(deckList),
      elements: Array.isArray(cfg.elements) ? clone(cfg.elements) : undefined,
      aiProfile: cfg.aiProfile && typeof cfg.aiProfile === 'object' ? clone(cfg.aiProfile) : undefined,
      // 途中で切ると data URL が壊れるので、大きすぎるものは載せない。
      iconDataUrl: typeof cfg.iconDataUrl === 'string' && cfg.iconDataUrl.length <= 20000 ? cfg.iconDataUrl : '',
    };
  });
  if (playerConfigs[0].uid !== hostUid) throw new Error('先頭の参加者はホスト本人である必要があります');
  const humanUids = playerConfigs.filter((p) => !p.isCPU).map((p) => p.uid);
  if (new Set(humanUids).size !== humanUids.length) throw new Error('同じuidが重複しています');
  return {
    roomCode,
    hostUid,
    mapId,
    goalCurrency: Math.max(1000, Math.min(1_000_000, Number(input.goalCurrency) || 5000)),
    bgmTrack: typeof input.bgmTrack === 'string' ? input.bgmTrack.slice(0, 64) : null,
    playerConfigs,
  };
}

/**
 * 部屋1つぶんの権威ロジック。
 *
 * io = {
 *   send(uid, message)   … その uid の接続へ JSON を送る（未接続なら無視）
 *   persist(record)      … 安全地点の保存（DO storage）。省略可
 *   onFinished(result)   … 決着・終了時の通知。省略可
 *   log(message)         … 診断ログ。省略可
 *   now()                … 時刻（テストで差し替え）
 * }
 */
export class PvpRoomCore {
  constructor(io = {}) {
    this.io = {
      send: () => {},
      persist: () => {},
      onFinished: () => {},
      log: () => {},
      now: () => Date.now(),
      disconnectGraceMs: DISCONNECT_GRACE_MS,
      askTimeoutMs: ASK_TIMEOUT_MS,
      ...io,
    };
    this.config = null;
    this.game = null;
    this.status = 'idle'; // idle → battling → finished
    this.finishResult = null;
    this.waitCutRate = 0;
    this.channels = new Map(); // uid → channel
    this.online = new Set();
    this.logs = [];
    // tilesRevision は「盤面が変わった送信」だけ進む番号。クライアントは同じ
    // 番号の更新で重い土地再構築を省く。DO の再起動で core が作り直されても
    // 以前の番号と衝突しないよう、時刻起点で始める。
    this._publishCache = { tilesJson: null, turnHandJson: null, lightJson: null, tilesRevision: Math.floor(this.io.now() / 1000) * 1000, hands: new Map() };
    this.lastPublicState = null;
    this.lastHands = new Map(); // playerId → hand
    this._nextEventId = pvpSequenceBase(this.io.now());
    this._destroyed = false;
    this._pendingStart = null; // { snapshot|null, timer }
  }

  // ── 開始・再開 ───────────────────────────────────────────────────
  start(config) {
    if (this.status !== 'idle') throw new Error('この部屋は既に開始しています');
    this.config = config;
    this._createGame();
    this.status = 'battling';
    this._gateLaunch(null);
  }

  /** 保存済みの安全地点から再開（DOの再起動・再デプロイ後）。 */
  resume(config, snapshot, { waitCutRate = 0 } = {}) {
    if (this.status !== 'idle') throw new Error('この部屋は既に開始しています');
    this.config = config;
    this.waitCutRate = waitCutRate;
    this._createGame();
    this.status = 'battling';
    this._gateLaunch(snapshot);
  }

  /** 全員がつながるか START_GRACE_MS 経過で最初の手番（game.init）を始める。 */
  _gateLaunch(snapshot) {
    this._pendingStart = { snapshot, timer: setTimeout(() => this._launch(), START_GRACE_MS) };
    this._maybeLaunch();
  }

  _maybeLaunch() {
    if (!this._pendingStart) return;
    const humans = this.config.playerConfigs.filter((p) => p.uid);
    if (humans.every((p) => this.online.has(p.uid))) this._launch();
  }

  _launch() {
    const pending = this._pendingStart;
    if (!pending || this._destroyed) return;
    this._pendingStart = null;
    clearTimeout(pending.timer);
    this.game.init(pending.snapshot ?? undefined);
  }

  get started() {
    return this.status === 'battling' && !this._pendingStart;
  }

  _createGame() {
    const tiles = createBoard(this.config.mapId);
    const scene = makeHeadlessScene(tiles);
    const hooks = {};
    for (const [hook, type] of Object.entries(ASK_HOOKS)) hooks[hook] = this._askHook(type);
    for (const [hook, spec] of Object.entries(BROADCAST_HOOKS)) hooks[hook] = this._broadcastHook(spec);
    const playerConfigs = this.config.playerConfigs.map((cfg) => ({
      name: cfg.name,
      isCPU: cfg.isCPU,
      color: cfg.color,
      allianceId: cfg.allianceId ?? null,
      deckList: cfg.deckList,
      elements: cfg.elements,
      aiProfile: cfg.aiProfile,
    }));
    this.game = new Game({
      tiles,
      mapId: this.config.mapId,
      scene,
      storyMode: true, // 目標総資産到達＋ゴール／生存陣営確定で決着させ、決着コールバックを飛ばす
      goalCurrency: this.config.goalCurrency,
      playerConfigs,
      onLog: (message) => {
        if (this.logs.length < 5000) this.logs.push(message);
        this.io.log(message);
      },
      onStateChange: () => {},
      onCpuRoll: async (forced) => forced ?? (1 + Math.floor(Math.random() * 6)),
      onMoveComplete: () => {},
      onBranchUndo: () => {},
      onTurnBoundary: (player) => this._onTurnBoundary(player),
      onStoryBattleEnd: async (result) => this._onBattleEnd(result),
      onStoryAssistEvent: async () => {},
      onCardSeen: () => {},
      onResumeCheckpoint: (state) => this._onSafePoint(state),
      onPvpSync: (snapshot) => this._publish(snapshot),
      ...hooks,
    });
    // 未指定のフックを安全な既定値で埋める（未定義のまま呼ばれると
    // TypeError で試合が異常終了する）。
    for (const key of Object.keys(this.game)) {
      if (!key.startsWith('on') || typeof this.game[key] === 'function') continue;
      this.game[key] = async () => {};
    }
  }

  // ── 参加者の接続管理 ─────────────────────────────────────────────
  playerOf(uid) {
    const index = this.config?.playerConfigs.findIndex((p) => p.uid === uid) ?? -1;
    return index >= 0 ? this.game?.players?.[index] ?? null : null;
  }

  isParticipant(uid) {
    return !!uid && !!this.config?.playerConfigs.some((p) => p.uid === uid);
  }

  _channel(uid) {
    let channel = this.channels.get(uid);
    if (channel) return channel;
    channel = {
      outbox: [],
      ackedThrough: 0,
      doneWaiters: [],
      valueWaiters: new Map(),
      degraded: false,
      // offline は「切断中」。everConnected が false の間は「まだ来ていない」
      // で、質問は捨てずにアウトボックスへ積んで welcome で届ける。
      offline: true,
      everConnected: false,
      // 切断猶予中（再接続を待っている）。過ぎると abandoned=true で AI 代行。
      graceTimer: null,
      abandoned: false,
    };
    this.channels.set(uid, channel);
    return channel;
  }

  /** WebSocket が開いた。現状の完全な状態と未ACKイベントを渡す。 */
  connect(uid) {
    if (!this.isParticipant(uid)) throw new Error('この部屋の参加者ではありません');
    const channel = this._channel(uid);
    if (channel.graceTimer) { clearTimeout(channel.graceTimer); channel.graceTimer = null; }
    channel.offline = false;
    channel.everConnected = true;
    channel.abandoned = false;
    channel.degraded = false;
    this.online.add(uid);
    const player = this.playerOf(uid);
    if (player?.pvpAutoCpu && !player.pvpHumanRestorePending && this.status === 'battling') {
      // 自動AI化からの復帰は手番開始境界だけで行う（onTurnBoundary）。
      // 通信復帰の瞬間に isCPU を反転すると、進行中のCPU戦闘の途中から
      // 人間向け選択UIへ切り替わってしまう。
      player.pvpHumanRestorePending = true;
      this.game.onLog(`${player.name}の再接続を確認。次の手番から操作へ復帰します`);
      this.game._notifyState();
    }
    this.io.send(uid, {
      t: 'welcome',
      uid,
      playerId: player?.id ?? null,
      room: this.roomSummary(),
      state: this.lastPublicState,
      hand: player ? (this.lastHands.get(player.id) ?? []) : [],
      events: channel.outbox,
      ackedThrough: channel.ackedThrough,
    });
    if (this.status === 'finished') this.io.send(uid, { t: 'finished', result: this.finishResult });
    this._maybeLaunch();
  }

  /**
   * WebSocket が閉じた。すぐには諦めず、猶予の間は「まだ来ていない」扱いで
   * 演出・質問を積んで待つ（再接続の welcome で届く）。猶予を過ぎたら
   * _abandon で未回答の質問を解除し、以後は AI が代行する。
   */
  disconnect(uid, { immediate = false } = {}) {
    if (!this.channels.has(uid) && !this.online.has(uid)) return;
    this.online.delete(uid);
    const channel = this._channel(uid);
    channel.offline = true;
    channel.degraded = true;
    if (immediate || this.status !== 'battling' || !(this.io.disconnectGraceMs > 0)) {
      this._abandon(uid);
      return;
    }
    if (channel.graceTimer) return;
    channel.graceTimer = setTimeout(() => {
      channel.graceTimer = null;
      if (!channel.offline) return; // 猶予内に戻ってきた
      this._abandon(uid);
    }, this.io.disconnectGraceMs);
  }

  /** 猶予切れ／明示的な退出: 発行済みの質問を解除し、演出列を捨て、AI 代行へ。 */
  _abandon(uid) {
    const channel = this._channel(uid);
    if (channel.graceTimer) { clearTimeout(channel.graceTimer); channel.graceTimer = null; }
    channel.abandoned = true;
    const resetThrough = Math.max(channel.ackedThrough, channel.outbox[channel.outbox.length - 1]?.id || 0);
    const error = new Error('参加者の通信が切断されました');
    for (const waiter of channel.doneWaiters) { clearTimeout(waiter.timer); waiter.resolve(); }
    for (const waiter of channel.valueWaiters.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    channel.doneWaiters = [];
    channel.valueWaiters.clear();
    channel.outbox = [];
    channel.ackedThrough = resetThrough;
    const player = this.playerOf(uid);
    if (player && this.status === 'battling') {
      if (player.pvpAutoCpu) player.pvpHumanRestorePending = false;
      if (!player.isCPU) {
        player.isCPU = true;
        player.pvpAutoCpu = true;
        player.pvpHumanRestorePending = false;
        this.game.onLog(`${player.name}の通信が切断されたためAIへ切り替え`);
        this.game._notifyState();
        this._kickCpuIfStalled(player);
      }
    }
  }

  /**
   * 人間を AI へ切り替えた直後の停止防止。サイコロ待ち（awaitingRoll）の
   * 本人が AI 化されると、Game 側は _beginTurn でしか _runCPUTurn を起動
   * しないため誰もサイコロを振らず盤面が永久に止まる（旧 Firestore 版でも
   * 30秒切断→AI化で同じ状況になり得た）。ここで CPU の手番を起動する。
   */
  _kickCpuIfStalled(player) {
    const game = this.game;
    if (!game || this.status !== 'battling' || !player?.isCPU) return;
    if (game.currentPlayer !== player || !game.awaitingRoll || game.isBusy) return;
    void game._runCPUTurn();
  }

  _onTurnBoundary(player) {
    if (!player?.pvpHumanRestorePending) return;
    player.pvpHumanRestorePending = false;
    if (!player.pvpAutoCpu) return;
    player.isCPU = false;
    player.pvpAutoCpu = false;
    this.game.onLog(`${player.name}が再接続し、操作を取り戻した`);
  }

  roomSummary() {
    return {
      roomCode: this.config?.roomCode ?? null,
      hostUid: this.config?.hostUid ?? null,
      mapId: this.config?.mapId ?? null,
      goalCurrency: this.config?.goalCurrency ?? null,
      bgmTrack: this.config?.bgmTrack ?? null,
      status: this.status,
      waitCutRate: this.waitCutRate,
      players: (this.config?.playerConfigs ?? []).map((cfg, playerId) => ({
        playerId,
        uid: cfg.uid,
        name: cfg.name,
        color: cfg.color,
        isCPU: cfg.isCPU,
        allianceId: cfg.allianceId ?? null,
        iconDataUrl: cfg.iconDataUrl || '',
        online: !!cfg.uid && this.online.has(cfg.uid),
      })),
    };
  }

  // ── クライアントからのメッセージ ─────────────────────────────────
  handleMessage(uid, message) {
    if (!message || typeof message !== 'object' || !this.isParticipant(uid)) return;
    switch (message.t) {
      case 'ack': return this._handleAck(uid, message);
      case 'action': return this._handleAction(uid, message.action);
      case 'ban': return this._handleBan(uid, message.playerId);
      case 'waitCut': return this._handleWaitCut(uid, message.rate);
      case 'leave': return this._handleLeave(uid);
      case 'clientError': {
        const type = String(message.eventType || '').slice(0, 48).replace(/[^a-zA-Z0-9]/g, '');
        console.warn('pvp-client-playback-error', { room: this.config?.roomCode, type, eventId: Number(message.eventId) || 0 });
        return;
      }
      case 'ping': return this.io.send(uid, { t: 'pong' });
      default: return undefined;
    }
  }

  _handleAck(uid, { through, value }) {
    const channel = this._channel(uid);
    const doneSeq = Number(through) || 0;
    if (doneSeq > channel.ackedThrough) channel.ackedThrough = doneSeq;
    channel.degraded = false; // 応答が来た＝追いついたので演出同期の待機を再開する
    channel.outbox = channel.outbox.filter((event) => event.id > doneSeq);
    channel.doneWaiters = channel.doneWaiters.filter((waiter) => {
      if (waiter.id > doneSeq) return true;
      clearTimeout(waiter.timer);
      waiter.resolve();
      return false;
    });
    if (value && typeof value === 'object' && channel.valueWaiters.has(value.id)) {
      const waiter = channel.valueWaiters.get(value.id);
      channel.valueWaiters.delete(value.id);
      clearTimeout(waiter.timer);
      waiter.resolve(value.v === undefined ? null : value.v);
    }
  }

  /** 本人の手番の自発的操作（サイコロ／スペル）。旧 handlePvpGuestAction と同じ検証。 */
  _handleAction(uid, action) {
    const game = this.game;
    if (!game || this.status !== 'battling' || !action || typeof action !== 'object') return;
    const player = this.playerOf(uid);
    if (!player || player.isCPU || game.currentPlayer?.id !== player.id) return;
    if (action.type === 'rollDice') {
      const steps = Number(action.steps);
      if (Number.isInteger(steps) && steps >= 1 && steps <= 6 && game.awaitingRoll && !game.isBusy) void game.rollDice(steps);
    } else if (action.type === 'useSpell') {
      if (!game.awaitingRoll || game.isBusy) return;
      const card = player.hand.find((c) => c.id === action.cardId);
      if (card) void game.useSpell(card);
    }
  }

  _handleBan(uid, playerId) {
    if (uid !== this.config?.hostUid || !this.game || this.status !== 'battling') return;
    const target = this.game.players.find((p) => p.id === Number(playerId));
    if (!target || target.id === 0 || target.isCPU || target.defeated) return;
    target.isCPU = true;
    target.banned = true;
    this.game.onLog(`${target.name}はホストにBANされ、AI操作へ切り替わった`);
    this.game._notifyState();
    this._kickCpuIfStalled(target);
  }

  _handleWaitCut(uid, rate) {
    if (uid !== this.config?.hostUid) return;
    this.waitCutRate = Math.min(0.7, Math.max(0, Number(rate) || 0));
    // 参加者の歩行アニメ尺に効く値なので、すぐ配る。
    if (this.lastPublicState) this._sendState({ waitCutRate: this.waitCutRate }, { forceLight: true });
  }

  _handleLeave(uid) {
    if (uid === this.config?.hostUid) {
      // ホストの退出は対戦終了（旧 finishPvpRoom と同じ意味）。
      this.finish({ reason: 'hostLeft' });
    } else {
      // ゲストの自発的退出は猶予なしの切断（以後AI代行）。
      this.disconnect(uid, { immediate: true });
    }
  }

  // ── Game → クライアント ──────────────────────────────────────────
  _askHook(type) {
    return (...args) => {
      const forPlayerId = args[args.length - 1];
      const localArgs = args.slice(0, -1);
      const payload = localArgs.length === 1 ? localArgs[0] : Object.fromEntries(localArgs.map((v, i) => [`a${i}`, v]));
      const player = this.game?.players?.find((p) => p.id === forPlayerId);
      const uid = player ? this.config.playerConfigs[player.id]?.uid : null;
      // CPU にはそもそも質問が飛ばないはずだが、飛んだ場合は「何も選ばない」
      // に相当する既定値で必ず抜ける（tools/simulate.mjs の stub と同じ）。
      if (!uid || player.isCPU) return Promise.resolve(this._defaultAnswer(type));
      return this._enqueue(uid, type, payload, 'value').catch((error) => {
        this.io.log(`ask timeout: type=${type} playerId=${forPlayerId} (${error?.message})`);
        // 応答が来ない相手はこのターンの残りを AI へ切り替える（以後の質問で
        // 毎回タイムアウトまで全員を止めない）。
        if (player && !player.isCPU) {
          player.isCPU = true;
          player.pvpAutoCpu = true;
          this.game.onLog(`${player.name}の応答がタイムアウトしたためAI操作へ切り替えました`);
          // ⚠️ 接続したままの相手（切断ではなく、単に質問に気づかなかった／
          // 迷っていた）は次の手番から必ず人間へ戻す。旧 Firestore 版は
          // ハートビートが届き続けることで pvpHumanRestorePending が立ち
          // 次の手番で復帰していたが、WS 版にはハートビートが無いので、
          // ここで立てないと永久に AI のまま＝サイコロもスペルも出ない
          // 「フリーズ」に見える（実機報告で踏んだ）。
          if (this.online.has(uid)) {
            player.pvpHumanRestorePending = true;
            this.game.onLog(`${player.name}は次の手番から操作へ復帰します`);
            this.io.send(uid, { t: 'notice', text: '応答がなかったため、このターンはAIが代行します。次の手番から操作に戻ります' });
          }
          this.game._notifyState();
        }
        return this._defaultAnswer(type);
      });
    };
  }

  _defaultAnswer(type) {
    if (type === 'landCommand') return 'end';
    if (type === 'landSubmenu') return 'back';
    if (type === 'confirmAction' || type === 'confirmMove') return false;
    return null;
  }

  _broadcastHook({ type, awaitDone = false, awaitMover = false }) {
    return (...args) => {
      const payload = args.length === 1 ? args[0] : args;
      const moverUid = awaitMover && payload?.playerId != null ? this.config.playerConfigs[payload.playerId]?.uid : null;
      const waits = [];
      for (const cfg of this.config.playerConfigs) {
        if (!cfg.uid) continue;
        const awaited = awaitDone || (awaitMover && cfg.uid === moverUid);
        const promise = this._enqueue(cfg.uid, type, payload, awaited ? 'done' : 'fire').catch(() => {});
        if (awaited) waits.push(promise);
      }
      return waits.length ? Promise.allSettled(waits) : Promise.resolve();
    };
  }

  /**
   * 参加者チャンネルへの送信。mode:
   *  'fire'  = 投げっぱなし演出（即resolve。クライアントは順番に再生するだけ）
   *  'done'  = 再生完了まで待つ演出（値は返らない）
   *  'value' = 対話プロンプト（回答値が返る）
   * どのmodeも同じアウトボックスに積むので、クライアントの実行順は常に
   * enqueue 順と一致する。
   */
  _enqueue(uid, type, payload, mode) {
    if (this._destroyed) return Promise.reject(new Error('対戦リレーが終了しました'));
    const channel = this._channel(uid);
    if (channel.offline && channel.abandoned) {
      // 猶予切れ／退出した相手: 演出は捨て、質問は即座に諦める（AI代行へ）。
      if (mode === 'fire') return Promise.resolve();
      return Promise.reject(new Error('参加者はオフラインです'));
    }
    // まだ来ていない、または切断猶予中の相手: 送らずに積んでおく
    // （connect の welcome で届く）。演出の完了待ちはしない。
    const notYetJoined = channel.offline;
    if (mode === 'done' && (channel.degraded || notYetJoined)) mode = 'fire';
    const id = this._nextEventId++;
    const event = { id, type, payload: stripUndefined(payload), ack: mode !== 'fire', wantValue: mode === 'value' };
    channel.outbox.push(event);
    // まだ来ていない相手には送らず積んでおく（connect の welcome で届く）。
    if (!notYetJoined) this.io.send(uid, { t: 'events', events: [event], ackedThrough: channel.ackedThrough });
    if (mode === 'fire') return Promise.resolve();
    const timeoutMs = mode === 'value' ? this.io.askTimeoutMs : DONE_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        channel.doneWaiters = channel.doneWaiters.filter((waiter) => waiter.id !== id);
        channel.valueWaiters.delete(id);
        if (mode === 'done') { channel.degraded = true; resolve(); return; }
        reject(new Error('参加者の応答がタイムアウトしました'));
      }, timeoutMs);
      if (mode === 'value') channel.valueWaiters.set(id, { resolve, reject, timer });
      else channel.doneWaiters.push({ id, resolve, reject, timer });
    });
  }

  /**
   * Game._notifyState ごとの公開状態配信。重い tiles（全体の9割超）と
   * turnHand は変わった時だけ載せ、軽い項目は差分があれば毎回送る
   * （旧 flushPvpSync と同じ層別差分。Firestore と違い書き込み回数の
   * 制約は無いので 400ms の間引きは行わない）。手札は本人にだけ送る。
   */
  _publish(snapshot) {
    if (this._destroyed) return;
    const { hands, ...publicPart } = snapshot;
    const { tiles, turnHand, ...light } = publicPart;
    light.waitCutRate = this.waitCutRate;
    const cache = this._publishCache;
    const tilesJson = JSON.stringify(tiles ?? []);
    const turnHandJson = JSON.stringify(turnHand ?? []);
    const tilesChanged = cache.tilesJson !== tilesJson;
    const turnHandChanged = cache.turnHandJson !== turnHandJson;
    if (tilesChanged) cache.tilesRevision += 1;
    const lightPart = { ...light, tilesRevision: cache.tilesRevision };
    const lightJson = JSON.stringify(lightPart);
    const lightChanged = cache.lightJson !== lightJson;
    if (lightChanged || tilesChanged || turnHandChanged) {
      cache.lightJson = lightJson;
      cache.tilesJson = tilesJson;
      cache.turnHandJson = turnHandJson;
      this.lastPublicState = { ...JSON.parse(lightJson), tiles: JSON.parse(tilesJson), turnHand: JSON.parse(turnHandJson) };
      const outgoing = JSON.parse(lightJson);
      if (tilesChanged) outgoing.tiles = this.lastPublicState.tiles;
      if (turnHandChanged) outgoing.turnHand = this.lastPublicState.turnHand;
      this._sendState(outgoing);
    }
    for (const [playerIdStr, hand] of Object.entries(hands || {})) {
      const playerId = Number(playerIdStr);
      const uid = this.config.playerConfigs[playerId]?.uid;
      if (!uid) continue;
      const handJson = JSON.stringify(hand ?? []);
      const safeHand = JSON.parse(handJson);
      this.lastHands.set(playerId, safeHand);
      if (cache.hands.get(uid) === handJson) continue;
      cache.hands.set(uid, handJson);
      if (this.online.has(uid)) this.io.send(uid, { t: 'hand', hand: safeHand });
    }
  }

  _sendState(state) {
    for (const uid of this.online) this.io.send(uid, { t: 'state', state });
  }

  /** 操作可能な安全地点（サイコロ／スペルを選べる瞬間）だけ保存する。 */
  _onSafePoint(state) {
    if (this.status !== 'battling') return;
    try {
      this.io.persist({ config: this.config, snapshot: state, waitCutRate: this.waitCutRate, savedAt: this.io.now() });
    } catch (error) {
      this.io.log(`persist failed: ${error?.message}`);
    }
  }

  // ── 決着・終了 ───────────────────────────────────────────────────
  _onBattleEnd(result) {
    if (this.status !== 'battling') return;
    const winnerIds = result?.winnerPlayerId != null
      ? [result.winnerPlayerId]
      : (Array.isArray(result?.alivePlayerIds) ? result.alivePlayerIds : []);
    this.finish({
      reason: 'settled',
      winnerPlayerId: result?.winnerPlayerId ?? null,
      alivePlayerIds: Array.isArray(result?.alivePlayerIds) ? result.alivePlayerIds : [],
      winnerIds,
    });
  }

  /**
   * 終了。各参加者の「自分の取り分」（同盟は人数割り）をサーバー側で
   * 確定して配る - 報酬計算の根拠を各ブラウザの推測値ではなく権威側の
   * 値にする。
   */
  finish(partial = {}) {
    if (this.status === 'finished') return this.finishResult;
    this.status = 'finished';
    const game = this.game;
    const players = game
      ? game.players.map((p) => {
        const allianceSize = p.allianceId != null ? game.players.filter((o) => o.allianceId === p.allianceId).length : 1;
        return {
          id: p.id,
          allianceId: p.allianceId ?? null,
          allianceSize,
          totalAssets: game._totalAssetsOf(p),
          endingAssetsShare: game._totalAssetsOf(p) / Math.max(allianceSize, 1),
          defeated: !!p.defeated,
        };
      })
      : [];
    const winnerIds = partial.winnerIds ?? [];
    this.finishResult = {
      reason: partial.reason ?? 'ended',
      winnerPlayerId: partial.winnerPlayerId ?? null,
      alivePlayerIds: partial.alivePlayerIds ?? [],
      winnerIds,
      turnCount: game?.turnCount ?? 0,
      players: players.map((p) => ({
        ...p,
        won: winnerIds.some((id) => id === p.id || (p.allianceId != null && players.find((o) => o.id === id)?.allianceId === p.allianceId)),
      })),
    };
    if (this._pendingStart) { clearTimeout(this._pendingStart.timer); this._pendingStart = null; }
    try { game?.cancel?.(); } catch { /* noop */ }
    for (const uid of this.online) this.io.send(uid, { t: 'finished', result: this.finishResult });
    for (const channel of this.channels.values()) {
      if (channel.graceTimer) { clearTimeout(channel.graceTimer); channel.graceTimer = null; }
      for (const waiter of channel.doneWaiters) { clearTimeout(waiter.timer); waiter.resolve(); }
      for (const waiter of channel.valueWaiters.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('対戦は終了しました')); }
      channel.doneWaiters = [];
      channel.valueWaiters.clear();
    }
    try { this.io.onFinished(this.finishResult); } catch (error) { this.io.log(`onFinished failed: ${error?.message}`); }
    return this.finishResult;
  }

  destroy() {
    this._destroyed = true;
    if (this._pendingStart) { clearTimeout(this._pendingStart.timer); this._pendingStart = null; }
    try { this.game?.cancel?.(); } catch { /* noop */ }
    for (const channel of this.channels.values()) {
      if (channel.graceTimer) { clearTimeout(channel.graceTimer); channel.graceTimer = null; }
      for (const waiter of channel.doneWaiters) { clearTimeout(waiter.timer); waiter.resolve(); }
      for (const waiter of channel.valueWaiters.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('対戦リレーが終了しました')); }
      channel.doneWaiters = [];
      channel.valueWaiters.clear();
    }
  }
}
