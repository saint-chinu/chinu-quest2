import { TileType, mapRequiresAllCheckpoints } from './board.js';
import { PIECE_REST_Y, UNIT_ICON_REST_Y } from './scene.js';
import { CardType, CARD_COLOR, Element, ELEMENT_LABEL, Deck, Rarity } from './cards.js';
import { buildStarterCardList, WEAK_AGAINST, ITEM_CATALOG, MONSTER_CATALOG, SPELL_CATALOG, catalogIdOf } from './battleCards.js';
import { createFieldUnit, resolveBattle, equipItem, applyCurse, applyPoison, GoldLedger } from './battle.js';
import { getCardCatalog } from './cardCatalog.js';
import { tween, easeInOutQuad, delay } from './utils.js';
import { DENCHU_FIELD_MONSTER } from './thunderMonsters.js';
import { GASHAAN_FIELD_MONSTER } from './neutralMonsters.js';
import { resolveAiProfile } from './aiProfiles.js';

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
// カルドセプト準拠の周回ボーナス（2026-08-12改訂）: 基本ボーナス=(周回数+1)×
// START_BONUS（周を重ねるほど増える）＋領地ボーナス=所持土地数×
// LAND_BONUS_RATE（2人戦）/LAND_BONUS_RATE_MULTI（3人以上）。連鎖数は
// 領地ボーナスに影響しない（本家準拠）。_computeLapBonus参照。
const START_BONUS = 100;
const LAND_BONUS_RATE = 60;
const LAND_BONUS_RATE_MULTI = 80;

const STARTING_HAND_SIZE = 4;
const HAND_LIMIT = 6;

// CPUの捨て札AI（_cpuChooseDiscard）が目指す手札構成。所持土地数6以上で
// アイテム偏重に切り替わる（土地が多い＝守りを固めたい局面という想定）。
const DISCARD_TARGET_COMPOSITION_DEFAULT = { [CardType.MONSTER]: 2, [CardType.GEAR]: 2, [CardType.SPELL]: 2 };
const DISCARD_TARGET_COMPOSITION_LAND_HEAVY = { [CardType.MONSTER]: 1, [CardType.GEAR]: 3, [CardType.SPELL]: 2 };
const DISCARD_TARGET_LAND_THRESHOLD = 6;
const DISCARD_RARITY_RANK = { [Rarity.N]: 0, [Rarity.S]: 1, [Rarity.R]: 2, [Rarity.EX]: 3 };

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
// ソニックムーヴの「高速化の呪い」で強制されるサイコロ目。
const HASTE_FORCED_STEPS = 6;

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
    onSpellCastEffect,
    onSpellComplete,
    onSummonEffect,
    onTargetEffect,
    onTurnFocus,
    onTollPayment,
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
    onPickCardType,
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
    onDamageEffect,
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
    this.onSpellCastEffect = onSpellCastEffect;
    this.onSpellComplete = onSpellComplete || (() => {});
    this.onSummonEffect = onSummonEffect;
    this.onTargetEffect = onTargetEffect;
    this.onTurnFocus = onTurnFocus;
    this.onTollPayment = onTollPayment || (() => Promise.resolve());
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
    this.onPickCardType = onPickCardType;
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
    // 直接ダメージ系の土地コマンド（damage/damageAndSelfDestruct）専用の
    // 演出フック。任意（未指定なら何も起きず即resolveする）ので、テスト等で
    // わざわざ渡す必要はない。
    this.onDamageEffect = onDamageEffect;
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
    this.players = resolvedConfigs.map((cfg, id) => {
      const deck = Deck.fromCardList(cfg.deckList ?? buildStarterCardList(cfg.deckVariant));
      return {
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
      deck,
      // HUDのデッキ比率表示用。対戦開始時の40枚から集計し、ドロー・捨て札・
      // 盤上配置でカードが移動しても「元のデッキ構成」は変わらないよう保持。
      deckBreakdown: deck.drawPile.reduce((counts, card) => {
        const key = card.type === CardType.MONSTER ? `monster:${card.element ?? Element.NEUTRAL}` : card.type;
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {}),
      hand: [],
      spellUsedThisTurn: false,
      defeated: false,
      // requireAllCheckpointsが有効なマップでだけ参照する: このラップで
      // 通過済みのチェックポイント(EVENT)タイルidの集合。ゴールでボーナスを
      // 受け取った瞬間にクリアする（_movePlayer/_resolveSpecialTile参照）。
      passedCheckpoints: new Set(),
      // ソニックムーヴの「高速化の呪い」残りターン数（0=呪いなし）。
      // >0の間、_beginTurnがサイコロ/スペルフェーズを飛ばしHASTE_FORCED_STEPS
      // 固定で強制移動させる（ほこらのforcedDiceRemainingと同じ仕組み、
      // こちらは全体ではなく対象プレイヤー個人にだけ効く）。
      hasteTurnsRemaining: 0,
      // イカサマのサイコロ用: 直近で実際に振った（強制含む）サイコロの目。
      lastDiceSteps: 0,
      // CPUの意思決定に使う性格パラメータ（aiProfiles.js）。人間プレイヤーでも
      // 持たせておくが参照されない。cfg.elements（story.jsのtheme.elements）が
      // あればそのキャラの得意属性として反映される。
      aiProfile: resolveAiProfile(cfg.name, cfg.elements ?? null),
      // ここから下はスペル効果用の状態（chinu-quest2-spells-final_1.md参照）。
      // diceCurse: 次の自分のサイコロにだけ効く一度きりの呪い
      // ({type:'fixed',value}/{type:'reverse'}/{type:'double'})。nullなら無し。
      diceCurse: null,
      // 副業収入（周回数×50G+50G）用の通算周回数。
      lapsCompleted: 0,
      // 脱税: 次に支払うはずだった通行料を無効化できる残り回数。
      tollWaiverCharges: 0,
      // 宝くじ: 次にゴールした時0〜500Gをランダム獲得する権利があるか。
      lotteryOnNextGoal: false,
      // 絶対攻撃: 次の侵略で召喚したモンスターが貫通を得るか。
      pierceNextInvasion: false,
      // お前も〇ぬんだ: 次の侵略が戦闘無しで確定勝利になるか（発動時に700G消費）。
      guaranteedNextInvasionWin: false,
      // 不動産鑑〇士: 自分の全ての土地の土地コマンドにアクセスできる残りターン数。
      allTilesAccessTurnsRemaining: 0,
      // バックファイア用: 直近に実際に着地したタイルidの履歴（新しい順が先頭）。
      tileHistory: [],
      };
    });
    // 盤面開始時に一度だけ先攻を抽選し、以後はこの順番を固定する。
    // プレイヤーIDや同盟順は変えず、ホスト／ゲストの同期も壊さない。
    this.currentPlayerIndex = Math.floor(Math.random() * this.players.length);
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
    // 不動産鑑〇士: 自分の手番が来るたびに残りターン数を1つ消化する。
    if (this.currentPlayer.allTilesAccessTurnsRemaining > 0) this.currentPlayer.allTilesAccessTurnsRemaining -= 1;
    this._notifyState();

    await this._drawForTurn(this.currentPlayer);

    const turnTile = this.tiles[this.currentPlayer.tileId];
    if (turnTile) await this.onTurnFocus?.({
      playerId: this.currentPlayer.id,
      position: { x: turnTile.position.x, z: turnTile.position.z },
    });

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

    if (this.currentPlayer.hasteTurnsRemaining > 0) {
      this.currentPlayer.hasteTurnsRemaining -= 1;
      this.onLog(`${this.currentPlayer.name}は高速化の呪いでサイコロ${HASTE_FORCED_STEPS}固定！`);
      await this.rollDice(HASTE_FORCED_STEPS);
      return;
    }

    this._notifyState();

    if (this.currentPlayer.isCPU) {
      this._runCPUTurn();
    }
  }

  /**
   * Uses a spell from the current (human) player's hand, once per turn,
   * before rolling. 対象選択（あれば）はカードを消費する前に行い、
   * キャンセルすれば何も消費しない（土地コマンドのconfirmAndSpend paternと
   * 同じ考え方）。手札からの削除・G消費・spellUsedThisTurnの確定は
   * 対象選択と発動がどちらも成功した後にまとめて行う。
   */
  async useSpell(card) {
    if (this.isBusy || !this.awaitingRoll || this.currentPlayer.isCPU) return;
    const player = this.currentPlayer;
    if (player.spellUsedThisTurn) return;
    if (card.type !== CardType.SPELL) return;
    if (!player.hand.some((c) => c.id === card.id)) return;
    if (player.currency < (card.cost || 0)) {
      this.onLog('Gが足りずスペルを使えません');
      return;
    }

    this.isBusy = true;
    this._notifyState();

    const cast = await this._resolveSpellCast(player, card);
    if (!cast) {
      this.isBusy = false;
      this._notifyState();
      return;
    }

    player.hand = player.hand.filter((c) => c.id !== card.id);
    player.deck.discard(card);
    player.currency -= card.cost || 0;
    player.spellUsedThisTurn = true;
    this.onLog(`${player.name}は「${card.name}」を使用した (-${card.cost || 0}G)`);
    this._notifyState();

    await this.onSpellUse(card);
    await this.onSpellCastEffect?.(this._buildSpellCastEffectPayload(player, cast, card));
    const endedTurn = await this._applySpellEffect(player, card, cast);
    await this.onSpellComplete();
    this._notifyState();

    if (endedTurn) {
      // 帰巣本能専用: 効果自体がターンを終わらせるので、通常のrollDice相当の
      // 後始末（破産チェック→次のプレイヤーへ）をここで肩代わりする。
      for (const p of this.players) this._checkBankruptcy(p);
      if (!this.storyEnded) {
        this._nextTurn();
        await this._beginTurn();
      }
      return;
    }

    this.isBusy = false;
    this._notifyState();
  }

  /**
   * カードのtargetに応じた対象選択UIを出し、`{}`（対象なし）や
   * `{targetTileId}`/`{targetPlayerId}`/`{targetTileIds:[a,b]}`のような
   * 選択結果を返す。キャンセルされたらnull。既存のonPickAbilityTargetを
   * モンスター・土地・プレイヤーいずれの対象選びにも使い回す（渡す配列の
   * 形が違うだけ）。
   */
  async _resolveSpellCast(player, card) {
    const target = card.target;
    if (target === 'self' || target === 'none') return {};

    if (target === 'enemyMonster' || target === 'anyMonster' || target === 'ownMonster') {
      const tiles = this.tiles.filter((t) => {
        if (!t.unit) return false;
        if (target === 'enemyMonster') return t.unit.ownerId !== player.id;
        if (target === 'ownMonster') return t.unit.ownerId === player.id;
        return true;
      });
      if (tiles.length === 0) {
        this.onLog('対象のモンスターがいません');
        return null;
      }
      const targetId = await this.onPickAbilityTarget(tiles.map((t) => this._browseTileSummary(t, player)), player.id);
      if (targetId == null) return null;
      return { targetTileId: targetId };
    }

    if (target === 'anyTile' || target === 'ownTile') {
      const tiles = this.tiles.filter((t) => {
        if (t.type !== TileType.LAND) return false;
        if (target === 'ownTile') return t.owner === player.id;
        return true;
      });
      if (tiles.length === 0) {
        this.onLog('対象の土地がありません');
        return null;
      }
      const targetId = await this.onPickAbilityTarget(
        tiles.map((t) => ({ ...this._browseTileSummary(t, player), label: `${t.id}番地（${ELEMENT_LABEL[t.element]}）` })),
        player.id,
      );
      if (targetId == null) return null;
      return { targetTileId: targetId };
    }

    if (target === 'enemyPlayer' || target === 'anyPlayer') {
      const targets = this.players.filter((p) => {
        if (p.defeated) return false;
        if (target === 'enemyPlayer' && p.id === player.id) return false;
        if (target === 'enemyPlayer' && p.allianceId != null && p.allianceId === player.allianceId) return false;
        return true;
      });
      if (targets.length === 0) {
        this.onLog('対象にできるプレイヤーがいません');
        return null;
      }
      const targetId = await this.onPickAbilityTarget(
        targets.map((p) => ({ id: p.id, label: `${p.name}に「${card.name}」をかける` })),
        player.id,
      );
      if (targetId == null) return null;
      return { targetPlayerId: targetId };
    }

    if (target === 'twoOwnMonsters') {
      const tiles = this._ownedTiles(player).filter((t) => t.unit);
      if (tiles.length < 2) {
        this.onLog('入れ替えられるモンスターが足りません');
        return null;
      }
      const firstId = await this.onPickAbilityTarget(tiles.map((t) => this._browseTileSummary(t, player)), player.id);
      if (firstId == null) return null;
      const remaining = tiles.filter((t) => t.id !== firstId);
      const secondId = await this.onPickAbilityTarget(remaining.map((t) => this._browseTileSummary(t, player)), player.id);
      if (secondId == null) return null;
      return { targetTileIds: [firstId, secondId] };
    }

    return null;
  }

  /**
   * カードのeffect.typeをディスパッチして実際の効果を適用する。戻り値が
   * `true`の場合、その効果自体がターン終了までを担った（帰巣本能専用）
   * ことを示し、useSpell側の通常の後始末をスキップする。
   */
  async _applySpellEffect(player, card, cast) {
    const effect = card.effect;
    const targetTile = cast.targetTileId != null ? this.tiles.find((t) => t.id === cast.targetTileId) : null;
    const targetPlayer = cast.targetPlayerId != null
      ? this.players.find((p) => p.id === cast.targetPlayerId)
      : (card.target === 'self' ? player : null);

    switch (effect.type) {
      case 'setNextDice':
        targetPlayer.diceCurse = { type: 'fixed', value: effect.value };
        this.onLog(`${targetPlayer.name}は次のサイコロが${effect.value}に固定される呪いをかけられた`);
        return false;

      case 'reverseNextDice':
        targetPlayer.diceCurse = { type: 'reverse' };
        this.onLog(`${targetPlayer.name}は次のサイコロで後退する呪いをかけられた`);
        return false;

      case 'doubleNextDice':
        targetPlayer.diceCurse = { type: 'double' };
        this.onLog(`${targetPlayer.name}は次のサイコロの出目が2倍になる呪いをかけられた`);
        return false;

      case 'warpToNearbyEmptyLand':
        await this._spellWarpToNearbyEmptyLand(player);
        return true;

      case 'curseForcedStop':
        if (!targetTile?.unit) {
          this.onLog('対象が既にいません');
          return false;
        }
        targetTile.forcedStopCursed = player.id;
        this.onLog(`${targetTile.unit.def.name}の土地に強制停止の呪いがかかった`);
        return false;

      case 'returnToStartDoubleBonus':
        this._spellReturnToStartDoubleBonus(player);
        return true;

      case 'lapCountGold': {
        const gold = player.lapsCompleted * effect.perLap + effect.flat;
        player.currency += gold;
        this.onLog(`${player.name}は副業収入で${gold}Gを得た`);
        return false;
      }

      case 'tollReductionCurse':
        if (!targetTile) return false;
        targetTile.tollReductionRatio = effect.ratio;
        this.onLog(`${targetTile.id}番地に通行料減少の呪いをかけた`);
        return false;

      case 'redistributeGoldEvenly': {
        const alive = this.players.filter((p) => !p.defeated);
        const total = alive.reduce((sum, p) => sum + p.currency, 0);
        const share = Math.floor(total / alive.length);
        for (const p of alive) p.currency = share;
        this.onLog(`「山分け」で全員の所持Gが${share}Gに均等化された`);
        return false;
      }

      case 'tollBonusOnceCurse':
        if (!targetTile) return false;
        targetTile.tollBonusOnceMultiplier = effect.multiplier;
        this.onLog(`${targetTile.id}番地に追徴課税の呪いをかけた`);
        return false;

      case 'tollWaiverCurse':
        player.tollWaiverCharges += 1;
        this.onLog(`${player.name}は脱税の準備をした`);
        return false;

      case 'lotteryOnNextGoal':
        player.lotteryOnNextGoal = true;
        this.onLog(`${player.name}は宝くじを手に入れた`);
        return false;

      case 'stealGoldRatio': {
        if (!targetPlayer) return false;
        const amount = Math.round(targetPlayer.currency * effect.ratio);
        targetPlayer.currency -= amount;
        player.currency += amount;
        this.onLog(`${player.name}が${targetPlayer.name}から${amount}Gを奪った`);
        return false;
      }

      case 'directDamage':
        if (!targetTile?.unit) {
          this.onLog('対象が既にいません');
          return false;
        }
        await this._spellDamageUnit(targetTile, effect.amount);
        return false;

      case 'damageAllUnits':
        await this._spellDamageAllUnits(() => true, effect.amount);
        return false;

      case 'damageAllUnitsOfElement':
        await this._spellDamageAllUnits((t) => t.unit.def.element === effect.element, effect.amount);
        return false;

      case 'poisonArea':
        this._spellPoisonArea(targetTile, effect.ratio);
        return false;

      case 'grantPierceNextInvasion':
        if (!targetPlayer) return false;
        targetPlayer.pierceNextInvasion = true;
        this.onLog(`${targetPlayer.name}は次の侵略で貫通を得る`);
        return false;

      case 'statCurse':
        if (!targetTile?.unit) {
          this.onLog('対象が既にいません');
          return false;
        }
        applyCurse(targetTile.unit, { name: card.name, addedAtk: effect.addedAtk, addedHp: effect.addedHp });
        this.onLog(`${targetTile.unit.def.name}に「${card.name}」の呪いをかけた`);
        return false;

      case 'guaranteedNextInvasionWin':
        if (player.currency < effect.cost) {
          this.onLog('Gが足りません');
          return false;
        }
        player.guaranteedNextInvasionWin = true;
        this.onLog(`${player.name}は禁断の呪いに手を染めた……`);
        return false;

      case 'fullHeal':
        if (!targetTile?.unit) return false;
        targetTile.unit.currentHp = this._baseStats(targetTile.unit).hp + this._elementHpBonus(targetTile.unit, targetTile);
        this.onLog(`${targetTile.unit.def.name}のHPが全回復した`);
        return false;

      case 'healAllUnitsRatio':
        this._spellHealAllUnitsRatio(effect.ratio);
        return false;

      case 'cleanseCurses':
        // 有益な呪い（宝くじ・絶対攻撃・お前も〇ぬんだ・不動産鑑〇士・脱税）も
        // 対象に含める＝自分にかかっている呪い状態を種類を問わず全て解除する。
        player.diceCurse = null;
        player.tollWaiverCharges = 0;
        player.lotteryOnNextGoal = false;
        player.pierceNextInvasion = false;
        player.guaranteedNextInvasionWin = false;
        player.allTilesAccessTurnsRemaining = 0;
        if (targetTile?.unit) targetTile.unit.curses = [];
        this.onLog(`${player.name}は呪いを解除した`);
        return false;

      case 'surviveLethalDamageCurse':
        if (!targetTile?.unit) return false;
        targetTile.unit.items.push({ name: card.name, atkBonus: 0, hpBonus: 0, effect: { type: 'surviveLethalDamage' } });
        this.onLog(`${targetTile.unit.def.name}に不死鳥の呪いをかけた`);
        return false;

      case 'enableAllOwnTileAbilities':
        player.allTilesAccessTurnsRemaining = effect.turns;
        this.onLog(`${player.name}は${effect.turns}ターンの間、全ての土地の土地コマンドを使えるようになった`);
        return false;

      case 'autoMatchAllTileElements':
        this._spellAutoMatchAllTileElements();
        return false;

      case 'forceTileElement':
        if (!targetTile) return false;
        targetTile.element = effect.element;
        this._repaintTileToElement(targetTile);
        this.onLog(`${targetTile.id}番地を${ELEMENT_LABEL[effect.element]}属性に変えた`);
        return false;

      case 'swapTwoMonsters':
        this._spellSwapTwoMonsters(cast.targetTileIds);
        return false;

      case 'forceRelocateOneStep':
        await this._spellForceRelocateOneStep(player, targetTile);
        return false;

      case 'curseSanctuary':
        if (!targetTile) return false;
        targetTile.transparentCursed = true;
        this.onLog(`${targetTile.id}番地に聖域の呪いをかけた（侵略不能・通行料ゼロ）`);
        return false;

      default:
        return false;
    }
  }

  /** ブルーオーシャン: 現在地からグラフ距離が最も近い空き地へ瞬間移動する（同着なら抽選）。その場で土地コマンド（土地コマンド・召喚のみ、サイコロ無し）まで済ませてターンを終える。 */
  async _spellWarpToNearbyEmptyLand(player) {
    const currentTile = this.tiles[player.tileId];
    const candidates = this.tiles.filter((t) => t.type === TileType.LAND && t.owner == null && t.id !== currentTile.id);
    if (candidates.length === 0) {
      this.onLog('飛べる空き地がありません');
      return;
    }
    let bestDist = Infinity;
    for (const t of candidates) bestDist = Math.min(bestDist, this._tileDistance(currentTile.id, t.id));
    const nearest = candidates.filter((t) => this._tileDistance(currentTile.id, t.id) === bestDist);
    const target = nearest[Math.floor(Math.random() * nearest.length)];

    player.previousTileId = null;
    player.tileId = target.id;
    if (player.mesh) player.mesh.position.set(target.position.x, PIECE_REST_Y, target.position.z);
    this.onLog(`${player.name}は「ブルーオーシャン」で${target.id}番地に飛んだ！`);
    this._notifyState();

    await this._runLandCommand(player);
    await delay(400);
    for (const p of this.players) this._checkBankruptcy(p);
    if (this.storyEnded) return;
    this._nextTurn();
    await this._beginTurn();
  }

  /** 帰巣本能: スタート地点へ瞬間移動し、周回ボーナス（_computeLapBonus、フリーランサー・領地ボーナス込み）の2倍のGを獲得する。呼び出し元がこの後すぐターンを終える。 */
  _spellReturnToStartDoubleBonus(player) {
    const startTile = this.tiles.find((t) => t.type === TileType.START);
    player.previousTileId = null;
    player.tileId = startTile.id;
    if (player.mesh) player.mesh.position.set(startTile.position.x, PIECE_REST_Y, startTile.position.z);
    this._healOwnedUnitsOnLap(player);
    const bonus = this._computeLapBonus(player).total * 2;
    player.lapsCompleted += 1;
    player.currency += bonus;
    this.onLog(`${player.name}は「帰巣本能」でスタート地点に戻り、+${bonus}Gを獲得した！`);
    if (this.requireAllCheckpoints) player.passedCheckpoints.clear();
  }

  /**
   * 1体へ直接ダメージを与える（火の玉演出込み）。戦闘外でHPが0以下に
   * なった場合の後始末（土地を空ける・不死鳥特性の処理）もここでまとめて
   * 行う - 通常のバトルでのdeath処理（_runInvasion等）と同じ形。
   */
  async _spellDamageUnit(tile, amount, { showEffect = true } = {}) {
    const unit = tile.unit;
    if (!unit) return;
    unit.currentHp -= amount;
    this._notifyState();
    if (showEffect) await this.onDamageEffect?.({ tileId: tile.id, damage: amount });

    if (unit.currentHp <= 0) {
      const owner = this.players.find((p) => p.id === tile.owner);
      tile.unit = null;
      tile.owner = null;
      tile.transparentCursed = false;
      this._repaintTileToElement(tile);
      this.onLog(`${owner.name}の${unit.def.name}は倒された`);
      await this._handleUnitDeath(unit, owner);
    }
  }

  /** 小隕石/洪水/干ばつ/断線事故/森林火災用: 条件に合う盤面全モンスターへ一律ダメージ。演出は1体ずつだと冗長になるので省略し、まとめて1行ログする。 */
  async _spellDamageAllUnits(predicate, amount) {
    const targets = this.tiles.filter((t) => t.unit && predicate(t));
    for (const t of targets) {
      if (!t.unit) continue; // 既に別の対象として倒れている場合はスキップ
      await this._spellDamageUnit(t, amount, { showEffect: false });
    }
    this.onLog(`${targets.length}体のモンスターに${amount}ダメージ！`);
  }

  /** 毒霧: 選んだマスとその隣接マス（前後左右1マス相当）にいる全モンスターを毒状態にする。 */
  _spellPoisonArea(tile, ratio) {
    if (!tile) return;
    const area = [tile, ...tile.neighbors.map((id) => this.tiles[id])];
    let count = 0;
    for (const t of area) {
      if (!t.unit) continue;
      applyPoison(t.unit, ratio);
      count += 1;
    }
    this.onLog(`「毒霧」で${count}体のモンスターが毒状態になった`);
  }

  /** 博愛精神: 盤面の全モンスターのHPを最大HPの割合分だけ回復する。 */
  _spellHealAllUnitsRatio(ratio) {
    let count = 0;
    for (const t of this.tiles) {
      if (!t.unit) continue;
      const maxHp = this._baseStats(t.unit).hp + this._elementHpBonus(t.unit, t);
      const healed = Math.min(t.unit.currentHp + Math.round(maxHp * ratio), maxHp);
      if (healed > t.unit.currentHp) {
        t.unit.currentHp = healed;
        count += 1;
      }
    }
    this.onLog(`「博愛精神」で${count}体のモンスターが回復した`);
  }

  /** 最適化: 盤面の全ての土地について、配置モンスターの属性と土地属性が食い違っていれば土地側をモンスターの属性に合わせる。 */
  _spellAutoMatchAllTileElements() {
    let count = 0;
    for (const t of this.tiles) {
      if (!t.unit || t.type !== TileType.LAND) continue;
      if (t.element === t.unit.def.element) continue;
      t.element = t.unit.def.element;
      this._repaintTileToElement(t);
      count += 1;
    }
    this.onLog(`「最適化」で${count}箇所の土地属性が配置モンスターに合わせて変わった`);
  }

  /** シャッフル: 自分の土地2マスの配置モンスターを入れ替える。呪いは対象の呪いは消滅する（土地レベル・所有権はそのまま）。 */
  _spellSwapTwoMonsters(tileIds) {
    const [idA, idB] = tileIds || [];
    const tileA = this.tiles.find((t) => t.id === idA);
    const tileB = this.tiles.find((t) => t.id === idB);
    if (!tileA?.unit || !tileB?.unit) return;
    const unitA = tileA.unit;
    const unitB = tileB.unit;
    unitA.curses = [];
    unitB.curses = [];
    tileA.unit = unitB;
    tileB.unit = unitA;
    this.onLog(`「シャッフル」で${unitA.def.name}と${unitB.def.name}が入れ替わった`);
  }

  /**
   * サイコキネシス: 指定モンスターを隣接1マスへ強制移動させる（移動先の
   * 候補は「対象モンスターの持ち主」視点で味方土地・特殊マス・透過の呪い
   * 付き土地を除外 - 空き地はOK、敵地（同盟含まない）は強制戦闘）。
   * _humanMoveFlowの侵略分岐と同じ決着ロジックを踏襲する。
   */
  async _spellForceRelocateOneStep(player, targetTile) {
    if (!targetTile?.unit) {
      this.onLog('対象が既にいません');
      return;
    }
    const unit = targetTile.unit;
    const unitOwner = this.players.find((p) => p.id === unit.ownerId);
    const candidates = targetTile.neighbors
      .map((id) => this.tiles[id])
      .filter((t) => t.type === TileType.LAND && !t.transparentCursed)
      .filter((t) => {
        if (t.owner == null) return true;
        if (t.owner === unit.ownerId) return false;
        const owner = this.players.find((p) => p.id === t.owner);
        if (owner?.allianceId != null && owner.allianceId === unitOwner.allianceId) return false;
        return true;
      });
    if (candidates.length === 0) {
      this.onLog('移動できるマスがありません');
      return;
    }
    const destId = await this.onPickAbilityTarget(
      candidates.map((t) => ({ ...this._browseTileSummary(t, player), label: `${t.id}番地へ強制移動` })),
      player.id,
    );
    if (destId == null) return;
    const destTile = this.tiles.find((t) => t.id === destId);
    unit.curses = []; // モンスターの呪いは一瞬でも移動すれば消滅する（防衛されて元の土地に戻った場合も含む）

    if (destTile.owner == null) {
      const mesh = targetTile.unitMesh;
      targetTile.unitMesh = null;
      destTile.unit = unit;
      destTile.owner = unit.ownerId;
      destTile.unitMesh = mesh;
      this._paintTile(destTile, unitOwner.color);
      targetTile.unit = null;
      targetTile.owner = null;
      targetTile.transparentCursed = false;
      this._repaintTileToElement(targetTile);
      this.onLog(`${unit.def.name}が${destTile.id}番地へ強制移動させられた`);
      await this._hopUnitIcon(mesh, targetTile.position, destTile.position);
    } else {
      const defenderPlayer = this.players.find((p) => p.id === destTile.owner);
      const defenderUnit = destTile.unit;
      const result = await this._runBattleScene(unit, unitOwner, defenderUnit, defenderPlayer, targetTile, destTile);
      destTile.forcedStopCursed = false;
      await this._maybeRedirectDeathToLightningRod(defenderPlayer, destTile, result);

      if (result.attackerSurvived && !result.defenderSurvived) {
        const mesh = targetTile.unitMesh;
        targetTile.unitMesh = null;
        this.scene.removeUnitIcon?.(destTile.unitMesh);
        destTile.unit = unit;
        destTile.owner = unit.ownerId;
        destTile.unitMesh = mesh;
        this._paintTile(destTile, unitOwner.color);
        targetTile.unit = null;
        targetTile.owner = null;
        targetTile.transparentCursed = false;
        this._repaintTileToElement(targetTile);
        this.onLog(`${unit.def.name}が強制移動の戦闘で${destTile.id}番地を奪取した！`);
        await this._handleUnitDeath(defenderUnit, defenderPlayer);
        await this._hopUnitIcon(mesh, targetTile.position, destTile.position);
      } else if (result.attackerSurvived && result.defenderSurvived) {
        this.onLog(`${unit.def.name}は強制移動先の防衛を受け、元の土地に戻った`);
        await this._hopUnitIcon(targetTile.unitMesh, targetTile.position, destTile.position);
        await this._hopUnitIcon(targetTile.unitMesh, destTile.position, targetTile.position);
      } else {
        targetTile.unit = null;
        targetTile.owner = null;
        targetTile.transparentCursed = false;
        this._repaintTileToElement(targetTile);
        if (!result.defenderSurvived) {
          destTile.unit = null;
          destTile.owner = null;
          destTile.transparentCursed = false;
          this._repaintTileToElement(destTile);
          this.onLog('強制移動の戦闘で両者相打ちになった');
          await this._handleUnitDeath(defenderUnit, defenderPlayer);
        } else {
          this.onLog(`${unit.def.name}は強制移動の戦闘で倒された`);
        }
        await this._handleUnitDeath(unit, unitOwner);
      }
    }
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
    // ダイス呪い（1のダイス/3のダイス/6のダイス/アイキャンフライ/バックファイア）:
    // 次の1回のロールだけ結果を書き換える一度きりの呪い。
    let reverse = false;
    if (player.diceCurse) {
      const curse = player.diceCurse;
      player.diceCurse = null;
      if (curse.type === 'fixed') {
        steps = curse.value;
        this.onLog(`${player.name}は呪いでサイコロが${steps}に固定された！`);
      } else if (curse.type === 'double') {
        steps = steps * 2;
        this.onLog(`${player.name}は呪いでサイコロの出目が2倍の${steps}になった！`);
      } else if (curse.type === 'reverse') {
        reverse = true;
        this.onLog(`${player.name}は呪いで${steps}マス後退させられる！`);
      }
    }
    player.lastDiceSteps = steps;
    if (!reverse) this.onLog(`${player.name}のサイコロ: ${steps}`);

    if (reverse) {
      await this._movePlayerBackward(player, steps);
    } else {
      await this._movePlayer(player, steps);
    }
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
          tile.transparentCursed = false;
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
        discarded = this._cpuChooseDiscard(player);
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
   * CPUの手札超過時の捨て札選択。所持土地数に応じた目標構成
   * （`DISCARD_TARGET_LAND_THRESHOLD`未満: モンスター2/アイテム2/
   * スペル2、以上: モンスター1/アイテム3/スペル2）に対して、現在の枚数が
   * 目標を超えているカード種別だけを候補にする（超過が無ければ手札全体を
   * 候補にする保険付き）。候補の中からレアリティが低い順に選び、モンスター
   * 同士の同レアリティはATKが低い方（＝残したいのはATKが高い方）を選ぶ。
   */
  _cpuChooseDiscard(player) {
    const landCount = this._summonCountOf(player.id);
    const target = landCount >= DISCARD_TARGET_LAND_THRESHOLD
      ? DISCARD_TARGET_COMPOSITION_LAND_HEAVY
      : DISCARD_TARGET_COMPOSITION_DEFAULT;

    const countsByType = {};
    for (const c of player.hand) countsByType[c.type] = (countsByType[c.type] ?? 0) + 1;

    const candidates = player.hand.filter((c) => (countsByType[c.type] ?? 0) > (target[c.type] ?? 0));
    const pool = candidates.length > 0 ? candidates : player.hand;

    const sorted = [...pool].sort((a, b) => {
      const rarityDiff = DISCARD_RARITY_RANK[a.rarity] - DISCARD_RARITY_RANK[b.rarity];
      if (rarityDiff !== 0) return rarityDiff;
      const aAtk = a.type === CardType.MONSTER ? (a.atk ?? 0) : 0;
      const bAtk = b.type === CardType.MONSTER ? (b.atk ?? 0) : 0;
      return aAtk - bAtk;
    });
    return sorted[0];
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
      // バックファイア用の着地履歴（直近20マスだけ保持すれば十分）。
      player.tileHistory.unshift(nextId);
      if (player.tileHistory.length > 20) player.tileHistory.length = 20;
      await this._stepWithCamera(player, fromTile.position, toTile.position);

      if (toTile.type === TileType.EVENT) await this._visitCheckpoint(player, toTile);

      if (toTile.type === TileType.START && i < steps - 1) {
        await this._grantGoalBonus(player);
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

  /**
   * バックファイア用: player.tileHistory（着地履歴、新しい順）を1つずつ
   * 遡ることで後退を再現する。通常の前進と違い分岐選択は発生しない
   * （来た道をそのまま戻るだけ）。履歴が尽きたらそこで止まる。ゴール
   * ボーナスは付与しない（後退でゴールを通り過ぎてもボーナスの対象外）。
   */
  async _movePlayerBackward(player, steps) {
    this._turnPathIds = [];
    for (let i = 0; i < steps; i++) {
      if (player.tileHistory.length < 2) break;
      const fromTile = this.tiles[player.tileId];
      player.tileHistory.shift();
      const backId = player.tileHistory[0];
      const toTile = this.tiles[backId];
      player.previousTileId = player.tileId;
      player.tileId = backId;
      this._turnPathIds.push(backId);
      await this._stepWithCamera(player, fromTile.position, toTile.position);

      if (toTile.type === TileType.EVENT) await this._visitCheckpoint(player, toTile);

      if (this._isForcedStopFor(player, toTile)) {
        if (i < steps - 1) this.onLog(`${player.name}は強制停止の呪いで足を止めた！`);
        break;
      }
    }
  }

  /**
   * カルドセプト準拠の周回ボーナス総額を計算する（実際に加算はしない、
   * _grantGoalBonusと帰巣本能スペルが共用する純粋な計算のみ）。
   * - 基本ボーナス: (周回数+1)×START_BONUS。周を重ねるほど増える。
   *   フリーランサーが盤上にいれば倍率補正がかかる。
   * - 領地ボーナス: 所持土地数×LAND_BONUS_RATE（2人戦）/
   *   LAND_BONUS_RATE_MULTI（3人以上）。連鎖数・土地レベルは影響しない。
   */
  _computeLapBonus(player) {
    const baseBonus = (player.lapsCompleted + 1) * START_BONUS;
    const freelancerTile = this.tiles.find(
      (t) => t.unit && t.unit.ownerId === player.id && t.unit.def.effect?.type === 'lapBonusMultiplier',
    );
    const base = freelancerTile ? Math.round(baseBonus * freelancerTile.unit.def.effect.multiplier) : baseBonus;
    const landRate = this.players.length >= 3 ? LAND_BONUS_RATE_MULTI : LAND_BONUS_RATE;
    const land = this._summonCountOf(player.id) * landRate;
    return { base, land, total: base + land };
  }

  /** ゴール(START)着地/通過どちらからも呼ぶ: このマップにrequireAllCheckpointsが立っていれば全チェックポイント通過済みの時だけボーナスを渡し、渡したらこのラップ分の通過記録をクリアする。立っていなければ無条件で渡す（従来通り）。 */
  async _grantGoalBonus(player) {
    this._healOwnedUnitsOnLap(player);
    if (this.requireAllCheckpoints && !this._hasPassedAllCheckpoints(player)) {
      const remaining = this.tiles
        .filter((tile) => tile.type === TileType.EVENT && !player.passedCheckpoints.has(tile.id))
        .map((tile) => tile.checkpointNumber);
      this.onLog(`${player.name}はゴールを通過（ボーナスなし）　残りのCPは${remaining.map((number) => `${number}番`).join('、')}です`);
      await delay(900);
      return;
    }
    const { base, land, total } = this._computeLapBonus(player);
    player.currency += total;
    player.lapsCompleted += 1;
    this.onLog(`${player.name}はゴールを通過！ +${total}G（基本${base}G＋領地${land}G）`);
    if (this.requireAllCheckpoints) player.passedCheckpoints.clear();

    // 宝くじ: 次のゴール通過で0〜500Gをランダム獲得する権利（100G刻み、500Gだけ確率10%）。
    if (player.lotteryOnNextGoal) {
      player.lotteryOnNextGoal = false;
      const roll = Math.random();
      const lotteryAmount = roll < 0.1 ? 500 : Math.floor(Math.random() * 5) * 100;
      player.currency += lotteryAmount;
      this.onLog(`${player.name}は宝くじで${lotteryAmount}Gを獲得した！`);
    }
    this._notifyState();
    await delay(900);
  }

  /** 初めて通過したCPだけ100Gを付与し、残り番号を案内して一瞬停止する。 */
  async _visitCheckpoint(player, tile) {
    if (player.passedCheckpoints.has(tile.id)) return;
    player.passedCheckpoints.add(tile.id);
    player.currency += 100;
    const remaining = this.tiles
      .filter((candidate) => candidate.type === TileType.EVENT && !player.passedCheckpoints.has(candidate.id))
      .map((candidate) => candidate.checkpointNumber);
    const guidance = remaining.length
      ? `残りのCPは${remaining.map((number) => `${number}番`).join('、')}です`
      : 'すべてのCPを通過しました。ゴールしてください';
    this.onLog(`${player.name}はCP${tile.checkpointNumber}を通過！ +100G　${guidance}`);
    this._notifyState();
    await delay(900);
  }

  /**
   * 配置されたモンスターは、所有者・属性を問わず周回ごとに最大基礎HPの
   * 10%回復する（全プレイヤー共通のルール）。チェックポイント未達成で
   * ボーナス無しの周回でも、ゴールを通過したこと自体は変わらないので
   * 回復は適用する。「最大基礎HP」は素のdef.hp＋永続呪いの加算に加え、
   * 同属性ボーナス（土地レベル×10）も含む＝土地情報等アイドル時のHP
   * 上限と同じ基準。
   * メカニックマソ: 自分の盤面のどこかに配置されていれば、自分が所有する
   * 雷属性モンスターだけこの汎用10%にさらに+10%上乗せされる（合計20%）。
   */
  _healOwnedUnitsOnLap(player) {
    const hasMechanicMaso = this._hasAllyOnBoard(player.id, 'mechanicMaso');
    for (const t of this._ownedTiles(player)) {
      if (!t.unit) continue;
      const mechanicMasoBonus = hasMechanicMaso && t.unit.def.element === Element.THUNDER;
      const healRatio = mechanicMasoBonus ? 0.2 : 0.1;
      const maxHp = this._baseStats(t.unit).hp + this._elementHpBonus(t.unit, t);
      const healed = Math.min(t.unit.currentHp + Math.round(maxHp * healRatio), maxHp);
      if (healed > t.unit.currentHp) {
        t.unit.currentHp = healed;
        this.onLog(`${t.unit.def.name}は周回の恩恵でHP回復${mechanicMasoBonus ? '（メカニックマソの上乗せ込み）' : ''}`);
      }
    }
  }

  _hasPassedAllCheckpoints(player) {
    return this.tiles
      .filter((t) => t.type === TileType.EVENT)
      .every((t) => player.passedCheckpoints.has(t.id));
  }

  /**
   * 強制停止の呪いが今このプレイヤーに対して効くか。`tile.forcedStopCursed`は
   * 通常`true`（ほこら効果 - 免除対象は土地の所有者本人）だが、アリジゴク
   * （スペル）は免除対象を「詠唱者」に変えたいので、代わりに免除する
   * プレイヤーidそのものを入れておける（数値idはtruthyなので`true`同様に
   * 呪いあり判定される）。免除対象の同盟仲間も素通りできる。
   */
  _isForcedStopFor(player, tile) {
    // player.idは0始まりなので、免除idがプレイヤー0の時に`!tile.forcedStopCursed`
    // だと`!0`=trueになり「呪い無し」と誤判定してしまう - null/undefined/false
    // だけを「呪い無し」として明示的に弾く。
    if (tile.forcedStopCursed == null || tile.forcedStopCursed === false) return false;
    if (tile.type !== TileType.LAND || tile.owner == null) return false;
    const exemptId = tile.forcedStopCursed === true ? tile.owner : tile.forcedStopCursed;
    if (exemptId === player.id) return false;
    const exemptPlayer = this.players.find((p) => p.id === exemptId);
    if (exemptPlayer?.allianceId != null && exemptPlayer.allianceId === player.allianceId) return false;
    return true;
  }

  /** CPU just picks randomly; the human is prompted (camera-work + diagonal arrows toward whichever screen direction each option actually sits in). */
  async _chooseNextTile(player, fromTile, optionIds) {
    if (player.isCPU) return this._cpuChooseNextTile(player, optionIds);

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
   * CPUの分岐選択: 完全ランダムではなく、次に狙うべきマス
   * （_nearestGoalTileId: 未通過チェックポイントかゴール）までの距離が
   * 近い選択肢ほど選ばれやすい重み付き抽選にする。ただし相手の高額マス
   * （Lv3以上・同盟仲間以外の所有地）につながる選択肢は
   * aiProfile.highValueAvoidanceに応じて重みを下げる（0にはしない -
   * 「勝てる可能性がある限りは攻める」性格のキャラも成立させるため、
   * あくまで確率を歪めるだけで完全に排除はしない）。
   */
  _cpuChooseNextTile(player, optionIds) {
    const profile = player.aiProfile;
    const target = this._nearestGoalTileId(player);
    const weights = optionIds.map((id) => {
      const tile = this.tiles[id];
      const distance = target == null ? 0 : this._tileDistance(id, target);
      let score = -distance;
      if (tile.type === TileType.LAND && tile.level >= 3 && tile.owner != null && tile.owner !== player.id) {
        const owner = this.players.find((p) => p.id === tile.owner);
        const isAlly = owner?.allianceId != null && owner.allianceId === player.allianceId;
        if (!isAlly) score -= profile.highValueAvoidance * 6;
        // 高レベルの敵地は、手札の召喚候補で勝率80%以上を見込める場合
        // にだけ選ぶ。勝てる候補が無い分岐では、未回収チェックポイント／
        // ゴールを優先しつつ、敵Lv3以上を実質的に迂回する。
        const candidates = player.hand.filter((c) => c.type === CardType.MONSTER && (c.hp ?? 0) > 0);
        const bestRate = candidates.reduce((best, card) => Math.max(
          best,
          this._estimateWinProbability(card, player.id, player.hand, tile, false),
          this._estimateWinProbability(card, player.id, player.hand, tile, true),
        ), 0);
        if (bestRate < 0.8) score -= 1000;
      }
      return Math.exp(score);
    });
    return this._weightedRandomPick(optionIds, weights);
  }

  /** 今向かうべき目標タイルid: 全チェックポイント制のマップでまだ未通過のものがあればその中で一番近いもの、そうでなければゴール（START）。目標が存在しないマップ構成ならnull。 */
  _nearestGoalTileId(player) {
    if (this.requireAllCheckpoints) {
      const unpassed = this.tiles.filter((t) => t.type === TileType.EVENT && !player.passedCheckpoints.has(t.id));
      if (unpassed.length > 0) {
        let best = unpassed[0];
        let bestDist = this._tileDistance(player.tileId, best.id);
        for (const t of unpassed.slice(1)) {
          const d = this._tileDistance(player.tileId, t.id);
          if (d < bestDist) {
            best = t;
            bestDist = d;
          }
        }
        return best.id;
      }
    }
    const startTile = this.tiles.find((t) => t.type === TileType.START);
    return startTile ? startTile.id : null;
  }

  /** 重み付き抽選（重みの合計に対する乱数で選ぶ）。重みが全て0以下なら単純な一様ランダムにフォールバックする。 */
  _weightedRandomPick(items, weights) {
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (!(total > 0)) return items[Math.floor(Math.random() * items.length)];
    let roll = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
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

  /** 配置モンスターの盤上アイコンが一マス分ホップ移動する演出（_tweenStepの駒版）。侵略で防衛された場合の「元の土地に戻る」往復にも使う。 */
  _hopUnitIcon(mesh, from, to) {
    if (!mesh) return Promise.resolve();
    return tween(STEP_DURATION_MS, (t) => {
      const eased = easeInOutQuad(t);
      const x = from.x + (to.x - from.x) * eased;
      const z = from.z + (to.z - from.z) * eased;
      const hop = Math.sin(Math.PI * t) * 0.5;
      mesh.position.set(x, UNIT_ICON_REST_Y + hop, z);
    });
  }

  /**
   * `tile.unit`の有無と盤上アイコン（`tile.unitMesh`、ミニカード＋通行料
   * バッジ＋HPゲージ）・所有者名ラベル（`tile.ownerLabelMesh`）の有無を
   * 突き合わせて作成/削除・更新する。_notifyStateから毎回呼ぶことで、
   * 召喚・侵略・死亡・売却・融合等tile.unitを書き換えるあらゆる箇所を
   * 個別に触らずに済む（移動時のホップ演出だけは_humanMoveFlow/
   * _spellForceRelocateOneStepが事前にtile.unitMeshを付け替えてから呼ぶ
   * ので、ここでは何もしない）。HP/通行料は毎回updateUnitIconに渡すが、
   * 値が変わっていなければscene側で再描画をスキップする。
   */
  _syncUnitIcons() {
    for (const tile of this.tiles) {
      if (tile.unit) {
        if (!tile.unitMesh || tile.unitMesh.userData.unit !== tile.unit) {
          if (tile.unitMesh) this.scene.removeUnitIcon?.(tile.unitMesh);
          tile.unitMesh = this.scene.createUnitIcon?.(tile.unit, tile.position) ?? null;
          if (tile.unitMesh) tile.unitMesh.userData.unit = tile.unit;
        }
        this.scene.updateUnitIcon?.(tile.unitMesh, {
          hp: tile.unit.currentHp,
          maxHp: tile.unit.def.hp,
          toll: this._tollOfTile(tile),
        });

        const ownerName = this.players.find((p) => p.id === tile.owner)?.name ?? '';
        if (!tile.ownerLabelMesh || tile.ownerLabelMesh.userData.ownerName !== ownerName) {
          if (tile.ownerLabelMesh) this.scene.removeOwnerLabel?.(tile.ownerLabelMesh);
          tile.ownerLabelMesh = this.scene.createOwnerLabel?.(ownerName, tile.position) ?? null;
          if (tile.ownerLabelMesh) tile.ownerLabelMesh.userData.ownerName = ownerName;
        }
      } else {
        if (tile.unitMesh) {
          this.scene.removeUnitIcon?.(tile.unitMesh);
          tile.unitMesh = null;
        }
        if (tile.ownerLabelMesh) {
          this.scene.removeOwnerLabel?.(tile.ownerLabelMesh);
          tile.ownerLabelMesh = null;
        }
      }
    }
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
      await this._grantGoalBonus(player);
    } else if (tile.type === TileType.EVENT) {
      // 通過報酬と残りCP案内は移動中の_visitCheckpointで処理済み。
    } else if (tile.type === TileType.SHOP) {
      await this._resolveShopTile(player);
    } else if (tile.type === TileType.SHRINE) {
      await this._resolveShrineTile(player);
    } else if (tile.type === TileType.WARP) {
      await this._resolveWarpTile(player);
    }

    if (tile.type === TileType.START || tile.type === TileType.EVENT) {
      this.onLog(`${player.name}は${tile.type === TileType.START ? 'ゴール' : `CP${tile.checkpointNumber}`}にちょうど停止！ このターンは保有するすべての土地で土地コマンドを使えます`);
      await delay(900);
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
    // 不動産鑑〇士: 効果中は今どこに立っていてもisAdmin相当（=全所有地に土地
    // コマンドでアクセス可能）になる。
    const isAdmin =
      tile.type === TileType.START || tile.type === TileType.EVENT || player.allTilesAccessTurnsRemaining > 0;
    const owesTollUnlessConquered = tile.type === TileType.LAND && tile.owner != null && tile.owner !== player.id;
    if (tile.type !== TileType.LAND && !isAdmin) return;

    if (player.isCPU) {
      if (tile.type === TileType.LAND) await this._cpuLandCommand(player, tile);
      await this._settleLandingToll(player, tile, owesTollUnlessConquered);
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
    await this._settleLandingToll(player, tile, owesTollUnlessConquered);
  }

  /**
   * 通行料は「敵地に足を踏み入れたのに、結局そこを奪えなかった」ことへの
   * 代償という扱いに変更（旧仕様は着地した瞬間に無条件徴収していた）。
   * このターンの土地コマンドが終わる瞬間に一度だけ判定する: 侵略に成功して
   * 自分の土地になっていれば免除、相打ちで無人地になっていても（払う相手が
   * もういないので）免除、それ以外（防衛成功、または侵略を試みなかった）
   * は今まで通り徴収する。
   */
  async _settleLandingToll(player, tile, owesTollUnlessConquered) {
    if (!owesTollUnlessConquered) return;
    if (tile.owner == null || tile.owner === player.id) return;
    const owner = this.players.find((p) => p.id === tile.owner);
    // 同盟戦: 仲間の土地に止まっても通行料は取られない。
    if (owner.allianceId != null && owner.allianceId === player.allianceId) return;

    let toll = this._tollOfTile(tile);
    // 追徴課税: 対象の土地に止まった最初の相手にだけ1.5倍（1回限り消費）。
    if (tile.tollBonusOnceMultiplier) {
      toll = Math.round(toll * tile.tollBonusOnceMultiplier);
      tile.tollBonusOnceMultiplier = null;
      this.onLog('「追徴課税」の効果で通行料が割り増しされた！');
    }
    // 脱税: 次に支払うはずだった通行料を1回無効化する（自分への呪い）。
    if (player.tollWaiverCharges > 0) {
      player.tollWaiverCharges -= 1;
      this.onLog(`${player.name}は「脱税」の効果で通行料の支払いを免れた！`);
      this._notifyState();
      return;
    }
    player.currency -= toll;
    owner.currency += toll;
    this.onLog(`${player.name}は通行料を支払った (-${toll}G → ${owner.name})`);
    this._notifyState();
    await this.onTollPayment({
      playerId: player.id,
      playerName: player.name,
      amount: toll,
      position: this.tiles[player.tileId]?.position ?? null,
    });
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

  /**
   * メタ〇ン: 盤面に存在するモンスターの中から1体を選んで変身する
   * （基礎値のみコピーし、バフ・デバフは引き継がない＝新しいdefへの
   * 差し替えなので既存のcurses/itemsはそのまま、currentHpだけ変身後の
   * 素のHPにリセットする）。対象がいなければ何もしない。CPU（対人戦の
   * 簡易AI）は変身させず素の姿のまま運用する。
   */
  async _maybeCopyOnSummon(tile, player) {
    const targets = this.tiles.filter((t) => t.unit && t !== tile);
    if (targets.length === 0) return;

    const targetId = await this.onPickAbilityTarget(
      targets.map((t) => ({ ...this._browseTileSummary(t, player), label: `${t.unit.def.name}に変身` })),
      player.id,
    );
    if (targetId == null) return;
    const targetTile = this.tiles.find((t) => t.id === targetId);
    if (!targetTile?.unit) return;

    const newDef = { ...targetTile.unit.def, id: tile.unit.def.id, catalogId: catalogIdOf(targetTile.unit.def) };
    tile.unit.def = newDef;
    tile.unit.currentHp = newDef.hp;
    this.onLog(`${player.name}のモンスターが${newDef.name}に変身した！`);
    this._notifyState();
  }

  /** 召喚条件chainRequired（例: 「火の土地1連鎖以上」）を満たすか。無指定なら常にtrue。 */
  _meetsChainRequirement(player, card) {
    if (!card.chainRequired) return true;
    return this._chainCount(player.id, card.element) >= card.chainRequired;
  }

  _affordableMonsterCards(player) {
    return player.hand.filter(
      (c) => c.type === CardType.MONSTER && c.cost <= player.currency && this._meetsChainRequirement(player, c),
    );
  }

  _ownedTiles(player) {
    return this.tiles.filter((t) => t.owner === player.id);
  }

  /**
   * 連鎖数: how many tiles of this element the owner holds (same-element
   * lands count as one 連鎖 today, since every element already forms a
   * single contiguous edge on this board). 無色 never chains, even with
   * other 無色 tiles. 同盟戦では同盟仲間の同属性所有地も連鎖にカウントする
   * （土地の所有権自体は個人のまま - このカウント上だけ仲間の分も足し
   * 合わせる）。召喚条件chainRequired（例:「1連鎖以上」）や炎神/水神系の
   * statsPerElementChain効果（連鎖数×n）はこの生の枚数を直接使う。
   */
  _chainCount(ownerId, element) {
    if (ownerId == null || element === Element.NEUTRAL) return 0;
    const owner = this.players.find((p) => p.id === ownerId);
    const allianceId = owner?.allianceId ?? null;
    return this.tiles.filter((t) => {
      if (t.element !== element || t.owner == null) return false;
      if (t.owner === ownerId) return true;
      if (allianceId == null) return false;
      const tileOwner = this.players.find((p) => p.id === t.owner);
      return tileOwner?.allianceId === allianceId;
    }).length;
  }

  /** 連鎖倍率: 連鎖数をCHAIN_MULTIPLIERテーブルに当てはめる（地価/通行料計算専用）。無所有・無色は連鎖1扱い。 */
  _chainMultiplier(ownerId, element) {
    const count = this._chainCount(ownerId, element);
    return CHAIN_MULTIPLIER[Math.min(Math.max(count, 1), LEVEL_CAP)];
  }

  /** 地価 = 基本地価 × レベル倍率 × 連鎖倍率 */
  _landValueOfTile(tile) {
    return Math.round(tile.price * tile.level * this._chainMultiplier(tile.owner, tile.element));
  }

  /** 通行料 = 地価 × 通行料倍率。透過の呪い（深海魚X）がかかった土地は通行料ゼロ。 */
  _tollOfTile(tile) {
    if (tile.transparentCursed) return 0;
    let toll = Math.round(this._landValueOfTile(tile) * TOLL_RATE[tile.level]);
    // 増税通知: 通行料を割合で恒久的に減らす呪い（表示にも反映される安定した値、
    // 追徴課税の1回限り倍率とは別枠 - こちらは_settleLandingToll側で扱う）。
    if (tile.tollReductionRatio) toll = Math.round(toll * (1 - tile.tollReductionRatio));
    return toll;
  }

  /**
   * Returns true if a summon/invade/swap actually went through (vs. being
   * cancelled). Doubles as the 土地-browse submenu's 入れ替え handler - the
   * only difference for a 'swap' actionType (tile already owned by this
   * player) is that the displaced unit's original card goes back to hand
   * instead of just vanishing.
   */
  async _humanSummonFlow(player, tile) {
    if (tile.owner != null && tile.owner !== player.id && tile.transparentCursed) {
      this.onLog('透過の呪いがかかっており侵略できません');
      return false;
    }
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
      this._notifyState();
      await this.onSummonEffect?.({ tileId: tile.id, unitName: card.name });
      if (card.effect?.type === 'copyOnSummon') {
        await this._maybeCopyOnSummon(tile, player);
      }
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
      .filter((t) => t.type === TileType.LAND && !t.transparentCursed && (t.owner == null || t.owner !== player.id));
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
    attackerUnit.curses = []; // モンスターの呪いは一瞬でも移動すれば消滅する（防衛されて元の土地に戻った場合も含む）

    if (targetTile.owner == null) {
      const mesh = tile.unitMesh;
      tile.unitMesh = null;
      targetTile.unit = attackerUnit;
      targetTile.owner = player.id;
      targetTile.unitMesh = mesh;
      this._paintTile(targetTile, player.color);
      tile.unit = null;
      tile.owner = null;
      tile.transparentCursed = false;
      this._repaintTileToElement(tile);
      this.onLog(`${player.name}は${attackerName}を移動させた`);
      await this._hopUnitIcon(mesh, tile.position, targetTile.position);
    } else {
      const defenderPlayer = this.players.find((p) => p.id === targetTile.owner);
      const defenderUnit = targetTile.unit;
      const result = await this._runBattleScene(attackerUnit, player, defenderUnit, defenderPlayer, tile, targetTile);
      targetTile.forcedStopCursed = false; // 戦闘が終わると消える - _shrineForcedStop参照。
      await this._maybeRedirectDeathToLightningRod(defenderPlayer, targetTile, result);

      if (result.attackerSurvived && !result.defenderSurvived) {
        const mesh = tile.unitMesh;
        tile.unitMesh = null;
        this.scene.removeUnitIcon?.(targetTile.unitMesh);
        targetTile.unit = attackerUnit;
        targetTile.owner = player.id;
        targetTile.unitMesh = mesh;
        this._paintTile(targetTile, player.color);
        tile.unit = null;
        tile.owner = null;
        tile.transparentCursed = false;
        this._repaintTileToElement(tile);
        this.onLog(`${player.name}が土地を奪取した！`);
        await this._handleUnitDeath(defenderUnit, defenderPlayer);
        await this._hopUnitIcon(mesh, tile.position, targetTile.position);
      } else if (result.attackerSurvived && result.defenderSurvived) {
        this.onLog(`${defenderPlayer.name}の${defenderUnit.def.name}が防衛に成功し、${attackerName}は元の土地に戻った`);
        await this._hopUnitIcon(tile.unitMesh, tile.position, targetTile.position);
        await this._hopUnitIcon(tile.unitMesh, targetTile.position, tile.position);
      } else {
        tile.unit = null;
        tile.owner = null;
        tile.transparentCursed = false;
        this._repaintTileToElement(tile);
        if (!result.defenderSurvived) {
          targetTile.unit = null;
          targetTile.owner = null;
          targetTile.transparentCursed = false;
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
    tile.transparentCursed = false;
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
   * 土地コマンドの「特殊能力」: 配置されたモンスターが持つabilityを行使
   * する。commandCostが設定されていれば所持Gを確認したうえで対象選び→
   * コスト確認→実行の順に進み、確定した時だけ消費する（キャンセルや
   * 対象/種類が無い場合はG消費なし）。damage系はHPが0以下で即死（通常の
   * 戦闘死と同じ_handleUnitDeathを流用 - 不死鳥特性はここでも効く）。
   * 実行したら移動・売却と同様に自動でターン終了する。
   */
  async _humanAbilityFlow(player, tile) {
    const unitDef = tile.unit?.def;
    const ability = unitDef?.ability;
    if (!ability) return false;

    const commandCost = unitDef.commandCost ?? 0;
    if (player.currency < commandCost) {
      this.onLog('Gが足りず特殊能力を使えません');
      return false;
    }
    const abilityLabel = unitDef.effectDescription ?? '特殊能力';

    const confirmAndSpend = async () => {
      const confirmed = await this.onConfirmAction(
        { actionType: 'ability', abilityLabel, cost: commandCost, tile: this.getTileSummary(tile) },
        player.id,
      );
      if (!confirmed) return false;
      player.currency -= commandCost;
      return true;
    };

    if (ability.type === 'damage') {
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
      if (!(await confirmAndSpend())) return false;

      const targetTile = this.tiles.find((t) => t.id === targetId);
      const targetUnit = targetTile.unit;
      targetUnit.currentHp -= ability.power;
      this.onLog(`${player.name}の${unitDef.name}が特殊能力で${targetUnit.def.name}に${ability.power}ダメージ！`);
      this._notifyState();
      await this.onDamageEffect?.({ tileId: targetTile.id, damage: ability.power });

      if (targetUnit.currentHp <= 0) {
        const targetOwner = this.players.find((p) => p.id === targetTile.owner);
        targetTile.unit = null;
        targetTile.owner = null;
        targetTile.transparentCursed = false;
        this._repaintTileToElement(targetTile);
        this.onLog(`${targetOwner.name}の${targetUnit.def.name}は倒された`);
        await this._handleUnitDeath(targetUnit, targetOwner);
      }
      this._notifyState();
      return true;
    }

    if (ability.type === 'warpToEmptyElementLand') {
      const targets = this.tiles.filter(
        (t) => t.type === TileType.LAND && t.owner == null && t.element === ability.element && t.id !== tile.id,
      );
      if (targets.length === 0) {
        this.onLog('ワープ先の空き地がありません');
        return false;
      }
      const targetId = await this.onPickAbilityTarget(
        targets.map((t) => ({ ...this._browseTileSummary(t, player), label: `${ELEMENT_LABEL[t.element]}の空き地（${t.id}番）` })),
        player.id,
      );
      if (targetId == null) return false;
      if (!(await confirmAndSpend())) return false;

      const targetTile = this.tiles.find((t) => t.id === targetId);
      const unit = tile.unit;
      targetTile.unit = unit;
      targetTile.owner = player.id;
      this._paintTile(targetTile, player.color);
      tile.unit = null;
      tile.owner = null;
      tile.transparentCursed = false;
      this._repaintTileToElement(tile);
      this.onLog(`${player.name}の${unitDef.name}が${targetTile.id}番地へワープした`);
      this._notifyState();
      await this.onTargetEffect?.({ tileId: targetTile.id, position: targetTile.position, message: `${unitDef.name}がワープした！` });
      return true;
    }

    if (ability.type === 'healAllOwnedAndCleanse') {
      if (!(await confirmAndSpend())) return false;

      let healedCount = 0;
      for (const t of this._ownedTiles(player)) {
        if (!t.unit) continue;
        t.unit.curses = [];
        t.unit.currentHp = this._baseStats(t.unit).hp + this._elementHpBonus(t.unit, t);
        healedCount += 1;
      }
      this.onLog(`${player.name}の${unitDef.name}が味方全体を回復し、呪いを解除した（${healedCount}体）`);
      this._notifyState();
      return true;
    }

    if (ability.type === 'drawCard') {
      const cardType = await this.onPickCardType(player.id);
      if (cardType == null) return false;
      const drawn = this._drawCardOfType(player, cardType);
      if (!drawn) {
        this.onLog('該当するカードが見つかりませんでした');
        return false;
      }
      if (!(await confirmAndSpend())) return false;

      player.hand.push(drawn);
      this.onLog(`${player.name}の${unitDef.name}が「${drawn.name}」を引いた`);
      this._notifyState();
      return true;
    }

    if (ability.type === 'curseTransparency') {
      if (!(await confirmAndSpend())) return false;

      tile.transparentCursed = true;
      this.onLog(`${player.name}の${unitDef.name}が透過の呪いを自身にかけた（侵略不能・通行料ゼロ）`);
      this._notifyState();
      return true;
    }

    if (ability.type === 'summonFieldMonster' || ability.type === 'summonMonsterOnEmptyLand') {
      const emptyLands = this.tiles.filter((t) => t.type === TileType.LAND && t.owner == null);
      if (emptyLands.length === 0) {
        this.onLog('召喚できる空き地がありません');
        return false;
      }
      if (!(await confirmAndSpend())) return false;

      const targetTile = emptyLands[Math.floor(Math.random() * emptyLands.length)];
      const summonedDef =
        ability.type === 'summonFieldMonster'
          ? { ...DENCHU_FIELD_MONSTER, id: `denchu-${Date.now()}-${Math.random().toString(36).slice(2)}` }
          : { ...MONSTER_CATALOG[ability.catalogId], id: `summon-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      this._placeUnit(targetTile, player, summonedDef);
      this.onLog(`${player.name}の${unitDef.name}が${targetTile.id}番地に${summonedDef.name}を召喚した`);
      this._notifyState();
      await this.onSummonEffect?.({ tileId: targetTile.id, unitName: summonedDef.name });
      return true;
    }

    if (ability.type === 'changeOwnLandElement') {
      const ownedLands = this._ownedTiles(player);
      if (ownedLands.length === 0) {
        this.onLog('対象の土地がありません');
        return false;
      }
      const targetId = await this.onPickAbilityTarget(
        ownedLands.map((t) => ({ ...this._browseTileSummary(t, player), label: `${t.id}番地（${ELEMENT_LABEL[t.element]}）` })),
        player.id,
      );
      if (targetId == null) return false;
      const targetTile = this.tiles.find((t) => t.id === targetId);
      const newElement = await this.onPickElement(CHANGEABLE_ELEMENTS.filter((e) => e !== targetTile.element), player.id);
      if (newElement == null) return false;
      if (!(await confirmAndSpend())) return false;

      targetTile.element = newElement;
      this.onLog(`${player.name}の${unitDef.name}が${targetTile.id}番地の属性を${ELEMENT_LABEL[newElement]}に変更した`);
      this._notifyState();
      await this.onTargetEffect?.({ tileId: targetTile.id, position: targetTile.position, message: `${ELEMENT_LABEL[newElement]}属性に変化！` });
      return true;
    }

    if (ability.type === 'damageAndSelfDestruct') {
      const targets = this.tiles.filter((t) => {
        if (t.owner == null || t.owner === player.id) return false;
        const owner = this.players.find((p) => p.id === t.owner);
        if (owner?.allianceId != null && owner.allianceId === player.allianceId) return false;
        return true;
      });
      if (targets.length === 0) {
        this.onLog('対象の敵がいません');
        return false;
      }
      const targetId = await this.onPickAbilityTarget(targets.map((t) => this._browseTileSummary(t, player)), player.id);
      if (targetId == null) return false;
      if (!(await confirmAndSpend())) return false;

      const targetTile = this.tiles.find((t) => t.id === targetId);
      const targetUnit = targetTile.unit;
      targetUnit.currentHp -= ability.power;
      this.onLog(`${player.name}の${unitDef.name}が特殊能力で${targetUnit.def.name}に${ability.power}ダメージを与え、自身は消滅した！`);
      await this.onDamageEffect?.({ tileId: targetTile.id, damage: ability.power });

      const casterUnit = tile.unit;
      tile.unit = null;
      tile.owner = null;
      tile.transparentCursed = false;
      this._repaintTileToElement(tile);
      this._notifyState();
      await this._handleUnitDeath(casterUnit, player);

      if (targetUnit.currentHp <= 0) {
        const targetOwner = this.players.find((p) => p.id === targetTile.owner);
        targetTile.unit = null;
        targetTile.owner = null;
        targetTile.transparentCursed = false;
        this._repaintTileToElement(targetTile);
        this.onLog(`${targetOwner.name}の${targetUnit.def.name}は倒された`);
        await this._handleUnitDeath(targetUnit, targetOwner);
      }
      this._notifyState();
      return true;
    }

    if (ability.type === 'grantItem') {
      if (!(await confirmAndSpend())) return false;

      const itemDef = ITEM_CATALOG[ability.itemId];
      const card = { ...itemDef, id: `granted-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      player.hand.push(card);
      this.onLog(`${player.name}の${unitDef.name}が「${card.name}」を入手した`);
      this._notifyState();
      return true;
    }

    if (ability.type === 'cursePlayerHaste') {
      const targets = this.players.filter((p) => {
        if (p.id === player.id || p.defeated) return false;
        if (p.allianceId != null && p.allianceId === player.allianceId) return false;
        return true;
      });
      if (targets.length === 0) {
        this.onLog('対象にできるプレイヤーがいません');
        return false;
      }
      const targetId = await this.onPickAbilityTarget(
        targets.map((p) => ({ id: p.id, label: `${p.name}に高速化の呪いをかける` })),
        player.id,
      );
      if (targetId == null) return false;
      if (!(await confirmAndSpend())) return false;

      const targetPlayer = this.players.find((p) => p.id === targetId);
      targetPlayer.hasteTurnsRemaining = (targetPlayer.hasteTurnsRemaining || 0) + ability.turns;
      this.onLog(`${player.name}の${unitDef.name}が${targetPlayer.name}に高速化の呪いをかけた`);
      this._notifyState();
      await this.onTargetEffect?.({
        playerId: targetPlayer.id,
        position: this.tiles[targetPlayer.tileId]?.position ?? null,
        message: `高速化の呪い：${ability.turns}ターン`,
      });
      return true;
    }

    return false;
  }

  /** あざらしさんの「選んだ種類のカードをランダムに1枚引ける」用: まず山札から、無ければ捨て札から、指定typeのカードを1枚抜き出して返す（見つからなければnull）。 */
  _drawCardOfType(player, cardType) {
    const fromDraw = player.deck.drawPile.filter((c) => c.type === cardType);
    const pile = fromDraw.length > 0 ? player.deck.drawPile : player.deck.discardPile;
    const matches = fromDraw.length > 0 ? fromDraw : player.deck.discardPile.filter((c) => c.type === cardType);
    if (matches.length === 0) return null;
    const picked = matches[Math.floor(Math.random() * matches.length)];
    pile.splice(pile.indexOf(picked), 1);
    return picked;
  }

  /**
   * CPUの土地コマンド判断。自分の土地なら_cpuMaybeLevelUpでレベルアップの
   * 是非だけ検討（入れ替え・属性変更・売却・特殊能力はまだCPUに実装して
   * いない）。空き地なら_cpuChooseSummonCardで召喚するカードを選ぶ。敵地
   * なら_cpuDecideInvasionで侵略するかどうか・どのカードで・アイテムを
   * 使うかを勝率シミュレーションベースで決める（見送ればG消費なしで
   * このターンの土地コマンドを終える）。
   */
  async _cpuLandCommand(player, tile) {
    await delay(CPU_DECISION_MS);
    const profile = player.aiProfile;

    if (tile.owner === player.id) {
      const usedDamageAbility = await this._cpuMaybeUseDamageAbility(player, tile);
      if (!usedDamageAbility) this._cpuMaybeLevelUp(player, tile, profile);
      return;
    }

    const options = this._affordableMonsterCards(player);
    if (options.length === 0) return;

    if (tile.owner == null) {
      const card = this._cpuChooseSummonCard(options, tile, profile, player);
      player.hand = player.hand.filter((c) => c.id !== card.id);
      player.deck.discard(card);
      player.currency -= card.cost;
      this._placeUnit(tile, player, card);
      this.onLog(`${player.name}は${card.name}を召喚した (-${card.cost}G)`);
      this._notifyState();
      await this.onSummonEffect?.({ tileId: tile.id, unitName: card.name });
      return;
    }

    const decision = this._cpuDecideInvasion(player, tile, options, profile);
    if (!decision) {
      this.onLog(`${player.name}は${tile.id}番地への侵略を見送った`);
      return;
    }
    const { card } = decision;
    player.hand = player.hand.filter((c) => c.id !== card.id);
    player.deck.discard(card);
    player.currency -= card.cost;
    await this._runInvasion(player, tile, card);
    this._notifyState();
  }

  /**
   * 自分の土地のレベルアップ判断: 土地属性がキャラの得意属性
   * （aiProfile.preferredElements、無ければどの属性でもマッチ扱い）に
   * 合っていて、かつレベルアップ後もaiProfile.levelUpReserve以上のGが
   * 手元に残る場合だけ実行する。人間向けの確認ダイアログは挟まない。
   */
  _cpuMaybeLevelUp(player, tile, profile) {
    if (tile.type !== TileType.LAND || tile.level >= LEVEL_CAP) return;
    const matches = !profile.preferredElements || profile.preferredElements.includes(tile.element);
    if (!matches) return;
    const cost = LEVEL_UP_COST[tile.level];
    if (player.currency - cost < profile.levelUpReserve) return;

    player.currency -= cost;
    tile.level += 1;
    this.scene.updateTileLevelBorder(tile);
    this.onLog(`${player.name}は${tile.id}番地をLv${tile.level}にアップグレードした (-${cost}G)`);
    this._notifyState();
  }

  /**
   * 空き地への召喚カード選び。手札に古代のギア（A/B/C）があれば最優先で
   * それを召喚する（ギアシリーズは積極的に空き地へ出し、合体「ガシャーン」
   * を狙う - 残り1種で完成する場合はそのギアを最優先、揃っていなければ
   * 手持ちのギアのどれかを出す）。ギアが無ければ従来通り: 基本は土地属性と
   * 同じ候補から選ぶが、aiProfile.offElementSummonChanceの確率であえて
   * 属性違いを選ぶ（同属性の選択肢が無ければ必然的に属性違いになる）。
   * 選んだプール内ではATK+HP合計が高いカードを優先する（同点ならコストが
   * 高い方＝より強力な方を優先）。
   */
  _cpuChooseSummonCard(options, tile, profile, player) {
    const gearCard = this._cpuPreferredGearCard(options, player);
    if (gearCard) return gearCard;

    const onElement = options.filter((c) => c.element === tile.element);
    const offElement = options.filter((c) => c.element !== tile.element);
    const preferOff = onElement.length === 0 || (offElement.length > 0 && Math.random() < profile.offElementSummonChance);
    const pool = preferOff && offElement.length > 0 ? offElement : onElement.length > 0 ? onElement : offElement;
    return this._strongestCard(pool);
  }

  /**
   * 古代のギアA/B/Cのうち、手札にあり、かつ自分の盤面に残り2種類が既に
   * 揃っている（＝これを召喚すればガシャーンに合体する）ものを最優先で
   * 返す。無ければ手札にあるギアの中から適当な1枚を返す（無ければnull）。
   */
  _cpuPreferredGearCard(options, player) {
    const gearIds = ['kodaiNoGearA', 'kodaiNoGearB', 'kodaiNoGearC'];
    const gearOptions = options.filter((c) => gearIds.includes(catalogIdOf(c)));
    if (gearOptions.length === 0) return null;

    const placedGearIds = new Set(
      this.tiles
        .filter((t) => t.unit && t.unit.ownerId === player.id && gearIds.includes(catalogIdOf(t.unit.def)))
        .map((t) => catalogIdOf(t.unit.def)),
    );
    const completingCard = gearOptions.find((c) => {
      const others = gearIds.filter((id) => id !== catalogIdOf(c));
      return others.every((id) => placedGearIds.has(id));
    });
    return completingCard ?? gearOptions[0];
  }

  _strongestCard(cards) {
    return [...cards].sort((a, b) => b.atk + b.hp - (a.atk + a.hp) || b.cost - a.cost)[0];
  }

  /**
   * 敵地への侵略判断: 手持ちの召喚可能カードそれぞれについて、アイテム
   * 無し／有りの勝率を_estimateWinProbabilityで見積もり、最も勝算の高い
   * 組み合わせを選ぶ。侵略しきい値（aiProfile.minWinProbabilityToInvade）は
   * 相手が高額マス（Lv3以上）だとaiProfile.highValueAvoidanceに応じて
   * 引き上げる。アイテム無しでしきい値を超えていればそのまま侵略、
   * アイテムを使えば超える場合はaiProfile.itemGambleChanceの確率でだけ
   * 踏み切る（それ以外は見送り）。
   */
  _cpuDecideInvasion(player, tile, options, profile) {
    const candidates = options.map((card) => ({
      card,
      noItemRate: this._estimateWinProbability(card, player.id, player.hand, tile, false),
      withItemRate: this._estimateWinProbability(card, player.id, player.hand, tile, true),
    }));
    candidates.sort((a, b) => Math.max(b.noItemRate, b.withItemRate) - Math.max(a.noItemRate, a.withItemRate));
    const best = candidates[0];
    if (!best) return null;

    let threshold = profile.minWinProbabilityToInvade;
    if (tile.level >= 3) threshold = Math.min(0.97, threshold + profile.highValueAvoidance * 0.3);

    if (best.noItemRate >= threshold) return { card: best.card };
    if (best.withItemRate >= threshold && Math.random() < profile.itemGambleChance) return { card: best.card };
    return null;
  }

  /**
   * 同属性ボーナス: 自分の土地に配置されているモンスターは、土地と同じ
   * 属性なら土地レベル×10（最大50）だけHPが増える。`positionTile` は
   * このモンスターが「今立っている」土地 - 手札から召喚したばかりの
   * 侵略側にはそもそも該当する土地が無いので null を渡す（ボーナス無し）。
   */
  _elementHpBonus(unit, positionTile) {
    if (!positionTile || positionTile.owner !== unit.ownerId) return 0;
    // レインボーカメレオン: 属性一致を問わず土地レベル×10を受け取る。
    const ignoresElement = unit.def.effect?.type === 'elementHpBonusIgnoreElement';
    if (!ignoresElement && positionTile.element !== unit.def.element) return 0;
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
    let hp = this._elementHpBonus(unit, positionTile);
    const atk = this._cheerAtkBonus(unit, battleTile);
    if (hp > 0) this.onLog(`${unit.def.name}は${ELEMENT_LABEL[positionTile.element]}の土地でHP+${hp}`);
    if (atk > 0) this.onLog(`${unit.def.name}は応援を受けてATK+10`);
    // 電柱（電柱を植える男の土地コマンド産）: 所有者を問わず、盤上のどこかに
    // 1体でもいれば全ての雷属性モンスターがHP+10（味方限定ではなく全体
    // 効果 - 仕様上「配置されていると」に所有者の限定が無いため）。
    if (unit.def.element === Element.THUNDER && this._hasFieldMonsterOnBoard('denchu-field')) {
      hp += 10;
      this.onLog(`${unit.def.name}は電柱の恩恵でHP+10`);
    }
    return { atk, hp };
  }

  /** 盤面上のどこかに、指定catalogIdのモンスターが（所有者問わず）配置されているか。電柱の全体効果用。 */
  _hasFieldMonsterOnBoard(catalogId) {
    return this.tiles.some((t) => t.unit && catalogIdOf(t.unit.def) === catalogId);
  }

  /**
   * カード固有の戦闘中ステータス補正（炎神/水神系のstatsPerElementChain、
   * ファイアキック/水風呂修行僧系のatkBonusAgainstRarity）。_battleBonus
   * （盤面の状況依存）とは別枠で計算するが、同じ{atk,hp}へそのまま加算
   * する（呼び出し元のbonusオブジェクトをその場で書き換える）。
   */
  _applyEffectBonus(unit, opponentUnit, bonus) {
    const effect = unit.def.effect;
    if (effect) this._applyEffectBonusFor(unit, opponentUnit, bonus, effect);

    // イカサマのサイコロ(atkFromLastDiceRoll): カード自身の効果ではなく
    // 装備アイテムの効果なので、上のunit.def.effect起点の分岐とは別枠で
    // チェックする（プレイヤーの直近のサイコロの目を参照するのでboard側の
    // Gameインスタンスでないと計算できない）。
    const diceItem = unit.items.find((i) => i.effect?.type === 'atkFromLastDiceRoll');
    if (diceItem) {
      const owner = this.players.find((p) => p.id === unit.ownerId);
      const roll = owner?.lastDiceSteps || 0;
      const atk = roll * diceItem.effect.multiplier;
      bonus.atk += atk;
      if (atk > 0) this.onLog(`${unit.def.name}は「${diceItem.name}」でATK+${atk}（前回の出目${roll}）`);
    }
  }

  _applyEffectBonusFor(unit, opponentUnit, bonus, effect) {
    if (effect.type === 'statsPerElementChain') {
      const count = this._chainCount(unit.ownerId, effect.element);
      const atk = count * effect.atkPerChain;
      const hp = count * effect.hpPerChain;
      bonus.atk += atk;
      bonus.hp += hp;
      if (atk > 0 || hp > 0) this.onLog(`${unit.def.name}は${ELEMENT_LABEL[effect.element]}${count}連鎖でATK+${atk}/HP+${hp}`);
    } else if (effect.type === 'atkBonusAgainstRarity' && opponentUnit.def.rarity === effect.targetRarity) {
      const atk = Math.round(unit.def.atk * effect.ratio);
      bonus.atk += atk;
      this.onLog(`${unit.def.name}は相手のレアリティ(${effect.targetRarity})によりATK+${atk}`);
    } else if (effect.type === 'synergyWithNamedAlly' && this._hasAllyOnBoard(unit.ownerId, effect.allyCatalogId)) {
      const atk = effect.atkBonus || 0;
      const hp = effect.hpBonus || 0;
      bonus.atk += atk;
      bonus.hp += hp;
      if (atk > 0 || hp > 0) this.onLog(`${unit.def.name}はシナジーでATK+${atk}/HP+${hp}`);
    } else if (effect.type === 'atkDoubleIfRicher') {
      const owner = this.players.find((p) => p.id === unit.ownerId);
      const opponentOwner = this.players.find((p) => p.id === opponentUnit.ownerId);
      if (owner && opponentOwner && owner.currency > opponentOwner.currency) {
        const atk = unit.def.atk;
        bonus.atk += atk;
        this.onLog(`${unit.def.name}は所持Gで上回りATKが2倍になった`);
      }
    } else if (effect.type === 'atkMultiplier') {
      const atk = Math.round(unit.def.atk * (effect.multiplier - 1));
      bonus.atk += atk;
      if (atk !== 0) this.onLog(`${unit.def.name}は狂戦士の力でATK+${atk}`);
    } else if (effect.type === 'statsPerTotalChain') {
      const totalChain = [Element.FIRE, Element.WATER, Element.THUNDER, Element.FOREST].reduce(
        (sum, el) => sum + this._chainCount(unit.ownerId, el),
        0,
      );
      const atk = totalChain * effect.atkPerChain;
      const hp = totalChain * effect.hpPerChain;
      bonus.atk += atk;
      bonus.hp += hp;
      if (atk > 0 || hp > 0) this.onLog(`${unit.def.name}は総連鎖${totalChain}でATK+${atk}/HP+${hp}`);
    }
  }

  /** 盤面上のどこかに、指定オーナーが持つ指定カード（catalogId基準）が配置されているか。シナジー系効果（タケノコ派⇔きのこ派）用。 */
  _hasAllyOnBoard(ownerId, catalogId) {
    return this.tiles.some((t) => t.unit && t.unit.ownerId === ownerId && catalogIdOf(t.unit.def) === catalogId);
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

  /** 装備アイテムとしての強さを大まかに数値化する（CPUの実際の選択と、侵略前のシミュレーションの両方から使う - 同じ基準で選ぶことで「シミュレーションで想定した通りに実際も動く」を保証する）。 */
  _itemPowerScore(item) {
    let score = (item.atkBonus || 0) + (item.hpBonus || 0);
    if (item.effect) score += 15;
    if (item.traits?.includes('firstStrike')) score += 10;
    if (item.traits?.includes('pierce')) score += 10;
    if (item.traits?.includes('lastStrike')) score -= 5;
    return score;
  }

  /** 手札の中から一番強いGEARカードを選ぶ（無ければnull）。 */
  _bestBattleItemFromHand(hand) {
    const gear = hand.filter((c) => c.type === CardType.GEAR);
    if (gear.length === 0) return null;
    return gear.reduce((best, c) => (this._itemPowerScore(c) > this._itemPowerScore(best) ? c : best));
  }

  /** CPUの実際のバトルアイテム選択。シミュレーション（_estimateWinProbability）と同じ_bestBattleItemFromHandを使うので、事前に見積もった勝率と実際の挙動がずれない。 */
  _cpuPickBattleItem(player) {
    return this._bestBattleItemFromHand(player.hand);
  }

  /** シミュレーション専用: 本物のユニットには一切触れず、items/cursesだけ独立コピーした複製を作る（resolveBattleは渡された引数を直接書き換えるため、実物を渡すと本当に装備/呪いが消し飛んでしまう）。 */
  _cloneFieldUnitForSim(unit) {
    return {
      ownerId: unit.ownerId,
      def: unit.def,
      items: unit.items.map((i) => ({ ...i })),
      curses: unit.curses.map((c) => ({ ...c })),
      currentHp: unit.currentHp,
      blinded: unit.blinded,
    };
  }

  /**
   * CPUの侵略判断用: 実際に戦闘を起こさず、指定したカードで相手の土地に
   * 侵略した場合の勝率をモンテカルロ法（既定20試行）で見積もる。
   * `useItem`がtrueなら手札の最強アイテムを装備した想定で計算する
   * （相手はアイテムを使わない前提 - ユーザー指示通りの簡略化）。
   * 実際の対戦へは一切影響しない: this._goldAdapter()（本物のプレイヤーの
   * Gを直接動かす）ではなく使い捨てのGoldLedgerを使い、onLogも一時的に
   * 抑制する。
   */
  _estimateWinProbability(card, attackerOwnerId, attackerHand, defenderTile, useItem, trials = 20) {
    const savedLog = this.onLog;
    this.onLog = () => {};
    try {
      let wins = 0;
      for (let i = 0; i < trials; i++) {
        const attackerUnit = createFieldUnit(card, attackerOwnerId);
        const defenderUnit = this._cloneFieldUnitForSim(defenderTile.unit);
        if (useItem) {
          const item = this._bestBattleItemFromHand(attackerHand);
          if (item) equipItem(attackerUnit, item);
        }
        const attackerBonus = this._battleBonus(attackerUnit, null, defenderTile);
        const defenderBonus = this._battleBonus(defenderUnit, defenderTile, defenderTile);
        this._applyEffectBonus(attackerUnit, defenderUnit, attackerBonus);
        this._applyEffectBonus(defenderUnit, attackerUnit, defenderBonus);
        const attackerHasPierce =
          attackerUnit.def.traits?.includes('pierce') || attackerUnit.items.some((i) => i.traits?.includes('pierce'));
        const battleDefenderBonus = attackerHasPierce ? { ...defenderBonus, hp: 0 } : defenderBonus;

        const result = resolveBattle(attackerUnit, defenderUnit, new GoldLedger(), attackerBonus, battleDefenderBonus);
        if (result.attackerSurvived && !result.defenderSurvived) wins++;
      }
      return wins / trials;
    } finally {
      this.onLog = savedLog;
    }
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
    this._applyEffectBonus(attackerUnit, defenderUnit, attackerBonus);
    this._applyEffectBonus(defenderUnit, attackerUnit, defenderBonus);

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
    // モンスター自身のtraitsだけでなく、装備アイテムが持つpierce（にょ〇棒/
    // イカサマのサイコロ/斬〇剣）も対象にする。
    const attackerHasPierce =
      attackerUnit.def.traits?.includes('pierce') || attackerUnit.items.some((i) => i.traits?.includes('pierce'));
    const battleDefenderBonus = attackerHasPierce ? { ...defenderBonus, hp: 0 } : defenderBonus;

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
        special: exchange.special,
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

    this._maybeGrantRandomSpell(attackerUnit, attackerPlayer);
    this._maybeGrantRandomSpell(defenderUnit, defenderPlayer);
    this._maybeReturnItemToHand(attackerItem, attackerPlayer);
    this._maybeReturnItemToHand(defenderItem, defenderPlayer);

    return result;
  }

  /** 不死鳥の剣: 実際に戦闘で使用された（=装備された）場合のみ、使い切った後も新しいidで持ち主の手札に戻る（手札上限で使わずに捨てられた場合はここを通らないので、通常のアイテム同様消滅する）。 */
  _maybeReturnItemToHand(item, player) {
    if (!item || !item.returnsToHandIfUsed) return;
    const card = { ...item, id: `itemreturn-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    player.hand.push(card);
    this.onLog(`「${card.name}」は${player.name}の手札に戻った`);
  }

  /** 怪しい老人: 戦闘終了時（生死問わず）、レア度無視の完全ランダムでスペルカードを1枚手札に加える。 */
  _maybeGrantRandomSpell(unit, player) {
    if (unit.def.effect?.type !== 'randomSpellAfterBattle') return;
    const pool = Object.values(SPELL_CATALOG);
    if (pool.length === 0) return;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    const card = { ...picked, id: `spell-summon-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    player.hand.push(card);
    this.onLog(`${player.name}の${unit.def.name}が「${card.name}」を手に入れた`);
  }

  async _runInvasion(player, tile, card) {
    // 絶対攻撃: 次の侵略で召喚するモンスターが一時的に貫通を得る（カードの
    // インスタンスだけをコピーして特性を足すので、カタログの元defは汚さない）。
    if (player.pierceNextInvasion) {
      player.pierceNextInvasion = false;
      card = { ...card, traits: [...(card.traits || []), 'pierce'] };
      this.onLog(`${player.name}の${card.name}が「絶対攻撃」の効果で貫通を得た！`);
    }

    const defenderPlayer = this.players.find((p) => p.id === tile.owner);
    const attackerUnit = createFieldUnit(card, player.id);
    const defenderUnit = tile.unit;

    // お前も〇ぬんだ: 次の侵略が戦闘無しで確定勝利になる（700G消費、通常の
    // 決着処理と同じ形で土地を奪う。避雷針侍の身代わり等の介入も一切挟まない）。
    if (player.guaranteedNextInvasionWin) {
      player.guaranteedNextInvasionWin = false;
      player.currency -= 700;
      this.onLog(`${player.name}は「お前も〇ぬんだ」の効果で戦闘なしに${defenderUnit.def.name}を倒した！ (-700G)`);
      tile.unit = attackerUnit;
      tile.owner = player.id;
      tile.transparentCursed = false;
      tile.forcedStopCursed = false;
      this._paintTile(tile, player.color);
      await this._handleUnitDeath(defenderUnit, defenderPlayer);
      this._notifyState();
      return;
    }

    const result = await this._runBattleScene(attackerUnit, player, defenderUnit, defenderPlayer, null, tile);
    // 強制停止の呪いは「戦闘が終わると消える」(勝敗を問わない) - _shrineForcedStop参照。
    tile.forcedStopCursed = false;
    await this._maybeRedirectDeathToLightningRod(defenderPlayer, tile, result);

    if (!result.defenderSurvived) {
      if (result.attackerSurvived) {
        tile.unit = attackerUnit;
        tile.owner = player.id;
        tile.transparentCursed = false;
        this._paintTile(tile, player.color);
        this.onLog(`${player.name}が土地を奪取した！`);
      } else {
        tile.unit = null;
        tile.owner = null;
        tile.transparentCursed = false;
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
   * 避雷針侍: 味方（同オーナー）モンスターが戦闘に敗れて死ぬ場合、盤面の
   * 別マスにいる避雷針侍自身が代わりに死んで守る（本来死ぬはずだった側は
   * ノーダメージで生存扱いに戻し、resultをその場で書き換える）。呼び出し元
   * （_runInvasion/_humanMoveFlowの侵略分岐）は_runBattleScene直後・
   * 死亡処理より前に呼ぶことで、以降の分岐が自然に「防衛成功」を辿る。
   * 避雷針侍が防衛側本人の場合や、身代わりがいない/既に生存している場合は
   * 何もしない。
   */
  async _maybeRedirectDeathToLightningRod(defenderPlayer, defenderTile, result) {
    if (result.defenderSurvived) return false;
    const defenderUnit = defenderTile.unit;
    if (!defenderUnit || catalogIdOf(defenderUnit.def) === 'raiheishinZamurai') return false;
    const rodTile = this.tiles.find(
      (t) => t !== defenderTile && t.unit && t.unit.ownerId === defenderPlayer.id && catalogIdOf(t.unit.def) === 'raiheishinZamurai',
    );
    if (!rodTile) return false;

    const rodUnit = rodTile.unit;
    this.onLog(`${defenderPlayer.name}の避雷針侍が${defenderUnit.def.name}の身代わりになった！`);
    rodTile.unit = null;
    rodTile.owner = null;
    rodTile.transparentCursed = false;
    this._repaintTileToElement(rodTile);

    defenderUnit.currentHp = this._baseStats(defenderUnit).hp + this._elementHpBonus(defenderUnit, defenderTile);
    result.defenderSurvived = true;
    this._notifyState();
    await this._handleUnitDeath(rodUnit, defenderPlayer);
    return true;
  }

  /**
   * 不死鳥: 死亡したユニットにこの特性があれば、カードを（新しいidで）
   * 持ち主の手札に戻す。手札上限を超える場合は通常の手札上限処理と同じ
   * 流れで1枚捨てさせる（捨てたカードはもう戻ってこない）。この特性が
   * 無ければ何もしない。
   */
  async _handleUnitDeath(unit, ownerPlayer) {
    if (unit.def.effect?.type === 'deathRespawnChance' && Math.random() < unit.def.effect.chance) {
      const emptyLands = this.tiles.filter((t) => t.type === TileType.LAND && t.owner == null);
      if (emptyLands.length > 0) {
        const targetTile = emptyLands[Math.floor(Math.random() * emptyLands.length)];
        const respawnCard = {
          ...unit.def,
          id: `zombie-${ownerPlayer.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          catalogId: catalogIdOf(unit.def),
        };
        this._placeUnit(targetTile, ownerPlayer, respawnCard);
        this.onLog(`${unit.def.name}が${targetTile.id}番地に再出現した！`);
        this._notifyState();
      }
    }

    if (!unit.def.traits?.includes('phoenix')) return;

    const card = {
      ...unit.def,
      id: `phoenix-${ownerPlayer.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      catalogId: catalogIdOf(unit.def),
    };
    ownerPlayer.hand.push(card);
    this.onLog(`${unit.def.name}は不死鳥の力で${ownerPlayer.name}の手札に戻った`);
    this._notifyState();

    if (ownerPlayer.hand.length > HAND_LIMIT) {
      let discarded;
      if (ownerPlayer.isCPU) {
        await delay(CPU_DECISION_MS);
        discarded = this._cpuChooseDiscard(ownerPlayer);
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
    tile.transparentCursed = false;
    this._paintTile(tile, player.color);
    if (card.effect?.type === 'itemOnSummon') {
      const item = this._randomItemCardForSummon();
      player.hand.push(item);
      this.onLog(`${player.name}の${card.name}が「${item.name}」を手に入れた`);
    }
    if (card.effect?.type === 'fusionSummon') {
      this._maybeFuseGear(tile, player, card);
    }
  }

  /**
   * 古代のギアA・B・C: 自分の盤面に残り2種類のギアが既に配置されている
   * 状態でギアのいずれかを召喚すると、その2枚を消滅させ、召喚した
   * このマスを合体ロボ「ガシャーン」に差し替える（召喚コストは0扱いなので
   * 先に払った分をここで払い戻す）。揃っていなければ何もせずギアのまま。
   */
  _maybeFuseGear(tile, player, card) {
    const partnerTiles = card.effect.partners.map((catalogId) =>
      this.tiles.find((t) => t !== tile && t.unit && t.unit.ownerId === player.id && catalogIdOf(t.unit.def) === catalogId),
    );
    if (partnerTiles.some((t) => !t)) return;

    for (const t of partnerTiles) {
      t.unit = null;
      t.owner = null;
      t.transparentCursed = false;
      this._repaintTileToElement(t);
    }
    player.currency += card.cost;
    const fusedDef = { ...GASHAAN_FIELD_MONSTER, id: `gashaan-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    tile.unit = createFieldUnit(fusedDef, player.id);
    this.onLog(`${player.name}のギアが合体し「${fusedDef.name}」が誕生した！ (召喚コスト${card.cost}Gを払い戻し)`);
    this._notifyState();
  }

  /**
   * 謎の科学者「アイテムカードを1枚入手」用: 名前付きアイテム
   * （ITEM_CATALOG）のレアリティ別プールから
   * N70%/S20%/R10%で1枚抽選する（所持カード自体は増減せず手札に加わる
   * だけ - buildStarterExtraCard等と同じ「新しいidを振った即席インスタンス」
   * として渡す）。該当レアリティが空なら安全にNへフォールバックする。
   */
  _randomItemCardForSummon() {
    const pool = Object.values(ITEM_CATALOG);
    const byRarity = { [Rarity.N]: [], [Rarity.S]: [], [Rarity.R]: [] };
    for (const c of pool) {
      if (byRarity[c.rarity]) byRarity[c.rarity].push(c);
    }
    const roll = Math.random();
    const rarity = roll < 0.1 ? Rarity.R : roll < 0.3 ? Rarity.S : Rarity.N;
    const tier = byRarity[rarity].length ? byRarity[rarity] : byRarity[Rarity.N].length ? byRarity[Rarity.N] : pool;
    const picked = tier[Math.floor(Math.random() * tier.length)];
    return { ...picked, id: `item-summon-${Date.now()}-${Math.random().toString(36).slice(2)}` };
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
      // forcedStopCursedはtrue（ほこら）かプレイヤーid（アリジゴク、0始まり）が
      // 入る - !!だとid=0がfalseに化けるので明示的にnull/false判定する。
      cursed: tile.forcedStopCursed != null && tile.forcedStopCursed !== false,
      transparentCursed: !!tile.transparentCursed,
    };
  }

  _paintTile(tile, _ownerColorHexInt) {
    // Ownership never changes a land's color. The visible color represents
    // the fixed/current land element only; element-changing spells update it.
    this._repaintTileToElement(tile);
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
    await this._cpuMaybeFixLandElementSpell(this.currentPlayer);
    await this._cpuMaybeUseDisruptionSpell(this.currentPlayer);
    await this._cpuMaybeUseDamageSpell(this.currentPlayer);
    await this._cpuMaybeUseSplitEvenlySpell(this.currentPlayer);
    await this._cpuMaybeUseImmediateSpell(this.currentPlayer);
    await this._cpuMaybeUseDiceSpell(this.currentPlayer);
    const fixedDiceValue = this.currentPlayer.diceCurse?.type === 'fixed' ? this.currentPlayer.diceCurse.value : null;
    const steps = await this.onCpuRoll(fixedDiceValue);
    this.rollDice(steps);
  }

  /** 配られたら即時使うスペル。アイキャンフライを副業収入より優先する。 */
  async _cpuMaybeUseImmediateSpell(player) {
    if (player.spellUsedThisTurn) return;
    const fly = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'doubleNextDice');
    if (fly && player.currency >= (fly.cost || 0)) {
      await this._cpuCastSpell(player, fly, { targetPlayerId: player.id });
      return;
    }
    const income = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'lapCountGold');
    if (income && player.currency >= (income.cost || 0)) await this._cpuCastSpell(player, income, {});
  }

  /**
   * ダメージ系スペル/土地コマンドの対象選び: ①そのダメージ量で1撃で
   * 倒せる相手がいれば最優先（複数いれば土地レベルが高い方）、②居なければ
   * 候補の中で土地レベルが最も高い相手を選ぶ。candidatesが空ならnull。
   */
  _cpuPickDamageTarget(candidates, amount) {
    if (candidates.length === 0) return null;
    const killable = candidates.filter((t) => t.unit.currentHp <= amount);
    const pool = killable.length > 0 ? killable : candidates;
    return [...pool].sort((a, b) => b.level - a.level)[0];
  }

  /**
   * directDamage型スペル（ファイヤーボール/千本桜等）のCPU使用判断。
   * 対象は_cpuPickDamageTargetで選ぶ。target: 'enemyMonster'の対象範囲
   * （_resolveSpellCastと同じ - 同盟仲間も対象に含む既存仕様に合わせる）。
   */
  async _cpuMaybeUseDamageSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'directDamage');
    if (!card || player.currency < (card.cost || 0)) return;

    const candidates = this.tiles.filter((t) => t.unit && t.unit.ownerId !== player.id);
    const target = this._cpuPickDamageTarget(candidates, card.effect.amount);
    if (!target) return;

    await this._cpuCastSpell(player, card, { targetTileId: target.id });
  }

  /**
   * 自分の土地の配置モンスターがdamage型の土地コマンド能力
   * （火炎瓶男/マタギの小四郎等）を持つ場合のCPU使用判断。射程内の敵
   * （同盟仲間は除外、_humanAbilityFlowと同じ条件）から_cpuPickDamage
   * Targetで対象を選ぶ。使った場合はtrueを返す（呼び出し元がレベルアップ
   * 判断をスキップするために使う）。
   */
  async _cpuMaybeUseDamageAbility(player, tile) {
    const unitDef = tile.unit?.def;
    const ability = unitDef?.ability;
    if (!ability || ability.type !== 'damage') return false;
    const commandCost = unitDef.commandCost ?? 0;
    if (player.currency < commandCost) return false;

    const candidates = this.tiles.filter((t) => {
      if (t.owner == null || t.owner === player.id) return false;
      const owner = this.players.find((p) => p.id === t.owner);
      if (owner?.allianceId != null && owner.allianceId === player.allianceId) return false;
      return this._tileDistance(tile.id, t.id) <= ability.range;
    });
    const target = this._cpuPickDamageTarget(candidates, ability.power);
    if (!target) return false;

    player.currency -= commandCost;
    const targetUnit = target.unit;
    targetUnit.currentHp -= ability.power;
    this.onLog(`${player.name}の${unitDef.name}が特殊能力で${targetUnit.def.name}に${ability.power}ダメージ！ (-${commandCost}G)`);
    this._notifyState();
    await this.onDamageEffect?.({ tileId: target.id, damage: ability.power });

    if (targetUnit.currentHp <= 0) {
      const targetOwner = this.players.find((p) => p.id === target.owner);
      target.unit = null;
      target.owner = null;
      target.transparentCursed = false;
      this._repaintTileToElement(target);
      this.onLog(`${targetOwner.name}の${targetUnit.def.name}は倒された`);
      await this._handleUnitDeath(targetUnit, targetOwner);
    }
    this._notifyState();
    return true;
  }

  /**
   * 山分け（redistributeGoldEvenly、場の手持ちG合計を全員で均等に分配し
   * 直す）のCPU使用判断。コスト込みで自分の最終所持Gが今より100G以上
   * 増える場合だけ使う（コストは_cpuCastSpellが効果適用より先に差し引く
   * ので、判断時点ではまだ払っていないコストを先に引いた上でシミュレート
   * する）。
   */
  async _cpuMaybeUseSplitEvenlySpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'redistributeGoldEvenly');
    if (!card) return;
    const cost = card.cost || 0;
    if (player.currency < cost) return;

    const alive = this.players.filter((p) => !p.defeated);
    const totalAfterCost = alive.reduce((sum, p) => sum + p.currency, 0) - cost;
    const share = Math.floor(totalAfterCost / alive.length);
    const netGain = share - player.currency;
    if (netGain >= 100) {
      await this._cpuCastSpell(player, card, {});
    }
  }

  /**
   * 土地属性変更系スペル（放火/放水/放電/放牧＝forceTileElement、
   * 最適化＝autoMatchAllTileElements）のCPU使用判断（ロール前・ダイス系
   * スペルより優先）。自分の土地にS以上のレアリティのモンスターを
   * 配置しているのに、その土地の属性がモンスターの属性と合っていない
   * （＝同属性ボーナスを取り逃している）場合、最優先でこの系統のスペルを
   * 使って属性を揃える。最適化があれば全ての不一致をまとめて直せるので
   * 優先し、無ければ該当する属性のforceTileElementを1件だけ使う
   * （1ターン1枚のため）。ツイッ〇ランド（無色化）は自分の土地を直す
   * 用途では使わない（無色は同属性ボーナス自体が発生しないうえ、本質的に
   * 相手の連鎖・地価を崩す妨害専用スペルのため） - 除外し
   * _cpuMaybeUseDisruptionSpellで別途扱う。
   */
  async _cpuMaybeFixLandElementSpell(player) {
    if (player.spellUsedThisTurn) return;
    const landFixCards = player.hand.filter(
      (c) => c.type === CardType.SPELL
        && (c.effect?.type === 'autoMatchAllTileElements'
          || (c.effect?.type === 'forceTileElement' && c.effect.element !== Element.NEUTRAL)),
    );
    if (landFixCards.length === 0) return;
    const affordable = landFixCards.filter((c) => player.currency >= (c.cost || 0));
    if (affordable.length === 0) return;

    const rarityRank = { [Rarity.N]: 0, [Rarity.S]: 1, [Rarity.R]: 2, [Rarity.EX]: 3 };
    const mismatchedTiles = this.tiles.filter(
      (t) => t.owner === player.id && t.unit?.ownerId === player.id
        && rarityRank[t.unit.def.rarity] >= rarityRank[Rarity.S]
        && t.element !== t.unit.def.element,
    );
    if (mismatchedTiles.length === 0) return;

    const optimizeCard = affordable.find((c) => c.effect.type === 'autoMatchAllTileElements');
    if (optimizeCard) {
      await this._cpuCastSpell(player, optimizeCard, {});
      return;
    }

    for (const tile of mismatchedTiles) {
      const fixCard = affordable.find((c) => c.effect.type === 'forceTileElement' && c.effect.element === tile.unit.def.element);
      if (fixCard) {
        await this._cpuCastSpell(player, fixCard, { targetTileId: tile.id });
        return;
      }
    }
  }

  /**
   * ツイッ〇ランド（forceTileElement→NEUTRAL）専用のCPU使用判断。
   * これは自分の土地を整える系のスペルとは違い、相手の土地を無色化して
   * 連鎖・地価を崩す妨害専用スペル - 自分の土地には絶対に使わない。
   * 相手（同盟以外）がレベル3以上の土地を持っているか、いずれかの属性で
   * 3連鎖以上を組んでいる場合に、その土地を無色化する（3連鎖を崩せる
   * 土地を最優先、無ければレベル3以上の土地）。
   */
  async _cpuMaybeUseDisruptionSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find(
      (c) => c.type === CardType.SPELL && c.effect?.type === 'forceTileElement' && c.effect.element === Element.NEUTRAL,
    );
    if (!card || player.currency < (card.cost || 0)) return;

    const opponents = this.players.filter(
      (p) => !p.defeated && p.id !== player.id && !(p.allianceId != null && p.allianceId === player.allianceId),
    );

    for (const opponent of opponents) {
      const ownedElements = new Set(
        this.tiles.filter((t) => t.owner === opponent.id && t.element !== Element.NEUTRAL).map((t) => t.element),
      );
      for (const element of ownedElements) {
        if (this._chainCount(opponent.id, element) >= 3) {
          const chainTile = this.tiles.find((t) => t.owner === opponent.id && t.element === element);
          await this._cpuCastSpell(player, card, { targetTileId: chainTile.id });
          return;
        }
      }
      const highLevelTile = this.tiles.find((t) => t.owner === opponent.id && t.level >= 3);
      if (highLevelTile) {
        await this._cpuCastSpell(player, card, { targetTileId: highLevelTile.id });
        return;
      }
    }
  }

  /**
   * ダイス系スペル（1/3/6のダイス＝setNextDice、アイキャンフライ＝
   * doubleNextDice）のCPU使用判断（ロール前に1回だけ）。
   * ①敵地を避けてゴールへ向かう通常の経路取りは既に_cpuChooseNextTile
   * （aiProfile.highValueAvoidance）が担っており、ここでは呪いカード
   * そのものを使うかどうかだけを決める。
   * ②自分が所有するレベル2以上の配置済み土地（守れそうな土地）があれば、
   * 相手の現在地からの距離が一致する固定値（1/3/6）のダイス系スペルを
   * 最優先で使い、その土地へ誘導する（相手が踏めば迎撃を狙える）。
   * ③②の罠が組めなければ、1のダイス/3のダイスは特に理由がなくても
   * 相手の足止めとして気軽に使う（出目を大きく進めてしまう6のダイス/
   * アイキャンフライは、罠目的以外では使わない）。
   */
  async _cpuMaybeUseDiceSpell(player) {
    if (player.spellUsedThisTurn) return;
    const diceCards = player.hand.filter(
      (c) => c.type === CardType.SPELL && c.effect?.type === 'setNextDice',
    );
    if (diceCards.length === 0) return;
    const affordable = diceCards.filter((c) => player.currency >= (c.cost || 0));
    if (affordable.length === 0) return;

    const target = this._cpuPickDiceSpellTarget(player);
    if (!target) return;

    const defensibleTiles = this.tiles.filter((t) => t.owner === player.id && t.level >= 2 && t.unit);
    for (const tile of defensibleTiles) {
      const distance = this._tileDistance(target.tileId, tile.id);
      const trapCard = affordable.find((c) => c.effect.type === 'setNextDice' && c.effect.value === distance);
      if (trapCard) {
        await this._cpuCastSpell(player, trapCard, { targetPlayerId: target.id });
        return;
      }
    }

    const nuisanceCard = affordable.find((c) => c.effect.type === 'setNextDice' && (c.effect.value === 1 || c.effect.value === 3));
    if (nuisanceCard) {
      await this._cpuCastSpell(player, nuisanceCard, { targetPlayerId: target.id });
    }
  }

  /** ダイス系スペルの標的にするプレイヤーを選ぶ: 人間プレイヤーがいれば優先、いなければ自分・同盟以外で最も所持Gが多い相手。 */
  _cpuPickDiceSpellTarget(player) {
    const candidates = this.players.filter(
      (p) => !p.defeated && p.id !== player.id && !(p.allianceId != null && p.allianceId === player.allianceId),
    );
    if (candidates.length === 0) return null;
    const human = candidates.find((p) => !p.isCPU);
    if (human) return human;
    return candidates.reduce((best, p) => (p.currency > best.currency ? p : best));
  }

  /**
   * onSpellCastEffect用のペイロードを組み立てる。PvPゲスト側main.jsは
   * ローカルにGameインスタンスを持たない（publicState経由の薄い描画のみ）
   * ため、キャスター/対象の座標はここでサーバー権威側（Game）が
   * `{x, z}`まで解決してから渡す - ホスト・ゲストどちらの描画コードも
   * 生のtile/player参照を辿り直す必要がないようにする。
   */
  _buildSpellCastEffectPayload(player, cast, card = null) {
    const casterPosition = this.tiles[player.tileId]?.position ?? null;
    let targetPosition = null;
    if (cast.targetPlayerId != null) {
      const targetPlayer = this.players.find((p) => p.id === cast.targetPlayerId);
      targetPosition = targetPlayer ? this.tiles[targetPlayer.tileId]?.position ?? null : null;
    } else if (cast.targetTileId != null) {
      targetPosition = this.tiles[cast.targetTileId]?.position ?? null;
    }
    return {
      casterId: player.id,
      casterPosition: casterPosition ? { x: casterPosition.x, z: casterPosition.z } : null,
      targetPlayerId: cast.targetPlayerId ?? null,
      targetTileId: cast.targetTileId ?? null,
      targetPosition: targetPosition ? { x: targetPosition.x, z: targetPosition.z } : null,
      effectMessage: card
        ? `${card.name}：${card.effectDescription || '効果が発動した'}`
        : '効果が発動した',
    };
  }

  /**
   * useSpellの人間向けフローと同じ後始末（手札除去・discard・G消費・
   * spellUsedThisTurn確定・ログ・演出・効果適用）をCPU向けに行う汎用
   * ヘルパー。対象選択のUIプロンプト（_resolveSpellCastのonPickAbility
   * Target）は挟まず、既に決め打ちした`cast`（{targetPlayerId}/
   * {targetTileId}/{}等、_applySpellEffectがそのまま受け取れる形）を
   * 直接渡す。
   */
  async _cpuCastSpell(player, card, cast) {
    player.hand = player.hand.filter((c) => c.id !== card.id);
    player.deck.discard(card);
    player.currency -= card.cost || 0;
    player.spellUsedThisTurn = true;
    this.onLog(`${player.name}は「${card.name}」を使用した (-${card.cost || 0}G)`);
    this._notifyState();
    await this.onSpellUse(card);
    await this.onSpellCastEffect?.(this._buildSpellCastEffectPayload(player, cast, card));
    await this._applySpellEffect(player, card, cast);
    await this.onSpellComplete();
    this._notifyState();
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
    this._syncUnitIcons();
    this._syncPieceRenderOrder();
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
      // 同盟人数（ソロなら1）。totalAssetsは同盟内で合算した値なので、退出
      // 報酬計算側（main.js）はこれで割って「自分の取り分」を出す - 割らずに
      // 使うとチーム全員が満額を個別に受け取れてしまう（同盟報酬の二重取り）。
      allianceSize: p.allianceId != null ? this.players.filter((other) => other.allianceId === p.allianceId).length : 1,
      summonCount: this._summonCountOf(p.id),
      handCount: p.hand.length,
      deckBreakdown: p.deckBreakdown,
      defeated: !!p.defeated,
      banned: !!p.banned,
      // このラップで通過済みのチェックポイント番号（未達成ならボーナス
      // 無しでゴールを通過しても消えない - _grantGoalBonus参照）。
      passedCheckpointNumbers: [...p.passedCheckpoints].map((id) => this.tiles[id].checkpointNumber),
    }));
    this.onStateChange({
      turnText: `${this.currentPlayer.name}のターン`,
      currentPlayerId: this.currentPlayer.id,
      canRoll: showCenter && !this.currentPlayer.isCPU,
      checkpointNumbers: this.checkpointNumbers,
      players: playersPayload,
      hand: human.hand,
      showCenter,
      centerHand: this.currentPlayer.hand,
      currentPlayerIsCPU: this.currentPlayer.isCPU,
      spellUsedThisTurn: this.currentPlayer.spellUsedThisTurn,
      fixedDiceValue: this.currentPlayer.diceCurse?.type === 'fixed' ? this.currentPlayer.diceCurse.value : null,
    });
    this.onPvpSync?.(this._pvpSnapshot(playersPayload));
  }

  /** 行動者を最前面にし、以降の手番順にプレイヤー駒の描画優先度を下げる。 */
  _syncPieceRenderOrder() {
    const count = this.players.length;
    for (let offset = 0; offset < count; offset++) {
      const player = this.players[(this.currentPlayerIndex + offset) % count];
      this.scene.setPieceRenderOrder?.(player.mesh, 100 + count - offset);
    }
  }

  /**
   * 対人戦ホスト権威モデル用の盤面スナップショット。ゲスト側main.jsは
   * Gameインスタンスを持たず、これをFirestore経由で受け取ってローカルの
   * scene/tilesにそのまま反映するだけ（シミュレーションはホストだけが行う
   * ので決定論の問題が発生しない）。各プレイヤー自身の手札は別チャンネル
   * （private/{uid}）で配るためplayersPayload側には枚数のみ含むが、
   * turnHandだけは例外 - 本家カルドセプト同様「相手の番には保有カードが
   * 見える」仕様のため、手番プレイヤーの手札の中身をここに載せて相手にも
   * 見せる（自分の番の間はturnHandが自分の手札と重複するだけなので実害なし）。
   */
  _pvpSnapshot(playersPayload) {
    return {
      currentPlayerId: this.currentPlayer.id,
      turnText: `${this.currentPlayer.name}のターン`,
      awaitingRoll: this.awaitingRoll,
      isBusy: this.isBusy,
      spellUsedThisTurn: this.currentPlayer.spellUsedThisTurn,
      fixedDiceValue: this.currentPlayer.diceCurse?.type === 'fixed' ? this.currentPlayer.diceCurse.value : null,
      turnHand: this.awaitingRoll && !this.isBusy ? this.currentPlayer.hand : [],
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
