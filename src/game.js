import { TileType, mapRequiresAllCheckpoints } from './board.js';
import { PIECE_REST_Y } from './scene.js';
import { CardType, CARD_COLOR, Element, ELEMENT_LABEL, Deck } from './cards.js';
import { buildStarterExtraCards, WEAK_AGAINST } from './battleCards.js';
import { createFieldUnit, resolveBattle, equipItem, applyCurse } from './battle.js';
import { getCardCatalog } from './cardCatalog.js';
import { tween, easeInOutQuad, delay } from './utils.js';

const SHOP_OPTION_COUNT = 3;

function randomSample(list, count) {
  const pool = [...list];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

const STEP_DURATION_MS = 300;
const START_BONUS = 100;

const STARTING_HAND_SIZE = 4;
const HAND_LIMIT = 6;

// The camera doesn't chase every step - it only pans once movement adds up
// to this many tiles since its last pan (across turns, not reset per
// roll), so small moves leave it completely still.
const TILE_PAN_THRESHOLD = 3;

// CPU "thinking" pauses so its turns don't blow by instantly.
const CPU_PRE_ROLL_MS = 1400;
const CPU_DECISION_MS = 900;

// Culdcept-accurate land economy: 地価 = 基本地価(tile.price) × レベル倍率 ×
// 連鎖倍率, 通行料 = 地価 × 通行料倍率. Both multiplier tables only go up to
// Lv5, so land level is capped there too (レベルアップ can't push past it).
const LEVEL_CAP = 5;
// カルドセプト ビギンズ系
const CHAIN_MULTIPLIER = { 1: 1.0, 2: 1.5, 3: 2.0, 4: 2.5, 5: 3.0 };
const TOLL_RATE = { 1: 0.3, 2: 0.3, 3: 0.4, 4: 0.6, 5: 0.8 };
// Flat cost to level up FROM the given level (not a formula) - keyed by current level.
const LEVEL_UP_COST = { 1: 50, 2: 200, 3: 400, 4: 600 };
// 属性変更コスト = 現レベル×100（無色マスからの変更は半額）
const ELEMENT_CHANGE_COST_PER_LEVEL = 100;
const NEUTRAL_ELEMENT_CHANGE_DISCOUNT = 0.5;
const CHANGEABLE_ELEMENTS = [Element.FIRE, Element.WATER, Element.THUNDER, Element.FOREST, Element.NEUTRAL];

// 速度違反はご愛嬌（ほこら効果）で強制されるサイコロ目。
const FORCED_DICE_STEPS = 10;

export class Game {
  constructor({
    tiles,
    mapId,
    scene,
    onLog,
    onStateChange,
    onCardReveal,
    onDiscardChoice,
    onSpellUse,
    onCpuRoll,
    onMoveComplete,
    onLandCommand,
    onPickMonsterCard,
    onConfirmAction,
    onConfirmMove,
    onConfirmSellLand,
    onPickBrowseTile,
    onLandSubmenu,
    onPickAbilityTarget,
    onShowTileInfo,
    onChooseBranch,
    onPickMoveDirection,
    onPickElement,
    onShopPurchase,
    onBattleSceneEnter,
    onPickBattleItem,
    onBattleAttack,
    onBattleRetreat,
    onBattleOutcome,
    onStoryBattleEnd,
    onPvpSync,
    playerConfigs,
    humanPlayer,
    storyMode = false,
  }) {
    this.tiles = tiles;
    this.requireAllCheckpoints = mapRequiresAllCheckpoints(mapId);
    // このマップに実在するチェックポイント番号一覧（board.jsが生成順に
    // 1から振ったもの）- プレイヤーパネルの通過状況表示用に_notifyState
    // で毎回そのまま送る（renderPlayerPanels参照）。
    this.checkpointNumbers = this.tiles
      .filter((t) => t.type === TileType.EVENT)
      .map((t) => t.checkpointNumber)
      .sort((a, b) => a - b);
    this.scene = scene;
    this.onLog = onLog;
    this.onStateChange = onStateChange;
    this.onCardReveal = onCardReveal;
    this.onDiscardChoice = onDiscardChoice;
    this.onSpellUse = onSpellUse;
    this.onCpuRoll = onCpuRoll;
    this.onMoveComplete = onMoveComplete;
    this.onLandCommand = onLandCommand;
    this.onPickMonsterCard = onPickMonsterCard;
    this.onConfirmAction = onConfirmAction;
    this.onConfirmMove = onConfirmMove;
    this.onConfirmSellLand = onConfirmSellLand;
    this.onPickBrowseTile = onPickBrowseTile;
    this.onLandSubmenu = onLandSubmenu;
    this.onPickAbilityTarget = onPickAbilityTarget;
    this.onShowTileInfo = onShowTileInfo;
    this.onChooseBranch = onChooseBranch;
    this.onPickMoveDirection = onPickMoveDirection;
    this.onPickElement = onPickElement;
    this.onShopPurchase = onShopPurchase;
    this.onBattleSceneEnter = onBattleSceneEnter;
    this.onPickBattleItem = onPickBattleItem;
    this.onBattleAttack = onBattleAttack;
    this.onBattleRetreat = onBattleRetreat;
    this.onBattleOutcome = onBattleOutcome;
    this.onStoryBattleEnd = onStoryBattleEnd;
    // 対人戦(PvP)ホスト側のみ使う: _notifyStateのたびに盤面全体のスナップ
    // ショットを渡す（main.js側がFirestoreへpublishする）。通常対戦/
    // ストーリーでは未設定のままなので何も起きない。
    this.onPvpSync = onPvpSync;
    // ストーリーモードでは破産＝敗北（脱落）としてそのままバトル終了判定に
    // つながる（_checkBankruptcy/_checkStoryWinCondition参照）。通常の対戦
    // モードでは今まで通り500Gを渡されゴール地点から再スタートするだけ。
    this.storyMode = storyMode;
    this.storyEnded = false;

    // 2人対戦（通常の対戦モード）呼び出し元との後方互換: playerConfigsが
    // 渡されなければ、これまで通りhumanPlayer+固定CPUの2人構成を組む。
    // ストーリーモード（1vs1vs1・2vs2同盟戦など）はplayerConfigsで任意の
    // 人数・陣営を渡す - ターン進行/CPUロジック/同盟集計は元々players配列
    // の長さやallianceIdだけを見て動く汎用実装なので、人数を増やすだけで
    // そのまま機能する。
    const resolvedConfigs = playerConfigs || [
      {
        name: humanPlayer?.name || 'プレイヤー',
        isCPU: false,
        color: humanPlayer?.color ?? 0x2ec4b6,
        allianceId: null,
        deckList: humanPlayer?.deckList,
        deckVariant: humanPlayer?.deckVariant,
        iconImage: humanPlayer?.iconImage,
      },
      { name: 'CPU', isCPU: true, color: 0xe63946, allianceId: null },
    ];

    // tileId indexes into `tiles` (ids are assigned sequentially at parse
    // time, so id === array index). previousTileId excludes backtracking
    // when picking the next step at a branch (see _movePlayer) - null at
    // game start, when every neighbor of the start tile is a fair option.
    this.players = resolvedConfigs.map((cfg, id) => ({
      id,
      name: cfg.name,
      isCPU: !!cfg.isCPU,
      currency: 500,
      tileId: 0,
      previousTileId: null,
      color: cfg.color,
      // 盤面駒の見た目に使うcanvas - null なら色付き丸のプレースホルダー
      // 駒になる（init()参照）。人間プレイヤーのアイコン選択（iconSheet.js）
      // だけでなく、ストーリーの名前付きNPC（npcArt.js経由）も同じ仕組み
      // に乗る - CPU/人間を問わずcfg.iconImageさえ入っていれば使われる。
      iconImage: cfg.iconImage ?? null,
      allianceId: cfg.allianceId ?? null,
      deck: cfg.deckList ? Deck.fromCardList(cfg.deckList) : new Deck(buildStarterExtraCards(cfg.deckVariant)),
      hand: [],
      spellUsedThisTurn: false,
      defeated: false,
      // requireAllCheckpointsが有効なマップでだけ参照する: このラップで
      // 通過済みのチェックポイント(EVENT)タイルidの集合。ゴールでボーナスを
      // 受け取った瞬間にクリアする（_movePlayer/_resolveSpecialTile参照）。
      passedCheckpoints: new Set(),
    }));
    this.currentPlayerIndex = 0;
    this.isBusy = false;
    this.tilesSincePan = 0;
    // Tile ids stepped onto during the current dice roll (landing tile
    // included, the tile moved FROM excluded) - reset at the start of each
    // _movePlayer call. Powers 土地コマンド's "土地" browse, which is
    // normally scoped to just this turn's path (see _runLandCommand).
    this._turnPathIds = [];
    // True from the moment a turn's draw finishes until the dice is
    // rolled - the window where the center hand+dice is shown and a
    // spell may be used.
    this.awaitingRoll = false;
    // ほこら効果「速度違反はご愛嬌」用: 残りこの人数分の手番は、サイコロ
    // フェーズ自体を見せずに強制的にFORCED_DICE_STEPS進める（_beginTurn
    // 参照）。全員1回ずつ食らったら0に戻り通常進行に戻る。
    this.forcedDiceRemaining = 0;
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  init() {
    for (const player of this.players) {
      const pos = this.tiles[player.tileId].position;
      player.mesh = player.iconImage
        ? this.scene.createPieceFromImage(player.iconImage, pos)
        : this.scene.createPiece(player.color, pos);
      for (let i = 0; i < STARTING_HAND_SIZE; i++) {
        const card = player.deck.draw();
        if (card) player.hand.push(card);
      }
    }
    const startPos = this.tiles[this.currentPlayer.tileId].position;
    this.scene.setFocusImmediate(startPos.x, startPos.z);
    this._beginTurn();
  }

  /** Runs automatically whenever a turn starts: draw, then hand control to the player (or CPU). */
  async _beginTurn() {
    this.isBusy = true;
    this.awaitingRoll = false;
    this.currentPlayer.spellUsedThisTurn = false;
    this._notifyState();

    await this._drawForTurn(this.currentPlayer);

    this.isBusy = false;
    this.awaitingRoll = true;

    // 速度違反はご愛嬌: サイコロフェーズ自体を一切見せず、この場で即
    // FORCED_DICE_STEPSを振ったことにする（awaitingRoll=trueを一度も
    // 通知しないので、UI上はダイス演出もスペル使用の隙も生まれない）。
    if (this.forcedDiceRemaining > 0) {
      this.forcedDiceRemaining -= 1;
      this.onLog(`${this.currentPlayer.name}は速度違反の効果でサイコロ${FORCED_DICE_STEPS}固定！`);
      await this.rollDice(FORCED_DICE_STEPS);
      return;
    }

    this._notifyState();

    if (this.currentPlayer.isCPU) {
      this._runCPUTurn();
    }
  }

  /** Uses a spell from the current (human) player's hand, once per turn, before rolling. */
  async useSpell(card) {
    if (this.isBusy || !this.awaitingRoll || this.currentPlayer.isCPU) return;
    const player = this.currentPlayer;
    if (player.spellUsedThisTurn) return;
    if (card.type !== CardType.SPELL) return;
    if (!player.hand.some((c) => c.id === card.id)) return;

    this.isBusy = true;
    this._notifyState();

    player.hand = player.hand.filter((c) => c.id !== card.id);
    player.deck.discard(card);
    player.spellUsedThisTurn = true;
    this.onLog(`${player.name}は「${card.name}」を使用した`);

    await this.onSpellUse(card);

    this.isBusy = false;
    this._notifyState();
  }

  /**
   * `steps` is the already-determined dice result (from the UI's
   * spin-and-stop, or CPU's own roll). Turn order: ① move ② resolve a
   * special tile (goal/checkpoint) if landed on one ③ land command menu
   * if landed on a land tile.
   */
  async rollDice(steps) {
    if (this.isBusy || !this.awaitingRoll) return;
    this.isBusy = true;
    this.awaitingRoll = false;
    this._notifyState();

    const player = this.currentPlayer;
    this.onLog(`${player.name}のサイコロ: ${steps}`);

    await this._movePlayer(player, steps);
    this.onMoveComplete?.();
    await this._resolveSpecialTile(player);
    await this._runLandCommand(player);
    await delay(400);

    // 相手側が戦闘中の略奪特性等でマイナスになっている可能性もあるので、
    // 今操作したプレイヤーだけでなく全員をチェックする。
    for (const p of this.players) this._checkBankruptcy(p);
    if (this.storyEnded) return; // ストーリーモードで決着がついたらターン進行を止める

    this._nextTurn();
    await this._beginTurn();
  }

  /**
   * 破産処理。通常の対戦モードでは所持Gがマイナスになったプレイヤーは
   * 500Gを渡され、ゴール地点（スタートマス）から再スタートする（デッキ・
   * 手札は変化しない。土地の所有権もこれだけでは失われない）。
   * ストーリーモードでは破産＝脱落（敗北）として扱い、盤上から取り除いた
   * 上で_checkStoryWinConditionに勝敗判定を委ねる。
   */
  _checkBankruptcy(player) {
    if (player.currency >= 0 || player.defeated) return;
    if (this.storyMode) {
      player.defeated = true;
      player.currency = 0;
      if (player.mesh) player.mesh.visible = false;
      for (const tile of this.tiles) {
        if (tile.owner === player.id) {
          tile.unit = null;
          tile.owner = null;
          this._repaintTileToElement(tile);
        }
      }
      this.onLog(`${player.name}は脱落した！`);
      this._notifyState();
      this._checkStoryWinCondition();
      return;
    }
    const startTile = this.tiles.find((t) => t.type === TileType.START);
    player.currency = 500;
    player.tileId = startTile.id;
    player.previousTileId = null;
    if (player.mesh) player.mesh.position.set(startTile.position.x, PIECE_REST_Y, startTile.position.z);
    this.onLog(`${player.name}は破産した！500Gを渡されゴール地点から再スタート`);
    this._notifyState();
  }

  /**
   * ストーリーモード専用の勝敗判定: 生存中（未脱落）プレイヤーの陣営数を
   * 数え、1陣営（同盟含む・ソロはp.id単位）まで絞られたらバトル終了。
   * 2vs2同盟戦もFFAも同じロジックで判定できる（allianceIdの汎用集計）。
   */
  _checkStoryWinCondition() {
    if (!this.storyMode || this.storyEnded) return;
    const alive = this.players.filter((p) => !p.defeated);
    const aliveSideIds = new Set(alive.map((p) => (p.allianceId != null ? `a${p.allianceId}` : `p${p.id}`)));
    if (aliveSideIds.size > 1) return;
    this.storyEnded = true;
    const won = alive.some((p) => !p.isCPU);
    this.onLog(won ? '勝利した！' : '敗北した…');
    this.onStoryBattleEnd?.({ won, alivePlayerIds: alive.map((p) => p.id) });
  }

  async _drawForTurn(player) {
    const card = player.deck.draw();
    if (!card) return;

    if (player.isCPU) {
      this.onLog(`${player.name}はカードを1枚引いた`);
    } else {
      await this.onCardReveal(card, player.id);
    }

    player.hand.push(card);
    this._notifyState();

    if (player.hand.length > HAND_LIMIT) {
      let discarded;
      if (player.isCPU) {
        await delay(CPU_DECISION_MS);
        discarded = player.hand[0];
      } else {
        discarded = await this.onDiscardChoice(player.hand, player.id);
      }
      player.hand = player.hand.filter((c) => c.id !== discarded.id);
      player.deck.discard(discarded);
      if (player.isCPU) this.onLog(`${player.name}は手札を1枚捨てた`);
      this._notifyState();
    }
  }

  /**
   * The board is a graph (see board.js - the outer loop plus a "+"-shaped
   * inner cross), not a simple loop, so each step picks the next tile from
   * `fromTile.neighbors` rather than a fixed +1/-1. A tile with exactly one
   * forward option (excluding wherever the player just came from) just
   * continues automatically; a branch (2+ options - the 4 edge-midpoints
   * and the center) prompts a choice every time it's reached, not just
   * once at game start.
   */
  async _movePlayer(player, steps) {
    this._turnPathIds = [];
    for (let i = 0; i < steps; i++) {
      const fromTile = this.tiles[player.tileId];
      const forward = fromTile.neighbors.filter((id) => id !== player.previousTileId);
      const options = forward.length > 0 ? forward : fromTile.neighbors;

      const nextId = options.length === 1 ? options[0] : await this._chooseNextTile(player, fromTile, options);
      const toTile = this.tiles[nextId];
      player.previousTileId = player.tileId;
      player.tileId = nextId;
      this._turnPathIds.push(nextId);
      await this._stepWithCamera(player, fromTile.position, toTile.position);

      if (toTile.type === TileType.EVENT) player.passedCheckpoints.add(toTile.id);

      if (toTile.type === TileType.START && i < steps - 1) {
        this._grantGoalBonus(player);
      }

      // 強制停止の呪い（ほこら効果「右の頬をシバかれたら～」）: 自分の土地・
      // 同盟仲間の土地は素通りできるが、それ以外は通過中でもここで足を
      // 止められる（このターンの残りステップは消化しない）。
      if (this._isForcedStopFor(player, toTile)) {
        if (i < steps - 1) this.onLog(`${player.name}は強制停止の呪いで足を止めた！`);
        break;
      }
    }
  }

  /** ゴール(START)着地/通過どちらからも呼ぶ: このマップにrequireAllCheckpointsが立っていれば全チェックポイント通過済みの時だけボーナスを渡し、渡したらこのラップ分の通過記録をクリアする。立っていなければ無条件で渡す（従来通り）。 */
  _grantGoalBonus(player) {
    if (this.requireAllCheckpoints && !this._hasPassedAllCheckpoints(player)) {
      this.onLog(`${player.name}はゴールを通過（チェックポイント未通過のためボーナスなし）`);
      return;
    }
    player.currency += START_BONUS;
    this.onLog(`${player.name}はゴールを通過！ +${START_BONUS}`);
    if (this.requireAllCheckpoints) player.passedCheckpoints.clear();
  }

  _hasPassedAllCheckpoints(player) {
    return this.tiles
      .filter((t) => t.type === TileType.EVENT)
      .every((t) => player.passedCheckpoints.has(t.id));
  }

  /** 強制停止の呪いが今このプレイヤーに対して効くか。呪い付きの土地でも、所有者本人と同盟仲間は素通りできる。 */
  _isForcedStopFor(player, tile) {
    if (!tile.forcedStopCursed || tile.type !== TileType.LAND || tile.owner == null) return false;
    if (tile.owner === player.id) return false;
    const owner = this.players.find((p) => p.id === tile.owner);
    if (owner?.allianceId != null && owner.allianceId === player.allianceId) return false;
    return true;
  }

  /** CPU just picks randomly; the human is prompted (camera-work + diagonal arrows toward whichever screen direction each option actually sits in). */
  async _chooseNextTile(player, fromTile, optionIds) {
    if (player.isCPU) return optionIds[Math.floor(Math.random() * optionIds.length)];

    const options = optionIds.map((id) => {
      const tile = this.tiles[id];
      const dgx = tile.gridX - fromTile.gridX;
      const dgz = tile.gridZ - fromTile.gridZ;
      const screenDir = dgx === 1 ? 'downright' : dgx === -1 ? 'upleft' : dgz === 1 ? 'downleft' : 'upright';
      return { tileId: id, screenDir };
    });
    return this.onChooseBranch(options, player.id);
  }

  /**
   * The piece moves at a constant, uninterrupted pace - the camera pan (if
   * any) is fired off in the background and never awaited, so a slower
   * multi-hundred-ms pan can never stall the next tile's step.
   */
  _stepWithCamera(player, from, to) {
    if (this.scene.isOutsideSafeView(to.x, to.z)) {
      this.scene.panTo(to.x, to.z);
      this.tilesSincePan = 0;
    } else {
      this.tilesSincePan += 1;
      if (this.tilesSincePan >= TILE_PAN_THRESHOLD) {
        this.scene.panTo(to.x, to.z);
        this.tilesSincePan = 0;
      }
    }

    return this._tweenStep(player, from, to);
  }

  _tweenStep(player, from, to) {
    return tween(STEP_DURATION_MS, (t) => {
      const eased = easeInOutQuad(t);
      const x = from.x + (to.x - from.x) * eased;
      const z = from.z + (to.z - from.z) * eased;
      const hop = Math.sin(Math.PI * t) * 0.5;
      player.mesh.position.set(x, PIECE_REST_Y + hop, z);
    });
  }

  /**
   * ② Goal/checkpoint/shop handling. Landing on someone else's land no
   * longer charges the toll here immediately - it's deferred until the
   * land command resolves (see _settleLandingToll), since a successful
   * invasion waives it entirely.
   */
  async _resolveSpecialTile(player) {
    const tile = this.tiles[player.tileId];

    if (tile.type === TileType.START) {
      this._grantGoalBonus(player);
    } else if (tile.type === TileType.EVENT) {
      this.onLog(`${player.name}はチェックポイントに止まった`);
    } else if (tile.type === TileType.SHOP) {
      await this._resolveShopTile(player);
    } else if (tile.type === TileType.SHRINE) {
      await this._resolveShrineTile(player);
    } else if (tile.type === TileType.WARP) {
      await this._resolveWarpTile(player);
    }

    await delay(200);
  }

  /**
   * ショップマス: offers 3 random catalog cards (paid for with in-battle G,
   * added straight to hand). This is intentionally disconnected from
   * character.ownedCards - it's a one-match-only pickup, not a permanent
   * acquisition, so it must never touch the persistent collection (that's
   * the hub's ショップ screen's job, a completely separate system).
   */
  async _resolveShopTile(player) {
    if (player.isCPU) return; // CPU doesn't shop
    // Spells have no cost field at all today (useSpell has always been
    // free once drawn) - excluded here rather than pretending they cost 0G.
    const sellable = getCardCatalog().filter((c) => c.cost != null);
    const options = randomSample(sellable, SHOP_OPTION_COUNT);
    const card = await this.onShopPurchase(options, player.currency, player.id);
    if (!card) return;
    if (player.currency < card.cost) {
      this.onLog('ゴールドが足りません');
      return;
    }
    player.currency -= card.cost;
    player.hand.push({ ...card, id: `shop-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}` });
    this.onLog(`${player.name}はショップで「${card.name}」を購入した (-${card.cost}G)`);
    this._notifyState();
  }

  /**
   * ほこらマス: ちょうど止まると「マダイの福音書」として4種類の効果から
   * 1つがランダムに発生する（②マダイの岩礁マップ専用）。誰が止まっても
   * 平等に発生しうる - トリガーしたのが人間かCPUかは効果の内容を変えない。
   */
  async _resolveShrineTile(player) {
    this.onLog('マダイの福音書……');
    const effects = [this._shrineChaos, this._shrineDoubleAtk, this._shrineForcedDice, this._shrineForcedStop];
    const effect = effects[Math.floor(Math.random() * effects.length)];
    await effect.call(this, player);
    this._notifyState();
  }

  /** 混沌を愛せ: 発動したプレイヤーの手札を全て捨て、デッキ（山札+捨札）を丸ごと再シャッフルしてから5枚引き直す。 */
  _shrineChaos(player) {
    this.onLog('「混沌を愛せ」……手札が入れ替わる！');
    for (const card of player.hand) player.deck.discard(card);
    player.hand = [];
    player.deck.resetShuffle();
    for (let i = 0; i < 5; i++) {
      const card = player.deck.draw();
      if (card) player.hand.push(card);
    }
  }

  /** 力こそパワー: 盤上に配置中の全モンスターから1体をランダムに選び、「倍化」という名の永続呪い（基礎ATKと同じ量を加算＝基礎ATKが実質2倍）をかける。盤上にモンスターが1体もいなければ不発。 */
  _shrineDoubleAtk() {
    const candidates = this.tiles.filter((t) => t.unit != null);
    if (candidates.length === 0) {
      this.onLog('「力こそパワー」……だが誰もいなかった');
      return;
    }
    const tile = candidates[Math.floor(Math.random() * candidates.length)];
    const unit = tile.unit;
    applyCurse(unit, { name: '倍化', addedAtk: unit.def.atk, addedHp: 0 });
    this.onLog(`「力こそパワー」……${unit.def.name}の基礎ATKが倍になった！`);
  }

  /** 速度違反はご愛嬌: 次のプレイヤー人数分の手番、サイコロフェーズを飛ばして強制的にFORCED_DICE_STEPS進ませる（_beginTurn参照）。 */
  _shrineForcedDice() {
    this.onLog('「速度違反はご愛嬌」……次の一巡、全員のサイコロが強制的に固定される！');
    this.forcedDiceRemaining = this.players.length;
  }

  /** 右の頬をシバかれたら、左の頬をシバきなさい: 盤上に配置中の全モンスターの土地に強制停止の呪いをかける（自分の土地以外を素通りできなくなる。同盟仲間は対象外 - _isForcedStopFor参照）。この呪いは戦闘が起きると解ける（_runInvasion/_humanMoveFlow参照）。 */
  _shrineForcedStop() {
    const targets = this.tiles.filter((t) => t.unit != null);
    for (const tile of targets) tile.forcedStopCursed = true;
    this.onLog(`「右の頬をシバかれたら、左の頬をシバきなさい」……配置中の全モンスターに強制停止の呪いがかかった！（${targets.length}箇所）`);
  }

  /**
   * ワープマス: ちょうど止まると対になるワープ先へ瞬間移動する（③の
   * マップ専用 - 物理的に隔絶されたもう一つの島との唯一の行き来手段。
   * warpTargetIdはcreateBoardが構築時にリンク付け済み - board.js参照）。
   * 歩行のtween演出はせず、その場で座標をスナップする（「瞬間移動」の
   * 演出として意図的に一歩ずつ歩かせない）。ワープ後は移動元の概念が
   * 無くなるのでpreviousTileIdをリセットし、次の分岐では全方向が候補
   * になる。
   */
  _resolveWarpTile(player) {
    const tile = this.tiles[player.tileId];
    const targetTile = this.tiles.find((t) => t.id === tile.warpTargetId);
    if (!targetTile) return;
    player.previousTileId = null;
    player.tileId = targetTile.id;
    if (player.mesh) player.mesh.position.set(targetTile.position.x, PIECE_REST_Y, targetTile.position.z);
    this.scene.panTo(targetTile.position.x, targetTile.position.z);
    this.onLog(`${player.name}はワープした！`);
  }

  /**
   * ③ The 3-button 召喚(/侵略)・土地・終了 menu for whichever tile was
   * landed on. 召喚 acts on the CURRENT tile only (summon/invade/swap,
   * exactly like before); 土地 opens the tile-browse sub-flow (see
   * _runLandBrowse) scoped to this turn's traversed path - or, if the
   * player landed exactly on START/EVENT, to every tile they own (見た目
   * 上の「本拠地」扱い). Both 召喚 and any browse action that actually
   * commits end the turn immediately; a cancelled action just loops back
   * to this menu. Whatever happens, _settleLandingToll runs exactly once
   * right before the turn actually ends (see its own doc comment).
   */
  async _runLandCommand(player) {
    const tile = this.tiles[player.tileId];
    const isAdmin = tile.type === TileType.START || tile.type === TileType.EVENT;
    const owesTollUnlessConquered = tile.type === TileType.LAND && tile.owner != null && tile.owner !== player.id;
    if (tile.type !== TileType.LAND && !isAdmin) return;

    if (player.isCPU) {
      if (tile.type === TileType.LAND) await this._cpuLandCommand(player, tile);
      this._settleLandingToll(player, tile, owesTollUnlessConquered);
      return;
    }

    for (;;) {
      const choice = await this.onLandCommand(
        this.getTileSummary(tile),
        { canSummon: tile.type === TileType.LAND && this._affordableMonsterCards(player).length > 0 },
        player.id,
      );
      if (choice === 'end') break;

      if (choice === 'summon') {
        if (await this._humanSummonFlow(player, tile)) break;
      } else if (choice === 'land') {
        const candidateIds = isAdmin ? this._ownedTiles(player).map((t) => t.id) : [...this._turnPathIds];
        if (candidateIds.length === 0) {
          this.onLog('選択できる土地がありません');
          continue;
        }
        if (await this._runLandBrowse(player, candidateIds)) break;
      }
    }
    this._settleLandingToll(player, tile, owesTollUnlessConquered);
  }

  /**
   * 通行料は「敵地に足を踏み入れたのに、結局そこを奪えなかった」ことへの
   * 代償という扱いに変更（旧仕様は着地した瞬間に無条件徴収していた）。
   * このターンの土地コマンドが終わる瞬間に一度だけ判定する: 侵略に成功して
   * 自分の土地になっていれば免除、相打ちで無人地になっていても（払う相手が
   * もういないので）免除、それ以外（防衛成功、または侵略を試みなかった）
   * は今まで通り徴収する。
   */
  _settleLandingToll(player, tile, owesTollUnlessConquered) {
    if (!owesTollUnlessConquered) return;
    if (tile.owner == null || tile.owner === player.id) return;
    const owner = this.players.find((p) => p.id === tile.owner);
    // 同盟戦: 仲間の土地に止まっても通行料は取られない。
    if (owner.allianceId != null && owner.allianceId === player.allianceId) return;
    const toll = this._tollOfTile(tile);
    player.currency -= toll;
    owner.currency += toll;
    this.onLog(`${player.name}は通行料を支払った (-${toll}G → ${owner.name})`);
    this._notifyState();
  }

  /**
   * 土地コマンドの「土地」: camera-work over just the candidate tiles
   * (blinking/highlighted), tapping one either opens the vertical submenu
   * (own tile with a garrisoned monster) or just shows its info inline
   * (anything else - handled entirely within onPickBrowseTile, which only
   * ever resolves once a "mine" tile is tapped or the player backs out).
   * Returns true once some submenu action actually commits (turn ends);
   * false if the player backs all the way out to the 3-button menu.
   */
  async _runLandBrowse(player, candidateIds) {
    for (;;) {
      const summaries = candidateIds.map((id) => this._browseTileSummary(this.tiles[id], player));
      const pickedId = await this.onPickBrowseTile(summaries, player.id);
      if (pickedId == null) return false;

      const tile = this.tiles[pickedId];
      for (;;) {
        const action = await this.onLandSubmenu(this._browseTileSummary(tile, player), player.id);
        if (action == null || action === 'back') break;

        if (action === 'info') {
          await this.onShowTileInfo(this._browseTileSummary(tile, player), player.id);
          continue;
        }
        if (action === 'swap' && (await this._humanSummonFlow(player, tile))) return true;
        if (action === 'levelup' && (await this._humanLevelUpFlowForTile(player, tile))) return true;
        if (action === 'element' && (await this._humanChangeElementFlowForTile(player, tile))) return true;
        if (action === 'move' && (await this._humanMoveFlow(player, tile))) return true;
        if (action === 'sell' && (await this._humanSellLandFlow(player, tile))) return true;
        if (action === 'ability' && (await this._humanAbilityFlow(player, tile))) return true;
        // cancelled sub-action - loop back to the submenu for this same tile
      }
    }
  }

  _browseTileSummary(tile, player) {
    return { ...this.getTileSummary(tile), isMine: tile.owner === player.id && tile.unit != null };
  }

  _affordableMonsterCards(player) {
    return player.hand.filter((c) => c.type === CardType.MONSTER && c.cost <= player.currency);
  }

  _ownedTiles(player) {
    return this.tiles.filter((t) => t.owner === player.id);
  }

  /**
   * 連鎖倍率: how many tiles of this element the owner holds (same-element
   * lands count as one 連鎖 today, since every element already forms a
   * single contiguous edge on this board). Unowned tiles preview at 連鎖1.
   * 無色 never chains, even with other 無色 tiles. 同盟戦では同盟仲間の
   * 同属性所有地も連鎖にカウントする（土地の所有権自体は個人のまま - この
   * カウント上だけ仲間の分も足し合わせる）。
   */
  _chainMultiplier(ownerId, element) {
    if (ownerId == null || element === Element.NEUTRAL) return CHAIN_MULTIPLIER[1];
    const owner = this.players.find((p) => p.id === ownerId);
    const allianceId = owner?.allianceId ?? null;
    const count = this.tiles.filter((t) => {
      if (t.element !== element || t.owner == null) return false;
      if (t.owner === ownerId) return true;
      if (allianceId == null) return false;
      const tileOwner = this.players.find((p) => p.id === t.owner);
      return tileOwner?.allianceId === allianceId;
    }).length;
    return CHAIN_MULTIPLIER[Math.min(Math.max(count, 1), LEVEL_CAP)];
  }

  /** 地価 = 基本地価 × レベル倍率 × 連鎖倍率 */
  _landValueOfTile(tile) {
    return Math.round(tile.price * tile.level * this._chainMultiplier(tile.owner, tile.element));
  }

  /** 通行料 = 地価 × 通行料倍率 */
  _tollOfTile(tile) {
    return Math.round(this._landValueOfTile(tile) * TOLL_RATE[tile.level]);
  }

  /**
   * Returns true if a summon/invade/swap actually went through (vs. being
   * cancelled). Doubles as the 土地-browse submenu's 入れ替え handler - the
   * only difference for a 'swap' actionType (tile already owned by this
   * player) is that the displaced unit's original card goes back to hand
   * instead of just vanishing.
   */
  async _humanSummonFlow(player, tile) {
    const options = this._affordableMonsterCards(player);
    if (options.length === 0) {
      this.onLog('召喚できるモンスターカードがありません');
      return false;
    }

    const card = await this.onPickMonsterCard(options, player.id);
    if (!card) return false;

    const actionType = tile.owner == null ? 'summon' : tile.owner === player.id ? 'swap' : 'invade';
    const confirmed = await this.onConfirmAction(
      { actionType, card, cost: card.cost, tile: this.getTileSummary(tile) },
      player.id,
    );
    if (!confirmed) return false;

    player.hand = player.hand.filter((c) => c.id !== card.id);
    player.deck.discard(card);
    player.currency -= card.cost;

    if (actionType === 'summon' || actionType === 'swap') {
      if (actionType === 'swap' && tile.unit) {
        player.hand.push({
          ...tile.unit.def,
          id: `swap-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
      }
      this._placeUnit(tile, player, card);
      this.onLog(`${player.name}は${card.name}を${actionType === 'summon' ? '召喚' : '入れ替え'}した (-${card.cost}G)`);
    } else {
      await this._runInvasion(player, tile, card);
    }
    this._notifyState();
    return true;
  }

  /** Returns true if a level-up actually went through (vs. maxed out / cancelled / unaffordable). Operates on an already-picked tile (see _runLandBrowse). */
  async _humanLevelUpFlowForTile(player, tile) {
    if (tile.level >= LEVEL_CAP) {
      this.onLog('これ以上レベルアップできません');
      return false;
    }

    const cost = LEVEL_UP_COST[tile.level];
    const confirmed = await this.onConfirmAction({ actionType: 'levelup', cost, tile: this.getTileSummary(tile) }, player.id);
    if (!confirmed) return false;
    if (player.currency < cost) {
      this.onLog('ゴールドが足りません');
      return false;
    }

    player.currency -= cost;
    tile.level += 1;
    this.scene.updateTileLevelBorder(tile);
    this.onLog(`${player.name}は土地をLv${tile.level}にアップグレードした (-${cost}G)`);
    this._notifyState();
    return true;
  }

  /** Returns true if an element change actually went through (vs. cancelled / unaffordable). Operates on an already-picked tile (see _runLandBrowse). */
  async _humanChangeElementFlowForTile(player, tile) {
    const newElement = await this.onPickElement(CHANGEABLE_ELEMENTS.filter((e) => e !== tile.element), player.id);
    if (!newElement) return false;

    const rate = tile.element === Element.NEUTRAL ? NEUTRAL_ELEMENT_CHANGE_DISCOUNT : 1;
    const cost = Math.round(ELEMENT_CHANGE_COST_PER_LEVEL * tile.level * rate);
    const confirmed = await this.onConfirmAction(
      { actionType: 'element', cost, tile: this.getTileSummary(tile), targetElement: newElement },
      player.id,
    );
    if (!confirmed) return false;
    if (player.currency < cost) {
      this.onLog('ゴールドが足りません');
      return false;
    }

    player.currency -= cost;
    tile.element = newElement;
    this.onLog(`${player.name}は土地属性を${ELEMENT_LABEL[newElement]}に変更した (-${cost}G)`);
    this._notifyState();
    return true;
  }

  /**
   * 土地コマンドの「移動」: relocates the tile's garrisoned monster to an
   * orthogonally-adjacent land that's either empty or enemy-owned. Empty
   * just relocates outright; enemy triggers a one-round invasion battle
   * reusing the SAME field-unit object (so equipped curses ride along).
   * Ownership only ever exists alongside a garrisoned unit - so whichever
   * tile(s) end up unit-less have owner cleared too, but level is never
   * touched (see the confirmed 土地レベルは所有権と無関係に保持される
   * design). Always ends the turn once the player actually commits to a
   * move, win or lose.
   */
  async _humanMoveFlow(player, tile) {
    const candidates = tile.neighbors
      .map((id) => this.tiles[id])
      .filter((t) => t.type === TileType.LAND && (t.owner == null || t.owner !== player.id));
    if (candidates.length === 0) {
      this.onLog('移動できる土地がありません');
      return false;
    }

    const options = candidates.map((t) => {
      const dgx = t.gridX - tile.gridX;
      const dgz = t.gridZ - tile.gridZ;
      const screenDir = dgx === 1 ? 'downright' : dgx === -1 ? 'upleft' : dgz === 1 ? 'downleft' : 'upright';
      return { tileId: t.id, screenDir };
    });
    const targetId = await this.onPickMoveDirection(options, player.id);
    if (targetId == null) return false;
    const targetTile = this.tiles.find((t) => t.id === targetId);

    const confirmed = await this.onConfirmMove(this.getTileSummary(targetTile), player.id);
    if (!confirmed) return false;

    const attackerUnit = tile.unit;
    const attackerName = attackerUnit.def.name;

    if (targetTile.owner == null) {
      targetTile.unit = attackerUnit;
      targetTile.owner = player.id;
      this._paintTile(targetTile, player.color);
      tile.unit = null;
      tile.owner = null;
      this._repaintTileToElement(tile);
      this.onLog(`${player.name}は${attackerName}を移動させた`);
    } else {
      const defenderPlayer = this.players.find((p) => p.id === targetTile.owner);
      const defenderUnit = targetTile.unit;
      const result = await this._runBattleScene(attackerUnit, player, defenderUnit, defenderPlayer, tile, targetTile);
      targetTile.forcedStopCursed = false; // 戦闘が終わると消える - _shrineForcedStop参照。

      if (result.attackerSurvived && !result.defenderSurvived) {
        targetTile.unit = attackerUnit;
        targetTile.owner = player.id;
        this._paintTile(targetTile, player.color);
        tile.unit = null;
        tile.owner = null;
        this._repaintTileToElement(tile);
        this.onLog(`${player.name}が土地を奪取した！`);
        await this._handleUnitDeath(defenderUnit, defenderPlayer);
      } else if (result.attackerSurvived && result.defenderSurvived) {
        this.onLog(`${defenderPlayer.name}の${defenderUnit.def.name}が防衛に成功し、${attackerName}は元の土地に戻った`);
      } else {
        tile.unit = null;
        tile.owner = null;
        this._repaintTileToElement(tile);
        if (!result.defenderSurvived) {
          targetTile.unit = null;
          targetTile.owner = null;
          this._repaintTileToElement(targetTile);
          this.onLog('両者相打ちで両方の土地が無人になった');
          await this._handleUnitDeath(defenderUnit, defenderPlayer);
        } else {
          this.onLog(`${attackerName}は倒された`);
        }
        await this._handleUnitDeath(attackerUnit, player);
      }
    }
    this._notifyState();
    return true;
  }

  /**
   * 土地コマンドの「土地を売る」: 唯一レベルをリセットする操作（それ以外は
   * 所有権を失ってもレベルは保持されるのが確定仕様 - 売却だけが例外）。
   * 売却額は地価の半額。配置されていたモンスターのカードは入れ替え同様
   * 手札に戻る。実行したら自動でターン終了。同盟戦でもパートナーの土地は
   * ここに来る前提として個人所有の土地しか_runLandBrowseの候補に出ない
   * ので、他人の土地を誤って売る経路は無い。
   */
  async _humanSellLandFlow(player, tile) {
    const salePrice = Math.round(this._landValueOfTile(tile) / 2);
    const confirmed = await this.onConfirmSellLand({ tile: this.getTileSummary(tile), salePrice }, player.id);
    if (!confirmed) return false;

    if (tile.unit) {
      player.hand.push({
        ...tile.unit.def,
        id: `sell-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
    }
    tile.unit = null;
    tile.owner = null;
    tile.level = 1;
    this._repaintTileToElement(tile);
    this.scene.updateTileLevelBorder(tile);
    player.currency += salePrice;
    this.onLog(`${player.name}は土地を売却した (+${salePrice}G)`);
    this._notifyState();
    return true;
  }

  /** BFS hop-count between two tiles over the same adjacency graph movement uses - this is what "3マス以内" means on this board (graph distance, not world-space distance). */
  _tileDistance(fromId, toId) {
    if (fromId === toId) return 0;
    const visited = new Set([fromId]);
    let frontier = [fromId];
    let distance = 0;
    while (frontier.length > 0) {
      distance += 1;
      const next = [];
      for (const id of frontier) {
        for (const neighborId of this.tiles[id].neighbors) {
          if (visited.has(neighborId)) continue;
          if (neighborId === toId) return distance;
          visited.add(neighborId);
          next.push(neighborId);
        }
      }
      frontier = next;
    }
    return Infinity;
  }

  /**
   * 土地コマンドの「特殊能力」: 配置されたモンスターが持つability
   * （現状はtype:'damage'のみ - 射程内の敵1体に固定ダメージ）を行使する。
   * HPが0以下になったら即死（通常の戦闘死と同じ_handleUnitDeathを流用 -
   * 不死鳥特性はここでも効く）。実行したら移動・売却と同様に自動でターン
   * 終了する。
   */
  async _humanAbilityFlow(player, tile) {
    const ability = tile.unit?.def.ability;
    if (!ability) return false;

    const targets = this.tiles.filter((t) => {
      if (t.owner == null || t.owner === player.id) return false;
      const owner = this.players.find((p) => p.id === t.owner);
      if (owner?.allianceId != null && owner.allianceId === player.allianceId) return false;
      return this._tileDistance(tile.id, t.id) <= ability.range;
    });
    if (targets.length === 0) {
      this.onLog('射程内に敵がいません');
      return false;
    }

    const targetId = await this.onPickAbilityTarget(targets.map((t) => this._browseTileSummary(t, player)), player.id);
    if (targetId == null) return false;

    const targetTile = this.tiles.find((t) => t.id === targetId);
    const targetUnit = targetTile.unit;
    const attackerName = tile.unit.def.name;
    targetUnit.currentHp -= ability.power;
    this.onLog(`${player.name}の${attackerName}が特殊能力で${targetUnit.def.name}に${ability.power}ダメージ！`);
    this._notifyState();

    if (targetUnit.currentHp <= 0) {
      const targetOwner = this.players.find((p) => p.id === targetTile.owner);
      targetTile.unit = null;
      targetTile.owner = null;
      this._repaintTileToElement(targetTile);
      this.onLog(`${targetOwner.name}の${targetUnit.def.name}は倒された`);
      await this._handleUnitDeath(targetUnit, targetOwner);
    }
    this._notifyState();
    return true;
  }

  async _cpuLandCommand(player, tile) {
    await delay(CPU_DECISION_MS);
    if (tile.owner === player.id) return; // CPU doesn't bother swapping its own land yet

    const options = this._affordableMonsterCards(player);
    if (options.length === 0) return;
    const card = options[0];
    const actionType = tile.owner == null ? 'summon' : 'invade';

    player.hand = player.hand.filter((c) => c.id !== card.id);
    player.deck.discard(card);
    player.currency -= card.cost;

    if (actionType === 'summon') {
      this._placeUnit(tile, player, card);
      this.onLog(`${player.name}は${card.name}を召喚した (-${card.cost}G)`);
    } else {
      await this._runInvasion(player, tile, card);
    }
    this._notifyState();
  }

  /**
   * 同属性ボーナス: 自分の土地に配置されているモンスターは、土地と同じ
   * 属性なら土地レベル×10（最大50）だけHPが増える。`positionTile` は
   * このモンスターが「今立っている」土地 - 手札から召喚したばかりの
   * 侵略側にはそもそも該当する土地が無いので null を渡す（ボーナス無し）。
   */
  _elementHpBonus(unit, positionTile) {
    if (!positionTile || positionTile.owner !== unit.ownerId) return 0;
    if (positionTile.element !== unit.def.element) return 0;
    return Math.min(positionTile.level * 10, 50);
  }

  /**
   * 応援ボーナス: 戦闘地（battleTile）に隣接するマスに同じ所有者の別
   * モンスターがいればATK+10。攻撃側・防御側どちらにも同じ判定を使う
   * （`unit !== t.unit` は移動コマンドで自分の元いた土地が戦闘地の隣接
   * マスに含まれてしまう＝自分自身を援護扱いしないための除外）。
   */
  _cheerAtkBonus(unit, battleTile) {
    const hasAlly = battleTile.neighbors.some((id) => {
      const t = this.tiles[id];
      return t.unit != null && t.unit !== unit && t.unit.ownerId === unit.ownerId;
    });
    return hasAlly ? 10 : 0;
  }

  /** Bundles both situational bonuses into the {atk,hp} shape resolveBattle expects, logging whichever actually apply. */
  _battleBonus(unit, positionTile, battleTile) {
    const hp = this._elementHpBonus(unit, positionTile);
    const atk = this._cheerAtkBonus(unit, battleTile);
    if (hp > 0) this.onLog(`${unit.def.name}は${ELEMENT_LABEL[positionTile.element]}の土地でHP+${hp}`);
    if (atk > 0) this.onLog(`${unit.def.name}は応援を受けてATK+10`);
    return { atk, hp };
  }

  /**
   * How mySideElement fares against opponentElement under the weakness
   * cycle (火→水→雷→森→火): 'advantage' if mySide is the one that hits the
   * opponent for 1.2x, 'disadvantage' if it's the other way around (the
   * opponent would hit mySide for 1.2x), 'neutral' otherwise (includes any
   * 無属性 side, and "opposite corner" pairs that aren't adjacent in the
   * cycle either way). Purely the elemental relationship - doesn't account
   * for monster-specific traits like 港区女子's resistance.
   */
  _elementMatchup(mySideElement, opponentElement) {
    if (mySideElement === Element.NEUTRAL || opponentElement === Element.NEUTRAL) return 'neutral';
    if (mySideElement === WEAK_AGAINST[opponentElement]) return 'advantage';
    if (opponentElement === WEAK_AGAINST[mySideElement]) return 'disadvantage';
    return 'neutral';
  }

  /** Base ATK/HP as shown on the battle-scene stat panel: def stats plus any永続 curses, but NOT items or the situational cheer/element bonuses (those are surfaced separately - see _runBattleScene). */
  _baseStats(unit) {
    const curseAtk = unit.curses.reduce((sum, c) => sum + (c.addedAtk || 0), 0);
    const curseHp = unit.curses.reduce((sum, c) => sum + (c.addedHp || 0), 0);
    return { atk: unit.def.atk + curseAtk, hp: unit.def.hp + curseHp };
  }

  /** CPU never deliberates over an item pick - just grabs its first (if any), same "pick the obvious option instantly" spirit as _cpuLandCommand. */
  _cpuPickBattleItem(player) {
    return player.hand.find((c) => c.type === CardType.GEAR) || null;
  }

  /** Equips + permanently consumes the chosen item (removed from hand, discarded) - a no-op if the side skipped. */
  _consumeBattleItem(player, unit, item) {
    if (!item) return;
    equipItem(unit, item);
    player.hand = player.hand.filter((c) => c.id !== item.id);
    player.deck.discard(item);
  }

  /**
   * Full battle-scene choreography, shared by both invasion entry points
   * (landing-invasion via _runInvasion, and the 移動 command's invasion
   * branch): fade in → reveal base stats + situational bonuses for both
   * sides → each side secretly picks an item (CPU sides never pause; a
   * human side never sees what the OTHER side already picked, since that
   * pick already happened silently or its own picker already closed) →
   * resolveBattle → attacker's strike animation, then the defender's
   * counter-strike animation only if it survived to make one (see
   * battle.js's sequential resolution) → outcome message. Returns the
   * resolveBattle result so callers still own the tile-ownership mutations
   * (that part differs between straight invasion and move-invasion).
   */
  async _runBattleScene(attackerUnit, attackerPlayer, defenderUnit, defenderPlayer, attackerPositionTile, battleTile) {
    const attackerBase = this._baseStats(attackerUnit);
    const defenderBase = this._baseStats(defenderUnit);
    const attackerBonus = this._battleBonus(attackerUnit, attackerPositionTile, battleTile);
    const defenderBonus = this._battleBonus(defenderUnit, battleTile, battleTile);

    const attackerMatchup = this._elementMatchup(attackerUnit.def.element, defenderUnit.def.element);
    const defenderMatchup = this._elementMatchup(defenderUnit.def.element, attackerUnit.def.element);

    await this.onBattleSceneEnter({
      attacker: {
        card: attackerUnit.def,
        name: attackerUnit.def.name,
        ownerName: attackerPlayer.name,
        atk: attackerBase.atk,
        hp: attackerBase.hp,
        cheerAtk: attackerBonus.atk,
        elementHp: attackerBonus.hp,
        element: attackerPositionTile?.element ?? null,
        matchup: attackerMatchup,
      },
      defender: {
        card: defenderUnit.def,
        name: defenderUnit.def.name,
        ownerName: defenderPlayer.name,
        atk: defenderBase.atk,
        hp: defenderBase.hp,
        cheerAtk: defenderBonus.atk,
        elementHp: defenderBonus.hp,
        element: battleTile.element,
        matchup: defenderMatchup,
      },
    });

    const attackerItem = attackerPlayer.isCPU
      ? this._cpuPickBattleItem(attackerPlayer)
      : await this.onPickBattleItem(
          {
            hand: attackerPlayer.hand.filter((c) => c.type === CardType.GEAR),
            side: 'attacker',
            ownerName: attackerPlayer.name,
            unitName: attackerUnit.def.name,
          },
          attackerPlayer.id,
        );
    this._consumeBattleItem(attackerPlayer, attackerUnit, attackerItem);

    const defenderItem = defenderPlayer.isCPU
      ? this._cpuPickBattleItem(defenderPlayer)
      : await this.onPickBattleItem(
          {
            hand: defenderPlayer.hand.filter((c) => c.type === CardType.GEAR),
            side: 'defender',
            ownerName: defenderPlayer.name,
            unitName: defenderUnit.def.name,
          },
          defenderPlayer.id,
        );
    this._consumeBattleItem(defenderPlayer, defenderUnit, defenderItem);

    // 貫通: nullifies the defender's 同属性ボーナス (land-added HP) for this
    // battle's math specifically - the stat panel above already showed the
    // "nominal" bonus, since traits (unlike items) aren't secret and the
    // pierce interaction is meant to land as a damage-calc surprise, not an
    // upfront display change. Item HP bonuses are untouched either way.
    const battleDefenderBonus = attackerUnit.def.traits?.includes('pierce') ? { ...defenderBonus, hp: 0 } : defenderBonus;

    const result = resolveBattle(attackerUnit, defenderUnit, this._goldAdapter(), attackerBonus, battleDefenderBonus);
    result.log.forEach((line) => this.onLog(line));

    // `exchanges` is already in the order strikes actually happened (先制
    // can flip it to defender-first) - just play them back in order.
    for (const exchange of result.exchanges) {
      const item = exchange.side === 'attacker' ? attackerItem : defenderItem;
      const targetUnit = exchange.side === 'attacker' ? defenderUnit : attackerUnit;
      await this.onBattleAttack({
        side: exchange.side,
        item,
        message: exchange.message,
        targetHp: Math.max(targetUnit.currentHp, 0),
        targetDied: exchange.targetDied,
      });
    }
    // Both sides got to strike and both survived - a genuine draw (見た目上
    // は防衛成功): retreat off-screen before the outcome message, rather
    // than either card crumbling.
    if (result.attackerSurvived && result.defenderSurvived) await this.onBattleRetreat();

    const won = result.attackerSurvived && !result.defenderSurvived;
    await this.onBattleOutcome({
      won,
      ownerName: won ? attackerPlayer.name : defenderPlayer.name,
      unitName: won ? attackerUnit.def.name : defenderUnit.def.name,
    });

    return result;
  }

  async _runInvasion(player, tile, card) {
    const defenderPlayer = this.players.find((p) => p.id === tile.owner);
    const attackerUnit = createFieldUnit(card, player.id);
    const defenderUnit = tile.unit;
    const result = await this._runBattleScene(attackerUnit, player, defenderUnit, defenderPlayer, null, tile);
    // 強制停止の呪いは「戦闘が終わると消える」(勝敗を問わない) - _shrineForcedStop参照。
    tile.forcedStopCursed = false;

    if (!result.defenderSurvived) {
      if (result.attackerSurvived) {
        tile.unit = attackerUnit;
        tile.owner = player.id;
        this._paintTile(tile, player.color);
        this.onLog(`${player.name}が土地を奪取した！`);
      } else {
        tile.unit = null;
        tile.owner = null;
        this._repaintTileToElement(tile);
        this.onLog('両者相打ちで土地は無人になった');
        await this._handleUnitDeath(attackerUnit, player);
      }
      await this._handleUnitDeath(defenderUnit, defenderPlayer);
    } else {
      this.onLog(`${defenderPlayer.name}の${defenderUnit.def.name}が防衛に成功した`);
      if (!result.attackerSurvived) await this._handleUnitDeath(attackerUnit, player);
    }
  }

  /**
   * 不死鳥: 死亡したユニットにこの特性があれば、カードを（新しいidで）
   * 持ち主の手札に戻す。手札上限を超える場合は通常の手札上限処理と同じ
   * 流れで1枚捨てさせる（捨てたカードはもう戻ってこない）。この特性が
   * 無ければ何もしない。
   */
  async _handleUnitDeath(unit, ownerPlayer) {
    if (!unit.def.traits?.includes('phoenix')) return;

    const card = { ...unit.def, id: `phoenix-${ownerPlayer.id}-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    ownerPlayer.hand.push(card);
    this.onLog(`${unit.def.name}は不死鳥の力で${ownerPlayer.name}の手札に戻った`);
    this._notifyState();

    if (ownerPlayer.hand.length > HAND_LIMIT) {
      let discarded;
      if (ownerPlayer.isCPU) {
        await delay(CPU_DECISION_MS);
        discarded = ownerPlayer.hand[0];
      } else {
        discarded = await this.onDiscardChoice(ownerPlayer.hand, ownerPlayer.id);
      }
      ownerPlayer.hand = ownerPlayer.hand.filter((c) => c.id !== discarded.id);
      ownerPlayer.deck.discard(discarded);
      if (ownerPlayer.isCPU) this.onLog(`${ownerPlayer.name}は手札を1枚捨てた`);
      this._notifyState();
    }
  }

  _placeUnit(tile, player, card) {
    tile.unit = createFieldUnit(card, player.id);
    tile.owner = player.id;
    this._paintTile(tile, player.color);
  }

  _goldAdapter() {
    const findPlayer = (id) => this.players.find((p) => p.id === id);
    return {
      add: (ownerId, amount) => {
        const p = findPlayer(ownerId);
        if (p) p.currency += amount;
      },
      transfer: (fromId, toId, amount) => {
        const from = findPlayer(fromId);
        const to = findPlayer(toId);
        if (from) from.currency -= amount;
        if (to) to.currency += amount;
      },
    };
  }

  /**
   * Plain-data snapshot of a tile for the UI - safe to hand to main.js, no
   * mesh/internal refs. Also safe to hand to Firestore (PvPの対人戦リレー
   * 経由でそのままpublishされる) - board.jsは非LANDマス（START/EVENT/SHOP）
   * のlevelをundefinedのまま置くので、ここで確実にnullへ丸める
   * （Firestoreはフィールド値のundefinedを許さない）。
   */
  getTileSummary(tile) {
    const owner = tile.owner != null ? this.players.find((p) => p.id === tile.owner) : null;
    const isLand = tile.type === TileType.LAND;
    return {
      id: tile.id,
      type: tile.type,
      element: tile.element,
      level: isLand ? tile.level : null,
      landValue: isLand ? this._landValueOfTile(tile) : null,
      toll: isLand ? this._tollOfTile(tile) : null,
      price: tile.price,
      ownerName: owner ? owner.name : null,
      ownerColor: owner ? owner.color : null,
      unitName: tile.unit ? tile.unit.def.name : null,
      // 呪い（倍化等）込みの実際のATK/HPを見せる（def.atk/hpそのままだと
      // 「倍化」がかかっていても数値に反映されない）。
      unitAtk: tile.unit ? this._baseStats(tile.unit).atk : null,
      unitHp: tile.unit ? (tile.unit.currentHp ?? this._baseStats(tile.unit).hp) : null,
      hasAbility: !!tile.unit?.def.ability,
      cursed: !!tile.forcedStopCursed,
    };
  }

  _paintTile(tile, colorHexInt) {
    tile.mesh.material.color.setHex(colorHexInt);
  }

  _repaintTileToElement(tile) {
    tile.mesh.material.color.set(CARD_COLOR[tile.element]);
  }

  _nextTurn() {
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    } while (this.players[this.currentPlayerIndex].defeated);
  }

  async _runCPUTurn() {
    await delay(CPU_PRE_ROLL_MS);
    if (!this.currentPlayer.isCPU) return;
    const steps = await this.onCpuRoll();
    this.rollDice(steps);
  }

  /** Total assets' land component: sum of 地価 (see _landValueOfTile) across owned tiles. */
  _landValueOf(playerId) {
    return this.tiles
      .filter((t) => t.owner === playerId)
      .reduce((sum, t) => sum + this._landValueOfTile(t), 0);
  }

  _summonCountOf(playerId) {
    return this.tiles.filter((t) => t.owner === playerId).length;
  }

  /**
   * 総資産（表示用）: 同盟戦では2人の合計（所持G＋地価、どちらも両者分を
   * 合算）が両プレイヤーの表示に使われる。土地の所有権自体は個人のままな
   * ので、合算するのはこの表示値だけ（_ownedTiles等はp.idだけを見続ける）。
   * 同盟でなければ今まで通り本人単独の値。
   */
  _totalAssetsOf(player) {
    const teammates =
      player.allianceId != null ? this.players.filter((p) => p.allianceId === player.allianceId) : [player];
    return teammates.reduce((sum, p) => sum + p.currency + this._landValueOf(p.id), 0);
  }

  _notifyState() {
    const human = this.players.find((p) => !p.isCPU);
    const showCenter = this.awaitingRoll && !this.isBusy;
    const playersPayload = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      allianceId: p.allianceId,
      tileId: p.tileId,
      currency: p.currency,
      totalAssets: this._totalAssetsOf(p),
      summonCount: this._summonCountOf(p.id),
      handCount: p.hand.length,
      defeated: !!p.defeated,
      // このラップで通過済みのチェックポイント番号（未達成ならボーナス
      // 無しでゴールを通過しても消えない - _grantGoalBonus参照）。
      passedCheckpointNumbers: [...p.passedCheckpoints].map((id) => this.tiles[id].checkpointNumber),
    }));
    this.onStateChange({
      turnText: `${this.currentPlayer.name}のターン`,
      canRoll: showCenter && !this.currentPlayer.isCPU,
      checkpointNumbers: this.checkpointNumbers,
      players: playersPayload,
      hand: human.hand,
      showCenter,
      centerHand: this.currentPlayer.hand,
      currentPlayerIsCPU: this.currentPlayer.isCPU,
      spellUsedThisTurn: this.currentPlayer.spellUsedThisTurn,
    });
    this.onPvpSync?.(this._pvpSnapshot(playersPayload));
  }

  /**
   * 対人戦ホスト権威モデル用の盤面スナップショット。ゲスト側main.jsは
   * Gameインスタンスを持たず、これをFirestore経由で受け取ってローカルの
   * scene/tilesにそのまま反映するだけ（シミュレーションはホストだけが行う
   * ので決定論の問題が発生しない）。手札は各プレイヤーごとに別チャンネル
   * （private/{uid}）で配るため、ここでは枚数だけ含む。
   */
  _pvpSnapshot(playersPayload) {
    return {
      currentPlayerId: this.currentPlayer.id,
      turnText: `${this.currentPlayer.name}のターン`,
      awaitingRoll: this.awaitingRoll,
      isBusy: this.isBusy,
      checkpointNumbers: this.checkpointNumbers,
      players: playersPayload,
      tiles: this.tiles
        .filter((t) => t.type === TileType.LAND)
        .map((t) => ({
          id: t.id,
          owner: t.owner,
          level: t.level,
          element: t.element,
          unit: t.unit
            ? { name: t.unit.def.name, atk: t.unit.def.atk, hp: t.unit.currentHp ?? t.unit.def.hp }
            : null,
        })),
      hands: Object.fromEntries(this.players.filter((p) => !p.isCPU).map((p) => [p.id, p.hand])),
    };
  }
}
