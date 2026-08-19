import { TileType, mapRequiresAllCheckpoints, mapCheckpointBonus, mapUsesAlternateGoalStarts, mapHasOfuda } from './board.js';
import { PIECE_REST_Y, UNIT_ICON_REST_Y } from './scene.js';
import { CardType, CARD_COLOR, Element, ELEMENT_LABEL, Deck, Rarity } from './cards.js';
import { buildStarterCardList, WEAK_AGAINST, ITEM_CATALOG, MONSTER_CATALOG, SPELL_CATALOG, catalogIdOf, isRewardOnlyCard } from './battleCards.js';
import { createFieldUnit, resolveBattle, applyPreAttackItemEffects, equipItem, applyCurse, applyPoison, GoldLedger, hasTrait, strikeOrderScore, statTotals } from './battle.js';
import { getCardCatalog } from './cardCatalog.js';
import { tween, easeInOutQuad, delay, getWaitCutRate } from './utils.js';
import { DENCHU_FIELD_MONSTER } from './thunderMonsters.js';
import {
  GASHAAN_FIELD_MONSTER,
  BATTLE_TRAIN_ID,
  SACRIFICE_CAR_ID,
  Q_LINER_FIELD_MONSTER,
  Q_TRAIN_FIELD_MONSTER,
} from './neutralMonsters.js';
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
/** 対象選択のラベル等でカード種別を日本語表記するための対応表。 */
const CARD_TYPE_LABEL = {
  [CardType.MONSTER]: 'モンスター',
  [CardType.GEAR]: 'アイテム',
  [CardType.SPELL]: 'スペル',
};
// カルドセプト準拠の周回ボーナス（2026-08-12改訂）: 基本ボーナス=(周回数+1)×
// START_BONUS（周を重ねるほど増える）＋領地ボーナス=所持土地数×
// LAND_BONUS_RATE（2人戦）/LAND_BONUS_RATE_MULTI（3人以上）。連鎖数は
// 領地ボーナスに影響しない（本家準拠）。_computeLapBonus参照。
const START_BONUS = 100;
const LAND_BONUS_RATE = 60;
const LAND_BONUS_RATE_MULTI = 80;

// 魔力抽出のCPU判断の分かれ目。この額以下なら「自分の弱い手札を換金」、
// 上回っていれば「相手の強い手札を潰す妨害」に使う。
const CPU_MANA_EXTRACTION_RICH_LINE = 400;
// サイコキネシスで自陣へ引き込んで迎え撃つ時、引き剥がした敵ユニットの勝率が
// これを超えるなら見送る（守備側が6割以上勝てる勝負だけ受ける）。
const CPU_PSYCHOKINESIS_MAX_ATTACKER_WIN_RATE = 0.4;
// 配置済みユニットの移動侵略（酢・ガシャーン・未知の侵略者）は、負けると
// ユニットと移動元の土地を両方失うため、手札からの侵略しきい値
// （aiProfile.minWinProbabilityToInvade）より慎重にこの下限を敷く。
const CPU_MOVE_INVASION_MIN_WIN_RATE = 0.5;

const STARTING_HAND_SIZE = 4;
const HAND_LIMIT = 6;

const isBattleItemCard = (card) => card?.type === CardType.GEAR || card?.dualUseItem === true;

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
// ビギンズのLv1からの累計投資額（Lv2=50、Lv3=250、Lv4=650、Lv5=1250）。
const LEVEL_INVESTMENT = { 1: 0, 2: 50, 3: 250, 4: 650, 5: 1250 };
// 属性変更コスト = 現レベル×100（無色マスからの変更は半額）
const ELEMENT_CHANGE_COST_PER_LEVEL = 100;
const NEUTRAL_ELEMENT_CHANGE_DISCOUNT = 0.5;
const CHANGEABLE_ELEMENTS = [Element.FIRE, Element.WATER, Element.THUNDER, Element.FOREST, Element.NEUTRAL];
const OFUDA_ELEMENTS = [Element.FIRE, Element.WATER, Element.FOREST, Element.THUNDER];
const OFUDA_TRADE_UNIT_G = 200;
const OFUDA_INITIAL_PRICE = 10;
const OFUDA_MAX_PRICE = 100;
const OFUDA_LEVEL_SCORE = { 1: 0.5, 2: 1.625, 3: 2.75, 4: 3.875, 5: 5 };

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
    onShrineEffect,
    onWarpEffect,
    onTurnFocus,
    onTollPayment,
    onMoveDestination,
    onLandLoss,
    onLandChain,
    onLandLevelUp,
    onCheckpoint,
    onGoalBonus,
    onGoalAchieved,
    onCpuRoll,
    onMoveComplete,
    onPieceMove,
    onLandCommand,
    onPickMonsterCard,
    onConfirmAction,
    onPickLevelUp,
    onConfirmMove,
    onPickSellLandForDebt,
    onOfudaMarket,
    onPickDebtRecovery,
    onBankruptcy,
    onPickBrowseTile,
    onLandSubmenu,
    onPickAbilityTarget,
    onPickTransformTarget,
    onPickCardType,
    onShowTileInfo,
    onChooseBranch,
    onBranchUndo,
    onPickMoveDirection,
    onPickElement,
    onShopPurchase,
    onBattleSceneEnter,
    onPickBattleItem,
    onBattleEquip,
    onBattleItemDestroy,
    onBattleItemSteal,
    onBattleTraitReveal,
    onBattleLightningRod,
    onBattleAttack,
    onBattleRetreat,
    onBattleOutcome,
    onDamageEffect,
    onStoryBattleEnd,
    onStoryAssistEvent,
    onCardSeen,
    onResumeCheckpoint,
    onPvpSync,
    playerConfigs,
    humanPlayer,
    storyMode = false,
    goalCurrency = null,
    tutorialMode = false,
    tutorialOpeningCardIds = [],
    tutorialCpuOpeningCardIds = [],
    tutorialDiceQueues = null,
    tutorialDrawQueues = null,
    tutorialCpuScript = [],
    onTutorialEvent = null,
    storyAssistEvent = null,
  }) {
    this.tiles = tiles;
    this.mapId = mapId;
    this.requireAllCheckpoints = mapRequiresAllCheckpoints(mapId);
    this.checkpointBonus = mapCheckpointBonus(mapId);
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
    this.onShrineEffect = onShrineEffect || (() => Promise.resolve());
    this.onWarpEffect = onWarpEffect || (() => Promise.resolve());
    this.onTurnFocus = onTurnFocus;
    this.onTollPayment = onTollPayment || (() => Promise.resolve());
    this.onMoveDestination = onMoveDestination || (() => {});
    this.onLandLoss = onLandLoss || (() => Promise.resolve());
    this.onLandChain = onLandChain || (() => Promise.resolve());
    this.onLandLevelUp = onLandLevelUp || (() => Promise.resolve());
    this.onCheckpoint = onCheckpoint || (() => Promise.resolve());
    this.onGoalBonus = onGoalBonus || (() => Promise.resolve());
    this.onGoalAchieved = onGoalAchieved || (() => Promise.resolve());
    this.onCpuRoll = onCpuRoll;
    this.onMoveComplete = onMoveComplete;
    this.onPieceMove = onPieceMove || (() => {});
    this.onLandCommand = onLandCommand;
    this.onPickMonsterCard = onPickMonsterCard;
    this.onConfirmAction = onConfirmAction;
    this.onPickLevelUp = onPickLevelUp;
    this.onConfirmMove = onConfirmMove;
    // 手持ちGがマイナスになった時の強制土地売却リスト、および破産演出
    // （カメラクローズアップ+ゆれ+「破産」の2文字）用フック - どちらも
    // 未指定ならテスト等で素通りできるようデフォルトを与えておく
    // （_resolveNegativeCurrency/_triggerBankruptcy参照）。
    this.onPickSellLandForDebt = onPickSellLandForDebt || (() => Promise.resolve(null));
    this.onOfudaMarket = onOfudaMarket || (() => Promise.resolve(null));
    this.onPickDebtRecovery = onPickDebtRecovery || (() => Promise.resolve(null));
    this.onBankruptcy = onBankruptcy || (() => Promise.resolve());
    this.onPickBrowseTile = onPickBrowseTile;
    this.onLandSubmenu = onLandSubmenu;
    this.onPickAbilityTarget = onPickAbilityTarget;
    this.onPickTransformTarget = onPickTransformTarget || onPickMonsterCard;
    this.onPickCardType = onPickCardType;
    this.onShowTileInfo = onShowTileInfo;
    this.onChooseBranch = onChooseBranch;
    this.onBranchUndo = onBranchUndo || (() => {});
    this.onPickMoveDirection = onPickMoveDirection;
    this.onPickElement = onPickElement;
    this.onShopPurchase = onShopPurchase;
    this.onBattleSceneEnter = onBattleSceneEnter;
    this.onPickBattleItem = onPickBattleItem;
    this.onBattleAttack = onBattleAttack;
    this.onBattleEquip = onBattleEquip || (() => Promise.resolve());
    this.onBattleItemDestroy = onBattleItemDestroy || (() => Promise.resolve());
    this.onBattleItemSteal = onBattleItemSteal || (() => Promise.resolve());
    this.onBattleTraitReveal = onBattleTraitReveal || (() => Promise.resolve());
    this.onBattleLightningRod = onBattleLightningRod || (() => Promise.resolve());
    this.onBattleRetreat = onBattleRetreat;
    this.onBattleOutcome = onBattleOutcome;
    // 直接ダメージ系の土地コマンド（damage/damageAndSelfDestruct）専用の
    // 演出フック。任意（未指定なら何も起きず即resolveする）ので、テスト等で
    // わざわざ渡す必要はない。
    this.onDamageEffect = onDamageEffect;
    this.onStoryBattleEnd = onStoryBattleEnd;
    this.onStoryAssistEvent = onStoryAssistEvent || (() => Promise.resolve());
    // カードが実際に場に出た時に呼ぶ（召喚・スペル詠唱・アイテム装備）。
    // 図鑑登録に使う - 敵しか使わないカードでも、見たのなら図鑑に載る。
    this.onCardSeen = onCardSeen;
    this.storyAssistEvent = storyAssistEvent;
    this.storyAssistTriggered = false;
    // ストーリー途中保存用。操作可能な安全地点だけをmain.jsへ渡す。
    this.onResumeCheckpoint = onResumeCheckpoint;
    // 対人戦(PvP)ホスト側のみ使う: _notifyStateのたびに盤面全体のスナップ
    // ショットを渡す（main.js側がFirestoreへpublishする）。通常対戦/
    // ストーリーでは未設定のままなので何も起きない。
    this.onPvpSync = onPvpSync;
    // ストーリーモードでは破産＝敗北（脱落）としてそのままバトル終了判定に
    // つながる（_triggerBankruptcy/_checkStoryWinCondition参照）。通常の
    // 対戦モードでは今まで通り500Gを渡されゴール地点から再スタートするだけ。
    this.storyMode = storyMode;
    this.goalCurrency = Number.isFinite(Number(goalCurrency)) ? Number(goalCurrency) : null;
    this.hasOfuda = mapHasOfuda(mapId);
    this.ofudaPressure = Object.fromEntries(OFUDA_ELEMENTS.map((element) => [element, 0]));
    this.ofudaInitialCounts = Object.fromEntries(OFUDA_ELEMENTS.map((element) => [
      element,
      this.tiles.filter((tile) => tile.type === TileType.LAND && tile.element === element).length,
    ]));
    this.tutorialMode = !!tutorialMode;
    this.tutorialOpeningCardIds = tutorialOpeningCardIds;
    this.tutorialCpuOpeningCardIds = tutorialCpuOpeningCardIds;
    this.tutorialDiceQueues = tutorialDiceQueues || { human: [1, 1, 2, 1, 3, 2], cpu: [2, 1, 2, 1, 2, 1] };
    // ターンごとの固定ドロー台本（catalogId、nullなら通常ドロー）。
    this.tutorialDrawQueues = tutorialDrawQueues || null;
    // CPUの土地コマンド台本。先頭から順に、状況が合致した時だけ消費する
    // （合致しなければ通常AIに委ねる）。[{type:'invade'|'summon', card:catalogId}]
    this.tutorialCpuScript = [...tutorialCpuScript];
    this.onTutorialEvent = onTutorialEvent || (() => {});
    this.storyEnded = false;
    // 経過ターン数（_beginTurnごとに+1）。退出報酬の最低ターン数判定に使う
    // （開始直後に退出して報酬を得る無限金策の防止）。
    this.turnCount = 0;
    // 呼び出し元（main.jsの「退出」）がこのGameを見捨てた後も、宙に浮いた
    // await（onBattleSceneEnter等）がいつか解決して先へ進んでしまうと、
    // 既に始まっている次のセッションのUI/状態を巻き込んで壊してしまう。
    // cancel()が呼ばれたら、そういった残存awaitの直後で早期returnして
    // 何もしないようにするためのフラグ（_isCancelled/cancel参照）。
    this._isCancelled = false;

    // ネクロマンサー用: この試合中に死んだモンスターの記録（敵味方問わず、
    // _handleUnitDeathで一括記録・蘇生時に消費される。プレイヤー個別ではなく
    // Game全体で1本 - 「敵プレイヤーのモンスターも対象」のため）。
    this._deadMonstersThisMatch = [];

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
    // 全マップ共通で、プレイヤーはゴール(START)マスから開始する。タイルID 0
    // 固定では、中央にゴールがあるステージ2などで別の土地から始まってしまう。
    const startingTileId = this.tiles.find((tile) => tile.type === TileType.START)?.id ?? 0;

    // tileId indexes into `tiles` (ids are assigned sequentially at parse
    // time, so id === array index). previousTileId excludes backtracking
    // when picking the next step at a branch (see _movePlayer) - null at
    // game start, when every neighbor of the start tile is a fair option.
    this.players = resolvedConfigs.map((cfg, id) => {
      // NPC専用カードは指定された所有者のデッキでのみ有効。過去の同期不具合や
      // 保存データに混入していても、別プレイヤー/CPUへ引き継がせない。
      const sourceDeckList = cfg.deckList ?? buildStarterCardList(cfg.deckVariant);
      const permittedDeckList = sourceDeckList.filter((card) => (
        !card.npcExclusive || !card.exclusiveOwnerName || card.exclusiveOwnerName === cfg.name
      ));
      const deck = Deck.fromCardList(permittedDeckList);
      // 「未知との遭遇」用: このデッキにセットされている無属性モンスターの種類
      // （catalogId）一覧。開始時は全40枚がdrawPileにあるのでここから拾える。
      const deckNeutralMonsterIds = new Set(
        deck.drawPile
          .filter((c) => c.type === CardType.MONSTER && c.element === Element.NEUTRAL)
          .map((c) => catalogIdOf(c)),
      );
      return {
      id,
      name: cfg.name,
      isCPU: !!cfg.isCPU,
      currency: 500,
      tileId: startingTileId,
      homeGoalTileId: startingTileId,
      previousTileId: null,
      color: cfg.color,
      // 「未知との遭遇」判定用: この盤面でこれまでにドローしたカードのcatalogId。
      deckNeutralMonsterIds,
      drawnCatalogIds: new Set(),
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
      ofuda: Object.fromEntries(OFUDA_ELEMENTS.map((element) => [element, 0])),
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
      // タフネス: 空き地へ新規召喚した盤面個体だけに基礎HP+10を与える残りターン数。
      // 元カードやデッキ定義には触れず、_placeUnitでunit.summonBaseHpBonusへ焼き込む。
      toughnessTurnsRemaining: 0,
      // バックファイア用: 直近に実際に着地したタイルidの履歴（新しい順が先頭）。
      tileHistory: [],
      };
    });
    // 盤面開始時に一度だけ先攻を抽選し、以後はこの順番を固定する。
    // プレイヤーIDや同盟順は変えず、ホスト／ゲストの同期も壊さない。
    this.currentPlayerIndex = this.tutorialMode
      ? Math.max(0, this.players.findIndex((player) => !player.isCPU))
      : Math.floor(Math.random() * this.players.length);
    this._assignGoalStarts(resolvedConfigs);
    this.isBusy = false;
    this.tilesSincePan = 0;
    // Tile ids stepped onto during the current dice roll (landing tile
    // included, the tile moved FROM excluded) - reset at the start of each
    // _movePlayer call. Powers 土地コマンド's "土地" browse, which is
    // normally scoped to just this turn's path (see _runLandCommand).
    this._turnPathIds = [];
    // 対人戦の駒移動配信（_broadcastPieceMove）専用の経路バッファ。通過ワープを
    // 跨ぐたびにリセットされる「区間」単位で、1ターン分を通しで保持する
    // _turnPathIds（土地コマンドの権限）とは寿命が違う。
    this._segmentPathIds = [];
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

  /** ステージ8は先攻順で左/右Gへ交互配置。ストーリー側の明示指定を優先する。 */
  _assignGoalStarts(resolvedConfigs) {
    const goals = this.tiles.filter((tile) => tile.type === TileType.START);
    if (goals.length < 2 || !mapUsesAlternateGoalStarts(this.mapId)) return;
    const turnOrder = Array.from({ length: this.players.length }, (_, offset) => (
      (this.currentPlayerIndex + offset) % this.players.length
    ));
    for (let order = 0; order < turnOrder.length; order++) {
      const playerIndex = turnOrder[order];
      const explicit = resolvedConfigs[playerIndex]?.startGoalIndex;
      const goalIndex = Number.isInteger(explicit) ? explicit : order % goals.length;
      const goal = goals[Math.max(0, Math.min(goalIndex, goals.length - 1))];
      this.players[playerIndex].tileId = goal.id;
      this.players[playerIndex].homeGoalTileId = goal.id;
    }
  }

  _runtimePlayerFromConfig(cfg, id, startingTileId = null) {
    const startId = startingTileId ?? this.tiles.find((tile) => tile.type === TileType.START)?.id ?? 0;
    const sourceDeckList = cfg.deckList ?? buildStarterCardList(cfg.deckVariant);
    const permittedDeckList = sourceDeckList.filter((card) => (
      !card.npcExclusive || !card.exclusiveOwnerName || card.exclusiveOwnerName === cfg.name
    ));
    const deck = Deck.fromCardList(permittedDeckList);
    const deckNeutralMonsterIds = new Set(
      deck.drawPile
        .filter((c) => c.type === CardType.MONSTER && c.element === Element.NEUTRAL)
        .map((c) => catalogIdOf(c)),
    );
    return {
      id,
      name: cfg.name,
      isCPU: !!cfg.isCPU,
      currency: 500,
      tileId: startId,
      homeGoalTileId: startId,
      previousTileId: null,
      color: cfg.color,
      deckNeutralMonsterIds,
      drawnCatalogIds: new Set(),
      iconImage: cfg.iconImage ?? null,
      allianceId: cfg.allianceId ?? null,
      deck,
      deckBreakdown: deck.drawPile.reduce((counts, card) => {
        const key = card.type === CardType.MONSTER ? `monster:${card.element ?? Element.NEUTRAL}` : card.type;
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {}),
      hand: [],
      spellUsedThisTurn: false,
      defeated: false,
      passedCheckpoints: new Set(),
      hasteTurnsRemaining: 0,
      lastDiceSteps: 0,
      aiProfile: resolveAiProfile(cfg.name, cfg.elements ?? null),
      diceCurse: null,
      lapsCompleted: 0,
      tollWaiverCharges: 0,
      lotteryOnNextGoal: false,
      pierceNextInvasion: false,
      guaranteedNextInvasionWin: false,
      allTilesAccessTurnsRemaining: 0,
      toughnessTurnsRemaining: 0,
      tileHistory: [],
    };
  }

  _addStoryAssistPlayer(cfg) {
    const human = this.players.find((player) => !player.isCPU && !player.defeated);
    const player = this._runtimePlayerFromConfig(cfg, this.players.length, human?.homeGoalTileId ?? null);
    const pos = this.tiles[player.tileId].position;
    player.mesh = player.iconImage
      ? this.scene.createPieceFromImage(player.iconImage, pos)
      : this.scene.createPiece(player.color, pos);
    for (let i = 0; i < STARTING_HAND_SIZE; i++) {
      const card = player.deck.draw();
      if (card) { player.hand.push(card); this._recordDraw(player, card); }
    }
    this.players.push(player);
    this._syncPieceRenderOrder();
    this._notifyState();
    return player;
  }

  async _maybeTriggerStoryAssistEvent() {
    const event = this.storyAssistEvent;
    if (!event || this.storyAssistTriggered || this.storyEnded || this._isCancelled) return;
    const human = this.players.find((player) => !player.isCPU && !player.defeated);
    if (!human) return;
    const enemy = this.players.find((player) => (
      !player.defeated && player.id !== human.id
      && !(player.allianceId != null && player.allianceId === human.allianceId)
    ));
    if (!enemy) return;
    const heroAssets = Math.max(1, this._totalAssetsOf(human));
    const enemyAssets = this._totalAssetsOf(enemy);
    if (enemyAssets < heroAssets * (event.ratio || 2.5)) return;
    this.storyAssistTriggered = true;
    await this.onStoryAssistEvent(event);
    if (this._isCancelled || this.storyEnded) return;
    const added = this._addStoryAssistPlayer(event.allyConfig);
    this.onLog(`${added.name}が紅組に参戦した！`);
  }

  /** 呼び出し元（main.jsの「退出」）がこのGameを見限る時に呼ぶ。以後、進行中のターン/戦闘シーンの続きは主要な再開ポイントで早期returnし、次に始まる別セッションのUIを巻き込まない。 */
  cancel() {
    this._isCancelled = true;
  }

  init(resumeState = null) {
    if (resumeState) {
      this._restoreState(resumeState);
      for (const player of this.players) {
        const pos = this.tiles[player.tileId].position;
        player.mesh = player.iconImage
          ? this.scene.createPieceFromImage(player.iconImage, pos)
          : this.scene.createPiece(player.color, pos);
      }
      this._syncUnitIcons();
      this._syncPieceRenderOrder();
      this.isBusy = false;
      this.awaitingRoll = true;
      this.scene.setFocusImmediate(this.tiles[this.currentPlayer.tileId].position.x, this.tiles[this.currentPlayer.tileId].position.z);
      this._notifyState();
      this.onTurnFocus?.({ playerId: this.currentPlayer.id, position: this.tiles[this.currentPlayer.tileId].position });
      if (this.currentPlayer.isCPU) this._runCPUTurn();
      return;
    }
    for (const player of this.players) {
      const pos = this.tiles[player.tileId].position;
      player.mesh = player.iconImage
        ? this.scene.createPieceFromImage(player.iconImage, pos)
        : this.scene.createPiece(player.color, pos);
      if (this.tutorialMode) this._prepareTutorialOpeningHand(player);
      for (let i = 0; i < STARTING_HAND_SIZE; i++) {
        const card = player.deck.draw();
        if (card) { player.hand.push(card); this._recordDraw(player, card); }
      }
    }
    if (this.tutorialMode) this._setupTutorialScenario();
    const startPos = this.tiles[this.currentPlayer.tileId].position;
    this.scene.setFocusImmediate(startPos.x, startPos.z);
    this._beginTurn();
  }

  _prepareTutorialOpeningHand(player) {
    const wantedIds = player.isCPU ? this.tutorialCpuOpeningCardIds : this.tutorialOpeningCardIds;
    const selected = [];
    for (const wantedId of wantedIds) {
      const index = player.deck.drawPile.findIndex((card) => catalogIdOf(card) === wantedId);
      if (index >= 0) selected.push(player.deck.drawPile.splice(index, 1)[0]);
    }
    // Deck.draw()は末尾から取り出すので、指定順の逆順で末尾へ積む。
    player.deck.drawPile.push(...selected.reverse());
  }

  _setupTutorialScenario() {
    const human = this.players.find((player) => !player.isCPU);
    const cpu = this.players.find((player) => player.isCPU);
    if (!human || !cpu) return;
    // 2026-08調整: 以前は両者1000G＋土地を初期配置（CPU側はLv2）していたが、
    // その土地を取るだけで総資産が跳ね、何もしなくても目標へ届いてしまった。
    // 全マスLv1の更地・少額スタートにして、召喚から一歩ずつ体験させる。
    human.currency = 200;
    cpu.currency = 200;
    this._notifyState();
  }

  /**
   * チュートリアルの固定サイコロ（次に出る目）。台本を使い切ったらnullを返して
   * 通常の抽選へ戻す - ここで1を返すと、rollDice側はキューが空なので実際の
   * 出目で動くのに、画面には「1で固定」のダイスが出続けて食い違う。
   */
  _tutorialDiceValue() {
    if (!this.tutorialMode) return null;
    const key = this.currentPlayer.isCPU ? 'cpu' : 'human';
    return this.tutorialDiceQueues?.[key]?.[0] ?? null;
  }

  /** ストーリー途中再開用。Three.jsの参照を除き、ゲーム進行に必要な純データだけを書き出す。 */
  exportState() {
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const tileVisualKeys = new Set(['mesh', 'unitMesh', 'markerSprite', 'ownerLabelMesh', 'position', 'neighbors']);
    return {
      version: 2,
      mapId: this.mapId,
      turnCount: this.turnCount,
      currentPlayerIndex: this.currentPlayerIndex,
      forcedDiceRemaining: this.forcedDiceRemaining,
      ofudaPressure: clone(this.ofudaPressure),
      deadMonstersThisMatch: clone(this._deadMonstersThisMatch),
      players: this.players.map((player) => {
        const {
          mesh, iconImage, aiProfile, deck, passedCheckpoints,
          deckNeutralMonsterIds, drawnCatalogIds, ...plain
        } = player;
        return {
          ...clone(plain),
          passedCheckpoints: [...passedCheckpoints],
          deckNeutralMonsterIds: [...deckNeutralMonsterIds],
          drawnCatalogIds: [...drawnCatalogIds],
          drawPile: clone(deck.drawPile),
          discardPile: clone(deck.discardPile),
        };
      }),
      tiles: this.tiles.map((tile) => Object.fromEntries(
        Object.entries(tile)
          .filter(([key, value]) => !tileVisualKeys.has(key) && value !== undefined && typeof value !== 'function')
          .map(([key, value]) => [key, clone(value)]),
      )),
    };
  }

  _restoreState(snapshot) {
    if (!snapshot || snapshot.version !== 2 || snapshot.mapId !== this.mapId
      || snapshot.players?.length !== this.players.length
      || snapshot.tiles?.length !== this.tiles.length) {
      throw new Error('保存データの形式が一致しません');
    }
    this.turnCount = Math.max(0, Number(snapshot.turnCount) || 0);
    this.currentPlayerIndex = Math.max(0, Math.min(snapshot.currentPlayerIndex || 0, this.players.length - 1));
    this.forcedDiceRemaining = snapshot.forcedDiceRemaining || 0;
    this.ofudaPressure = { ...this.ofudaPressure, ...(snapshot.ofudaPressure || {}) };
    this._deadMonstersThisMatch = Array.isArray(snapshot.deadMonstersThisMatch) ? snapshot.deadMonstersThisMatch : [];
    snapshot.players.forEach((saved, index) => {
      const player = this.players[index];
      const {
        passedCheckpoints, deckNeutralMonsterIds, drawnCatalogIds,
        drawPile, discardPile, ...plain
      } = saved;
      Object.assign(player, plain);
      player.passedCheckpoints = new Set(passedCheckpoints || []);
      player.deckNeutralMonsterIds = new Set(deckNeutralMonsterIds || []);
      player.drawnCatalogIds = new Set(drawnCatalogIds || []);
      player.deck.drawPile = drawPile || [];
      player.deck.discardPile = discardPile || [];
      player.aiProfile = resolveAiProfile(player.name, player.aiProfile?.preferredElements ?? null);
    });
    // 旧不具合や境界タイミングの保存データでも、脱落済みプレイヤーの手番を
    // 再開して永久停止しないよう、生存している次のプレイヤーへ補正する。
    if (this.players[this.currentPlayerIndex]?.defeated) {
      const nextAlive = this.players.findIndex((player) => !player.defeated);
      if (nextAlive < 0) throw new Error('再開できるプレイヤーがいません');
      this.currentPlayerIndex = nextAlive;
    }
    snapshot.tiles?.forEach((saved, index) => {
      const tile = this.tiles[index];
      if (!tile || saved.id !== tile.id) return;
      for (const [key, value] of Object.entries(saved)) {
        if (['id', 'type', 'gridX', 'gridZ', 'position', 'neighbors', 'checkpointNumber', 'warpKind'].includes(key)) continue;
        tile[key] = value;
      }
    });
  }

  /** Runs automatically whenever a turn starts: draw, then hand control to the player (or CPU). */
  async _beginTurn() {
    this.isBusy = true;
    this.awaitingRoll = false;
    this.turnCount += 1;
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
    await this._maybeTriggerStoryAssistEvent();
    if (this._isCancelled || this.storyEnded) return;

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

    this.onCardSeen?.(card);
    player.hand = player.hand.filter((c) => c.id !== card.id);
    this._discardUsedCard(player, card);
    player.currency -= card.cost || 0;
    player.spellUsedThisTurn = true;
    this.onLog(`${player.name}は「${card.name}」を使用した (-${card.cost || 0}G)`);
    this._notifyState();

    const casterTile = this.tiles[player.tileId];
    await this.onSpellUse({
      card,
      casterPosition: casterTile?.position
        ? { x: casterTile.position.x, z: casterTile.position.z }
        : null,
    });
    await this.onSpellCastEffect?.(this._buildSpellCastEffectPayload(player, cast, card));
    const endedTurn = await this._applySpellEffect(player, card, cast);
    await this.onSpellComplete();
    this.onTutorialEvent('spell', { card });
    this._notifyState();

    if (endedTurn) {
      // 帰巣本能専用: 効果自体がターンを終わらせるので、通常のrollDice相当の
      // 後始末（破産チェック→次のプレイヤーへ）をここで肩代わりする。
      for (const p of this.players) await this._resolveNegativeCurrency(p);
      if (!this.storyEnded) {
        this._nextTurn();
        await this._beginTurn();
      }
      return;
    }

    this.isBusy = false;
    this._notifyState();
  }

  /** 元デッキ外から一時生成されたカードは、使用・破棄後に捨て札へ混ぜず消滅させる。 */
  _discardUsedCard(player, card) {
    if (!card || card.generatedOutsideDeck) return;
    player.deck.discard(card);
  }

  /**
   * カードのtargetに応じた対象選択UIを出し、`{}`（対象なし）や
   * `{targetTileId}`/`{targetPlayerId}`/`{targetTileIds:[a,b]}`のような
   * 選択結果を返す。キャンセルされたらnull。既存のonPickAbilityTargetを
   * モンスター・土地・プレイヤーいずれの対象選びにも使い回す（渡す配列の
   * 形が違うだけ）。
   */
  _disclosureEligibleCards(caster, targetPlayer, disclosureCost = 150) {
    // 開示請求は敵専用。同盟者を候補にしないだけでなく、候補カード取得の
    // 最終入口でも空配列にして、固有AIや今後追加されるAI経路から誤って
    // 同盟者を渡されても発動対象にならないようにする。
    if (!targetPlayer || targetPlayer.id === caster.id || this._isAllyOf(targetPlayer, caster)) return [];
    const emptyLandExists = this.tiles.some((tile) => tile.type === TileType.LAND && tile.owner == null);
    const availableForExtraCost = Math.max(0, caster.currency - disclosureCost);
    return targetPlayer.hand.filter((card) => {
      if (catalogIdOf(card) === 'disclosureRequest') return false;
      if ((card.cost || 0) > availableForExtraCost) return false;
      if (card.type === CardType.MONSTER) return emptyLandExists;
      return card.type === CardType.SPELL;
    });
  }

  async _resolveSpellCast(player, card) {
    const target = card.target;
    if (target === 'self' || target === 'none') return {};

    if (target === 'cardTypeChoice') {
      const labels = {
        [CardType.MONSTER]: 'モンスター',
        [CardType.GEAR]: 'アイテム',
        [CardType.SPELL]: 'スペル',
      };
      const availableTypes = [CardType.MONSTER, CardType.GEAR, CardType.SPELL].filter((type) =>
        [...player.deck.drawPile, ...player.deck.discardPile]
          .some((candidate) => candidate.id !== card.id && candidate.type === type));
      if (availableTypes.length === 0) {
        this.onLog('デッキに引けるカードがありません');
        return null;
      }
      const chosenType = await this.onPickAbilityTarget(
        availableTypes.map((type) => ({ id: type, label: `${labels[type]}を1枚引く` })),
        player.id,
      );
      if (chosenType == null) return null;
      return { chosenCardType: chosenType };
    }

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
        tiles.map((t) => ({
          ...this._browseTileSummary(t, player),
          label: `${ELEMENT_LABEL[t.element]}属性の土地（Lv${t.level}）`,
          effectAreaIds: card.effect?.type === 'poisonArea' ? [t.id, ...t.neighbors] : null,
        })),
        player.id,
      );
      if (targetId == null) return null;
      return { targetTileId: targetId };
    }

    if (target === 'enemyPlayer' || target === 'anyPlayer' || target === 'selfOrAllyPlayer') {
      const targets = this.players.filter((p) => {
        if (p.defeated) return false;
        if (target === 'enemyPlayer' && p.id === player.id) return false;
        if (target === 'enemyPlayer' && p.allianceId != null && p.allianceId === player.allianceId) return false;
        if (target === 'selfOrAllyPlayer' && !this._isAllyOf(p, player)) return false;
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

    // キャンセルカルチャー: 相手を選ぶ→その相手のスペル/アイテムを1枚選んで破壊。
    if (target === 'enemyPlayerHandCard') {
      const isDestroyable = (c) => c.type === CardType.SPELL || c.type === CardType.GEAR;
      const opponents = this.players.filter(
        (p) => !p.defeated && p.id !== player.id
          && !(p.allianceId != null && p.allianceId === player.allianceId)
          && p.hand.some(isDestroyable),
      );
      if (opponents.length === 0) {
        this.onLog('破壊できる手札（スペル/アイテム）を持つ相手がいません');
        return null;
      }
      const targetPlayerId = await this.onPickAbilityTarget(
        opponents.map((p) => ({ id: p.id, label: `${p.name}の手札を見る（${p.hand.filter(isDestroyable).length}枚）` })),
        player.id,
      );
      if (targetPlayerId == null) return null;
      const targetPlayer = this.players.find((p) => p.id === targetPlayerId);
      const cards = targetPlayer ? targetPlayer.hand.filter(isDestroyable) : [];
      if (cards.length === 0) {
        this.onLog('対象の相手に破壊できる手札がありません');
        return null;
      }
      const targetCardId = await this.onPickAbilityTarget(
        cards.map((c) => ({ id: c.id, label: `${c.name}（${c.type === CardType.SPELL ? 'スペル' : 'アイテム'}・${c.rarity}）を捨てさせる` })),
        player.id,
      );
      if (targetCardId == null) return null;
      return { targetPlayerId, targetCardId };
    }

    // 魔力抽出: 自分を含む全プレイヤーから1人選ぶ→その手札を見て1枚選ぶ。
    // 捨てさせる代わりに対象は報酬Gを得るので、自分を狙う「換金」としても
    // 相手の強カードを潰す妨害としても使える。手札が無い（自分の場合は
    // この魔力抽出しか持っていない）プレイヤーは選べない。
    if (target === 'anyPlayerHandCard') {
      const extractable = (p) => p.hand.filter((c) => c.id !== card.id);
      const candidates = this.players.filter((p) => !p.defeated && extractable(p).length > 0);
      if (candidates.length === 0) {
        this.onLog('手札を持つプレイヤーがいません');
        return null;
      }
      const targetPlayerId = await this.onPickAbilityTarget(
        candidates.map((p) => ({
          id: p.id,
          label: `${p.name}${p.id === player.id ? '（自分）' : ''}の手札を見る（${extractable(p).length}枚）`,
        })),
        player.id,
      );
      if (targetPlayerId == null) return null;
      const targetPlayer = this.players.find((p) => p.id === targetPlayerId);
      const cards = targetPlayer ? extractable(targetPlayer) : [];
      if (cards.length === 0) {
        this.onLog('対象のプレイヤーに捨てさせる手札がありません');
        return null;
      }
      const reward = card.effect?.reward ?? 0;
      const targetCardId = await this.onPickAbilityTarget(
        cards.map((c) => ({ id: c.id, label: `${c.name}（${CARD_TYPE_LABEL[c.type] ?? ''}・${c.rarity}）を捨てて${reward}G` })),
        player.id,
      );
      if (targetCardId == null) return null;
      return { targetPlayerId, targetCardId };
    }

    // 開示請求: 相手を選ぶ→その相手のモンスター/スペルを1枚選ぶ。
    // スペルの場合は、奪う前にそのスペル自身の対象選択まで済ませておく。
    if (target === 'enemyPlayerDisclosureCard') {
      const opponents = this.players.filter(
        (candidate) => !candidate.defeated && candidate.id !== player.id
          && !this._isAllyOf(candidate, player),
      );
      if (opponents.length === 0) return null;
      const targetPlayerId = await this.onPickAbilityTarget(
        opponents.map((candidate) => ({ id: candidate.id, label: `${candidate.name}へ開示請求する` })),
        player.id,
      );
      if (targetPlayerId == null) return null;
      const targetPlayer = this.players.find((candidate) => candidate.id === targetPlayerId);
      const eligible = targetPlayer ? this._disclosureEligibleCards(player, targetPlayer, card.cost || 0) : [];
      if (eligible.length === 0) {
        this.onLog('開示できるモンスター/スペルがないため「開示請求」は手札に戻った');
        return null;
      }
      const targetCardId = await this.onPickAbilityTarget(
        eligible.map((candidate) => ({
          id: candidate.id,
          label: `${candidate.name}（${candidate.type === CardType.MONSTER ? 'モンスター' : 'スペル'}・${candidate.rarity}・追加${candidate.cost || 0}G）`,
        })),
        player.id,
      );
      if (targetCardId == null) return null;
      const targetCard = eligible.find((candidate) => candidate.id === targetCardId);
      let nestedCast = null;
      if (targetCard?.type === CardType.SPELL) {
        nestedCast = await this._resolveSpellCast(player, targetCard);
        if (!nestedCast) return null;
      }
      return { targetPlayerId, targetCardId, nestedCast };
    }

    // ネクロマンサー: この試合中に死んだモンスター（敵味方問わず）から1体選ぶ。
    if (target === 'deadMonster') {
      if (this._deadMonstersThisMatch.length === 0) {
        this.onLog('この試合ではまだモンスターが死んでいません');
        return null;
      }
      const targetId = await this.onPickAbilityTarget(
        this._deadMonstersThisMatch.map((entry) => {
          const originalOwner = this.players.find((p) => p.id === entry.originalOwnerId);
          return {
            id: entry.id,
            label: `${originalOwner?.name ?? '???'}の${entry.def.name}（${entry.def.rarity}・ATK${entry.def.atk}/HP${entry.def.hp}）を蘇生`,
          };
        }),
        player.id,
      );
      if (targetId == null) return null;
      return { targetDeadMonsterId: targetId };
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
      case 'drawRandomCardOfChosenType': {
        const labels = {
          [CardType.MONSTER]: 'モンスター',
          [CardType.GEAR]: 'アイテム',
          [CardType.SPELL]: 'スペル',
        };
        const drawn = this._drawCardOfType(player, cast.chosenCardType, { excludeCardId: card.id });
        if (!drawn) {
          this.onLog(`デッキに${labels[cast.chosenCardType] || '対象'}カードがなく、「占術」は不発になった`);
          return false;
        }
        player.hand.push(drawn);
        this._recordDraw(player, drawn);
        this.onLog(`${player.name}は「占術」でデッキから${labels[cast.chosenCardType]}「${drawn.name}」を手札に加えた`);
        this._notifyState();
        await this._enforceHandLimit(player);
        return false;
      }

      case 'destroyHandCard': {
        // キャンセルカルチャー: 対象の手札からスペル/アイテム1枚を「捨てる」。
        // 盤外ではなく通常の捨札と同じ扱い（deck.discard）＝後でデッキ再シャッフル
        // 時に戻り得る。
        if (!targetPlayer || cast.targetCardId == null) return false;
        const discarded = targetPlayer.hand.find((c) => c.id === cast.targetCardId);
        if (!discarded) {
          this.onLog('対象のカードは既に手札にありません');
          return false;
        }
        targetPlayer.hand = targetPlayer.hand.filter((c) => c.id !== cast.targetCardId);
        this._discardUsedCard(targetPlayer, discarded);
        this.onLog(`${player.name}は「${card.name}」で${targetPlayer.name}の「${discarded.name}」を捨てさせた`);
        this._notifyState();
        return false;
      }

      case 'extractManaFromHandCard': {
        // 魔力抽出: 対象の手札1枚を捨てさせ、その見返りに対象へ報酬Gを渡す。
        // 捨札はキャンセルカルチャーと同じ通常の捨札扱い（再シャッフルで戻り得る）。
        if (!targetPlayer || cast.targetCardId == null) return false;
        const extracted = targetPlayer.hand.find((c) => c.id === cast.targetCardId);
        if (!extracted) {
          this.onLog('対象のカードは既に手札にありません');
          return false;
        }
        const reward = effect.reward ?? 0;
        targetPlayer.hand = targetPlayer.hand.filter((c) => c.id !== cast.targetCardId);
        this._discardUsedCard(targetPlayer, extracted);
        targetPlayer.currency += reward;
        this.onLog(
          targetPlayer.id === player.id
            ? `${player.name}は「${card.name}」で自分の「${extracted.name}」を魔力に変えた (+${reward}G)`
            : `${player.name}は「${card.name}」で${targetPlayer.name}の「${extracted.name}」を魔力に変えた（${targetPlayer.name}は+${reward}G）`,
        );
        this._notifyState();
        return false;
      }

      case 'disclosureRequest': {
        if (!targetPlayer || cast.targetCardId == null) return false;
        const stolen = targetPlayer.hand.find((candidate) => candidate.id === cast.targetCardId);
        if (!stolen || (stolen.type !== CardType.MONSTER && stolen.type !== CardType.SPELL)) {
          this.onLog('対象カードがなくなったため「開示請求」は不発になった');
          return false;
        }
        const extraCost = stolen.cost || 0;
        if (player.currency < extraCost) {
          this.onLog('追加コストを支払えないため「開示請求」は不発になった');
          return false;
        }

        targetPlayer.hand = targetPlayer.hand.filter((candidate) => candidate.id !== stolen.id);
        player.currency -= extraCost;
        // 開示請求で奪ったカードは使用者の元デッキには存在しない。
        // ここで捨て札へ入れると再シャッフル後に使用者が再ドローできてしまうため、
        // モンスターは盤面へ移し、スペルはその場で使い切るだけにする。

        const stolenCard = { ...stolen, generatedOutsideDeck: true };
        let endedTurn = false;
        if (stolenCard.type === CardType.MONSTER) {
          const emptyLands = this.tiles.filter((tile) => tile.type === TileType.LAND && tile.owner == null);
          const matching = emptyLands.filter((tile) => tile.element === stolenCard.element);
          const pool = matching.length > 0 ? matching : emptyLands;
          if (pool.length === 0) return false;
          const summonTile = pool[Math.floor(Math.random() * pool.length)];
          const chainGain = this._captureLandGain(player, summonTile);
          this._placeUnit(summonTile, player, stolenCard);
          this.onLog(`${player.name}は開示された「${stolenCard.name}」を${ELEMENT_LABEL[summonTile.element]}属性の空き地へ召喚した (-${extraCost}G)`);
          await this.onSummonEffect?.({ tileId: summonTile.id, unitName: stolenCard.name });
          await this._presentLandGain(chainGain);
        } else {
          const casterTile = this.tiles[player.tileId];
          this.onLog(`${player.name}は開示された「${stolenCard.name}」を自分の詠唱として使用した (-${extraCost}G)`);
          await this.onSpellUse({
            card: stolenCard,
            casterPosition: casterTile?.position ? { x: casterTile.position.x, z: casterTile.position.z } : null,
          });
          await this.onSpellCastEffect?.(this._buildSpellCastEffectPayload(player, cast.nestedCast || {}, stolenCard));
          endedTurn = await this._applySpellEffect(player, stolenCard, cast.nestedCast || {});
        }

        const replacement = targetPlayer.deck.draw();
        if (replacement) {
          this._recordDraw(targetPlayer, replacement);
          targetPlayer.hand.push(replacement);
        }
        targetPlayer.currency += 100;
        this.onLog(`${targetPlayer.name}は補償としてカードを1枚引き、100Gを得た`);
        this._notifyState();
        await this._enforceHandLimit(targetPlayer);
        return endedTurn;
      }

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
        return this._spellWarpToNearbyEmptyLand(player);

      case 'curseForcedStop':
        if (!targetTile?.unit) {
          this.onLog('対象が既にいません');
          return false;
        }
        targetTile.forcedStopCursed = player.id;
        this.onLog(`${targetTile.unit.def.name}の土地に強制停止の呪いがかかった`);
        return false;

      case 'returnPlayerToStart':
        await this._spellReturnPlayerToStart(targetPlayer, effect.reward ?? 250);
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
        this.onLog(`${ELEMENT_LABEL[targetTile.element]}属性の土地に通行料減少の呪いをかけた`);
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
        this.onLog(`${ELEMENT_LABEL[targetTile.element]}属性の土地に追徴課税の呪いをかけた`);
        return false;

      case 'tollWaiverCurse':
        player.tollWaiverCharges += 1;
        this.onLog(`${player.name}は脱税の準備をした`);
        return false;

      case 'summonBaseHpBoostCurse':
        if (!targetPlayer || !this._isAllyOf(targetPlayer, player)) return false;
        // 重複加算はせず、再使用時は残り期間を3ターンへ更新する。
        targetPlayer.toughnessTurnsRemaining = effect.turns;
        this.onLog(`${targetPlayer.name}は${effect.turns}ターンの間、空き地への召喚時に基礎HP+${effect.hpBonus}を得る`);
        return false;

      case 'cashOutOwnLand':
        if (!targetTile || targetTile.owner !== player.id) return false;
        await this._cashOutOwnLand(player, targetTile, effect.multiplier || 1);
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

      case 'chainStatCurse': {
        if (!targetTile?.unit) {
          this.onLog('対象が既にいません');
          return false;
        }
        const ownerId = targetTile.unit.ownerId;
        const chain = this._chainCount(ownerId, targetTile.element);
        const amount = Math.max(0, chain * (effect.perChain || 0));
        applyCurse(targetTile.unit, { name: card.name, addedAtk: amount, addedHp: amount });
        this.onLog(`${targetTile.unit.def.name}に「${card.name}」の呪い。${ELEMENT_LABEL[targetTile.element]}${chain}連鎖でHP/ATK+${amount}`);
        return false;
      }

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
        // currentHpは常に基礎HPスケールで保持する。土地レベルのHP加算は
        // 戦闘中だけの一時値であり、回復量として盤面へ保存しない。
        targetTile.unit.currentHp = this._baseStats(targetTile.unit).hp;
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
        player.toughnessTurnsRemaining = 0;
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
        this.onLog(`対象の土地を${ELEMENT_LABEL[effect.element]}属性に変えた`);
        return false;

      case 'swapTwoMonsters':
        this._spellSwapTwoMonsters(cast.targetTileIds);
        return false;

      case 'forceRelocateOneStep':
        await this._spellForceRelocateOneStep(player, targetTile, cast.destinationTileId);
        return false;

      case 'curseSanctuary':
        if (!targetTile) return false;
        targetTile.transparentCursed = true;
        this.onLog(`${ELEMENT_LABEL[targetTile.element]}属性の土地に聖域の呪いをかけた（侵略不能・通行料ゼロ）`);
        return false;

      case 'encounterUnknown':
        await this._spellEncounterUnknown(player, card);
        return false;

      // 色の魔法陣シリーズ: デッキ（drawPile/discardPile、手札・盤上は含まない）に
      // 残っている対象属性のモンスターを1体ランダムに引き当て、ランダムな空き地へ
      // 直接召喚する（手札もコストも経由しない）。対象が1体もいなければ150Gを得る。
      case 'randomDeckMonsterSummon': {
        const pool = [...player.deck.drawPile, ...player.deck.discardPile].filter(
          (c) => c.type === CardType.MONSTER && c.element === effect.element,
        );
        if (pool.length === 0) {
          player.currency += 150;
          this.onLog(`${player.name}は「${card.name}」を使ったが対象のモンスターがデッキになく、150Gを得た`);
          this._notifyState();
          return false;
        }
        const emptyLands = this.tiles.filter((t) => t.type === TileType.LAND && t.owner == null);
        if (emptyLands.length === 0) {
          this.onLog('召喚できる空き地がありません');
          return false;
        }
        const picked = pool[Math.floor(Math.random() * pool.length)];
        if (player.deck.drawPile.some((c) => c.id === picked.id)) {
          player.deck.drawPile = player.deck.drawPile.filter((c) => c.id !== picked.id);
        } else {
          player.deck.discardPile = player.deck.discardPile.filter((c) => c.id !== picked.id);
        }
        const targetTile = emptyLands[Math.floor(Math.random() * emptyLands.length)];
        const summonedCard = { ...picked, id: `magiccircle-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}` };
        this._placeUnit(targetTile, player, summonedCard);
        this.onLog(`${player.name}は「${card.name}」で${summonedCard.name}を空き地に召喚した`);
        this._notifyState();
        await this.onSummonEffect?.({ tileId: targetTile.id, unitName: summonedCard.name });
        return false;
      }

      // ネクロマンサー: _deadMonstersThisMatchから対象を取り除き、自分の所有として
      // ランダムな空き地に蘇生する（元の所有者は問わない）。
      case 'reviveDeadMonster': {
        const idx = this._deadMonstersThisMatch.findIndex((entry) => entry.id === cast.targetDeadMonsterId);
        if (idx === -1) {
          this.onLog('対象のモンスターは既に蘇生されています');
          return false;
        }
        const emptyLands = this.tiles.filter((t) => t.type === TileType.LAND && t.owner == null);
        if (emptyLands.length === 0) {
          this.onLog('召喚できる空き地がありません');
          return false;
        }
        const [entry] = this._deadMonstersThisMatch.splice(idx, 1);
        const targetTile = emptyLands[Math.floor(Math.random() * emptyLands.length)];
        const revivedCard = {
          ...entry.def,
          id: `necro-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          catalogId: catalogIdOf(entry.def),
        };
        this._placeUnit(targetTile, player, revivedCard);
        this.onLog(`${player.name}は「ネクロマンサー」で${entry.def.name}を蘇生し、自分の配下にした`);
        this._notifyState();
        await this.onSummonEffect?.({ tileId: targetTile.id, unitName: revivedCard.name });
        return false;
      }

      default:
        return false;
    }
  }

  /**
   * 未知との遭遇: デッキにセットしているのにこの盤面でまだ一度もドローしていない
   * 無属性モンスターを1体、手札に加える。使うと手札に戻る（捨札には残さない＝
   * 再シャッフルで増殖しない。手札上限で捨てた時は_enforceHandLimitで消滅）。
   * 全種遭遇済みなら復帰せず200G＋2ドローを得て終了。
   * ※呼び出し元useSpellは既にこのカードをdiscardへ入れているので、復帰時はそれを
   * 取り除いてから新しいidで手札へ戻す。全種遭遇時もdiscardから取り除いて消滅させる。
   */
  async _spellEncounterUnknown(player, card) {
    const removeUsedFromDiscard = () => {
      player.deck.discardPile = player.deck.discardPile.filter((c) => c.id !== card.id);
    };
    const deckNeutrals = player.deckNeutralMonsterIds;
    const drawn = player.drawnCatalogIds;
    const drawnHas = (id) => (drawn instanceof Set ? drawn.has(id) : false);
    // ギア（fusionSummon）と合体ロボ・ガシャーンは「未知との遭遇」の対象外。
    // ギアを引き当てて召喚すると他2種と合体して「ガシャーン」になってしまい、
    // デッキに積んでいないガシャーン（＝合体専用でデッキには存在しない）が
    // 実質召喚できてしまうため、遭遇候補から除外する。
    const encounterable = (id) => {
      if (id === 'gashaan-field') return false;
      return MONSTER_CATALOG[id]?.effect?.type !== 'fusionSummon';
    };
    const undrawn = (deckNeutrals instanceof Set ? [...deckNeutrals] : [])
      .filter((id) => !drawnHas(id) && encounterable(id));

    if (undrawn.length === 0) {
      // 全種遭遇済み: 復帰なし・200G＋2ドロー。
      removeUsedFromDiscard();
      player.currency += 200;
      this.onLog('全ての怪異と遭遇済みで報酬を得ます');
      for (let i = 0; i < 2; i++) {
        const drawnCard = player.deck.draw();
        if (drawnCard) { player.hand.push(drawnCard); this._recordDraw(player, drawnCard); }
      }
      this._notifyState();
      await this._enforceHandLimit(player);
      return;
    }

    const pickedId = undrawn[Math.floor(Math.random() * undrawn.length)];
    // ブリードモンスター等はMONSTER_CATALOGに載っていない（プレイヤー固有の
    // カード）。その場合はデッキ内（山札/捨札）の実カードからdefを引き当てる。
    // これが無いと無属性のブリモンを引いた時にdef未解決で何も召喚されず、
    // 「未知との遭遇が機能しない」状態になっていた。
    const deckCard = [...(player.deck?.drawPile || []), ...(player.deck?.discardPile || [])]
      .find((c) => catalogIdOf(c) === pickedId);
    const def = MONSTER_CATALOG[pickedId]
      || Object.values(MONSTER_CATALOG).find((m) => catalogIdOf(m) === pickedId)
      || deckCard;
    if (def) {
      // 「デッキから1体手札に加える」＝複製ではなく移動。元のカードをデッキ
      // （山札/捨札）から1枚取り除いてから手札へ加える。これをやらないと
      // デッキに残った分と手札の分でめたんまん等が増殖してしまう。
      this._reclaimCardFromDeck(player, pickedId);
      const monsterCard = {
        ...def,
        id: `encounter-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        catalogId: catalogIdOf(def),
      };
      player.hand.push(monsterCard);
      player.drawnCatalogIds.add(pickedId); // 遭遇済みにする（次回は別の未遭遇から選ばれる）
      this.onLog(`${player.name}は「未知との遭遇」で${def.name}と遭遇した`);
    }
    // 使うと手札に戻る: discardから取り除き、新しいidで手札へ。
    removeUsedFromDiscard();
    player.hand.push({
      ...card,
      id: `encounter-spell-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    this._notifyState();
    await this._enforceHandLimit(player);
  }

  /** ブルーオーシャン: 現在地からグラフ距離が最も近い空き地へ瞬間移動する（同着なら抽選）。その場で土地コマンド（土地コマンド・召喚のみ、サイコロ無し）まで済ませてターンを終える。 */
  async _spellWarpToNearbyEmptyLand(player) {
    const currentTile = this.tiles[player.tileId];
    const candidates = this.tiles.filter((t) => t.type === TileType.LAND && t.owner == null && t.id !== currentTile.id);
    if (candidates.length === 0) {
      this.onLog('飛べる空き地がありません');
      return false;
    }
    const highValue = this._cpuHighValueEmptyLands(candidates);
    let target;
    if (player.isCPU && highValue.length > 0) {
      target = highValue[0];
    } else {
      let bestDist = Infinity;
      for (const t of candidates) bestDist = Math.min(bestDist, this._tileDistance(currentTile.id, t.id));
      const nearest = candidates.filter((t) => this._tileDistance(currentTile.id, t.id) === bestDist);
      target = nearest[Math.floor(Math.random() * nearest.length)];
    }

    player.previousTileId = null;
    player.tileId = target.id;
    if (player.mesh) player.mesh.position.set(target.position.x, PIECE_REST_Y, target.position.z);
    this.onLog(`${player.name}は「ブルーオーシャン」で空き地に飛んだ！`);
    this._notifyState();

    await this._runLandCommand(player);
    await delay(400);
    // ターン送りは人間/CPUそれぞれの呼び出し元で、スペル演出を完全に
    // 閉じた後に一度だけ行う。ここで進めると次プレイヤーのUIを直前の
    // onSpellCompleteが消し、操作不能や二重ターン送りの原因になる。
    return true;
  }

  /** 帰巣本能: 選んだプレイヤーをゴールへ戻して250Gを渡す。ゴール処理は
   * 通常移動と同じ_grantGoalBonusへ集約し、全CP通過済みの場合だけ周回
   * ボーナスを追加する（未通過なら250Gのみ）。 */
  async _spellReturnPlayerToStart(player, reward = 250) {
    if (!player) return;
    const startTile = this.tiles[player.homeGoalTileId]
      ?? this.tiles.find((t) => t.type === TileType.START);
    if (!startTile) return;
    player.previousTileId = null;
    player.tileId = startTile.id;
    if (player.mesh) player.mesh.position.set(startTile.position.x, PIECE_REST_Y, startTile.position.z);
    player.currency += reward;
    this.onLog(`${player.name}は「帰巣本能」でゴールに戻り、+${reward}Gを獲得した！`);
    this._notifyState();
    await this._grantGoalBonus(player);
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
    if (showEffect) await this.onDamageEffect?.({
      tileId: tile.id,
      damage: amount,
      targetDied: unit.currentHp <= 0,
      targetName: unit.def.name,
    });

    if (unit.currentHp <= 0) {
      const owner = this.players.find((p) => p.id === tile.owner);
      const landLoss = this._captureLandLoss(owner, tile);
      tile.unit = null;
      tile.owner = null;
      tile.transparentCursed = false;
      this._repaintTileToElement(tile);
      this.onLog(`${owner.name}の${unit.def.name}は倒された`);
      await this._handleUnitDeath(unit, owner);
      await this._presentLandLoss(landLoss);
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
      const maxHp = this._baseStats(t.unit).hp;
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
  async _spellForceRelocateOneStep(player, targetTile, preferredDestinationId = null) {
    if (!targetTile?.unit) {
      this.onLog('対象が既にいません');
      return;
    }
    const unit = targetTile.unit;
    const unitOwner = this.players.find((p) => p.id === unit.ownerId);
    const candidates = this._moveCommandCandidates(targetTile, unitOwner).map(({ tile }) => tile);
    if (candidates.length === 0) {
      this.onLog('移動できるマスがありません');
      return;
    }
    const destId = preferredDestinationId != null && candidates.some((tile) => tile.id === preferredDestinationId)
      ? preferredDestinationId
      : await this.onPickAbilityTarget(
        candidates.map((t) => ({ ...this._browseTileSummary(t, player), label: `${ELEMENT_LABEL[t.element]}属性の土地へ強制移動` })),
      player.id,
    );
    if (destId == null) return;
    const destTile = this.tiles.find((t) => t.id === destId);
    unit.curses = []; // モンスターの呪いは一瞬でも移動すれば消滅する（防衛されて元の土地に戻った場合も含む）
    const sourceLandLoss = this._captureLandLoss(unitOwner, targetTile);
    const destinationLandGain = this._captureLandGain(unitOwner, destTile, { showAnyChange: true });
    const destinationOwner = destTile.owner != null ? this.players.find((p) => p.id === destTile.owner) : null;
    const destinationLandLoss = this._captureLandLoss(destinationOwner, destTile);

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
      this.onLog(`${unit.def.name}が${ELEMENT_LABEL[destTile.element]}属性の土地へ強制移動させられた`);
      await this._hopUnitIcon(mesh, targetTile.position, destTile.position);
      await this._presentLandLoss(sourceLandLoss);
      await this._presentLandGain(destinationLandGain);
    } else {
      const defenderPlayer = this.players.find((p) => p.id === destTile.owner);
      const defenderUnit = destTile.unit;
      const result = await this._runBattleScene(unit, unitOwner, defenderUnit, defenderPlayer, null, destTile);
      if (!result) return;
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
        this.onLog(`${unit.def.name}が強制移動の戦闘で土地を奪取した！`);
        await this._handleUnitDeath(defenderUnit, defenderPlayer);
        await this._hopUnitIcon(mesh, targetTile.position, destTile.position);
        await this._presentLandLoss(sourceLandLoss);
        await this._presentLandLoss(destinationLandLoss);
        await this._presentLandGain(destinationLandGain);
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
        await this._presentLandLoss(sourceLandLoss);
        if (!result.defenderSurvived) await this._presentLandLoss(destinationLandLoss);
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
    if (this._isCancelled || this.isBusy || !this.awaitingRoll) return;
    this.isBusy = true;
    this.awaitingRoll = false;
    this._notifyState();

    const player = this.currentPlayer;
    if (this.tutorialMode) {
      const key = player.isCPU ? 'cpu' : 'human';
      const fixed = this.tutorialDiceQueues?.[key]?.shift();
      if (fixed != null) steps = fixed;
      if (!player.isCPU) this.onTutorialEvent('roll', { steps });
    }
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
    if (this.storyEnded) return;
    this.onMoveComplete?.();
    await this._resolveSpecialTile(player);
    if (this.storyEnded) return;
    await this._runLandCommand(player);
    await delay(400);

    // 相手側が戦闘中の略奪特性等でマイナスになっている可能性もあるので、
    // 今操作したプレイヤーだけでなく全員をチェックする。
    for (const p of this.players) await this._resolveNegativeCurrency(p);
    if (this.storyEnded) return; // ストーリーモードで決着がついたらターン進行を止める

    this._nextTurn();
    await this._beginTurn();
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

  /** この盤面でドローしたカードのcatalogIdを記録する（「未知との遭遇」の未ドロー判定用）。 */
  _recordDraw(player, card) {
    if (card && player.drawnCatalogIds) player.drawnCatalogIds.add(catalogIdOf(card));
  }

  async _drawForTurn(player) {
    // チュートリアルのドロー台本: 指定catalogIdの1枚を山札から抜いて引かせる。
    // null（またはキュー切れ・見つからない）なら通常ドローに落ちる。
    let card = null;
    if (this.tutorialMode && this.tutorialDrawQueues) {
      const queue = this.tutorialDrawQueues[player.isCPU ? 'cpu' : 'human'];
      const wantedId = queue?.shift();
      if (wantedId) {
        const index = player.deck.drawPile.findIndex((c) => catalogIdOf(c) === wantedId);
        if (index >= 0) card = player.deck.drawPile.splice(index, 1)[0];
      }
    }
    card ||= player.deck.draw();
    if (!card) return;
    this._recordDraw(player, card);

    if (player.isCPU) {
      this.onLog(`${player.name}はカードを1枚引いた`);
    } else {
      await this.onCardReveal(card, player.id);
    }

    player.hand.push(card);
    this._notifyState();

    await this._enforceHandLimit(player);
  }

  /** 手札が上限以下になるまで、1枚ずつ捨て札選択を繰り返す。 */
  async _enforceHandLimit(player) {
    while (player.hand.length > HAND_LIMIT && !this._isCancelled) {
      let discarded;
      if (player.isCPU) {
        await delay(CPU_DECISION_MS);
        discarded = this._cpuChooseDiscard(player);
      } else {
        discarded = await this.onDiscardChoice(player.hand, player.id);
      }
      if (this._isCancelled || !discarded) return;
      player.hand = player.hand.filter((c) => c.id !== discarded.id);
      // 未知との遭遇は手札上限で捨てた時だけ消滅する。詠唱時は通常どおり
      // 捨て札へ入り、効果処理がそこから回収して手札へ戻す。
      if (catalogIdOf(discarded) !== 'encounterUnknown') this._discardUsedCard(player, discarded);
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
    // 不死鳥の剣は使うと手札に戻る＝1枚あれば十分。手札に2枚以上ある時は、
    // ダブりを最優先で1枚だけ捨てる（2枚持ち続けても腐るため。1枚は残す）。
    const fenixSwords = player.hand.filter((c) => catalogIdOf(c) === 'fushichoNoKen');
    if (fenixSwords.length >= 2) return fenixSwords[0];

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
    this._segmentPathIds = [];
    const originTileId = player.tileId;
    let movementSegmentOriginTileId = originTileId;
    const triggeredRunawayTiles = new Set();
    const destinationIds = this._forwardDestinationIds(player, steps);
    if (destinationIds.length) this.onMoveDestination({ tileIds: destinationIds, active: true });
    for (let i = 0; i < steps; i++) {
      const fromTile = this.tiles[player.tileId];
      const forward = fromTile.neighbors.filter((id) => id !== player.previousTileId);
      const options = forward.length > 0 ? forward : fromTile.neighbors;
      if (options.length === 0) break;
      // 分岐選択は経路計画時ではなく、駒が実際に分岐マスへ到着してから行う。
      // 対人ゲストは歩行アニメをpieceMove配信で再生するため、分岐マスに着く
      // までのセグメントを先に流し切ってから選択UIを出す。これをしないと
      // ゲスト画面では駒が手前に残ったまま分岐矢印だけが先に出てしまう。
      if (options.length > 1 && this._segmentPathIds.length > 0) {
        await this._broadcastPieceMove(player, movementSegmentOriginTileId);
        this._segmentPathIds = [];
        movementSegmentOriginTileId = player.tileId;
      }
      const remainingSteps = steps - i - 1;
      const nextId = options.length === 1 ? options[0] : await this._chooseNextTile(player, fromTile, options, remainingSteps);
      if (this._isCancelled || nextId == null) break;
      if (options.length > 1) {
        const narrowedIds = remainingSteps > 0
          ? this._forwardDestinationIdsFrom(player, nextId, fromTile.id, remainingSteps)
          : [nextId];
        this.onMoveDestination({ tileIds: destinationIds, active: false });
        this.onMoveDestination({ tileIds: narrowedIds, active: true });
        destinationIds.splice(0, destinationIds.length, ...narrowedIds);
      }
      const toTile = this.tiles[nextId];
      const canUndoBranch = options.length > 1 && !player.isCPU;
      const branchPreviousTileId = player.previousTileId;
      const branchPathLength = this._turnPathIds.length;
      const branchSegmentLength = this._segmentPathIds.length;
      const branchHistory = canUndoBranch ? [...player.tileHistory] : null;
      let branchUndoRequested = false;
      if (canUndoBranch) {
        this.onBranchUndo({
          active: true,
          playerId: player.id,
          onUndo: () => { branchUndoRequested = true; },
        });
      }
      player.previousTileId = player.tileId;
      player.tileId = nextId;
      this._turnPathIds.push(nextId);
      this._segmentPathIds.push(nextId);
      // バックファイア用の着地履歴（直近20マスだけ保持すれば十分）。
      player.tileHistory.unshift(nextId);
      if (player.tileHistory.length > 20) player.tileHistory.length = 20;
      await this._stepWithCamera(player, fromTile.position, toTile.position);

      // 分岐直後の移動中と着地後の短い猶予だけ、選択を取り消せる。
      // CP・ゴール・土地効果より前に戻すため、報酬などの副作用は発生しない。
      if (canUndoBranch) {
        await delay(600);
        this.onBranchUndo({ active: false, playerId: player.id });
        if (branchUndoRequested) {
          await this._stepWithCamera(player, toTile.position, fromTile.position);
          player.tileId = fromTile.id;
          player.previousTileId = branchPreviousTileId;
          this._turnPathIds.length = branchPathLength;
          this._segmentPathIds.length = branchSegmentLength;
          player.tileHistory = branchHistory;
          this.onMoveDestination({ tileIds: destinationIds, active: false });
          const restoredIds = this._forwardDestinationIds(player, steps - i);
          if (restoredIds.length) this.onMoveDestination({ tileIds: restoredIds, active: true });
          destinationIds.splice(0, destinationIds.length, ...restoredIds);
          i -= 1;
          continue;
        }
      }

      if (toTile.type === TileType.EVENT) await this._visitCheckpoint(player, toTile);

      if (toTile.type === TileType.START && i < steps - 1) {
        await this._grantGoalBonus(player);
        if (this.storyEnded) break;
      }


      // ⑧のKは通過した瞬間に対のKへ強制ワープする。最後の1歩でKへ
      // ちょうど止まった時だけ、転移後に次のサイコロ2倍を付与する。
      if (toTile.type === TileType.WARP && toTile.warpOnPass) {
        const exactStop = i === steps - 1;
        // 対人ゲストには「ここまで歩く→ワープ→残りを歩く」の順で配信する。
        // 先にwarpEffectだけ流すと、その後届く一括歩行で駒が入口へ戻ってしまう。
        // リセットするのは配信用のセグメント経路だけ。_turnPathIdsは土地コマンドの
        // 権限（このターンに通った自分の土地）に使うので、ワープを跨いでも
        // 通過済みの土地が対象から消えないよう1ターン分を保持し続ける。
        await this._broadcastPieceMove(player, movementSegmentOriginTileId);
        this._segmentPathIds = [];
        await this._resolveWarpTile(player, toTile, { doubleNextDice: exactStop });
        movementSegmentOriginTileId = player.tileId;
        player.skipWarpResolveTileId = player.tileId;
        if (!exactStop) {
          this.onMoveDestination({ tileIds: destinationIds, active: false });
          const updatedIds = this._forwardDestinationIds(player, steps - i - 1);
          if (updatedIds.length) this.onMoveDestination({ tileIds: updatedIds, active: true });
          destinationIds.splice(0, destinationIds.length, ...updatedIds);
        }
      }

      // 暴走マスを「通過」した場合だけ残り歩数を2～3追加する。追加後も通常の
      // 分岐選択を通るため、プレイヤーは進行方向を選べる。同じ暴走マスを
      // 1ターン中に周回して再通過しても無限加速しないよう1回限りにする。
      if (toTile.type === TileType.RUNAWAY && i < steps - 1 && !triggeredRunawayTiles.has(toTile.id)) {
        triggeredRunawayTiles.add(toTile.id);
        const bonusSteps = 2 + Math.floor(Math.random() * 2);
        steps += bonusSteps;
        this.onLog(`${player.name}は暴走マスを通過！ さらに${bonusSteps}マス進む！`);
        this.onMoveDestination({ tileIds: destinationIds, active: false });
        const updatedIds = this._forwardDestinationIds(player, steps - i - 1);
        if (updatedIds.length) this.onMoveDestination({ tileIds: updatedIds, active: true });
        destinationIds.splice(0, destinationIds.length, ...updatedIds);
      }

      // 強制停止の呪い（ほこら効果「右の頬をシバかれたら～」）: 自分の土地・
      // 同盟仲間の土地は素通りできるが、それ以外は通過中でもここで足を
      // 止められる（このターンの残りステップは消化しない）。
      if (this._isForcedStopFor(player, toTile)) {
        if (i < steps - 1) this.onLog(`${player.name}は強制停止の呪いで足を止めた！`);
        // ほこら由来（boolean true）の強制停止は、この土地で誰かを一度
        // 止めた時点で消費される。アリジゴク等の数値ID型の呪いは従来通り。
        if (toTile.forcedStopCursed === true) toTile.forcedStopCursed = false;
        break;
      }
    }
    this.onBranchUndo({ active: false, playerId: player.id });
    if (destinationIds.length) this.onMoveDestination({ tileIds: destinationIds, active: false });
    await this._broadcastPieceMove(player, movementSegmentOriginTileId);
  }

  /**
   * 対人戦のゲスト側は publicState のスナップでしか駒位置を知れず、移動が
   * 「ワープ」に見える。そこで確定した経路をまとめて1イベントで配信し、
   * ゲスト側で駒を1マスずつ動かせるようにする。通過ワープ（⑧のワームホール）
   * を跨ぐと歩行が分断されるため、配信単位は`_segmentPathIds`（ワープごとに
   * リセットされる区間）を使う - 土地コマンドの権限に使う`_turnPathIds`
   * （1ターン分を通しで保持）とは別物なので混同しないこと。
   * ローカルプレイ・ホスト自身では onPieceMove は実質no-op（relayable参照）。
   */
  async _broadcastPieceMove(player, originTileId) {
    const path = this._segmentPathIds;
    if (!path || path.length === 0) return;
    const posOf = (id) => {
      const t = this.tiles[id];
      return t ? { x: t.position.x, z: t.position.z } : null;
    };
    const from = posOf(originTileId);
    const points = path.map(posOf).filter(Boolean);
    if (!from || points.length === 0) return;
    await this.onPieceMove({ playerId: player.id, from, path: points });
  }

  /** 分岐をまだ選ばない状態で、残り歩数から到達し得る全タイルを列挙する。 */
  _forwardDestinationIds(player, steps) {
    return this._forwardDestinationIdsFrom(player, player.tileId, player.previousTileId, steps);
  }

  _forwardDestinationIdsFrom(player, currentId, previousId, steps) {
    let states = [{ currentId, previousId }];
    const destinations = new Set();
    for (let step = 0; step < steps; step++) {
      const nextStates = [];
      for (const state of states) {
        const tile = this.tiles[state.currentId];
        const forward = tile.neighbors.filter((id) => id !== state.previousId);
        const options = forward.length > 0 ? forward : tile.neighbors;
        for (const rawNextId of options) {
          // ⑧のワームホール（warpOnPass）は踏んだ瞬間に対岸へ飛ぶので、着地
          // 予測でも入口ではなく出口を辿る。_forwardTileDistance/_tileDistance
          // と同じ扱いに揃えないと、ワームホールを跨ぐ出目で「ここに止まる」
          // ハイライトが実際の着地マスとずれる。
          const entered = this.tiles[rawNextId];
          // ⑨のパラレルワールド（randomWarp）は飛び先がランダムなので着地点を
          // 予測できない。踏んだ時点で行き先が決まる＝この先は辿らず、マス自身を
          // 終着として見せる。辿ってしまうと、実際には絶対に止まれないマス
          // （渦の中心の無属性マス等）がハイライトされてしまう。
          if (entered?.warpOnPass && entered.randomWarp) {
            destinations.add(rawNextId);
            continue;
          }
          const warped = !!(entered?.warpOnPass && entered.warpTargetId != null);
          const nextId = warped ? entered.warpTargetId : rawNextId;
          const nextTile = this.tiles[nextId];
          if (this._isForcedStopFor(player, nextTile) || step === steps - 1) {
            destinations.add(nextId);
          } else {
            // 転移後は「来た道」の概念が消える（_resolveWarpTileと同じ）。
            nextStates.push({ currentId: nextId, previousId: warped ? null : state.currentId });
          }
        }
      }
      states = nextStates;
      if (states.length === 0) break;
    }
    return [...destinations];
  }

  /**
   * バックファイア用: player.tileHistory（着地履歴、新しい順）を1つずつ
   * 遡ることで後退を再現する。通常の前進と違い分岐選択は発生しない
   * （来た道をそのまま戻るだけ）。履歴が尽きたらそこで止まる。ゴール
   * ボーナスは付与しない（後退でゴールを通り過ぎてもボーナスの対象外）。
   */
  async _movePlayerBackward(player, steps) {
    this._turnPathIds = [];
    this._segmentPathIds = [];
    const originTileId = player.tileId;
    const plannedPath = [];
    for (const tileId of player.tileHistory.slice(1, steps + 1)) {
      plannedPath.push(tileId);
      if (this._isForcedStopFor(player, this.tiles[tileId])) break;
    }
    const destinationId = plannedPath.at(-1);
    if (destinationId != null) this.onMoveDestination({ tileId: destinationId, active: true });
    for (let i = 0; i < steps; i++) {
      if (player.tileHistory.length < 2) break;
      const fromTile = this.tiles[player.tileId];
      player.tileHistory.shift();
      const backId = player.tileHistory[0];
      const toTile = this.tiles[backId];
      player.previousTileId = player.tileId;
      player.tileId = backId;
      this._turnPathIds.push(backId);
      this._segmentPathIds.push(backId);
      await this._stepWithCamera(player, fromTile.position, toTile.position);

      if (toTile.type === TileType.EVENT) await this._visitCheckpoint(player, toTile);

      if (this._isForcedStopFor(player, toTile)) {
        if (i < steps - 1) this.onLog(`${player.name}は強制停止の呪いで足を止めた！`);
        if (toTile.forcedStopCursed === true) toTile.forcedStopCursed = false;
        break;
      }
    }
    // バックファイアの後退はこの1ターンだけ。ループ内でprevousTileIdが「1つ前方
    // （ゴール方向）」を指したままだと、次の前進で分岐判定がゴール方向を"戻る方向"
    // と誤認し、後退し続けてしまう。停止地点のさらに後ろのマスへ向けておくことで、
    // 次のサイコロから通常どおりゴール方向へ進み直せるようにする。
    player.previousTileId = player.tileHistory[1] ?? null;
    if (destinationId != null) this.onMoveDestination({ tileId: destinationId, active: false });
    this._broadcastPieceMove(player, originTileId);
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
      this._notifyState();
      // CP未通過なら周回ボーナスは付かないが、勝利条件は「目標総資産に
      // 到達した状態でゴールへ戻る」こと。以前はここでreturnしていたため、
      // 土地価値などで既に目標へ到達したプレイヤーがゴールを踏んでも
      // 決着しなかった。ボーナス判定とは独立して必ず勝利判定を行う。
      if (await this._checkGoalAchievement(player)) return;
      await delay(900);
      return;
    }
    const { base, land, total } = this._computeLapBonus(player);
    player.currency += total;
    player.lapsCompleted += 1;
    this.onLog(`${player.name}はゴールを通過！ +${total}G（基本${base}G＋領地${land}G）`);
    await this.onGoalBonus({ playerId: player.id, playerName: player.name, amount: total });
    if (this.requireAllCheckpoints) player.passedCheckpoints.clear();

    // 宝くじ: 次のゴール通過で0〜500Gをランダム獲得する権利（100G刻み、500Gだけ確率10%）。
    if (player.lotteryOnNextGoal) {
      player.lotteryOnNextGoal = false;
      const roll = Math.random();
      const lotteryAmount = roll < 0.1 ? 500 : Math.floor(Math.random() * 5) * 100;
      player.currency += lotteryAmount;
      this.onLog(`${player.name}は宝くじで${lotteryAmount}Gを獲得した！`);
    }
    await this._maybeTradeOfudaAtGoal(player);
    this._notifyState();
    if (await this._checkGoalAchievement(player)) return;
    await delay(900);
  }

  async _maybeTradeOfudaAtGoal(player) {
    if (!this.hasOfuda || this._isCancelled) return;
    if (player.isCPU) {
      await this._cpuMaybeTradeOfuda(player);
      return;
    }
    for (;;) {
      const trade = await this.onOfudaMarket({
        playerName: player.name,
        currency: player.currency,
        holdings: player.ofuda || {},
        market: this._ofudaMarketSummary(),
      }, player.id);
      if (this._isCancelled || !trade || trade.action === 'close') return;
      const element = trade.element;
      if (!OFUDA_ELEMENTS.includes(element)) continue;
      if (trade.action === 'buy') {
        const budget = Math.max(0, Math.floor(Number(trade.amountG) || 0));
        const price = this._ofudaPrice(element);
        const count = price > 0 ? Math.floor(Math.min(budget, player.currency) / price) : 0;
        if (count <= 0) { this.onLog('購入できるお札がありません'); continue; }
        const spent = count * price;
        const before = this._applyOfudaTradePressure(element, spent, 'buy');
        player.currency -= spent;
        player.ofuda[element] = (player.ofuda[element] || 0) + count;
        this.onLog(`${player.name}は${ELEMENT_LABEL[element]}のお札を${count}枚購入した (-${spent}G)`);
        this._notifyState();
        await this._presentOfudaPriceChange(element, before);
      } else if (trade.action === 'sell') {
        const result = this._sellOfuda(player, element, Number(trade.count) || 0);
        if (result.sold <= 0) { this.onLog('売却できるお札がありません'); continue; }
        this.onLog(`${player.name}は${ELEMENT_LABEL[element]}のお札を${result.sold}枚売却した (+${result.revenue}G)`);
        this._notifyState();
        await this._presentOfudaPriceChange(element, result.before);
      }
    }
  }

  async _cpuMaybeTradeOfuda(player) {
    const market = this._ofudaMarketSummary().filter((entry) => entry.price > 0);
    if (market.length === 0 || player.currency < 200) return;
    const ownedElements = new Set(this._ownedTiles(player).map((tile) => tile.element));
    const preferred = market
      .filter((entry) => ownedElements.has(entry.element))
      .sort((a, b) => b.price - a.price)[0] || market.sort((a, b) => a.price - b.price)[0];
    const budget = Math.min(400, Math.floor(player.currency / 2));
    const count = Math.floor(budget / preferred.price);
    if (count <= 0) return;
    const spent = count * preferred.price;
    const before = this._applyOfudaTradePressure(preferred.element, spent, 'buy');
    player.currency -= spent;
    player.ofuda[preferred.element] = (player.ofuda[preferred.element] || 0) + count;
    this.onLog(`${player.name}は${ELEMENT_LABEL[preferred.element]}のお札を${count}枚購入した (-${spent}G)`);
    this._notifyState();
    await this._presentOfudaPriceChange(preferred.element, before);
  }

  async _checkGoalAchievement(player) {
    if (this.storyEnded || this.goalCurrency == null || this._totalAssetsOf(player) < this.goalCurrency) return false;
    // チュートリアルは練習の場: CPUが先に目標へ届いても決着させない
    // （通常AIは土地を強気に強化するため、放っておくと2周程度で2000Gに
    // 達してレッスン途中のプレイヤーを置き去りに終了してしまう）。
    // プレイヤー自身の達成だけがレッスン①の文章どおり勝利になる。
    if (this.tutorialMode && player.isCPU) return false;
    this.storyEnded = true;
    this.awaitingRoll = false;
    this.isBusy = true;
    this._notifyState();
    await this.onGoalAchieved({
      playerId: player.id,
      playerName: player.name,
      totalAssets: this._totalAssetsOf(player),
      goalCurrency: this.goalCurrency,
      position: this.tiles[player.tileId]?.position ?? null,
    });
    this.onLog(`${player.name}は目標総資産${this.goalCurrency}Gを達成した！`);
    if (this.storyMode) {
      const winnerSideHasHuman = this.players.some((candidate) =>
        !candidate.isCPU && (candidate.id === player.id || (player.allianceId != null && candidate.allianceId === player.allianceId)),
      );
      // 決着後の報酬保存・画面遷移が完了するまで、このGameの非同期処理を
      // 生かしたまま待つ。特に対人戦では終了処理を投げっぱなしにすると、
      // 古いターン処理が盤面へ触り続けることがある。
      await this.onStoryBattleEnd?.({
        won: winnerSideHasHuman,
        winnerPlayerId: player.id,
        alivePlayerIds: this.players.filter((candidate) => !candidate.defeated).map((candidate) => candidate.id),
      });
    }
    return true;
  }

  /** 初めて通過したCPだけボーナス（マップ依存、既定100G／④⑤⑥は150G）を付与し、残り番号を案内して一瞬停止する。 */
  async _visitCheckpoint(player, tile) {
    if (player.passedCheckpoints.has(tile.id)) return;
    player.passedCheckpoints.add(tile.id);
    const bonus = this.checkpointBonus ?? 100;
    player.currency += bonus;
    const remaining = this.tiles
      .filter((candidate) => candidate.type === TileType.EVENT && !player.passedCheckpoints.has(candidate.id))
      .map((candidate) => candidate.checkpointNumber);
    const guidance = remaining.length
      ? `残りのCPは${remaining.map((number) => `${number}番`).join('、')}です`
      : 'すべてのCPを通過しました。ゴールしてください';
    this.onLog(`${player.name}はCP${tile.checkpointNumber}を通過！ +${bonus}G　${guidance}`);
    await this.onCheckpoint({ playerId: player.id, playerName: player.name, checkpointNumber: tile.checkpointNumber });
    this._notifyState();
    await delay(900);
  }

  /**
   * 配置されたモンスターは、所有者・属性を問わず周回ごとに最大基礎HPの
   * 10%回復する（全プレイヤー共通のルール）。チェックポイント未達成で
   * ボーナス無しの周回でも、ゴールを通過したこと自体は変わらないので
   * 回復は適用する。回復の上限は「基礎HP」＝素のdef.hp＋永続呪いの加算まで
   * とし、同属性ボーナス（土地レベル×10）は含めない＝基礎HPを超えて回復
   * させない。
   * メカニックマソ: 自分の盤面のどこかに配置されていれば、自分が所有する
   * 雷属性モンスターだけこの汎用10%にさらに+10%上乗せされる（合計20%）。
   */
  _healOwnedUnitsOnLap(player) {
    const hasMechanicMaso = this._hasAllyOnBoard(player.id, 'mechanicMaso');
    for (const t of this._ownedTiles(player)) {
      if (!t.unit) continue;
      const mechanicMasoBonus = hasMechanicMaso && t.unit.def.element === Element.THUNDER;
      const lapHealMultiplier = t.unit.def.effect?.type === 'lapHealMultiplier'
        ? Number(t.unit.def.effect.multiplier || 1)
        : 1;
      const healRatio = (mechanicMasoBonus ? 0.2 : 0.1) * lapHealMultiplier;
      // 上限は基礎HP（同属性ボーナスは含めない）。
      const maxHp = this._baseStats(t.unit).hp;
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
    const permanentForcedStop = tile.unit?.def?.traits?.includes('permanentForcedStop');
    if (permanentForcedStop && tile.type === TileType.LAND && tile.owner != null) {
      if (tile.owner === player.id) return false;
      const owner = this.players.find((p) => p.id === tile.owner);
      if (owner?.allianceId != null && owner.allianceId === player.allianceId) return false;
      return true;
    }
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
  async _chooseNextTile(player, fromTile, optionIds, remainingSteps = 0) {
    // チュートリアルは台本進行を守るため分岐を自動選択する（このマップで
    // 分岐が出るのはスタート地点の初回だけ。id最小＝時計回り側で固定）。
    if (this.tutorialMode) return Math.min(...optionIds);
    if (player.isCPU) return this._cpuChooseNextTile(player, optionIds);

    const options = optionIds.map((id) => {
      const tile = this.tiles[id];
      const dgx = tile.gridX - fromTile.gridX;
      const dgz = tile.gridZ - fromTile.gridZ;
      const screenDir = dgx === 1 ? 'downright' : dgx === -1 ? 'upleft' : dgz === 1 ? 'downleft' : 'upright';
      const previewTileIds = remainingSteps > 0
        ? this._forwardDestinationIdsFrom(player, id, fromTile.id, remainingSteps)
        : [id];
      return { tileId: id, screenDir, previewTileIds, remainingSteps: remainingSteps + 1 };
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
    // 全CPU共通: 未通過CPがあればCP、全CP通過後はゴールを絶対優先。
    // 同属性空き地・高額土地・個別AI判断は、その最短経路が同点の時だけ
    // タイブレークとして使う。
    const isDanball = this._isDanballBoss(player);
    const checkpointTarget = this._nearestUnpassedCheckpointTileId(player);
    const target = checkpointTarget ?? this._nearestGoalTileId(player);
    // 次点の誘導先（最短チェックポイント/ゴールへの距離が同点の分岐同士の
    // タイブレークに使う）。ダンボール男は「道中でギアを置ける空き地」を最優先
    // で狙い、置けるギアが無い時だけ通常の同属性空き地へ寄る。それ以外のCPUは
    // 従来どおり同属性空き地。
    const gearLandTarget = isDanball ? this._nearestGearPlaceableEmptyLandTileId(player) : null;
    const matchingElementTarget = this._nearestSummonableMatchingEmptyLandTileId(player);
    const secondaryTarget = isDanball ? (gearLandTarget ?? matchingElementTarget) : matchingElementTarget;
    const leadingOniku = player.name === '暴君マダイ' ? this._leadingOnikuOpponent(player) : null;
    const onikuLands = leadingOniku ? this.tiles.filter((tile) => tile.owner === leadingOniku.id) : [];
    const scores = optionIds.map((id) => {
      const tile = this.tiles[id];
      // 分岐へ来た方向へ即座に引き返す経路を「最短」と誤認しないよう、
      // 選択後の進行方向を含む状態で距離を測る。
      const distance = target == null ? 0 : this._forwardTileDistance(id, player.tileId, target);
      // CP/ゴールへの1マス差を他の加点では覆せない大きさにする。
      let score = -distance * 10000;
      // CP/ゴールまで同じ距離の分岐同士では、次点の誘導先（ダンボール男は
      // ギアを置ける空き地、それ以外は召喚できる同属性空き地）へ近づく方向を
      // 優先する。※チェックポイント/ゴールへの最短(×10000)は絶対に覆さない。
      if (secondaryTarget != null) {
        const secondaryDistance = this._forwardTileDistance(id, player.tileId, secondaryTarget);
        if (Number.isFinite(secondaryDistance)) score -= secondaryDistance * 10;
      }
      if (isDanball) {
        // CP→ゴールへの距離は絶対優先。同じ最短距離の方向だけで、ギアを
        // 置ける空地、その次に通常モンスターを置ける空地をタイブレークに使う。
        if (tile.type === TileType.LAND && tile.owner == null) {
          const hasGear = player.hand.some((card) =>
            card.type === CardType.MONSTER
            && ['kodaiNoGearA', 'kodaiNoGearB', 'kodaiNoGearC'].includes(catalogIdOf(card))
            && player.currency >= (card.cost || 0));
          const hasMonster = player.hand.some((card) => card.type === CardType.MONSTER && player.currency >= (card.cost || 0));
          if (hasGear) score += 0.2;
          else if (hasMonster) score += 0.1;
        }
        return score;
      }
      if (leadingOniku && onikuLands.length > 0) {
        const onikuDistance = Math.min(...onikuLands.map((land) => this._forwardTileDistance(id, player.tileId, land.id)));
        if (Number.isFinite(onikuDistance)) score += Math.max(0, 4 - onikuDistance * 0.5);
        if (tile.owner === leadingOniku.id) score += 10;
      }
      if (player.name === '「彼」' && tile.type === TileType.LAND && tile.owner == null) {
        const preferredGodId = tile.element === Element.WATER ? 'suijin' : tile.element === Element.FOREST ? 'yamagami' : null;
        if (preferredGodId && player.hand.some((card) => catalogIdOf(card) === preferredGodId)) score += 0.25;
      }
      if (tile.owner == null && tile.level >= 2) score += 12 + tile.level * 3;
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
      return score;
    });
    // 目標への最短経路を必ず選ぶ。旧実装の重み付き抽選では、ステージ2等で
    // CPから遠ざかる分岐を確率で選んでしまっていた。同点だけ抽選する。
    const bestScore = Math.max(...scores);
    const bestIds = optionIds.filter((_, index) => scores[index] === bestScore);
    return bestIds[Math.floor(Math.random() * bestIds.length)];
  }

  /** 今向かうべき目標タイルid: 全チェックポイント制のマップでまだ未通過のものがあればその中で一番近いもの、そうでなければゴール（START）。目標が存在しないマップ構成ならnull。 */
  _nearestGoalTileId(player) {
    if (this.requireAllCheckpoints) {
      const unpassed = this.tiles.filter((t) => t.type === TileType.EVENT && !player.passedCheckpoints.has(t.id));
      if (unpassed.length > 0) {
        let best = unpassed[0];
        let bestDist = this._forwardTileDistance(player.tileId, player.previousTileId, best.id);
        for (const t of unpassed.slice(1)) {
          const d = this._forwardTileDistance(player.tileId, player.previousTileId, t.id);
          if (d < bestDist) {
            best = t;
            bestDist = d;
          }
        }
        return best.id;
      }
    }
    const goals = this.tiles.filter((t) => t.type === TileType.START);
    if (goals.length === 0) return null;
    let best = goals[0];
    let bestDist = this._forwardTileDistance(player.tileId, player.previousTileId, best.id);
    for (const goal of goals.slice(1)) {
      const distance = this._forwardTileDistance(player.tileId, player.previousTileId, goal.id);
      if (distance < bestDist) { best = goal; bestDist = distance; }
    }
    return best.id;
  }

  /** 未通過CPのうち、現在の進行状態から最短のもの。無ければnull。 */
  _nearestUnpassedCheckpointTileId(player) {
    if (!this.requireAllCheckpoints) return null;
    const candidates = this.tiles.filter(
      (tile) => tile.type === TileType.EVENT && !player.passedCheckpoints.has(tile.id),
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((best, tile) => {
      const distance = this._forwardTileDistance(player.tileId, player.previousTileId, tile.id);
      const bestDistance = this._forwardTileDistance(player.tileId, player.previousTileId, best.id);
      return distance < bestDistance ? tile : best;
    }).id;
  }

  /**
   * 手札にある、コスト・連鎖条件を満たした火/水/森/雷モンスターと同属性の
   * 空き地から最短のものを返す。無属性モンスターと無属性土地は対象外。
   */
  _nearestSummonableMatchingEmptyLandTileId(player) {
    const elemental = new Set([Element.FIRE, Element.WATER, Element.FOREST, Element.THUNDER]);
    const summonableElements = new Set(
      this._affordableMonsterCards(player)
        .map((card) => card.element)
        .filter((element) => elemental.has(element)),
    );
    if (summonableElements.size === 0) return null;
    const candidates = this.tiles.filter(
      (tile) => tile.type === TileType.LAND
        && tile.owner == null
        && summonableElements.has(tile.element),
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((best, tile) => {
      const distance = this._forwardTileDistance(player.tileId, player.previousTileId, tile.id);
      const bestDistance = this._forwardTileDistance(player.tileId, player.previousTileId, best.id);
      if (distance !== bestDistance) return distance < bestDistance ? tile : best;
      // 同距離なら、その属性の召喚可能カードが多い方を優先する。
      const countFor = (element) => this._affordableMonsterCards(player)
        .filter((card) => card.element === element).length;
      return countFor(tile.element) > countFor(best.element) ? tile : best;
    }).id;
  }

  /**
   * ダンボール男専用: 手札に召喚可能なギア（古代のギアA/B/C）がある時、
   * それを置ける空き地のうち最短のtile idを返す。ギアは無属性なので属性は
   * 不問＝全ての空き地が対象。ギアが無い/空き地が無いならnull。分岐選択で
   * 「道中の空き地へ寄ってギアを置く（合体ロボ・ガシャーン狙い）」方向を
   * 次点で優先するために使う（未回収チェックポイント/ゴールへの最短は絶対優先）。
   */
  _nearestGearPlaceableEmptyLandTileId(player) {
    const GEAR_IDS = ['kodaiNoGearA', 'kodaiNoGearB', 'kodaiNoGearC'];
    const hasAffordableGear = player.hand.some(
      (c) => c.type === CardType.MONSTER && GEAR_IDS.includes(catalogIdOf(c)) && (c.cost || 0) <= player.currency,
    );
    if (!hasAffordableGear) return null;
    const candidates = this.tiles.filter((t) => t.type === TileType.LAND && t.owner == null);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, tile) => {
      const distance = this._forwardTileDistance(player.tileId, player.previousTileId, tile.id);
      const bestDistance = this._forwardTileDistance(player.tileId, player.previousTileId, best.id);
      return distance < bestDistance ? tile : best;
    }).id;
  }

  /** 暴君マダイ専用: お肉が生存者の総資産1位（同率含む）なら返す。 */
  _leadingOnikuOpponent(player) {
    const oniku = this.players.find((candidate) => !candidate.defeated && candidate.id !== player.id && candidate.name === 'お肉');
    if (!oniku) return null;
    const topAssets = Math.max(...this.players.filter((candidate) => !candidate.defeated).map((candidate) => this._totalAssetsOf(candidate)));
    return this._totalAssetsOf(oniku) >= topAssets ? oniku : null;
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
        const ownerName = this.players.find((p) => p.id === tile.owner)?.name ?? '';
        this.scene.updateUnitIcon?.(tile.unitMesh, {
          hp: tile.unit.currentHp,
          maxHp: tile.unit.def.hp,
          toll: this._tollOfTile(tile),
          ownerName,
        });
        if (tile.ownerLabelMesh) {
          this.scene.removeOwnerLabel?.(tile.ownerLabelMesh);
          tile.ownerLabelMesh = null;
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
      if (player.skipWarpResolveTileId === tile.id) player.skipWarpResolveTileId = null;
      else await this._resolveWarpTile(player);
    } else if (tile.type === TileType.RUNAWAY) {
      await this._resolveRunawayTile(player);
    } else if (tile.type === TileType.DEFAMATION) {
      await this._resolveDefamationTile(player);
    }

    if (tile.type === TileType.START || tile.type === TileType.EVENT) {
      this.onLog(`${player.name}は${tile.type === TileType.START ? 'ゴール' : `CP${tile.checkpointNumber}`}にちょうど停止！ このターンは保有するすべての土地で土地コマンドを使えます`);
      await delay(900);
    }

    await delay(200);
  }

  /** 誹謗中傷マス: EXスペル「開示請求」を手札へ直接1枚加える。 */
  async _resolveDefamationTile(player) {
    const definition = SPELL_CATALOG.disclosureRequest;
    const card = {
      ...definition,
      id: `defamation-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      generatedOutsideDeck: true,
    };
    player.hand.push(card);
    this.onLog(`${player.name}は誹謗中傷を受け、「開示請求」を1枚手札に加えた！`);
    this._notifyState();
    await this.onTargetEffect?.({
      tileId: player.tileId,
      position: this.tiles[player.tileId]?.position || null,
      message: '誹謗中傷\n「開示請求」を手札に加えた！',
    });
    await this._enforceHandLimit(player);
  }

  /**
   * ショップマス: offers 3 random catalog cards (paid for with in-battle G,
   * added straight to hand). This is intentionally disconnected from
   * character.ownedCards - it's a one-match-only pickup, not a permanent
   * acquisition, so it must never touch the persistent collection (that's
   * the hub's ショップ screen's job, a completely separate system).
   */
  async _resolveShopTile(player) {
    // ストーリー報酬・NPC専用カード（ペーの杖/未知との遭遇/開示請求/タフネス/
    // 強制成仏）はショップに並べない。報酬として渡す意味が無くなるうえ、
    // ペーの杖は20GのEX武器なので実質バグ価格になっていた。
    const sellable = getCardCatalog().filter((c) => c.cost != null && !isRewardOnlyCard(c));
    let card = null;
    if (player.isCPU) {
      card = this._chooseCpuShopPurchase(player, sellable);
      if (!card) {
        this.onLog(`${player.name}はショップを見送った`);
        return;
      }
    } else {
      const options = randomSample(sellable, SHOP_OPTION_COUNT);
      card = await this.onShopPurchase(options, player.currency, player.id);
      if (!card) return;
    }
    if (player.currency < card.cost) {
      if (!player.isCPU) this.onLog('ゴールドが足りません');
      return;
    }
    player.currency -= card.cost;
    player.hand.push({
      ...card,
      id: `shop-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      generatedOutsideDeck: true,
    });
    this.onLog(`${player.name}はショップで「${card.name}」を購入した (-${card.cost}G)`);
    this._notifyState();
    await this._enforceHandLimit(player);
  }

  _chooseCpuShopPurchase(player, sellable) {
    const requiredTypes = [CardType.MONSTER, CardType.GEAR, CardType.SPELL];
    const handTypes = new Set((player.hand || []).map((card) => card.type));
    const missingTypes = requiredTypes.filter((type) => !handTypes.has(type));
    // モンスター・アイテム・スペルの3種類が手札に揃っているなら買わない。
    if (missingTypes.length === 0) return null;
    // 召喚と同じく、買った後も「一番高い敵地の通行料」を払える備えを残す
    // （_cpuSummonReserve参照）。残さないと高額地の直前で散財して破産する。
    const reserve = this._cpuSummonReserve(player);
    const affordable = sellable.filter((card) => missingTypes.includes(card.type)
      && player.currency - card.cost >= reserve);
    if (affordable.length === 0) return null;
    return randomSample(affordable, 1)[0] || null;
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
    const result = effect.call(this, player);
    this._notifyState();
    const shrineTile = this.tiles[player.tileId];
    await this.onShrineEffect({
      playerId: player.id,
      position: result?.position || shrineTile?.position || null,
      title: 'マダイの福音書',
      message: result?.message || '不思議な力が発動した！',
    });
  }

  /** 混沌を愛せ: 発動したプレイヤーの手札を全て捨て、デッキ（山札+捨札）を丸ごと再シャッフルしてから5枚引き直す。 */
  _shrineChaos(player) {
    const message = '「混沌を愛せ」\n手札をすべて捨て、5枚引き直した！';
    this.onLog(message.replace('\n', '……'));
    for (const card of player.hand) this._discardUsedCard(player, card);
    player.hand = [];
    player.deck.resetShuffle();
    for (let i = 0; i < 5; i++) {
      const card = player.deck.draw();
      if (card) { player.hand.push(card); this._recordDraw(player, card); }
    }
    return { message };
  }

  /** 力こそパワー: 盤上に配置中の全モンスターから1体をランダムに選び、「倍化」という名の永続呪い（基礎ATKと同じ量を加算＝基礎ATKが実質2倍）をかける。盤上にモンスターが1体もいなければ不発。 */
  _shrineDoubleAtk() {
    const candidates = this.tiles.filter((t) => t.unit != null);
    if (candidates.length === 0) {
      const message = '「力こそパワー」\nしかし対象のモンスターがいなかった';
      this.onLog(message.replace('\n', '……'));
      return { message };
    }
    const tile = candidates[Math.floor(Math.random() * candidates.length)];
    const unit = tile.unit;
    applyCurse(unit, { name: '倍化', addedAtk: unit.def.atk, addedHp: 0 });
    const message = `「力こそパワー」\n${unit.def.name}の基礎ATKが倍になった！`;
    this.onLog(message.replace('\n', '……'));
    return { message, position: tile.position };
  }

  /** 速度違反はご愛嬌: 次のプレイヤー人数分の手番、サイコロフェーズを飛ばして強制的にFORCED_DICE_STEPS進ませる（_beginTurn参照）。 */
  _shrineForcedDice() {
    const message = `「速度違反はご愛嬌」\n次の一巡、全員のサイコロが${FORCED_DICE_STEPS}に固定！`;
    this.onLog(message.replace('\n', '……'));
    this.forcedDiceRemaining = this.players.length;
    return { message };
  }

  /** 右の頬をシバかれたら、左の頬をシバきなさい: 盤上に配置中の全モンスターの土地に強制停止の呪いをかける（自分の土地以外を素通りできなくなる。同盟仲間は対象外 - _isForcedStopFor参照）。各土地の呪いは誰かを一度停止させると消える。 */
  _shrineForcedStop() {
    const targets = this.tiles.filter((t) => t.unit != null);
    for (const tile of targets) tile.forcedStopCursed = true;
    const message = `「右の頬をシバかれたら、左の頬をシバきなさい」\n全モンスターの土地に強制停止の呪い！（${targets.length}箇所）`;
    this.onLog(message.replace('\n', '……'));
    return { message };
  }

  /**
   * ワープマス: ちょうど止まると対になるワープ先へ瞬間移動する（③の島、
   * および⑦の卍部分と下段直線を結ぶ唯一の行き来手段。
   * warpTargetIdはcreateBoardが構築時にリンク付け済み - board.js参照）。
   * 歩行のtween演出はせず、その場で座標をスナップする（「瞬間移動」の
   * 演出として意図的に一歩ずつ歩かせない）。ワープ後は移動元の概念が
   * 無くなるのでpreviousTileIdをリセットし、次の分岐では全方向が候補
   * になる。
   */
  async _resolveWarpTile(player, sourceTile = null, { doubleNextDice = false } = {}) {
    const tile = sourceTile ?? this.tiles[player.tileId];
    let targetTile = null;
    if (tile.randomWarp) {
      const candidates = this.tiles.filter((t) => t.id !== tile.id && t.type !== TileType.WARP);
      targetTile = candidates[Math.floor(Math.random() * candidates.length)] || null;
    } else {
      targetTile = this.tiles.find((t) => t.id === tile.warpTargetId);
    }
    if (!targetTile) return;
    await this.onWarpEffect({
      playerId: player.id,
      playerName: player.name,
      sourcePosition: tile.position,
      targetPosition: targetTile.position,
      label: tile.warpKind === 'parallel' ? 'パラレルワールド' : tile.warpKind === 'wormhole' ? 'ワームホール' : 'ワープ',
    });
    player.previousTileId = null;
    player.tileId = targetTile.id;
    if (player.mesh) player.mesh.position.set(targetTile.position.x, PIECE_REST_Y, targetTile.position.z);
    const warpLabel = tile.warpKind === 'parallel' ? 'パラレルワールド' : tile.warpKind === 'wormhole' ? 'ワームホール' : 'ワープ';
    this.onLog(`${player.name}は${warpLabel}で転移した！`);
    if (doubleNextDice) {
      player.diceCurse = { type: 'double' };
      this.onLog(`${player.name}はワームホールにちょうど停止！ 次のサイコロの出目が2倍になる！`);
    }
    this._notifyState();
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
    const landingOwner = tile.owner != null ? this.players.find((candidate) => candidate.id === tile.owner) : null;
    const isAlliedLand = landingOwner?.allianceId != null && landingOwner.allianceId === player.allianceId;
    const owesTollUnlessConquered = tile.type === TileType.LAND && tile.owner != null && tile.owner !== player.id && !isAlliedLand;
    const accessibleOwnedTiles = isAdmin
      ? this._ownedTiles(player)
      : [...new Set(this._turnPathIds)]
        .map((id) => this.tiles[id])
        .filter((candidate) => candidate?.type === TileType.LAND && candidate.owner === player.id);
    if (tile.type !== TileType.LAND && !isAdmin && accessibleOwnedTiles.length === 0) return;

    if (player.isCPU) {
      if (this.tutorialMode && await this._runTutorialCpuScript(player, tile)) {
        await this._settleLandingToll(player, tile, owesTollUnlessConquered);
        return;
      }
      if (tile.type === TileType.LAND && tile.owner !== player.id && !isAlliedLand) {
        await this._cpuLandCommand(player, tile);
      } else {
        // 人間と同じ権限範囲だけから、能力・移動・レベルアップを1つ選ぶ。
        await this._cpuUseAccessibleLandCommand(player, accessibleOwnedTiles);
      }
      await this._settleLandingToll(player, tile, owesTollUnlessConquered);
      return;
    }

    for (;;) {
      const choice = await this.onLandCommand(
        this.getTileSummary(tile),
        {
          // 聖域/透過の呪いがかかった敵地には侵略できない（_humanSummonFlowと
          // 同条件）ので、そもそも「侵略/召喚」項目自体を出さない。空き地召喚や
          // 自分の土地の入れ替えには影響しない。
          canSummon:
            tile.type === TileType.LAND &&
            !isAlliedLand &&
            !(tile.owner != null && tile.owner !== player.id && tile.transparentCursed) &&
            this._affordableMonsterCards(player).length > 0,
        },
        player.id,
      );
      if (this._isCancelled) return;
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
    const conquestKey = `${player.id}:${tile.id}`;
    if (this._conqueredLandingTiles?.delete(conquestKey)) {
      this.onLog(`${player.name}は侵略に成功したため通行料を支払わない`);
      return;
    }
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
    this.onTutorialEvent('toll', { playerId: player.id, amount: toll });
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
      if (this._isCancelled) return false;
      if (pickedId == null) return false;

      const tile = this.tiles[pickedId];
      for (;;) {
        const action = await this.onLandSubmenu(this._browseTileSummary(tile, player), player.id);
        if (this._isCancelled) return false;
        if (action == null || action === 'back') break;

        if (action === 'swap' && (await this._humanSummonFlow(player, tile))) return true;
        if (action === 'levelup' && (await this._humanLevelUpFlowForTile(player, tile))) return true;
        if (action === 'element' && (await this._humanChangeElementFlowForTile(player, tile))) return true;
        if (action === 'move' && (await this._humanMoveFlow(player, tile))) return true;
        if (action === 'ability' && (await this._humanAbilityFlow(player, tile))) return true;
        // cancelled sub-action - loop back to the submenu for this same tile
      }
    }
  }

  _browseTileSummary(tile, player) {
    return { ...this.getTileSummary(tile), isMine: tile.owner === player.id && tile.unit != null };
  }

  /**
   * めたんまん: 盤面に存在するモンスターの中から1体を選んで変身する
   * （基礎値のみコピーし、バフ・デバフは引き継がない＝新しいdefへの
   * 差し替えなので既存のcurses/itemsはそのまま、currentHpだけ変身後の
   * 素のHPにリセットする）。候補は手札・デッキ・図鑑ではなく、現在の盤面に
   * 実際に召喚されているモンスターだけ。対象がいなければ何もしない。
   */
  async _maybeCopyOnSummon(tile, player) {
    const targets = this.tiles.filter((t) => t.unit && t !== tile);
    if (targets.length === 0) return;

    // 盤面のモンスターをクリックさせるのではなく、変身先を「カード一覧」で
    // 提示して選ばせる（HP/ATK/先制等はrenderCardElがそのまま表示する）。
    // 同じモンスターが複数体いても基礎値コピーなので一覧では1件に統合する。
    const seen = new Set();
    const options = [];
    for (const t of targets) {
      const def = t.unit.def;
      const catId = catalogIdOf(def);
      if (seen.has(catId)) continue;
      seen.add(catId);
      options.push({ ...def, catalogId: catId, id: `metamorph-${catId}` });
    }

    // CPUは盤面上の候補から基礎HP+ATKが最も高い姿を選ぶ。人間と同様、
    // 盤面外のカード定義を変身先に混ぜない。
    const picked = player.isCPU
      ? [...options].sort((a, b) => (b.hp + b.atk) - (a.hp + a.atk))[0]
      : await this.onPickTransformTarget(options, player.id);
    if (!picked) return;
    const chosen = options.find((o) => o.id === picked.id) || picked;
    const chosenCatId = chosen.catalogId ?? catalogIdOf(chosen);

    // 基礎値のみコピー: めたんまんのインスタンスidは保持し、図鑑ID・各ステータス
    // ・特性（先制/貫通など）を変身先へ差し替える。現在HPも新しい基礎HPへ。
    // 入れ替え等で手札へ戻る時は、変身先ではなく元のめたんまんへ戻す。
    // 召喚時に捨て札へ入ったカードも元カードなので、その参照を保持する。
    tile.unit.originalDef ||= tile.unit.def;
    const newDef = { ...chosen, id: tile.unit.def.id, catalogId: chosenCatId };
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

  /** 生贄召喚（避雷針侍）: そのカード自身を除いて、捨てられる手札が足りているか。 */
  _meetsSacrificeRequirement(player, card) {
    if (!card.summonSacrifice) return true;
    return player.hand.filter((c) => c.id !== card.id).length >= card.summonSacrifice;
  }

  /**
   * 生贄召喚のコストを支払う。手札（召喚するカードは既に抜かれている前提）
   * から指定枚数を捨てる。人間は捨てる札を選び、CPUは手札上限と同じ基準で
   * 一番いらない札を出す。
   */
  async _paySummonSacrifice(player, card) {
    const count = card.summonSacrifice || 0;
    for (let i = 0; i < count; i++) {
      if (player.hand.length === 0 || this._isCancelled) return;
      const discarded = player.isCPU
        ? this._cpuChooseDiscard(player)
        : await this.onDiscardChoice(player.hand, {
            reason: 'summonSacrifice',
            sourceName: card.name,
            count,
          }, player.id);
      if (this._isCancelled || !discarded) return;
      player.hand = player.hand.filter((c) => c.id !== discarded.id);
      this._discardUsedCard(player, discarded);
      this.onLog(`${player.name}は${card.name}の生贄として「${discarded.name}」を捨てた`);
      this._notifyState();
    }
  }

  _affordableMonsterCards(player) {
    return player.hand.filter(
      (c) => c.type === CardType.MONSTER && c.cost <= player.currency
        && this._meetsChainRequirement(player, c) && this._meetsSacrificeRequirement(player, c),
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

  _captureLandLoss(ownerPlayer, tile) {
    if (!ownerPlayer || !tile || tile.owner !== ownerPlayer.id || tile.element === Element.NEUTRAL) return null;
    return {
      player: ownerPlayer,
      element: tile.element,
      chainBefore: this._chainCount(ownerPlayer.id, tile.element),
      assetsBefore: this._totalAssetsOf(ownerPlayer),
    };
  }

  async _presentLandLoss(snapshot) {
    if (!snapshot) return;
    const { player, element, chainBefore, assetsBefore } = snapshot;
    const chainAfter = this._chainCount(player.id, element);
    if (chainAfter === chainBefore) return;
    await this.onLandLoss({
      playerId: player.id,
      playerName: player.name,
      landLabel: `${ELEMENT_LABEL[element]}の土地`,
      chainBefore,
      chainAfter,
      assetsBefore,
      assetsAfter: this._totalAssetsOf(player),
      position: this.tiles[player.tileId]?.position ?? null,
    });
  }

  /** 土地取得（召喚・侵略奪取）で連鎖が増える直前の状態を控える。土地の所有権を
   *  変える前に呼ぶこと。無色地は連鎖しないので対象外。 */
  /** 同盟（自分＋同盟仲間）が所有する全土地の地価合計。ソロなら自分の分のみ。
   *  連鎖ボーナスは同盟全体の地価上昇で測るため、この合計の増分を使う。 */
  _allianceLandValueOf(player) {
    const allianceId = player?.allianceId ?? null;
    return this.tiles
      .filter((t) => {
        if (t.owner == null) return false;
        if (t.owner === player.id) return true;
        if (allianceId == null) return false;
        const owner = this.players.find((p) => p.id === t.owner);
        return owner?.allianceId === allianceId;
      })
      .reduce((sum, t) => sum + this._landValueOfTile(t), 0);
  }

  _captureLandGain(player, tile, { showAnyChange = false } = {}) {
    if (!player || !tile || tile.element === Element.NEUTRAL) return null;
    return {
      player,
      element: tile.element,
      chainBefore: this._chainCount(player.id, tile.element),
      // 連鎖ボーナス＝連鎖で増えた総資産分。通貨（カード代・700G等）の増減を
      // 拾わないよう、総資産のうち土地価値だけの増分で測る。同盟戦では連鎖が
      // 同盟仲間の同属性地の地価も押し上げるので、同盟全体の地価増分で測る。
      landValueBefore: this._allianceLandValueOf(player),
      position: tile.position ? { x: tile.position.x, z: tile.position.z } : null,
      showAnyChange,
    };
  }

  /** 取得後に連鎖が実際に増えて2連鎖以上になった時だけ「◯連鎖→◯連鎖（連鎖ボーナス+◯G）」を見せる。 */
  async _presentLandGain(snapshot) {
    if (!snapshot) return;
    const { player, element, chainBefore, landValueBefore, position, showAnyChange } = snapshot;
    const chainAfter = this._chainCount(player.id, element);
    if (chainAfter <= chainBefore || (!showAnyChange && chainAfter < 2)) return;
    const chainBonus = Math.max(0, Math.round(this._allianceLandValueOf(player) - landValueBefore));
    await this.onLandChain({
      playerId: player.id,
      playerName: player.name,
      elementLabel: ELEMENT_LABEL[element],
      chainBefore,
      chainAfter,
      chainBonus,
      position,
    });
  }

  /** 連鎖倍率: 連鎖数をCHAIN_MULTIPLIERテーブルに当てはめる（地価/通行料計算専用）。無所有・無色は連鎖1扱い。 */
  _chainMultiplier(ownerId, element) {
    const count = this._chainCount(ownerId, element);
    return CHAIN_MULTIPLIER[Math.min(Math.max(count, 1), LEVEL_CAP)];
  }

  /** 連鎖を掛ける前の土地価値（基本地価＋累計レベルアップ投資額）。 */
  _baseLandValueOfTile(tile) {
    return tile.price + (LEVEL_INVESTMENT[tile.level] || 0);
  }

  /** 暴走マスにちょうど停止: もう一方へ飛ばし、次のサイコロを2倍にする。 */
  async _resolveRunawayTile(player) {
    const tile = this.tiles[player.tileId];
    const targetTile = this.tiles.find((candidate) => candidate.id === tile.runawayTargetId);
    if (!targetTile) return;
    await this.onWarpEffect({
      playerId: player.id,
      playerName: player.name,
      sourcePosition: tile.position,
      targetPosition: targetTile.position,
    });
    player.previousTileId = null;
    player.tileId = targetTile.id;
    if (player.mesh) player.mesh.position.set(targetTile.position.x, PIECE_REST_Y, targetTile.position.z);
    player.diceCurse = { type: 'double' };
    this.onLog(`${player.name}は暴走して反対側へ飛ばされ、次のサイコロの出目が2倍になった！`);
    await this.onTargetEffect?.({
      tileId: targetTile.id,
      position: targetTile.position,
      message: '次のサイコロの出目が2倍！',
    });
    this._notifyState();
  }

  /** 地価 = (基本地価 + 累計レベルアップ投資額) × 連鎖倍率。 */
  _landValueOfTile(tile) {
    return Math.round(this._baseLandValueOfTile(tile) * this._chainMultiplier(tile.owner, tile.element));
  }

  _ofudaBasePrice(element) {
    if (!this.hasOfuda || !OFUDA_ELEMENTS.includes(element)) return 0;
    const initialCount = Math.max(1, this.ofudaInitialCounts[element] || 0);
    const score = this.tiles
      .filter((tile) => tile.type === TileType.LAND && tile.element === element)
      .reduce((sum, tile) => sum + (OFUDA_LEVEL_SCORE[tile.level] ?? OFUDA_LEVEL_SCORE[1]), 0);
    if (score <= 0) return 0;
    return Math.round(OFUDA_MAX_PRICE * score / (initialCount * OFUDA_LEVEL_SCORE[LEVEL_CAP]));
  }

  _ofudaPrice(element) {
    if (!this.hasOfuda || !OFUDA_ELEMENTS.includes(element)) return 0;
    return Math.max(0, Math.min(OFUDA_MAX_PRICE, this._ofudaBasePrice(element) + Math.trunc(this.ofudaPressure[element] || 0)));
  }

  _ofudaMarketSummary() {
    if (!this.hasOfuda) return [];
    return OFUDA_ELEMENTS.map((element) => ({
      element,
      label: ELEMENT_LABEL[element],
      price: this._ofudaPrice(element),
      basePrice: this._ofudaBasePrice(element),
      pressure: Math.trunc(this.ofudaPressure[element] || 0),
    }));
  }

  _ofudaValueOf(player) {
    if (!this.hasOfuda) return 0;
    return OFUDA_ELEMENTS.reduce((sum, element) => (
      sum + (player.ofuda?.[element] || 0) * this._ofudaPrice(element)
    ), 0);
  }

  async _presentOfudaPriceChange(element, before) {
    const after = this._ofudaPrice(element);
    if (!this.hasOfuda || before === after) return;
    const message = `${ELEMENT_LABEL[element]}のお札：${before}G→${after}G`;
    this.onLog(message);
    await this.onTargetEffect?.({ playerId: this.currentPlayer?.id, message });
    await delay(1500);
  }

  _applyOfudaTradePressure(element, amountG, direction) {
    if (!this.hasOfuda || !OFUDA_ELEMENTS.includes(element) || !Number.isFinite(amountG) || amountG <= 0) return null;
    const before = this._ofudaPrice(element);
    const delta = amountG / OFUDA_TRADE_UNIT_G * (direction === 'sell' ? -1 : 1);
    this.ofudaPressure[element] = (this.ofudaPressure[element] || 0) + delta;
    return before;
  }

  _sellOfuda(player, element, count) {
    if (!this.hasOfuda || !OFUDA_ELEMENTS.includes(element)) return { sold: 0, revenue: 0, before: null };
    const owned = player.ofuda?.[element] || 0;
    const sold = Math.max(0, Math.min(owned, Math.floor(count)));
    if (sold <= 0) return { sold: 0, revenue: 0, before: null };
    const price = this._ofudaPrice(element);
    const revenue = sold * price;
    player.ofuda[element] = owned - sold;
    const before = this._applyOfudaTradePressure(element, revenue, 'sell');
    player.currency += revenue;
    return { sold, revenue, before };
  }

  /**
   * 本家同様、通行料にも連鎖倍率を直接適用する。
   * 通行料 = 連鎖前土地価値 × 連鎖倍率 × レベル別通行料率。
   * 透過の呪い（深海魚X）がかかった土地は通行料ゼロ。
   */
  _tollOfTile(tile) {
    if (tile.transparentCursed) return 0;
    let toll = Math.round(
      this._baseLandValueOfTile(tile)
        * this._chainMultiplier(tile.owner, tile.element)
        * TOLL_RATE[tile.level],
    );
    const monsterTollMultiplier = Number(tile.unit?.def?.effect?.tollMultiplier || 1);
    if (monsterTollMultiplier !== 1) toll = Math.round(toll * monsterTollMultiplier);
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
    const owner = tile.owner != null ? this.players.find((candidate) => candidate.id === tile.owner) : null;
    // 自分の所有地は同じallianceIdを持つのが当然なので、同盟仲間として
    // 拒否してはいけない。ここで自分まで弾くと同盟戦中だけ入れ替え不能になる。
    if (owner?.id !== player.id && owner?.allianceId != null && owner.allianceId === player.allianceId) {
      this.onLog('同盟仲間の土地には侵略できません');
      return false;
    }
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
    this._discardUsedCard(player, card);
    player.currency -= card.cost;
    // 生贄はG支払いと同じ「召喚コスト」なので、盤面へ出す前に必ず払わせる。
    await this._paySummonSacrifice(player, card);
    if (this._isCancelled) return false;

    if (actionType === 'summon' || actionType === 'swap') {
      if (actionType === 'swap' && tile.unit) {
        const returnedDef = tile.unit.originalDef || tile.unit.def;
        this._reclaimCardFromDeck(player, catalogIdOf(returnedDef));
        player.hand.push({
          ...returnedDef,
          id: `swap-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
      }
      const chainGain = this._captureLandGain(player, tile);
      this._placeUnit(tile, player, card);
      this.onLog(`${player.name}は${card.name}を${actionType === 'summon' ? '召喚' : '入れ替え'}した (-${card.cost}G)`);
      this._notifyState();
      await this.onSummonEffect?.({ tileId: tile.id, unitName: card.name });
      this.onTutorialEvent('summon', { playerId: player.id, tileId: tile.id, card });
      await this._presentLandGain(chainGain);
      if (card.effect?.type === 'copyOnSummon') {
        await this._maybeCopyOnSummon(tile, player);
      }
      await this._enforceHandLimit(player);
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

    const options = [];
    for (let targetLevel = tile.level + 1; targetLevel <= LEVEL_CAP; targetLevel += 1) {
      const cost = LEVEL_INVESTMENT[targetLevel] - LEVEL_INVESTMENT[tile.level];
      if (cost <= player.currency) options.push({ targetLevel, cost, label: `Lv${tile.level}→Lv${targetLevel}：${cost}G` });
    }
    if (options.length === 0) {
      this.onLog('ゴールドが足りません');
      return false;
    }
    const targetLevel = await this.onPickLevelUp({ currentLevel: tile.level, options }, player.id);
    if (targetLevel == null) return false;
    const previousLevel = tile.level;
    const tollBefore = this._tollOfTile(tile);
    const ofudaPriceBefore = this._ofudaPrice(tile.element);
    const cost = LEVEL_INVESTMENT[targetLevel] - LEVEL_INVESTMENT[tile.level];

    player.currency -= cost;
    tile.level = targetLevel;
    this.scene.updateTileLevelBorder(tile);
    this.onLog(`${player.name}は土地をLv${tile.level}にアップグレードした (-${cost}G)`);
    this._notifyState();
    await this.onLandLevelUp({
      playerId: player.id,
      playerName: player.name,
      tileId: tile.id,
      position: tile.position,
      element: tile.element,
      previousLevel,
      newLevel: tile.level,
      tollBefore,
      tollAfter: this._tollOfTile(tile),
    });
    await this._presentOfudaPriceChange(tile.element, ofudaPriceBefore);
    this.onTutorialEvent('levelUp', { playerId: player.id, tileId: tile.id, previousLevel, newLevel: tile.level });
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

    const oldElement = tile.element;
    const oldOfudaPrice = this._ofudaPrice(oldElement);
    const newOfudaPrice = this._ofudaPrice(newElement);
    player.currency -= cost;
    tile.element = newElement;
    this._repaintTileToElement(tile);
    this.onLog(`${player.name}は土地属性を${ELEMENT_LABEL[newElement]}に変更した (-${cost}G)`);
    this._notifyState();
    await this._presentOfudaPriceChange(oldElement, oldOfudaPrice);
    await this._presentOfudaPriceChange(newElement, newOfudaPrice);
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
  _moveCommandCandidates(tile, player) {
    const maxDistance = tile.unit?.def?.traits?.includes('twoStepMove') ? 2 : 1;
    const found = new Map();
    const queue = [{ id: tile.id, distance: 0, specialCount: 0 }];
    const visited = new Set([`${tile.id}:0`]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current.distance >= maxDistance) continue;
      for (const nextId of this.tiles[current.id].neighbors) {
        const next = this.tiles[nextId];
        if (!next) continue;
        const specialCount = current.specialCount + (next.type === TileType.LAND ? 0 : 1);
        // 酢だけは経路中の特殊マスを1つ飛び越えられる。ただし特殊マス自体は
        // 移動先にできず、2つ以上の特殊マスをまたぐこともできない。
        if (specialCount > (maxDistance === 2 ? 1 : 0)) continue;
        const distance = current.distance + 1;
        const stateKey = `${next.id}:${specialCount}`;
        if (!visited.has(stateKey)) {
          visited.add(stateKey);
          queue.push({ id: next.id, distance, specialCount });
        }
        if (next.type !== TileType.LAND || next.transparentCursed) continue;
        if (next.owner === player.id) continue;
        const owner = next.owner != null ? this.players.find((p) => p.id === next.owner) : null;
        if (owner?.allianceId != null && owner.allianceId === player.allianceId) continue;
        const previous = found.get(next.id);
        if (!previous || distance < previous.distance) found.set(next.id, { tile: next, distance });
      }
    }
    return [...found.values()];
  }

  async _humanMoveFlow(player, tile) {
    if (tile.unit?.def?.traits?.includes('immovableByMoveCommand')) {
      this.onLog(`${tile.unit.def.name}は通常の移動コマンドでは動かせません`);
      return false;
    }
    const candidateEntries = this._moveCommandCandidates(tile, player);
    const candidates = candidateEntries.map(({ tile: target }) => target);
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
    const isTwoStep = tile.unit?.def?.traits?.includes('twoStepMove');
    const targetId = isTwoStep
      ? await this.onPickAbilityTarget(
        candidateEntries.map(({ tile: target, distance }) => ({
          ...this._browseTileSummary(target, player),
          label: `${distance}マス先・${ELEMENT_LABEL[target.element]}属性の土地`,
        })),
        player.id,
      )
      : await this.onPickMoveDirection(options, player.id);
    if (targetId == null) return false;
    const targetTile = this.tiles.find((t) => t.id === targetId);

    const confirmed = await this.onConfirmMove(this.getTileSummary(targetTile), player.id);
    if (!confirmed) return false;
    this.onTutorialEvent('move', { playerId: player.id, fromTileId: tile.id, toTileId: targetTile.id, invasion: targetTile.owner != null });

    const attackerUnit = tile.unit;
    const attackerName = attackerUnit.def.name;
    attackerUnit.curses = []; // モンスターの呪いは一瞬でも移動すれば消滅する（防衛されて元の土地に戻った場合も含む）
    const sourceLandLoss = this._captureLandLoss(player, tile);
    const destinationLandGain = this._captureLandGain(player, targetTile, { showAnyChange: true });
    const destinationOwner = targetTile.owner != null ? this.players.find((p) => p.id === targetTile.owner) : null;
    const destinationLandLoss = this._captureLandLoss(destinationOwner, targetTile);

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
      await this._presentLandLoss(sourceLandLoss);
      await this._presentLandGain(destinationLandGain);
    } else {
      const defenderPlayer = this.players.find((p) => p.id === targetTile.owner);
      const defenderUnit = targetTile.unit;
      const result = await this._runBattleScene(attackerUnit, player, defenderUnit, defenderPlayer, null, targetTile);
      if (!result) return false;
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
        await this._presentLandLoss(sourceLandLoss);
        await this._presentLandLoss(destinationLandLoss);
        await this._presentLandGain(destinationLandGain);
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
        await this._presentLandLoss(sourceLandLoss);
        if (!result.defenderSurvived) await this._presentLandLoss(destinationLandLoss);
      }
    }
    this._notifyState();
    return true;
  }

  /** 強制売却リスト1件分のサマリー（売却額・配置モンスターのレアリティ込み）。 */
  _sellLandSummary(tile) {
    return {
      ...this.getTileSummary(tile),
      salePrice: Math.round(this._landValueOfTile(tile) / 2),
      unitRarity: tile.unit ? tile.unit.def.rarity : null,
    };
  }

  /**
   * 実際に土地を売却する（旧「土地を売る」コマンドの中身そのまま）。唯一
   * レベルをリセットする操作（それ以外は所有権を失ってもレベルは保持
   * されるのが確定仕様 - 売却だけが例外）。売却額は地価の半額。配置され
   * ていたモンスターは手札へ戻らず消滅する。呼び出し元
   * （_resolveNegativeCurrency）だけが使う内部処理で、確認ダイアログは
   * 挟まない（マイナスGの解消は任意ではなく必須のため）。
   */
  _sellLandTile(player, tile) {
    const salePrice = Math.round(this._landValueOfTile(tile) / 2);
    const ofudaPriceBefore = this._ofudaPrice(tile.element);
    // G不足による強制売却では、配置モンスターは手札へ戻らず消滅する。
    tile.unit = null;
    tile.owner = null;
    tile.transparentCursed = false;
    tile.level = 1;
    this._repaintTileToElement(tile);
    this.scene.updateTileLevelBorder(tile);
    player.currency += salePrice;
    this.onLog(`${player.name}は${ELEMENT_LABEL[tile.element]}属性の土地を売却した (+${salePrice}G)`);
    this._notifyState();
    void this._presentOfudaPriceChange(tile.element, ofudaPriceBefore);
  }

  /** 強制成仏: 自分の土地を地価倍率で換金し、配置モンスターは消滅、土地はLv1空き地へ戻る。 */
  async _cashOutOwnLand(player, tile, multiplier = 1.2) {
    const landLoss = this._captureLandLoss(player, tile);
    const salePrice = Math.round(this._landValueOfTile(tile) * multiplier);
    const unit = tile.unit;
    const level = tile.level;

    // 盤面を書き換える"前"に対象マスへ寄り、成仏の光と一緒に「誰が消えて
    // いくら入るのか」を見せる。以前は所有権もモンスターも無言で消え、
    // ログ1行が流れるだけで何が起きたのか分からなかった。
    // 光は_notifyStateの_syncUnitIconsでアイコンが消える前に再生する。
    await this.onTargetEffect?.({
      tileId: tile.id,
      position: tile.position,
      aura: 'ascension',
      message: unit
        ? `強制成仏\n${unit.def.name}が成仏した\n${player.name}はLv${level}の土地を手放し${salePrice}Gを得た`
        : `強制成仏\n${player.name}はLv${level}の空き地を手放し${salePrice}Gを得た`,
    });
    if (this._isCancelled) return;

    player.currency += salePrice;
    const ofudaPriceBefore = this._ofudaPrice(tile.element);
    tile.owner = null;
    tile.unit = null;
    tile.level = 1;
    tile.transparentCursed = false;
    tile.forcedStopCursed = false;
    tile.tollReductionRatio = null;
    tile.tollBonusOnceMultiplier = null;
    this._repaintTileToElement(tile);
    // レベルを1へ戻したら枠線も戻す（_sellLandTile等レベルを触る全箇所と同じ）。
    // これが無いと換金後もLv5の枠が残り、空き地なのに高レベルに見える。
    this.scene.updateTileLevelBorder(tile);
    this.onLog(`${player.name}は「強制成仏」で土地を${salePrice}Gに換金した`);
    if (unit) await this._handleUnitDeath(unit, player);
    this._notifyState();
    await this._presentOfudaPriceChange(tile.element, ofudaPriceBefore);
    await this._presentLandLoss(landLoss);
  }

  /**
   * 通行料・スペル等でGがマイナスになった直後に呼ぶ: マイナスが解消される
   * まで、所有地を1つずつ強制的に売却させる（土地コマンドから能動的に
   * 売る手段は無くなった - このマイナス解消時だけの特別処理）。CPUは
   * 一番安い土地から機械的に売る。売れる土地が尽きてもまだマイナスなら
   * 破産（_triggerBankruptcy）。
   */
  async _resolveNegativeCurrency(player) {
    if (player.currency >= 0 || player.defeated) return;
    // 正味財産（手持ち＋全土地を1枚ずつ連鎖減衰込みで売った額）で払いきれない
    // ＝支払いが正味財産を超えた場合は、土地を1枚ずつ売らせず即破産にする。
    if (this._netWorthOf(player) < 0) {
      await this._triggerBankruptcy(player);
      return;
    }
    while (player.currency < 0) {
      const candidates = this._ownedTiles(player);
      const ofudaCandidates = this.hasOfuda
        ? OFUDA_ELEMENTS
          .map((element) => ({
            element,
            label: ELEMENT_LABEL[element],
            price: this._ofudaPrice(element),
            count: player.ofuda?.[element] || 0,
          }))
          .filter((entry) => entry.count > 0 && entry.price > 0)
        : [];
      if (candidates.length === 0) {
        if (ofudaCandidates.length > 0) {
          const best = ofudaCandidates.sort((a, b) => b.price - a.price)[0];
          const need = Math.ceil((-player.currency) / best.price);
          const result = this._sellOfuda(player, best.element, need);
          this.onLog(`${player.name}は${best.label}のお札を${result.sold}枚売却した (+${result.revenue}G)`);
          this._notifyState();
          await this._presentOfudaPriceChange(best.element, result.before);
          continue;
        }
        await this._triggerBankruptcy(player);
        return;
      }
      if (player.isCPU) {
        if (ofudaCandidates.length > 0) {
          const best = ofudaCandidates.sort((a, b) => b.price - a.price)[0];
          const need = Math.ceil((-player.currency) / best.price);
          const result = this._sellOfuda(player, best.element, need);
          this.onLog(`${player.name}は${best.label}のお札を${result.sold}枚売却した (+${result.revenue}G)`);
          this._notifyState();
          await this._presentOfudaPriceChange(best.element, result.before);
          continue;
        }
        const cheapest = candidates.reduce((min, t) => (this._landValueOfTile(t) < this._landValueOfTile(min) ? t : min));
        this._sellLandTile(player, cheapest);
        continue;
      }
      const choice = await this.onPickDebtRecovery(
        {
          tiles: candidates.map((t) => this._sellLandSummary(t)),
          ofuda: ofudaCandidates,
          deficit: -player.currency,
        },
        player.id,
      );
      if (this._isCancelled) return;
      if (choice?.type === 'ofuda') {
        const entry = ofudaCandidates.find((candidate) => candidate.element === choice.element);
        if (!entry) continue;
        const result = this._sellOfuda(player, entry.element, Number(choice.count) || 0);
        if (result.sold <= 0) continue;
        this.onLog(`${player.name}は${entry.label}のお札を${result.sold}枚売却した (+${result.revenue}G)`);
        this._notifyState();
        await this._presentOfudaPriceChange(entry.element, result.before);
        continue;
      }
      const pickedId = choice?.type === 'land' ? choice.id : choice;
      const pickedTile = candidates.find((t) => t.id === pickedId);
      if (!pickedTile) continue; // 念のため: 不正な選択は無視して再提示する
      this._sellLandTile(player, pickedTile);
    }
  }

  /**
   * 土地を売り尽くしてもまだGがマイナスな時の破産処理。まず演出
   * （カメラクローズアップ+ゆれ+「破産」の2文字、main.js側）を再生し、
   * その後、全モード共通で500Gを受け取り、自分の開始ゴールから再スタートする。
   */
  async _triggerBankruptcy(player) {
    const startTile = this.tiles[player.homeGoalTileId]
      ?? this.tiles.find((t) => t.type === TileType.START);
    await this.onBankruptcy({
      playerId: player.id,
      playerName: player.name,
      position: this.tiles[player.tileId]?.position ?? null,
      startPosition: startTile?.position
        ? { x: startTile.position.x, z: startTile.position.z }
        : null,
      restartCurrency: 500,
    });
    if (!startTile) return;
    // 正味財産不足では売却選択を省略して直接ここへ来るため、残っている土地も
    // 破産時にすべて清算する。配置モンスターは手札へ戻さず消滅し、土地Lvも
    // 強制売却と同じく1へ戻す。
    for (const tile of this.tiles) {
      if (tile.owner !== player.id) continue;
      tile.unit = null;
      tile.owner = null;
      tile.transparentCursed = false;
      tile.level = 1;
      this._repaintTileToElement(tile);
      this.scene.updateTileLevelBorder(tile);
    }
    player.defeated = false;
    player.currency = 500;
    player.tileId = startTile.id;
    player.previousTileId = null;
    if (player.mesh) {
      player.mesh.visible = true;
      player.mesh.position.set(startTile.position.x, PIECE_REST_Y, startTile.position.z);
    }
    this.onLog(`${player.name}は破産した！500Gを渡されゴール地点から再スタート`);
    this._notifyState();
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
        for (const rawNeighborId of this.tiles[id].neighbors) {
          const entered = this.tiles[rawNeighborId];
          // ランダムワープはこの先の行き先が確定しないので、そこで打ち切る
          // （踏んだ時点でどこへ飛ぶか分からない＝距離を測れない）。
          if (entered?.warpOnPass && entered.randomWarp) {
            if (rawNeighborId === toId) return distance;
            continue;
          }
          const neighborId = entered?.warpOnPass && entered.warpTargetId != null
            ? entered.warpTargetId
            : rawNeighborId;
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

  /** 直前マスへの即時逆走を禁止した移動状態(current, previous)のBFS距離。 */
  _forwardTileDistance(currentId, previousId, targetId) {
    if (currentId === targetId) return 0;
    const keyOf = (current, previous) => `${current}:${previous ?? 'none'}`;
    const visited = new Set([keyOf(currentId, previousId)]);
    let frontier = [{ currentId, previousId }];
    let distance = 0;
    while (frontier.length > 0) {
      distance += 1;
      const next = [];
      for (const state of frontier) {
        const tile = this.tiles[state.currentId];
        const forward = tile.neighbors.filter((id) => id !== state.previousId);
        const options = forward.length > 0 ? forward : tile.neighbors;
        for (const rawNeighborId of options) {
          const entered = this.tiles[rawNeighborId];
          // ランダムワープの先は不定なので探索を打ち切る（_tileDistanceと同様）。
          if (entered?.warpOnPass && entered.randomWarp) {
            if (rawNeighborId === targetId) return distance;
            continue;
          }
          const neighborId = entered?.warpOnPass && entered.warpTargetId != null
            ? entered.warpTargetId
            : rawNeighborId;
          if (neighborId === targetId) return distance;
          // 強制ワープ後は来た道という概念を失う（実移動の_resolveWarpTileと同じ）。
          const nextPreviousId = entered?.warpOnPass ? null : state.currentId;
          const key = keyOf(neighborId, nextPreviousId);
          if (visited.has(key)) continue;
          visited.add(key);
          next.push({ currentId: neighborId, previousId: nextPreviousId });
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
      await this.onDamageEffect?.({ tileId: targetTile.id, damage: ability.power, targetDied: targetUnit.currentHp <= 0, targetName: targetUnit.def.name });

      if (targetUnit.currentHp <= 0) {
        const targetOwner = this.players.find((p) => p.id === targetTile.owner);
        const landLoss = this._captureLandLoss(targetOwner, targetTile);
        targetTile.unit = null;
        targetTile.owner = null;
        targetTile.transparentCursed = false;
        this._repaintTileToElement(targetTile);
        this.onLog(`${targetOwner.name}の${targetUnit.def.name}は倒された`);
        await this._handleUnitDeath(targetUnit, targetOwner);
        await this._presentLandLoss(landLoss);
      }
      this._notifyState();
      return true;
    }

    if (ability.type === 'warpToEmptyElementLand' || ability.type === 'warpToAnyEmptyLand') {
      const targets = this.tiles.filter(
        (t) => t.type === TileType.LAND
          && t.owner == null
          && (ability.type === 'warpToAnyEmptyLand' || t.element === ability.element)
          && t.id !== tile.id,
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
      const mesh = tile.unitMesh;
      const sourceLandLoss = this._captureLandLoss(player, tile);
      const destinationLandGain = this._captureLandGain(player, targetTile, { showAnyChange: true });
      tile.unitMesh = null;
      targetTile.unit = unit;
      targetTile.owner = player.id;
      targetTile.unitMesh = mesh;
      this._paintTile(targetTile, player.color);
      tile.unit = null;
      tile.owner = null;
      tile.transparentCursed = false;
      this._repaintTileToElement(tile);
      this.onLog(`${player.name}の${unitDef.name}が空き地へワープした`);
      await this._hopUnitIcon(mesh, tile.position, targetTile.position);
      await this._presentLandLoss(sourceLandLoss);
      await this._presentLandGain(destinationLandGain);
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
        t.unit.currentHp = this._baseStats(t.unit).hp;
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
      await this._enforceHandLimit(player);
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
      this.onLog(`${player.name}の${unitDef.name}が空き地に${summonedDef.name}を召喚した`);
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
        ownedLands.map((t) => ({ ...this._browseTileSummary(t, player), label: `${ELEMENT_LABEL[t.element]}属性の土地（Lv${t.level}）` })),
        player.id,
      );
      if (targetId == null) return false;
      const targetTile = this.tiles.find((t) => t.id === targetId);
      const newElement = await this.onPickElement(CHANGEABLE_ELEMENTS.filter((e) => e !== targetTile.element), player.id);
      if (newElement == null) return false;
      if (!(await confirmAndSpend())) return false;

      targetTile.element = newElement;
      this._repaintTileToElement(targetTile);
      this.onLog(`${player.name}の${unitDef.name}が土地を${ELEMENT_LABEL[newElement]}属性に変更した`);
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
      await this.onDamageEffect?.({ tileId: targetTile.id, damage: ability.power, targetDied: targetUnit.currentHp <= 0, targetName: targetUnit.def.name });

      const casterUnit = tile.unit;
      tile.unit = null;
      tile.owner = null;
      tile.transparentCursed = false;
      this._repaintTileToElement(tile);
      this._notifyState();
      await this._handleUnitDeath(casterUnit, player);

      if (targetUnit.currentHp <= 0) {
        const targetOwner = this.players.find((p) => p.id === targetTile.owner);
        const landLoss = this._captureLandLoss(targetOwner, targetTile);
        targetTile.unit = null;
        targetTile.owner = null;
        targetTile.transparentCursed = false;
        this._repaintTileToElement(targetTile);
        this.onLog(`${targetOwner.name}の${targetUnit.def.name}は倒された`);
        await this._handleUnitDeath(targetUnit, targetOwner);
        await this._presentLandLoss(landLoss);
      }
      this._notifyState();
      return true;
    }

    if (ability.type === 'grantItem') {
      if (!(await confirmAndSpend())) return false;

      const itemDef = ITEM_CATALOG[ability.itemId];
      const card = {
        ...itemDef,
        id: `granted-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        generatedOutsideDeck: true,
      };
      player.hand.push(card);
      this.onLog(`${player.name}の${unitDef.name}が「${card.name}」を入手した`);
      this._notifyState();
      await this._enforceHandLimit(player);
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
  _drawCardOfType(player, cardType, { excludeCardId = null } = {}) {
    const isEligible = (card) => card.type === cardType && card.id !== excludeCardId;
    const fromDraw = player.deck.drawPile.filter(isEligible);
    const pile = fromDraw.length > 0 ? player.deck.drawPile : player.deck.discardPile;
    const matches = fromDraw.length > 0 ? fromDraw : player.deck.discardPile.filter(isEligible);
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
  /**
   * チュートリアルのCPU台本: 先頭ステップの前提条件（invade=敵ユニットの
   * いる土地に着地／summon=空き地に着地、指定カードが手札にあり支払える）が
   * 揃った時だけ消費・実行する。揃わなければ何もせずfalseを返し、呼び出し元が
   * 通常AIに委ねる（プレイヤーが台本どおり動かなくても詰まない・壊れない）。
   */
  async _runTutorialCpuScript(player, tile) {
    const step = this.tutorialCpuScript[0];
    if (!step) return false;
    const card = player.hand.find((c) => catalogIdOf(c) === step.card);
    if (!card || player.currency < (card.cost || 0)) return false;

    if (step.type === 'invade') {
      if (tile.type !== TileType.LAND || tile.owner == null || tile.owner === player.id || !tile.unit || tile.transparentCursed) return false;
      this.tutorialCpuScript.shift();
      await delay(CPU_DECISION_MS);
      player.hand = player.hand.filter((c) => c.id !== card.id);
      this._discardUsedCard(player, card);
      player.currency -= card.cost;
      await this._runInvasion(player, tile, card);
      this._notifyState();
      return true;
    }

    if (step.type === 'summon') {
      if (tile.type !== TileType.LAND || tile.owner != null) return false;
      this.tutorialCpuScript.shift();
      await delay(CPU_DECISION_MS);
      player.hand = player.hand.filter((c) => c.id !== card.id);
      this._discardUsedCard(player, card);
      player.currency -= card.cost;
      const chainGain = this._captureLandGain(player, tile);
      this._placeUnit(tile, player, card);
      this.onLog(`${player.name}は${card.name}を召喚した (-${card.cost}G)`);
      this._notifyState();
      await this.onSummonEffect?.({ tileId: tile.id, unitName: card.name });
      await this._presentLandGain(chainGain);
      return true;
    }

    return false;
  }

  async _cpuLandCommand(player, tile) {
    await delay(CPU_DECISION_MS);
    const profile = player.aiProfile;

    if (tile.owner === player.id) {
      const movedToHighValueLand = await this._cpuMaybeMoveToHighValueLand(player, tile);
      if (movedToHighValueLand) return;
      const usedAcquisitionAbility = await this._cpuMaybeAcquireHighValueLandByAbility(player, tile);
      if (usedAcquisitionAbility) return;
      const usedDamageAbility = await this._cpuMaybeUseDamageAbility(player, tile);
      if (!usedDamageAbility) await this._cpuMaybeLevelUp(player, tile, profile);
      return;
    }

    const owner = tile.owner != null ? this.players.find((candidate) => candidate.id === tile.owner) : null;
    if (owner?.allianceId != null && owner.allianceId === player.allianceId) return;

    // 聖域/透過の呪い（transparentCursed）がかかった敵地には侵略できない。
    // 人間側の_humanSummonFlowと同じ保護をCPUにも適用する（これが無いと
    // CPUだけが聖域を無視して侵略できてしまい、効果が発動しないように見える）。
    if (tile.owner != null && tile.owner !== player.id && tile.transparentCursed) {
      this.onLog(`${player.name}は透過の呪いがかかった土地に侵略できず見送った`);
      return;
    }

    const options = this._affordableMonsterCards(player);
    if (options.length === 0) return;

    if (tile.owner == null) {
      // 通行料破産の防止: 手元に「払い得る最大の敵地通行料」の備え(reserve)を
      // 残せる範囲でだけ通常の召喚選択を行う。どのカードも備えを残せないほど
      // 手持ちが薄い時は最安の1枚だけに絞って土地は確保しつつ散財を避ける。
      const reserve = this._cpuSummonReserve(player);
      const withinReserve = options.filter((c) => player.currency - (c.cost || 0) >= reserve);
      const pool = withinReserve.length > 0
        ? withinReserve
        : [options.reduce((cheap, c) => ((c.cost || 0) < (cheap.cost || 0) ? c : cheap))];
      const card = this._isDanballBoss(player)
        ? this._cpuChooseSummonCardForDanball(pool, tile, player)
        : player.name === 'Q'
          ? this._cpuChooseSummonCardForQ(pool, tile, profile, player)
          : player.name === 'ムール'
            ? this._cpuChooseSummonCardForMuuru(pool, tile, profile, player)
          : player.name === '「彼」'
            ? this._cpuChooseSummonCardForKare(pool, tile, profile, player)
            : this._cpuChooseSummonCard(pool, tile, profile, player);
      player.hand = player.hand.filter((c) => c.id !== card.id);
      this._discardUsedCard(player, card);
      player.currency -= card.cost;
      await this._paySummonSacrifice(player, card);
      if (this._isCancelled) return;
      const chainGain = this._captureLandGain(player, tile);
      this._placeUnit(tile, player, card);
      this.onLog(`${player.name}は${card.name}を召喚した (-${card.cost}G)`);
      this._notifyState();
      await this.onSummonEffect?.({ tileId: tile.id, unitName: card.name });
      await this._presentLandGain(chainGain);
      if (card.effect?.type === 'copyOnSummon') await this._maybeCopyOnSummon(tile, player);
      return;
    }

    const decision = this._cpuDecideInvasion(player, tile, options, profile);
    if (!decision) {
      this.onLog(`${player.name}はこの土地への侵略を見送った`);
      return;
    }
    const { card } = decision;
    player.hand = player.hand.filter((c) => c.id !== card.id);
    this._discardUsedCard(player, card);
    player.currency -= card.cost;
    await this._paySummonSacrifice(player, card);
    if (this._isCancelled) return;
    await this._runInvasion(player, tile, card);
    this._notifyState();
  }

  /**
   * CPU共通の土地コマンド判断。候補は呼び出し元が人間と同じ権限
   * （今ターンに通過した所有地／ゴール・CP停止時は全所有地）へ絞る。
   * スペルと同様に、効果を使う価値があるものを優先順に1件だけ実行する。
   */
  async _cpuUseAccessibleLandCommand(player, candidates) {
    const accessible = candidates.filter((tile) => tile?.owner === player.id && tile.unit);
    if (accessible.length === 0) return false;

    // アサシンユニット運用（ガシャーン／未知の侵略者）。固有AIも権限候補を必ず
    // 受け取り、盤面上の任意のユニットを直接動かすことは禁止する。
    if (await this._cpuMaybeUseAssassinTactics(player, accessible.map((tile) => tile.id))) return true;

    // 朕は酢の2マス移動を侵略に優先使用する。土地コマンドを使えるタイミングと
    // 候補範囲はaccessibleを通すため、人間側と同じ権限制約を外れない。
    if (player.name === '朕') {
      const source = accessible.find((tile) => catalogIdOf(tile.unit?.def) === 'su');
      if (source) {
        const minWinRate = Math.max(player.aiProfile?.minWinProbabilityToInvade ?? 0, CPU_MOVE_INVASION_MIN_WIN_RATE);
        const targets = this._moveCommandCandidates(source, player)
          .map(({ tile: target }) => target)
          .filter((target) => target.owner != null && target.unit)
          // 勝算のない突撃はしない。負けると酢も移動元の土地も失う。
          .filter((target) => this._estimateUnitBattleWinProbability(source.unit, null, target) >= minWinRate)
          .sort((a, b) => b.level - a.level || this._landValueOfTile(b) - this._landValueOfTile(a));
        if (targets.length > 0) {
          this.onLog(`${player.name}は酢を移動させ、${targets[0].unit.def.name}へ侵略する！`);
          await this._cpuMoveOwnedUnit(player, source, targets[0]);
          return true;
        }
      }
    }

    for (const tile of accessible) {
      if (await this._cpuMaybeUseDamageAbility(player, tile)) return true;
    }
    for (const tile of accessible) {
      if (await this._cpuMaybeUseUtilityLandAbility(player, tile)) return true;
    }
    for (const tile of accessible) {
      if (await this._cpuMaybeAcquireHighValueLandByAbility(player, tile)) return true;
    }
    for (const tile of accessible) {
      if (await this._cpuMaybeMoveToHighValueLand(player, tile)) return true;
    }

    const levelTarget = this._cpuChooseLevelUpTile(player, candidates);
    if (levelTarget && await this._cpuMaybeLevelUp(player, levelTarget)) return true;
    return false;
  }

  /** 回復・ドロー・防御・属性調整など、即時に有益な土地能力のCPU判断。 */
  async _cpuMaybeUseUtilityLandAbility(player, tile) {
    const unitDef = tile.unit?.def;
    const ability = unitDef?.ability;
    const cost = unitDef?.commandCost ?? 0;
    if (!ability || player.currency < cost) return false;
    const spend = () => { player.currency -= cost; };

    if (ability.type === 'healAllOwnedAndCleanse') {
      const ownedUnits = this._ownedTiles(player).filter((candidate) => candidate.unit);
      const needsHealing = ownedUnits.some((candidate) => {
        const maxHp = this._baseStats(candidate.unit).hp + this._elementHpBonus(candidate.unit, candidate);
        return candidate.unit.currentHp < maxHp || (candidate.unit.curses?.length || 0) > 0;
      });
      if (!needsHealing) return false;
      spend();
      for (const candidate of ownedUnits) {
        candidate.unit.curses = [];
        candidate.unit.currentHp = this._baseStats(candidate.unit).hp;
      }
      this.onLog(`${player.name}の${unitDef.name}が味方全体を回復し、呪いを解除した (-${cost}G)`);
      this._notifyState();
      return true;
    }

    if (ability.type === 'drawCard') {
      if (player.hand.length >= HAND_LIMIT) return false;
      const types = [CardType.MONSTER, CardType.GEAR, CardType.SPELL]
        .sort((a, b) => player.hand.filter((card) => card.type === a).length - player.hand.filter((card) => card.type === b).length);
      let drawn = null;
      for (const type of types) {
        drawn = this._drawCardOfType(player, type);
        if (drawn) break;
      }
      if (!drawn) return false;
      spend();
      player.hand.push(drawn);
      this.onLog(`${player.name}の${unitDef.name}が「${drawn.name}」を引いた (-${cost}G)`);
      this._notifyState();
      return true;
    }

    if (ability.type === 'curseTransparency') {
      if (tile.transparentCursed || tile.level < 3) return false;
      spend();
      tile.transparentCursed = true;
      this.onLog(`${player.name}の${unitDef.name}が透過の呪いで土地を守った (-${cost}G)`);
      this._notifyState();
      return true;
    }

    if (ability.type === 'changeOwnLandElement') {
      const target = this._ownedTiles(player).find((candidate) =>
        candidate.unit?.def?.element != null
        && candidate.unit.def.element !== Element.NEUTRAL
        && candidate.element !== candidate.unit.def.element);
      if (!target) return false;
      spend();
      target.element = target.unit.def.element;
      this._repaintTileToElement(target);
      this.onLog(`${player.name}の${unitDef.name}が土地を${ELEMENT_LABEL[target.element]}属性に変更した (-${cost}G)`);
      this._notifyState();
      return true;
    }

    if (ability.type === 'grantItem') {
      if (player.hand.length >= HAND_LIMIT || !ITEM_CATALOG[ability.itemId]) return false;
      spend();
      const card = {
        ...ITEM_CATALOG[ability.itemId],
        id: `cpu-granted-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        generatedOutsideDeck: true,
      };
      player.hand.push(card);
      this.onLog(`${player.name}の${unitDef.name}が「${card.name}」を入手した (-${cost}G)`);
      this._notifyState();
      return true;
    }

    if (ability.type === 'cursePlayerHaste') {
      const target = this.players
        .filter((candidate) => !candidate.defeated && !this._isAllyOf(candidate, player))
        .sort((a, b) => this._totalAssetsOf(b) - this._totalAssetsOf(a))[0];
      if (!target) return false;
      spend();
      target.hasteTurnsRemaining = (target.hasteTurnsRemaining || 0) + ability.turns;
      this.onLog(`${player.name}の${unitDef.name}が${target.name}に高速化の呪いをかけた (-${cost}G)`);
      this._notifyState();
      return true;
    }

    return false;
  }

  /**
   * CPUの投資先を優先順位順に選ぶ。無属性土地はレベルアップしない。
   * ①2連鎖以上かつ土地と同属性のモンスター、②同属性モンスターがいる
   * Lv1土地、③そのほかの同属性配置、④そのほかの有属性土地の順。
   */
  _cpuChooseLevelUpTile(player, candidates) {
    if (player.currency < 300) return null;
    const eligible = candidates.filter((tile) =>
      tile.type === TileType.LAND
      && tile.owner === player.id
      && tile.element !== Element.NEUTRAL
      && tile.level < LEVEL_CAP,
    );
    if (eligible.length === 0) return null;

    const score = (tile) => {
      const sameElementUnit = tile.unit?.def?.element === tile.element;
      const chainCount = this._chainCount(player.id, tile.element);
      if (sameElementUnit && chainCount >= 2) return 400 + chainCount * 10 - tile.level;
      if (sameElementUnit && tile.level === 1) return 300;
      if (sameElementUnit) return 200 - tile.level;
      return 100 + chainCount * 10 - tile.level;
    };
    return [...eligible].sort((a, b) => score(b) - score(a))[0];
  }

  /** 空き地のうち、以前の所有者が育てたLv2以上を地価の高い順に返す。 */
  _cpuHighValueEmptyLands(candidates = this.tiles) {
    return candidates
      .filter((tile) => tile.type === TileType.LAND && tile.owner == null && tile.level >= 2)
      .sort((a, b) => this._landValueOfTile(b) - this._landValueOfTile(a) || b.level - a.level);
  }

  /**
   * 土地コマンド「移動」のCPU判断。現在地に隣接する高額空き地のうち、
   * 現在地より地価が高い土地があれば、配置モンスターを移して確保する。
   * 人間の移動と同様、移動したモンスターの呪いは解除され、土地レベルは
   * 移動元・移動先とも維持される。
   */
  async _cpuMaybeMoveToHighValueLand(player, tile) {
    if (tile.owner !== player.id || !tile.unit) return false;
    if (tile.unit.def.traits?.includes('immovableByMoveCommand')) return false;
    const adjacent = tile.neighbors.map((id) => this.tiles[id]);
    const target = this._cpuHighValueEmptyLands(adjacent)
      .find((land) => this._landValueOfTile(land) > this._landValueOfTile(tile));
    if (!target) return false;

    const unit = tile.unit;
    const mesh = tile.unitMesh;
    const sourceLandLoss = this._captureLandLoss(player, tile);
    const destinationLandGain = this._captureLandGain(player, target, { showAnyChange: true });
    unit.curses = [];
    tile.unitMesh = null;
    target.unit = unit;
    target.owner = player.id;
    target.unitMesh = mesh;
    this._paintTile(target, player.color);
    tile.unit = null;
    tile.owner = null;
    tile.transparentCursed = false;
    this._repaintTileToElement(tile);
    this.onLog(`${player.name}は${unit.def.name}を高額な空き地へ移動させた`);
    await this._hopUnitIcon(mesh, tile.position, target.position);
    await this._presentLandLoss(sourceLandLoss);
    await this._presentLandGain(destinationLandGain);
    this._notifyState();
    return true;
  }

  /**
   * CPUが現在地のモンスター能力で高額空き地を確保する。属性ワープは
   * 対応属性内の最高額へ移動し、空き地召喚能力は全候補中の最高額へ置く。
   */
  async _cpuMaybeAcquireHighValueLandByAbility(player, tile) {
    const unitDef = tile.unit?.def;
    const ability = unitDef?.ability;
    const cost = unitDef?.commandCost ?? 0;
    if (!ability || player.currency < cost) return false;

    if (ability.type === 'warpToEmptyElementLand' || ability.type === 'warpToAnyEmptyLand') {
      const target = this._cpuHighValueEmptyLands().find((land) =>
        land.id !== tile.id && (ability.type === 'warpToAnyEmptyLand' || land.element === ability.element));
      if (!target) return false;
      player.currency -= cost;
      const unit = tile.unit;
      // 他のワープ/移動処理と同じくアイコンも付け替える。付け替えないと元の
      // マスに置き去りのアイコンが残り、_syncUnitIconsが破棄→再生成するため
      // ホップ演出が出ずに瞬間移動して見える。
      const mesh = tile.unitMesh;
      const sourceLandLoss = this._captureLandLoss(player, tile);
      const destinationLandGain = this._captureLandGain(player, target, { showAnyChange: true });
      tile.unitMesh = null;
      target.unit = unit;
      target.owner = player.id;
      target.unitMesh = mesh;
      this._paintTile(target, player.color);
      tile.unit = null;
      tile.owner = null;
      tile.transparentCursed = false;
      this._repaintTileToElement(tile);
      this.onLog(`${player.name}の${unitDef.name}が高額な空き地へワープした (-${cost}G)`);
      await this._hopUnitIcon(mesh, tile.position, target.position);
      this._notifyState();
      await this.onTargetEffect?.({ tileId: target.id, position: target.position, message: `${unitDef.name}が高額空き地を確保！` });
      await this._presentLandLoss(sourceLandLoss);
      await this._presentLandGain(destinationLandGain);
      return true;
    }

    if (ability.type === 'summonFieldMonster' || ability.type === 'summonMonsterOnEmptyLand') {
      const target = this._cpuHighValueEmptyLands()[0];
      if (!target) return false;
      player.currency -= cost;
      const summonedDef = ability.type === 'summonFieldMonster'
        ? { ...DENCHU_FIELD_MONSTER, id: `denchu-${Date.now()}-${Math.random().toString(36).slice(2)}` }
        : { ...MONSTER_CATALOG[ability.catalogId], id: `summon-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      this._placeUnit(target, player, summonedDef);
      this.onLog(`${player.name}の${unitDef.name}が高額な空き地に${summonedDef.name}を召喚した (-${cost}G)`);
      this._notifyState();
      await this.onSummonEffect?.({ tileId: target.id, unitName: summonedDef.name });
      return true;
    }
    return false;
  }

  /**
   * 手持ちGが300以上なら、選ばれた土地を現在Lvからランダムに1〜3段階
   * （Lv5上限・支払可能範囲内）上げる。残金を固定額残す旧profile設定は
   * 使わず、行動開始時の300Gを判断基準にする。
   */
  async _cpuMaybeLevelUp(player, tile) {
    // チュートリアルではCPUの強化をLv2まで・1段階ずつに抑える。通常AIの
    // 「+3段階まで一気に上げる」を許すと序盤から地価1000G超の土地ができ、
    // 初心者が通行料で消耗するうえ、CPUの総資産が目標へ一直線に伸びる。
    const cpuLevelCap = this.tutorialMode ? 2 : LEVEL_CAP;
    if (player.currency < 300 || tile.type !== TileType.LAND || tile.level >= cpuLevelCap || tile.element === Element.NEUTRAL) return false;
    const affordableTargets = [];
    const maxTargetLevel = Math.min(cpuLevelCap, tile.level + (this.tutorialMode ? 1 : 3));
    for (let targetLevel = tile.level + 1; targetLevel <= maxTargetLevel; targetLevel += 1) {
      const cost = LEVEL_INVESTMENT[targetLevel] - LEVEL_INVESTMENT[tile.level];
      if (cost <= player.currency) affordableTargets.push({ targetLevel, cost });
    }
    if (affordableTargets.length === 0) return false;
    const { targetLevel, cost } = affordableTargets[Math.floor(Math.random() * affordableTargets.length)];

    const previousLevel = tile.level;
    const tollBefore = this._tollOfTile(tile);
    const ofudaPriceBefore = this._ofudaPrice(tile.element);
    player.currency -= cost;
    tile.level = targetLevel;
    this.scene.updateTileLevelBorder(tile);
    this.onLog(`${player.name}は土地をLv${tile.level}にアップグレードした (-${cost}G)`);
    this._notifyState();
    await this.onLandLevelUp({
      playerId: player.id,
      playerName: player.name,
      tileId: tile.id,
      position: tile.position,
      element: tile.element,
      previousLevel,
      newLevel: tile.level,
      tollBefore,
      tollAfter: this._tollOfTile(tile),
    });
    await this._presentOfudaPriceChange(tile.element, ofudaPriceBefore);
    return true;
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
  /**
   * そのカードが「この土地の属性HPボーナス」を活かせるか。全AI共通の召喚判定に使う。
   * 通常モンスターは土地と属性一致のとき該当。レインボーカメレオン等
   * （elementHpBonusIgnoreElement＝属性を問わず土地レベル×10のHPボーナスを受ける）は
   * どの有属性土地でもボーナスを活かせるので、有属性土地では属性一致モンスターと同格に
   * 「土地ボーナスを活かせる」候補として扱う。無色地はレベルアップせず土地ボーナスが
   * ほぼ無いため該当させず、有属性土地のために温存させる（＝無色地にはあまり置かない）。
   */
  _cardBenefitsFromLandElement(card, tile) {
    if (card.effect?.type === 'elementHpBonusIgnoreElement') {
      return tile.element !== Element.NEUTRAL;
    }
    return card.element === tile.element;
  }

  /** CPUが空き地召喚時に手元へ残しておきたい通行料の備え。盤上で自分が払い得る
   *  最大の敵地（非同盟）通行料を目安にする。序盤は土地レベルが低く小さいので
   *  自由に召喚でき、中盤以降は高くなり高コストカードでの散財を抑える。上限は
   *  召喚・レベルアップをある程度積極的に回せるよう500Gでキャップ。 */
  _cpuSummonReserve(player) {
    let maxToll = 0;
    for (const tile of this.tiles) {
      if (tile.type !== TileType.LAND || tile.owner == null || tile.owner === player.id) continue;
      const owner = this.players.find((p) => p.id === tile.owner);
      if (owner?.allianceId != null && owner.allianceId === player.allianceId) continue;
      maxToll = Math.max(maxToll, this._tollOfTile(tile));
    }
    return Math.min(maxToll, 500);
  }

  _cpuChooseSummonCard(options, tile, profile, player) {
    const onElement = options.filter((c) => this._cardBenefitsFromLandElement(c, tile));
    const offElement = options.filter((c) => !this._cardBenefitsFromLandElement(c, tile));

    // 属性マッチ（土地ボーナスを活かせる）カードが手札にあれば最優先。ギア召喚を
    // 優先するのは、マッチするカードが手札に無い空き地に止まった場合のみ。
    if (onElement.length === 0) {
      const gearCard = this._cpuPreferredGearCard(options, player);
      if (gearCard) return gearCard;
    }

    const preferOff = onElement.length === 0 || (offElement.length > 0 && Math.random() < profile.offElementSummonChance);
    const pool = preferOff && offElement.length > 0 ? offElement : onElement.length > 0 ? onElement : offElement;
    return this._strongestCard(pool);
  }

  /** Q専用: 合体素材になる列車2種を通常の雷モンスターより優先して配置する。 */
  _cpuChooseSummonCardForQ(options, tile, profile, player) {
    const trainIds = [BATTLE_TRAIN_ID, SACRIFICE_CAR_ID];
    const trains = options.filter((card) => trainIds.includes(catalogIdOf(card)));
    if (trains.length > 0) {
      const placedCount = (id) => this.tiles.filter(
        (candidate) => candidate.unit?.ownerId === player.id && catalogIdOf(candidate.unit.def) === id,
      ).length;
      return trains.reduce((best, card) => (
        placedCount(catalogIdOf(card)) < placedCount(catalogIdOf(best)) ? card : best
      ));
    }
    return this._cpuChooseSummonCard(options, tile, profile, player);
  }

  /**
   * 「彼」専用の召喚選択。
   * ①未知の侵略者(HP10の貫通アサシン)は基本、守備召喚しない。ただし今止まった
   *   空き地が敵Lv3以上の土地に隣接しているなら、そこへ置いて次ターンの移動侵略に
   *   備える（積極的に前線へ配置）。他に召喚候補が無い時だけ仕方なく召喚する。
   * ②それ以外は水土地なら水神、森土地なら山神を最優先、無ければ汎用選択。
   */
  _cpuChooseSummonCardForKare(options, tile, profile, player) {
    const invader = options.find((card) => catalogIdOf(card) === 'mysteriousInvader');
    const nonInvader = options.filter((card) => catalogIdOf(card) !== 'mysteriousInvader');
    if (invader) {
      const adjacentToHighEnemyLand = (tile.neighbors || []).some((id) => this._isInvadeWorthyEnemyLand(this.tiles[id], player));
      if (adjacentToHighEnemyLand) return invader;
      if (nonInvader.length === 0) return invader;
    }
    const pool = nonInvader.length > 0 ? nonInvader : options;
    const preferredId = tile.element === Element.WATER ? 'suijin' : tile.element === Element.FOREST ? 'yamagami' : null;
    const god = preferredId ? pool.find((card) => catalogIdOf(card) === preferredId) : null;
    return god || this._cpuChooseSummonCard(pool, tile, profile, player);
  }

  /** ムール専用: タフネス中かつ水土地なら、強化した関所クラゲの配置を最優先する。 */
  _cpuChooseSummonCardForMuuru(options, tile, profile, player) {
    if (player.toughnessTurnsRemaining > 0 && tile.element === Element.WATER) {
      const jellyfish = options.find((card) => catalogIdOf(card) === 'kaikyouSekishoKurage');
      if (jellyfish) return jellyfish;
    }
    return this._cpuChooseSummonCard(options, tile, profile, player);
  }

  /** 移動侵略の狙い目になる敵地か: Lv3以上・非同盟の相手が守るモンスター有り・
   *  聖域/透過の呪い無し。ガシャーン/未知の侵略者の運用AIで共用する。 */
  _isInvadeWorthyEnemyLand(tile, player) {
    if (!tile || tile.type !== TileType.LAND || tile.level < 3 || tile.owner == null || tile.owner === player.id || !tile.unit) return false;
    if (tile.transparentCursed) return false;
    const owner = this.players.find((candidate) => candidate.id === tile.owner);
    return !!owner && !this._isAllyOf(owner, player);
  }

  /**
   * 古代のギアA/B/Cのうち、手札にあり、かつ自分の盤面に残り2種類が既に
   * 揃っている（＝これを召喚すればガシャーンに合体する）ものを最優先で
   * 返す。無ければ手札にあるギアの中から適当な1枚を返す（無ければnull）。
   */
  /** ダンボール男（ラスボス）判定。専用の召喚・スペルAIに切り替える。 */
  _isDanballBoss(player) {
    return !!player?.isCPU && player.name === 'ダンボール男';
  }

  /**
   * ダンボール男専用の召喚カード選択（合体ロボ・ガシャーン＝3種のギアを揃えるのが狙い）。
   * ①古代のギアA/B/C（未配置の種類を優先）
   * ②ギアが無い時だけ、土地属性に合う通常モンスターをレアリティ順に召喚。
   * 「未知との遭遇」はスペルフェーズの_cpuMaybeUseEncounterSpellで処理する。
   */
  _cpuChooseSummonCardForDanball(options, tile, player) {
    const GEAR_IDS = ['kodaiNoGearA', 'kodaiNoGearB', 'kodaiNoGearC'];
    const RANK = { N: 0, S: 1, R: 2, EX: 3 };
    const isGear = (c) => GEAR_IDS.includes(catalogIdOf(c));
    const rank = (c) => RANK[c.rarity] ?? 0;
    // ④⑤⑥: 自分の土地に既にあるギアの種類。
    const placedGearIds = new Set(
      this.tiles
        .filter((t) => t.unit && t.unit.ownerId === player.id && isGear(t.unit.def))
        .map((t) => catalogIdOf(t.unit.def)),
    );
    // 手札のギアから「まだ自分の土地に無い種類」を優先。無ければ手札の先頭ギア。
    const pickGear = (gears) => {
      const fresh = gears.filter((g) => !placedGearIds.has(catalogIdOf(g)));
      return (fresh.length > 0 ? fresh : gears)[0];
    };
    const gears = options.filter(isGear);

    // 合体ロボ成立を通常召喚より優先。未配置の種類から置き、3種目なら
    // その召喚直後にガシャーンへ合体する。
    if (gears.length > 0) return pickGear(gears);

    // ギアが無い場合だけ、通常モンスターを土地属性・レアリティ順で選ぶ。
    // レインボーカメレオンは有属性土地でここに含まれ、無色地では含まれない。
    {
      const matching = options.filter((c) => this._cardBenefitsFromLandElement(c, tile));
      if (matching.length > 0) {
        const topRank = Math.max(...matching.map(rank));
        const top = matching.filter((c) => rank(c) === topRank);
        const gearsInTop = top.filter(isGear);
        // 最高レア帯にギアが含まれるなら④⑤⑥で未配置のギアを優先。
        if (gearsInTop.length > 0) return pickGear(gearsInTop);
        return top[0];
      }
    }

    // フォールバック: 土地を活かせるカード優先でレアリティの高い順（ギアが無い時のレインボー等）。
    const fallbackMatching = options.filter((c) => this._cardBenefitsFromLandElement(c, tile));
    const pool = fallbackMatching.length > 0 ? fallbackMatching : options;
    return [...pool].sort((a, b) => rank(b) - rank(a))[0];
  }

  /** デッキに古代のギアA/B/C 全種が入っているか（deckNeutralMonsterIdsで判定）。 */
  _deckHasAllGears(player) {
    const ids = player?.deckNeutralMonsterIds;
    return !!ids && ['kodaiNoGearA', 'kodaiNoGearB', 'kodaiNoGearC'].every((g) => ids.has(g));
  }

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
    const defender = this.players.find((candidate) => candidate.id === tile.owner);
    if (player.name === '暴君マダイ' && defender?.name === 'お肉' && this._leadingOnikuOpponent(player)) {
      threshold = Math.min(threshold, 0.1);
    }
    if (tile.level >= 3) threshold = Math.min(0.97, threshold + profile.highValueAvoidance * 0.3);

    if (best.noItemRate >= threshold) return { card: best.card };
    if (best.withItemRate >= threshold && Math.random() < profile.itemGambleChance) return { card: best.card };
    return null;
  }

  /** 貫通を持つか（モンスター自身のtraits、または装備アイテム由来）。 */
  _hasPierce(unit) {
    return !!unit?.def?.traits?.includes('pierce')
      || !!unit?.items?.some((item) => item.traits?.includes('pierce'));
  }

  /**
   * 貫通が守備側から剥がすHPを差し引いたボーナスを返す。剥がすのは
   * 「土地レベル由来のHP加算」(_elementHpBonus)だけで、雷神・水神・炎神の
   * 連鎖加算や混沌の頭の全連鎖加算といったカード能力由来の分、電柱などの
   * 場の効果、アイテムのHP加算はそのまま残す（貫通の説明文どおり）。
   * 実戦闘と、CPUの勝率シミュレーション2種が必ず同じ計算になるよう共通化する。
   */
  _pierceAdjustedBonus(defenderBonus, piercedLandHp) {
    if (!piercedLandHp) return defenderBonus;
    return { ...defenderBonus, hp: Math.max(0, (defenderBonus.hp || 0) - piercedLandHp) };
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
    const ignoresElement = unit.def.effect?.type === 'elementHpBonusIgnoreElement'
      || unit.def.traits?.includes('elementHpBonusIgnoreElement');
    if (!ignoresElement && positionTile.element !== unit.def.element) return 0;
    return Math.min(positionTile.level * 10, 50);
  }

  /**
   * 応援ボーナス: 戦闘地（battleTile）に隣接するマスに、自分または同盟仲間の
   * 別モンスターがいればATK+10。攻撃側・防御側どちらにも同じ判定を使う
   * （`unit !== t.unit` は移動コマンドで自分の元いた土地が戦闘地の隣接
   * マスに含まれてしまう＝自分自身を援護扱いしないための除外）。同盟戦では
   * 同盟者の土地のモンスターも応援に含める。
   */
  _cheerAtkBonus(unit, battleTile) {
    const owner = this.players.find((p) => p.id === unit.ownerId);
    if (!owner) return 0;
    const hasAlly = battleTile.neighbors.some((id) => {
      const t = this.tiles[id];
      if (t.unit == null || t.unit === unit) return false;
      const supporter = this.players.find((p) => p.id === t.unit.ownerId);
      return supporter != null && this._isAllyOf(supporter, owner);
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
    if (unit.def.element === Element.NEUTRAL && this._hasFieldTraitOnBoard('neutralHpAura')) {
      hp += 10;
      this.onLog(`${unit.def.name}は古代のギアCの応援でHP+10`);
    }
    return { atk, hp };
  }

  /** 盤面上のどこかに、指定catalogIdのモンスターが（所有者問わず）配置されているか。電柱の全体効果用。 */
  _hasFieldMonsterOnBoard(catalogId) {
    return this.tiles.some((t) => t.unit && catalogIdOf(t.unit.def) === catalogId);
  }

  _hasFieldTraitOnBoard(trait) {
    return this.tiles.some((t) => t.unit?.def?.traits?.includes(trait));
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
  }

  /**
   * 装備アイテム由来の動的ATK加算。アイテムはequip後でないとunit.itemsに
   * 乗らないため、_applyEffectBonus（召喚前・装備前でも呼ばれる）とは別枠で、
   * 必ず装備が確定した"後"に呼ぶ。ここで呼ばないとイカサマのサイコロの加算が
   * 一切効かない（unit.itemsが空のまま計算されてしまう）。
   * イカサマのサイコロ(atkFromLastDiceRoll): ATK+前回移動したサイコロの目×倍率。
   * プレイヤーの直近のサイコロの目を参照するのでboard側のGameインスタンス側で計算する。
   */
  _applyEquippedItemBonus(unit, bonus) {
    const diceItem = unit.items.find((i) => i.effect?.type === 'atkFromLastDiceRoll');
    if (!diceItem) return;
    const owner = this.players.find((p) => p.id === unit.ownerId);
    const roll = owner?.lastDiceSteps || 0;
    const atk = roll * diceItem.effect.multiplier;
    bonus.atk += atk;
    if (atk > 0) this.onLog(`${unit.def.name}は「${diceItem.name}」でATK+${atk}（前回の出目${roll}）`);
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
      bonus.atkMultiplier = (bonus.atkMultiplier || 1) * effect.multiplier;
      this.onLog(`${unit.def.name}の最終ATK${effect.multiplier}倍が発動`);
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
   * for monster-specific traits like 港〇女子's resistance.
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
    // 再生(regenerate)で積み上げた恒久ATKと、タフネスで焼き込んだ基礎HPは
    // その個体の"素のステータス"として扱う（statTotalsと同じ基準にしないと、
    // 戦闘画面の基礎ステ表示だけが実際の数値とズレる）。
    return {
      atk: unit.def.atk + (unit.regenAtkBonus || 0) + curseAtk,
      hp: unit.def.hp + (unit.summonBaseHpBonus || 0) + curseHp,
    };
  }

  /** 装備アイテムとしての強さを大まかに数値化する（CPUの実際の選択と、侵略前のシミュレーションの両方から使う - 同じ基準で選ぶことで「シミュレーションで想定した通りに実際も動く」を保証する）。 */
  _itemPowerScore(item, unit = null) {
    let score = (item.atkBonus || 0) + (item.hpBonus || 0);
    if (item.effect?.type === 'wielderElementAtkBonus'
        && unit?.def?.element === item.effect.wielderElement) {
      score += item.effect.atkBonus || 0;
    }
    if (item.effect) score += 15;
    if (item.traits?.includes('firstStrike')) score += 10;
    if (item.traits?.includes('pierce')) score += 10;
    if (item.traits?.includes('lastStrike')) score -= 5;
    return score;
  }

  /** 手札の中から一番強いGEARカードを選ぶ（無ければnull）。 */
  _bestBattleItemFromHand(hand, unit = null, { preferStandardItems = false } = {}) {
    const gear = hand.filter(isBattleItemCard);
    if (gear.length === 0) return null;
    if (preferStandardItems) {
      const standardItems = gear.filter((card) => card.type === CardType.GEAR);
      if (standardItems.length > 0) {
        return standardItems.reduce((best, card) => (
          this._itemPowerScore(card, unit) > this._itemPowerScore(best, unit) ? card : best
        ));
      }
    }
    const monsterId = catalogIdOf(unit?.def);
    const fusionPartnerId = monsterId === BATTLE_TRAIN_ID
      ? SACRIFICE_CAR_ID
      : monsterId === SACRIFICE_CAR_ID ? BATTLE_TRAIN_ID : null;
    if (fusionPartnerId) {
      const fusionPartner = gear.find((card) => catalogIdOf(card) === fusionPartnerId);
      if (fusionPartner) return fusionPartner;
    }
    return gear.reduce((best, c) => (this._itemPowerScore(c, unit) > this._itemPowerScore(best, unit) ? c : best));
  }

  /** CPUの実際のバトルアイテム選択。シミュレーション（_estimateWinProbability）と同じ_bestBattleItemFromHandを使うので、事前に見積もった勝率と実際の挙動がずれない。 */
  _cpuPickBattleItem(player, unit) {
    return this._bestBattleItemFromHand(player.hand, unit, { preferStandardItems: player.name === 'Q' });
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
      // 完成ギアで侵略する場合は合体先ガシャーン(70/70)の想定で勝算を見積もる。
      const attackerDef = this._gashaanDefIfCompleting(card, attackerOwnerId);
      let wins = 0;
      for (let i = 0; i < trials; i++) {
        const attackerUnit = createFieldUnit(attackerDef, attackerOwnerId);
        const defenderUnit = this._cloneFieldUnitForSim(defenderTile.unit);
        if (useItem) {
          const attackerPlayer = this.players.find((candidate) => candidate.id === attackerOwnerId);
          const item = this._bestBattleItemFromHand(attackerHand, attackerUnit, {
            preferStandardItems: attackerPlayer?.name === 'Q',
          });
          if (item) {
            const fusionDef = this._trainFusionDef(attackerUnit, item);
            if (fusionDef) attackerUnit.def = fusionDef;
            else equipItem(attackerUnit, item);
          }
        }
        const attackerBonus = this._battleBonus(attackerUnit, null, defenderTile);
        const defenderBonus = this._battleBonus(defenderUnit, defenderTile, defenderTile);
        this._applyEffectBonus(attackerUnit, defenderUnit, attackerBonus);
        this._applyEffectBonus(defenderUnit, attackerUnit, defenderBonus);
        this._applyEquippedItemBonus(attackerUnit, attackerBonus);
        this._applyEquippedItemBonus(defenderUnit, defenderBonus);
        const battleDefenderBonus = this._pierceAdjustedBonus(
          defenderBonus,
          this._hasPierce(attackerUnit) ? this._elementHpBonus(defenderUnit, defenderTile) : 0,
        );

        const result = resolveBattle(attackerUnit, defenderUnit, new GoldLedger(), attackerBonus, battleDefenderBonus);
        if (result.attackerSurvived && !result.defenderSurvived) wins++;
      }
      return wins / trials;
    } finally {
      this.onLog = savedLog;
    }
  }

  /**
   * 盤上ユニット同士の戦闘勝率を見積もる（_estimateWinProbabilityの
   * 「手札カードで侵略」版に対する「配置済みユニットが移動侵略/強制侵略」版）。
   * 現在HP・装備・呪いを含む実状態の複製で、実際の移動戦闘と同じボーナス
   * （移動側は土地を離れて戦うため土地HPなし、応援、貫通のHP無効化）を掛けて
   * モンテカルロする。戻り値は「攻撃側が勝つ（守備側が死に攻撃側が残る）」確率。
   * 相手のアイテム使用は考慮しない（_estimateWinProbabilityと同じ簡略化）。
   */
  _estimateUnitBattleWinProbability(attackerUnit, attackerPositionTile, defenderTile, trials = 20) {
    if (!attackerUnit || !defenderTile?.unit) return 0;
    const savedLog = this.onLog;
    this.onLog = () => {};
    try {
      let wins = 0;
      for (let i = 0; i < trials; i++) {
        const atk = this._cloneFieldUnitForSim(attackerUnit);
        const def = this._cloneFieldUnitForSim(defenderTile.unit);
        const attackerBonus = this._battleBonus(atk, null, defenderTile);
        const defenderBonus = this._battleBonus(def, defenderTile, defenderTile);
        this._applyEffectBonus(atk, def, attackerBonus);
        this._applyEffectBonus(def, atk, defenderBonus);
        this._applyEquippedItemBonus(atk, attackerBonus);
        this._applyEquippedItemBonus(def, defenderBonus);
        const battleDefenderBonus = this._pierceAdjustedBonus(
          defenderBonus,
          this._hasPierce(atk) ? this._elementHpBonus(def, defenderTile) : 0,
        );
        const result = resolveBattle(atk, def, new GoldLedger(), attackerBonus, battleDefenderBonus);
        if (result.attackerSurvived && !result.defenderSurvived) wins++;
      }
      return wins / trials;
    } finally {
      this.onLog = savedLog;
    }
  }

  /** Equips + permanently consumes the chosen item (removed from hand, discarded) - a no-op if the side skipped. */
  _consumeBattleItem(player, unit, item) {
    if (!item) return null;
    this.onCardSeen?.(item);
    const equipped = equipItem(unit, item);
    player.hand = player.hand.filter((c) => c.id !== item.id);
    this._discardUsedCard(player, item);
    return equipped;
  }

  /** 列車2種は相方を装備した時点で、確認なしに恒久的な合体形態へ置換する。 */
  _applyTrainFusion(unit, equippedItem) {
    // アイテムを装備しなかった側は equippedItem が null。その場合は合体判定を
    // 行わない（_trainFusionDef内の catalogIdOf(null) で例外→戦闘フリーズになる
    // ため、ここで必ず打ち切る）。
    if (!equippedItem || !unit?.def) return null;
    const monsterId = catalogIdOf(unit.def);
    const fusionDef = this._trainFusionDef(unit, equippedItem);
    if (!fusionDef) return null;
    const previousMaxHp = Number(unit.def.hp || 0);
    unit.def = fusionDef;
    unit.currentHp = Math.min(fusionDef.hp, Math.max(1, unit.currentHp + fusionDef.hp - previousMaxHp));
    unit.items = [];
    this.onLog(`${monsterId === BATTLE_TRAIN_ID ? '戦闘列車' : '供物車両'}は${fusionDef.name}に合体した！`);
    return fusionDef;
  }

  _trainFusionDef(unit, item) {
    if (!item || !unit?.def) return null; // アイテム未装備なら合体なし（catalogIdOf(null)対策）
    const monsterId = catalogIdOf(unit.def);
    const itemId = catalogIdOf(item);
    if (monsterId === BATTLE_TRAIN_ID && itemId === SACRIFICE_CAR_ID) return Q_LINER_FIELD_MONSTER;
    if (monsterId === SACRIFICE_CAR_ID && itemId === BATTLE_TRAIN_ID) return Q_TRAIN_FIELD_MONSTER;
    return null;
  }

  /**
   * Full battle-scene choreography, shared by both invasion entry points
   * (landing-invasion via _runInvasion, and the 移動 command's invasion
   * branch): fade in → reveal base stats + situational bonuses for both
   * sides → each side secretly picks an item (所持アイテム一覧は双方に公開するが、
   * 実際に選択したカードは両者の確定後まで非公開。CPU側は停止しない) →
   * resolveBattle → attacker's strike animation, then the defender's
   * counter-strike animation only if it survived to make one (see
   * battle.js's sequential resolution) → outcome message. Returns the
   * resolveBattle result so callers still own the tile-ownership mutations
   * (that part differs between straight invasion and move-invasion).
   */
  async _runBattleScene(attackerUnit, attackerPlayer, defenderUnit, defenderPlayer, attackerPositionTile, battleTile) {
    for (const unit of [attackerUnit, defenderUnit]) {
      if (unit.def.effect?.type === 'cleanseSelfAtBattleStart' && unit.curses?.length) {
        unit.curses = [];
        this.onLog(`${unit.def.name}は戦闘開始時に自身の呪いを解除した`);
      }
    }
    let attackerBase = this._baseStats(attackerUnit);
    let defenderBase = this._baseStats(defenderUnit);
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
        currentHp: Math.min(attackerUnit.currentHp, attackerBase.hp),
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
        currentHp: Math.min(defenderUnit.currentHp, defenderBase.hp),
        cheerAtk: defenderBonus.atk,
        elementHp: defenderBonus.hp,
        element: battleTile.element,
        matchup: defenderMatchup,
      },
    });
    // 演出待ちの間に「退出」でこのGameが見捨てられていたら、ここで打ち切る
    // （cancel()参照）。以後のアイテム選択UI等を今更表示しても、既に別の
    // セッションが始まっているUIを巻き込むだけなので何もせず抜ける。
    if (this._isCancelled) return null;

    // アイテム選択は両者とも「相手が何を選んだか一切見えない」状態で行う
    // 必要がある（後から選ぶ側が相手の装備を見てから決められると有利に
    // なってしまう）。そのため選択(onPickBattleItem)は両者分を先に済ませ、
    // 実際に装備した見た目の演出(onBattleEquip)は両者の選択が確定した
    // "後" にまとめて再生する - 選択中に相手の装備が画面上に見えることは
    // ない。
    const attackerItem = attackerPlayer.isCPU
      ? this._cpuPickBattleItem(attackerPlayer, attackerUnit)
      : await this.onPickBattleItem(
          {
            hand: attackerPlayer.hand.filter(isBattleItemCard),
            opponentHand: defenderPlayer.hand.filter(isBattleItemCard),
            side: 'attacker',
            ownerName: attackerPlayer.name,
            opponentName: defenderPlayer.name,
            unitName: attackerUnit.def.name,
          },
          attackerPlayer.id,
        );
    const defenderItem = defenderPlayer.isCPU
      ? this._cpuPickBattleItem(defenderPlayer, defenderUnit)
      : await this.onPickBattleItem(
          {
            hand: defenderPlayer.hand.filter(isBattleItemCard),
            opponentHand: attackerPlayer.hand.filter(isBattleItemCard),
            side: 'defender',
            ownerName: defenderPlayer.name,
            opponentName: attackerPlayer.name,
            unitName: defenderUnit.def.name,
          },
          defenderPlayer.id,
        );
    if (this._isCancelled) return null;

    const equippedAttackerItem = this._consumeBattleItem(attackerPlayer, attackerUnit, attackerItem);
    const equippedDefenderItem = this._consumeBattleItem(defenderPlayer, defenderUnit, defenderItem);
    const attackerFusion = this._applyTrainFusion(attackerUnit, equippedAttackerItem);
    const defenderFusion = this._applyTrainFusion(defenderUnit, equippedDefenderItem);
    if (attackerFusion) attackerBase = this._baseStats(attackerUnit);
    if (defenderFusion) defenderBase = this._baseStats(defenderUnit);

    // 攻撃開始前効果（真剣白刃取りの強奪／海賊S・ステゴロの破壊）を、装備公開
    // （ATK+20等の補正演出）より前に確定・演出する。順序を守らないと、奪われる／
    // 壊される側の補正演出が先に出てしまい、見た目上は何も起きていないように
    // 見える（実数値の計算自体は元から正しい順序だった）。
    const preAttackEffects = applyPreAttackItemEffects(attackerUnit, defenderUnit);
    preAttackEffects.log.forEach((line) => this.onLog(line));
    for (const destruction of preAttackEffects.itemDestructions) {
      await this.onBattleItemDestroy(destruction);
      if (this._isCancelled) return null;
    }
    for (const steal of preAttackEffects.itemSteals) {
      await this.onBattleItemSteal(steal);
      if (this._isCancelled) return null;
    }

    // 装備公開: 奪われた/壊された側はitems配列が既に空になっているのでスキップ
    // する（何も装備していないので演出しようがない＝見た目上も本当に奪えている）。
    // ただし列車の合体も_applyTrainFusionがitemsを空にするので、items判定だけ
    // だと合体演出まで丸ごと飛んでしまう。合体した側は必ず演出する。
    // 表示中の補正値は複数枚重なる可能性があるため、側ごとに積み上げて追う。
    let attackerShownAtkBonus = attackerBonus.atk || 0;
    let attackerShownHpBonus = attackerBonus.hp || 0;
    let defenderShownAtkBonus = defenderBonus.atk || 0;
    let defenderShownHpBonus = defenderBonus.hp || 0;
    if (equippedAttackerItem && (attackerFusion || attackerUnit.items.includes(equippedAttackerItem))) {
      await this.onBattleEquip({
        side: 'attacker', item: equippedAttackerItem, unitName: attackerUnit.def.name,
        baseAtk: attackerBase.atk, baseHp: attackerBase.hp,
        baseCurrentHp: Math.min(attackerUnit.currentHp, attackerBase.hp),
        existingAtkBonus: attackerShownAtkBonus, existingHpBonus: attackerShownHpBonus,
        fusionCard: attackerFusion,
      });
      if (this._isCancelled) return null;
      attackerShownAtkBonus += Number(equippedAttackerItem.atkBonus || 0);
      attackerShownHpBonus += Number(equippedAttackerItem.hpBonus || 0);
    }
    if (equippedDefenderItem && (defenderFusion || defenderUnit.items.includes(equippedDefenderItem))) {
      await this.onBattleEquip({
        side: 'defender', item: equippedDefenderItem, unitName: defenderUnit.def.name,
        baseAtk: defenderBase.atk, baseHp: defenderBase.hp,
        baseCurrentHp: Math.min(defenderUnit.currentHp, defenderBase.hp),
        existingAtkBonus: defenderShownAtkBonus, existingHpBonus: defenderShownHpBonus,
        fusionCard: defenderFusion,
      });
      if (this._isCancelled) return null;
      defenderShownAtkBonus += Number(equippedDefenderItem.atkBonus || 0);
      defenderShownHpBonus += Number(equippedDefenderItem.hpBonus || 0);
    }

    // 真剣白刃取りで奪ったアイテムぶんの補正演出を、奪った側にもう一段重ねて
    // かける（元の持ち主側の装備公開は、items配列が空のため上でスキップ済み）。
    for (const steal of preAttackEffects.itemSteals) {
      const toAttacker = steal.toSide === 'attacker';
      const ownerUnit = toAttacker ? attackerUnit : defenderUnit;
      const ownerBase = toAttacker ? attackerBase : defenderBase;
      const ownerFusion = toAttacker ? attackerFusion : defenderFusion;
      for (const stolenItem of steal.items) {
        const existingAtkBonus = toAttacker ? attackerShownAtkBonus : defenderShownAtkBonus;
        const existingHpBonus = toAttacker ? attackerShownHpBonus : defenderShownHpBonus;
        await this.onBattleEquip({
          side: steal.toSide, item: stolenItem, unitName: ownerUnit.def.name,
          baseAtk: ownerBase.atk, baseHp: ownerBase.hp,
          baseCurrentHp: Math.min(ownerUnit.currentHp, ownerBase.hp),
          existingAtkBonus, existingHpBonus,
          fusionCard: ownerFusion,
        });
        if (this._isCancelled) return null;
        if (toAttacker) {
          attackerShownAtkBonus += Number(stolenItem.atkBonus || 0);
          attackerShownHpBonus += Number(stolenItem.hpBonus || 0);
        } else {
          defenderShownAtkBonus += Number(stolenItem.atkBonus || 0);
          defenderShownHpBonus += Number(stolenItem.hpBonus || 0);
        }
      }
    }

    // 装備が確定した"後"に、装備アイテム由来の動的加算（イカサマのサイコロの
    // ATK+出目×倍率）を反映する。ここでやらないと装備前計算になってしまい効かない。
    this._applyEquippedItemBonus(attackerUnit, attackerBonus);
    this._applyEquippedItemBonus(defenderUnit, defenderBonus);

    // 貫通: 守備側の「土地レベル由来のHP加算」だけを無効化する。表示側も特性
    // 表示のタイミングで同じ分だけ取り除く（下のtraitRevealSides参照 - 表示
    // だけ残すと貫通ダメージでHPが想定より大きく減ったように見える）。
    // モンスター自身のtraitsだけでなく、装備アイテムが持つpierce（にょ〇棒/
    // イカサマのサイコロ/斬〇剣）も対象にする。
    const attackerHasPierce = this._hasPierce(attackerUnit);
    const piercedLandHp = attackerHasPierce ? this._elementHpBonus(defenderUnit, battleTile) : 0;
    const battleDefenderBonus = this._pierceAdjustedBonus(defenderBonus, piercedLandHp);

    // 先制/後攻/貫通と最終ATK倍率の表示内容は、resolveBattleを呼ぶ"前"に
    // 確定させる。resolveBattleは終了時にunit.itemsを空にするため、後から
    // 評価すると装備由来の特性・ATKが消えた状態で計算されてしまう
    // （ペーの杖の先制が消えて相手のNinjaだけが「先制」と表示される、
    // 狂戦士＋不死鳥の盾が50→75ではなく40→60と表示される、等）。
    // 強奪・破壊はpreAttackEffectsで適用済みなので、この時点のitemsが
    // 実際に戦う装備そのものになる。
    const attackerScore = strikeOrderScore(attackerUnit);
    const defenderScore = strikeOrderScore(defenderUnit);
    const traitLabelsFor = (unit, myScore, theirScore) => {
      const labels = [];
      if (hasTrait(unit, 'firstStrike') && myScore > theirScore) labels.push('先制：先に攻撃');
      if (hasTrait(unit, 'lastStrike') && myScore < theirScore) labels.push('後攻：あとに攻撃');
      if (hasTrait(unit, 'pierce')) labels.push('貫通：HPの土地レベルボーナス、ダメージ無効化、反射を無視してダメージ。アイテムやカード能力によるHP増加は無視できない。');
      return labels;
    };
    // 攻撃側の貫通で守備側の土地レベルHPボーナスが実際に無効化される場合、
    // 特性表示のタイミングで画面上の「+◯◯」表示と表示HPからも同じ分だけ
    // 取り除く（カード能力や電柱由来の加算はここでも残す）。
    const attackerReveal = { side: 'attacker', labels: traitLabelsFor(attackerUnit, attackerScore, defenderScore) };
    if (piercedLandHp > 0) {
      attackerReveal.stripHpBonus = { side: 'defender', amount: piercedLandHp };
    }
    const traitRevealSides = [
      attackerReveal,
      { side: 'defender', labels: traitLabelsFor(defenderUnit, defenderScore, attackerScore) },
    ];
    // 先に攻撃する側（スコアが高い側／同点なら攻撃側）を先に見せる。
    if (defenderScore > attackerScore) traitRevealSides.reverse();

    // 狂戦士などの固有ステータス倍率は実ダメージだけでなく、攻撃開始前に
    // 大きな文字でも明示する。これで通常の応援加算との区別がつく。
    // 倍率の前後の値は装備込みの実数値（ここもresolveBattleより前に確定させる）。
    const multiplierLabels = (unit, bonus) => {
      if (!bonus.atkMultiplier || bonus.atkMultiplier === 1) return [];
      const before = statTotals(unit, { ...bonus, atkMultiplier: 1 }).atk;
      const after = statTotals(unit, bonus).atk;
      return [`${unit.def.name}：最終ATK${bonus.atkMultiplier}倍（${before}→${after}）`];
    };
    const effectRevealSides = [
      { side: 'attacker', labels: multiplierLabels(attackerUnit, attackerBonus) },
      { side: 'defender', labels: multiplierLabels(defenderUnit, defenderBonus) },
    ];

    // 破壊・強奪はpreAttackEffectsで既に適用・演出済みなので、resolveBattle内の
    // 同判定はitems配列が既に空/移動済み（length>0ガード）で不発になる。
    // result.itemDestructions/itemStealsは常に空配列で返るため、ここでの
    // 二重演出は発生しない。
    const result = resolveBattle(attackerUnit, defenderUnit, this._goldAdapter(), attackerBonus, battleDefenderBonus);
    result.log.forEach((line) => this.onLog(line));

    for (const reveal of traitRevealSides) {
      if (reveal.labels.length === 0) continue;
      await this.onBattleTraitReveal(reveal);
      if (this._isCancelled) return null;
    }
    for (const reveal of effectRevealSides) {
      if (reveal.labels.length === 0) continue;
      await this.onBattleTraitReveal(reveal);
      if (this._isCancelled) return null;
    }

    // `exchanges` is already in the order strikes actually happened (先制
    // can flip it to defender-first) - just play them back in order.
    for (const exchange of result.exchanges) {
      const item = exchange.side === 'attacker' ? attackerItem : defenderItem;
      const targetUnit = exchange.side === 'attacker' ? defenderUnit : attackerUnit;
      await this.onBattleAttack({
        side: exchange.side,
        // 毒tick・戦闘後の反動は誰かが撃った一撃ではないので、装備カードも
        // 属性ビームも出さない（aftermath側でスキップする）。
        item: exchange.aftermath ? null : item,
        message: exchange.message,
        damage: exchange.damage,
        element: exchange.element,
        attackPower: exchange.attackPower,
        elementMultiplier: exchange.elementMultiplier,
        targetHp: Math.max(exchange.targetHp ?? targetUnit.currentHp, 0),
        targetDied: exchange.targetDied,
        special: exchange.special,
        reflected: !!exchange.reflected,
        aftermath: !!exchange.aftermath,
        targetName: targetUnit.def.name,
      });
      if (this._isCancelled) return null;
    }
    // 強盗は攻撃後に実際の与ダメージから奪取額を算出するため、通常攻撃の
    // 再生が終わった直後に戦闘画面内で明示する。上部ログだけでは流れて
    // 見落とされるため、特性表示と同じ大きな表示を使う。
    // 与ダメージ比例の強奪（テンホウ／目出し帽）も同じ扱いで、発動した
    // 回数ぶん並べる（ツインハンマーの2回攻撃なら2件出る）。
    for (const effect of result.stealEffects || []) {
      await this.onBattleTraitReveal({
        side: effect.side,
        labels: [`強奪：${effect.amount}Gを奪った！`],
      });
      if (this._isCancelled) return null;
    }
    for (const effect of result.robberEffects || []) {
      await this.onBattleTraitReveal({
        side: effect.side,
        labels: [`強盗：${effect.amount}Gを奪った！`],
      });
      if (this._isCancelled) return null;
    }
    // 決着表示より先に身代わりを確定する。これにより一度「侵略成功」と
    // 表示してから防衛成功へ戻る不自然な流れを防ぐ。
    const lightningRod = this._prepareLightningRodSubstitution(defenderPlayer, battleTile, result);
    if (lightningRod) {
      await this.onBattleLightningRod({
        protectedUnitName: defenderUnit.def.name,
        rodCard: lightningRod.unit.def,
      });
      if (this._isCancelled) return null;
    }
    // Both sides got to strike and both survived - a genuine draw (見た目上
    // は防衛成功): retreat off-screen before the outcome message, rather
    // than either card crumbling.
    if (result.attackerSurvived && result.defenderSurvived) {
      await this.onBattleRetreat();
      if (this._isCancelled) return null;
    }

    // ハリネズミの服(reflectHalfDamage)等で両者とも倒れた場合、旧仕様では
    // 「防衛成功」側の勝利メッセージになっていた（wonがfalseの場合を全て
    // 防衛成功扱いしていたため）。実際には両者死亡なので明示的に区別する。
    const mutualDestruction = !result.attackerSurvived && !result.defenderSurvived;
    const won = result.attackerSurvived && !result.defenderSurvived;
    await this.onBattleOutcome({
      won,
      mutualDestruction,
      ownerName: won ? attackerPlayer.name : defenderPlayer.name,
      unitName: won ? attackerUnit.def.name : defenderUnit.def.name,
    });
    if (this._isCancelled) return null;

    this._maybeGrantRandomSpell(attackerUnit, attackerPlayer);
    this._maybeGrantRandomSpell(defenderUnit, defenderPlayer);
    this._maybeReturnItemToHand(attackerItem, attackerPlayer);
    this._maybeReturnItemToHand(defenderItem, defenderPlayer);
    await this._enforceHandLimit(attackerPlayer);
    await this._enforceHandLimit(defenderPlayer);

    return result;
  }

  /**
   * 不死鳥系（不死鳥の剣・不死鳥特性のモンスター）が手札に戻る際に呼ぶ。
   * 召喚/装備した時点で捨札（＝再シャッフルで山札に戻る）へ送られた同一カタログの
   * カードを1枚だけ回収して取り除く。これをやらないと「手札に戻った1枚」と
   * 「捨札に残った1枚」で実質2枚に増殖してしまう（デッキが循環するたびに増える）。
   * 捨札→山札の順に探し、最初に見つかった1枚だけ取り除く。
   */
  _reclaimCardFromDeck(player, catalogId) {
    const deck = player?.deck;
    if (!deck || catalogId == null) return;
    for (const pile of [deck.discardPile, deck.drawPile]) {
      if (!pile) continue;
      const idx = pile.findIndex((c) => catalogIdOf(c) === catalogId);
      if (idx !== -1) {
        pile.splice(idx, 1);
        return;
      }
    }
  }

  /** 不死鳥の剣: 実際に戦闘で使用された（=装備された）場合のみ、使い切った後も新しいidで持ち主の手札に戻る（手札上限で使わずに捨てられた場合はここを通らないので、通常のアイテム同様消滅する）。 */
  _maybeReturnItemToHand(item, player) {
    if (!item || !item.returnsToHandIfUsed) return;
    // _consumeBattleItemが捨札へ送った同一アイテムを1枚回収してから手札へ戻す
    // （手札分＋捨札分で増殖するのを防ぐ）。
    this._reclaimCardFromDeck(player, catalogIdOf(item));
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
    const card = {
      ...picked,
      id: `spell-summon-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      generatedOutsideDeck: true,
    };
    player.hand.push(card);
    this.onLog(`${player.name}の${unit.def.name}が「${card.name}」を手に入れた`);
  }

  async _runInvasion(player, tile, card) {
    this.onTutorialEvent('battle', { attackerId: player.id, defenderId: tile.owner });
    // battleEnd用: 決着処理でtile.ownerが書き換わる前の防衛側を控えておく。
    const battleDefenderId = tile.owner;
    const currentOwner = tile.owner != null ? this.players.find((candidate) => candidate.id === tile.owner) : null;
    if (currentOwner?.allianceId != null && currentOwner.allianceId === player.allianceId) {
      this.onLog('同盟仲間の土地には侵略できません');
      return;
    }
    // 絶対攻撃: 次の侵略で召喚するモンスターが一時的に貫通を得る（カードの
    // インスタンスだけをコピーして特性を足すので、カタログの元defは汚さない）。
    if (player.pierceNextInvasion) {
      player.pierceNextInvasion = false;
      card = { ...card, traits: [...(card.traits || []), 'pierce'] };
      this.onLog(`${player.name}の${card.name}が「絶対攻撃」の効果で貫通を得た！`);
    }

    // 完成ギアでの侵略は、侵略と同時に合体してガシャーンで出撃する（他2種のギアを
    // 消費し、召喚コストを払い戻す＝_maybeFuseGearと同じ扱い）。ダンボール男AIはこれを
    // 前提に勝率を見積もっている（_gashaanDefIfCompleting参照）。
    const gearPartnerTiles = this._completingGearPartnerTiles(card, player);
    if (gearPartnerTiles) {
      for (const t of gearPartnerTiles) {
        t.unit = null;
        t.owner = null;
        t.transparentCursed = false;
        this._repaintTileToElement(t);
      }
      player.currency += card.cost; // 合体特典: 召喚コスト払い戻し
      card = { ...GASHAAN_FIELD_MONSTER, id: `gashaan-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      this.onLog(`${player.name}のギアが侵略と同時に合体し「${card.name}」が出撃！ (召喚コスト払い戻し)`);
      this._notifyState();
    }

    const defenderPlayer = this.players.find((p) => p.id === tile.owner);
    const attackerUnit = createFieldUnit(card, player.id);
    const defenderUnit = tile.unit;
    const defenderLandLoss = this._captureLandLoss(defenderPlayer, tile);
    const attackerLandGain = this._captureLandGain(player, tile);

    // お前も〇ぬんだ: 次の侵略が戦闘無しで確定勝利になる（700G消費、通常の
    // 決着処理と同じ形で土地を奪う。避雷針侍の身代わり等の介入も一切挟まない）。
    if (player.guaranteedNextInvasionWin) {
      player.guaranteedNextInvasionWin = false;
      player.currency -= 700;
      this.onLog(`${player.name}は「お前も〇ぬんだ」の効果で戦闘なしに${defenderUnit.def.name}を倒した！ (-700G)`);
      tile.unit = attackerUnit;
      tile.owner = player.id;
      if (!this._conqueredLandingTiles) this._conqueredLandingTiles = new Set();
      this._conqueredLandingTiles.add(`${player.id}:${tile.id}`);
      tile.transparentCursed = false;
      tile.forcedStopCursed = false;
      this._paintTile(tile, player.color);
      await this._handleUnitDeath(defenderUnit, defenderPlayer);
      await this._presentLandLoss(defenderLandLoss);
      await this._presentLandGain(attackerLandGain);
      this._notifyState();
      return;
    }

    const result = await this._runBattleScene(attackerUnit, player, defenderUnit, defenderPlayer, null, tile);
    if (!result) return;
    // 強制停止の呪いは「戦闘が終わると消える」(勝敗を問わない) - _shrineForcedStop参照。
    tile.forcedStopCursed = false;
    await this._maybeRedirectDeathToLightningRod(defenderPlayer, tile, result);

    if (!result.defenderSurvived) {
      if (result.attackerSurvived) {
        tile.unit = attackerUnit;
        tile.owner = player.id;
        if (!this._conqueredLandingTiles) this._conqueredLandingTiles = new Set();
        this._conqueredLandingTiles.add(`${player.id}:${tile.id}`);
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
    } else if (result.attackerSurvived) {
      // 引き分け（両者生存）: 召喚侵略で出したモンスターは手札に戻る。召喚時に
      // 捨札へ送った同一カードを回収してから戻すことで増殖を防ぐ。
      // 戦闘列車/供物車両が戦闘中に合体した場合は、元カードではなく合体後の
      // モンスターとして戻す（戦闘結果の見た目と手札状態を一致させる）。
      this.onLog(`${defenderPlayer.name}の${defenderUnit.def.name}が防衛に成功した`);
      this._reclaimCardFromDeck(player, catalogIdOf(card));
      const returnDef = attackerUnit.def || card;
      player.hand.push({ ...returnDef, id: `drawreturn-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}` });
      this.onLog(`引き分けのため${returnDef.name}は${player.name}の手札に戻った`);
      this._notifyState();
      await this._enforceHandLimit(player);
    } else {
      this.onLog(`${defenderPlayer.name}の${defenderUnit.def.name}が防衛に成功した`);
      await this._handleUnitDeath(attackerUnit, player);
    }
    if (tile.owner !== defenderPlayer.id) await this._presentLandLoss(defenderLandLoss);
    if (tile.owner === player.id) await this._presentLandGain(attackerLandGain);
    // 決着後通知: チュートリアルの誘導ステップ（防衛レッスン）はアイテム選択を
    // 含む戦闘全体が終わってから進めたいので、開始時の'battle'とは別に送る。
    this.onTutorialEvent('battleEnd', { attackerId: player.id, defenderId: battleDefenderId });
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
    const rodTile = result.lightningRodTileId != null
      ? this.tiles.find((tile) => tile.id === result.lightningRodTileId)
      : null;
    if (!rodTile) return false;

    const rodUnit = rodTile.unit;
    const defenderUnit = defenderTile.unit;
    await this.onTargetEffect?.({
      tileId: rodTile.id,
      position: rodTile.position,
      message: `避雷針侍が${defenderUnit.def.name}の身代わりとなって倒れた！`,
    });
    rodTile.unit = null;
    rodTile.owner = null;
    rodTile.transparentCursed = false;
    this._repaintTileToElement(rodTile);

    this._notifyState();
    await this._handleUnitDeath(rodUnit, defenderPlayer);
    return true;
  }

  /** 戦闘結果表示前に避雷針侍の身代わりを予約し、防衛側を生存へ戻す。 */
  _prepareLightningRodSubstitution(defenderPlayer, defenderTile, result) {
    if (result.defenderSurvived) return null;
    const defenderUnit = defenderTile?.unit;
    if (!defenderUnit || catalogIdOf(defenderUnit.def) === 'raiheishinZamurai') return null;
    const rodTile = this.tiles.find(
      (tile) => tile !== defenderTile
        && tile.unit?.ownerId === defenderPlayer.id
        && catalogIdOf(tile.unit.def) === 'raiheishinZamurai',
    );
    if (!rodTile) return null;

    defenderUnit.currentHp = Math.max(1, Math.min(
      defenderUnit._boardHpBeforeBattle ?? defenderUnit.currentHp,
      this._baseStats(defenderUnit).hp,
    ));
    result.defenderSurvived = true;
    result.lightningRodTileId = rodTile.id;
    this.onLog(`${defenderPlayer.name}の避雷針侍が${defenderUnit.def.name}の身代わりになった！`);
    return { tile: rodTile, unit: rodTile.unit };
  }

  /**
   * 不死鳥: 死亡したユニットにこの特性があれば、カードを（新しいidで）
   * 持ち主の手札に戻す。手札上限を超える場合は通常の手札上限処理と同じ
   * 流れで1枚捨てさせる（捨てたカードはもう戻ってこない）。この特性が
   * 無ければ何もしない。
   */
  async _handleUnitDeath(unit, ownerPlayer) {
    // ネクロマンサー用の記録。不死鳥/ゾンビ復活で結果的に盤面へ戻る場合も
    // 「一度死んだ」事実自体は変わらないので、分岐より前に無条件で積む。
    this._deadMonstersThisMatch.push({
      id: `dead-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      def: { ...unit.def },
      originalOwnerId: ownerPlayer.id,
    });

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
        this.onLog(`${unit.def.name}が別の空き地に再出現した！`);
        this._notifyState();
      }
    }

    if (!unit.def.traits?.includes('phoenix')) return;

    const catalogId = catalogIdOf(unit.def);
    // 召喚時に捨札へ送られた同一モンスターを1枚回収してから手札へ戻す
    // （不死鳥で手札に戻る分＋捨札に残った分で増殖するのを防ぐ）。
    this._reclaimCardFromDeck(ownerPlayer, catalogId);
    const card = {
      ...unit.def,
      id: `phoenix-${ownerPlayer.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      catalogId,
    };
    ownerPlayer.hand.push(card);
    this.onLog(`${unit.def.name}は不死鳥の力で${ownerPlayer.name}の手札に戻った`);
    this._notifyState();

    await this._enforceHandLimit(ownerPlayer);
  }

  _placeUnit(tile, player, card) {
    this.onCardSeen?.(card);
    const isEmptyLandSummon = tile.type === TileType.LAND && tile.owner == null && tile.unit == null;
    tile.unit = createFieldUnit(card, player.id);
    if (isEmptyLandSummon && player.toughnessTurnsRemaining > 0) {
      const hpBonus = 10;
      tile.unit.summonBaseHpBonus = hpBonus;
      tile.unit.currentHp += hpBonus;
      this.onLog(`${player.name}の「タフネス」で${card.name}の基礎HPが${hpBonus}上昇した`);
    }
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

  /** cardが「他2種のギアが自分の土地に配置済み」の完成ギアなら、そのパートナーtile配列を返す。違えばnull。 */
  _completingGearPartnerTiles(card, player) {
    if (card?.effect?.type !== 'fusionSummon') return null;
    const partnerTiles = card.effect.partners.map((catalogId) =>
      this.tiles.find((t) => t.unit && t.unit.ownerId === player.id && catalogIdOf(t.unit.def) === catalogId),
    );
    return partnerTiles.every(Boolean) ? partnerTiles : null;
  }

  /** 侵略勝率シミュレーション用: cardが完成ギア（今召喚すれば合体できる）なら合体先ガシャーンのdefを、
   *  そうでなければcardをそのまま返す（盤面は変更しない）。ダンボール男が「ガシャーン召喚ありき」で
   *  侵略の勝算を見積もれるようにするため。 */
  _gashaanDefIfCompleting(card, ownerId) {
    const player = this.players.find((p) => p.id === ownerId);
    if (player && this._completingGearPartnerTiles(card, player)) return GASHAAN_FIELD_MONSTER;
    return card;
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
    return {
      ...picked,
      id: `item-summon-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      generatedOutsideDeck: true,
    };
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
      warpKind: tile.warpKind ?? null,
      element: tile.element,
      level: isLand ? tile.level : null,
      landValue: isLand ? this._landValueOfTile(tile) : null,
      toll: isLand ? this._tollOfTile(tile) : null,
      chainCount: isLand ? this._chainCount(tile.owner, tile.element) : null,
      price: tile.price,
      ownerName: owner ? owner.name : null,
      ownerColor: owner ? owner.color : null,
      unitName: tile.unit ? tile.unit.def.name : null,
      // 呪い（倍化等）込みの実際のATK/HPを見せる（def.atk/hpそのままだと
      // 「倍化」がかかっていても数値に反映されない）。
      unitAtk: tile.unit ? this._baseStats(tile.unit).atk : null,
      unitHp: tile.unit ? (tile.unit.currentHp ?? this._baseStats(tile.unit).hp) : null,
      // 戦闘になった時だけ基礎値に上乗せされる状況ボーナス（土地情報で見えると
      // 「この土地に置くと何が乗るか」が事前に分かる）。同属性土地HPは
      // 「この土地」自体がpositionTile、応援ATKも「この土地」自体が
      // battleTileになる（防衛時はこのマスで戦うため）。
      unitElementHpBonus: tile.unit ? this._elementHpBonus(tile.unit, tile) : null,
      unitCheerAtkBonus: tile.unit ? this._cheerAtkBonus(tile.unit, tile) : null,
      // 呪い一覧（マ〇ジャロ等のstatCurse、毒・感電のようにaddedAtk/addedHpを
      // 持たないものも名前だけは分かるよう含める）。
      unitCurses: tile.unit
        ? tile.unit.curses.map((c) => ({ name: c.name, addedAtk: c.addedAtk || 0, addedHp: c.addedHp || 0 }))
        : [],
      unitCard: tile.unit ? {
        catalogId: tile.unit.def.catalogId ?? null,
        name: tile.unit.def.name,
        type: tile.unit.def.type,
        rarity: tile.unit.def.rarity,
        element: tile.unit.def.element,
        cost: tile.unit.def.cost ?? 0,
        atk: tile.unit.def.atk,
        hp: tile.unit.def.hp,
        traits: tile.unit.def.traits ?? [],
        effectDescription: tile.unit.def.effectDescription ?? '',
        imageDataUrl: tile.unit.def.imageDataUrl ?? null,
        imageFit: tile.unit.def.imageFit ?? null,
      } : null,
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
    // タフネスは対象プレイヤーが手番を終えた時に1消費する。開始時に減らすと、
    // 同盟者へかけた直後の最初の手番が2扱いになり、3ターン分使えなくなる。
    if (this.currentPlayer.toughnessTurnsRemaining > 0) this.currentPlayer.toughnessTurnsRemaining -= 1;
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    } while (this.players[this.currentPlayerIndex].defeated);
  }

  /**
   * アサシンユニット運用（ダンボール男のガシャーン／「彼」の未知の侵略者）。
   * Lv3以上の敵地に隣接していればモンスター移動で侵略し、離れていればその敵地に
   * 隣接する空き地へワープで先回りする。どちらも土地コマンド1回分としてそのターンを
   * 終了する。ワープ時は各ユニットのcommandCostを消費する（未知の侵略者=30G）。
   */
  async _cpuMaybeUseAssassinTactics(player, accessibleTileIds = []) {
    const assassinId = this._isDanballBoss(player)
      ? 'gashaan-field'
      : player.name === '「彼」'
        ? 'mysteriousInvader'
        : null;
    if (!assassinId) return false;
    const accessibleSet = new Set(accessibleTileIds);
    const source = this.tiles.find(
      (tile) => accessibleSet.has(tile.id)
        && tile.unit?.ownerId === player.id
        && catalogIdOf(tile.unit.def) === assassinId,
    );
    if (!source) return false;

    // 勝算のない標的は狙わない: 侵略で負けるとアサシンと移動元の土地を両方失い、
    // 勝てない敵地の横へワープしても待ち伏せが成立しない（ワープ費用も無駄になる）。
    const minWinRate = Math.max(player.aiProfile?.minWinProbabilityToInvade ?? 0, CPU_MOVE_INVASION_MIN_WIN_RATE);
    const enemyLands = this.tiles
      .filter((tile) => this._isInvadeWorthyEnemyLand(tile, player))
      .filter((tile) => this._estimateUnitBattleWinProbability(source.unit, null, tile) >= minWinRate)
      .sort((a, b) => b.level - a.level || this._landValueOfTile(b) - this._landValueOfTile(a));
    if (enemyLands.length === 0) return false;

    const adjacentEnemy = enemyLands.find((target) => source.neighbors.includes(target.id));
    if (adjacentEnemy) {
      this.onLog(`${player.name}は${source.unit.def.name}を移動させ、Lv${adjacentEnemy.level}の敵地へ侵略する！`);
      await this._cpuMoveOwnedUnit(player, source, adjacentEnemy);
      return true;
    }

    const staging = enemyLands.flatMap((enemy) => enemy.neighbors
      .map((id) => this.tiles[id])
      .filter((tile) => tile.type === TileType.LAND && tile.owner == null)
      .map((tile) => ({ tile, enemy })));
    if (staging.length === 0) return false;
    // ワープにはcommandCostが要る（未知の侵略者=30G、ガシャーン=0G）。払えないなら見送る。
    const warpCost = source.unit.def.commandCost || 0;
    if (player.currency < warpCost) return false;
    staging.sort((a, b) => b.enemy.level - a.enemy.level || this._landValueOfTile(b.enemy) - this._landValueOfTile(a.enemy));
    const target = staging[0].tile;
    const unit = source.unit;
    const mesh = source.unitMesh;
    const sourceLandLoss = this._captureLandLoss(player, source);
    const destinationLandGain = this._captureLandGain(player, target, { showAnyChange: true });
    player.currency -= warpCost;
    source.unitMesh = null;
    target.unit = unit;
    target.owner = player.id;
    target.unitMesh = mesh;
    this._paintTile(target, player.color);
    source.unit = null;
    source.owner = null;
    source.transparentCursed = false;
    this._repaintTileToElement(source);
    this.onLog(`${player.name}の${unit.def.name}がLv${staging[0].enemy.level}の敵地の横へ移動した！${warpCost > 0 ? ` (-${warpCost}G)` : ''}`);
    await this._hopUnitIcon(mesh, source.position, target.position);
    this._notifyState();
    await this.onTargetEffect?.({ tileId: target.id, position: target.position, message: `${unit.def.name}が敵地の横へワープした！` });
    await this._presentLandLoss(sourceLandLoss);
    await this._presentLandGain(destinationLandGain);
    return true;
  }

  /** CPU用の隣接モンスター移動。人間の「移動」と同じ一戦・奪取処理を使う。 */
  async _cpuMoveOwnedUnit(player, source, target) {
    const attackerUnit = source.unit;
    if (attackerUnit?.def?.traits?.includes('immovableByMoveCommand')) return false;
    const defenderPlayer = this.players.find((candidate) => candidate.id === target.owner);
    const defenderUnit = target.unit;
    const sourceLandLoss = this._captureLandLoss(player, source);
    const defenderLandLoss = this._captureLandLoss(defenderPlayer, target);
    const attackerLandGain = this._captureLandGain(player, target, { showAnyChange: true });
    attackerUnit.curses = [];
    const result = await this._runBattleScene(attackerUnit, player, defenderUnit, defenderPlayer, null, target);
    if (!result) return false;
    target.forcedStopCursed = false;
    await this._maybeRedirectDeathToLightningRod(defenderPlayer, target, result);

    if (result.attackerSurvived && !result.defenderSurvived) {
      const mesh = source.unitMesh;
      source.unitMesh = null;
      this.scene.removeUnitIcon?.(target.unitMesh);
      target.unit = attackerUnit;
      target.owner = player.id;
      target.unitMesh = mesh;
      this._paintTile(target, player.color);
      source.unit = null;
      source.owner = null;
      source.transparentCursed = false;
      this._repaintTileToElement(source);
      await this._handleUnitDeath(defenderUnit, defenderPlayer);
      await this._hopUnitIcon(mesh, source.position, target.position);
      this.onLog(`${player.name}の${attackerUnit.def.name}がLv${target.level}の土地を奪取した！`);
      await this._presentLandLoss(defenderLandLoss);
      await this._presentLandGain(attackerLandGain);
      await this._presentLandLoss(sourceLandLoss);
    } else if (result.attackerSurvived && result.defenderSurvived) {
      await this._hopUnitIcon(source.unitMesh, source.position, target.position);
      await this._hopUnitIcon(source.unitMesh, target.position, source.position);
      this.onLog(`${defenderPlayer.name}が防衛し、${attackerUnit.def.name}は元の土地へ戻った`);
    } else {
      source.unit = null;
      source.owner = null;
      source.transparentCursed = false;
      this._repaintTileToElement(source);
      await this._handleUnitDeath(attackerUnit, player);
      await this._presentLandLoss(sourceLandLoss);
      if (!result.defenderSurvived) {
        target.unit = null;
        target.owner = null;
        target.transparentCursed = false;
        this._repaintTileToElement(target);
        await this._handleUnitDeath(defenderUnit, defenderPlayer);
        await this._presentLandLoss(defenderLandLoss);
      }
    }
    this._notifyState();
    return true;
  }

  async _runCPUTurn() {
    await delay(CPU_PRE_ROLL_MS);
    if (!this.currentPlayer.isCPU) return;
    // チュートリアルのCPUはスペルを使わない: 台本の進行（固定ダイスで決めた
    // 着地マス）をスペル移動やダイス操作で崩さないため。サイコロを振って
    // 土地コマンド（台本→通常AI）だけを行う。
    if (this.tutorialMode) {
      const fixedDiceValue = this._tutorialDiceValue();
      const steps = await this.onCpuRoll(fixedDiceValue);
      this.rollDice(steps);
      return;
    }
    if (await this._cpuMaybeUseHomingInstinctSpell(this.currentPlayer)) {
      for (const player of this.players) await this._resolveNegativeCurrency(player);
      if (!this.storyEnded) {
        this._nextTurn();
        await this._beginTurn();
      }
      return;
    }
    await this._cpuMaybeUseForcedAscensionSpell(this.currentPlayer);
    // ダンボール男は③手札の「未知との遭遇」を最優先で使う（無属性モンスター＝ギアを
    // 引き寄せてガシャーン合体を狙う）。1ターン1スペルなので他スペルより先に判定。
    await this._cpuMaybeUseDisclosureRequest(this.currentPlayer);
    await this._cpuMaybeUseToughnessSpell(this.currentPlayer);
    await this._cpuMaybeUseMuuruStrategySpell(this.currentPlayer);
    await this._cpuMaybeUseEncounterSpell(this.currentPlayer);
    await this._cpuMaybeUseMagicCircleSpell(this.currentPlayer);
    if (await this._cpuMaybeWarpToHighValueLand(this.currentPlayer)) {
      // ブルーオーシャンはサイコロを振らずにターンを終了する。スペルの
      // 表示終了後に通常のターン終了処理を一度だけ実行する。
      for (const player of this.players) await this._resolveNegativeCurrency(player);
      if (!this.storyEnded) {
        this._nextTurn();
        await this._beginTurn();
      }
      return;
    }
    await this._cpuMaybeFixLandElementSpell(this.currentPlayer);
    await this._cpuMaybeUsePsychokinesisSpell(this.currentPlayer);
    await this._cpuMaybeUseDisruptionSpell(this.currentPlayer);
    await this._cpuMaybeUseDamageSpell(this.currentPlayer);
    await this._cpuMaybeUsePoisonSpell(this.currentPlayer);
    await this._cpuMaybeUseCancelCultureSpell(this.currentPlayer);
    await this._cpuMaybeUseManaExtractionSpell(this.currentPlayer);
    await this._cpuMaybeUseNecromancerSpell(this.currentPlayer);
    await this._cpuMaybeUseSplitEvenlySpell(this.currentPlayer);
    await this._cpuMaybeUseStealGoldSpell(this.currentPlayer);
    await this._cpuMaybeUseCurseCleanseSpell(this.currentPlayer);
    await this._cpuMaybeUseHealSpell(this.currentPlayer);
    await this._cpuMaybeUsePhoenixCurseSpell(this.currentPlayer);
    await this._cpuMaybeUseChainStatCurseSpell(this.currentPlayer);
    await this._cpuMaybeUseGuaranteedWinSpell(this.currentPlayer);
    await this._cpuMaybeUseReverseDiceSpell(this.currentPlayer);
    await this._cpuMaybeUseShuffleSpell(this.currentPlayer);
    await this._cpuMaybeUseTollBonusSpell(this.currentPlayer);
    await this._cpuMaybeUseTollReductionSpell(this.currentPlayer);
    await this._cpuMaybeUseTollWaiverSpell(this.currentPlayer);
    await this._cpuMaybeUseAppraiserSpell(this.currentPlayer);
    await this._cpuMaybeUseDivinationSpell(this.currentPlayer);
    await this._cpuMaybeUseImmediateSpell(this.currentPlayer);
    await this._cpuMaybeUseDiceSpell(this.currentPlayer);
    const fixedDiceValue = this.currentPlayer.diceCurse?.type === 'fixed'
      ? this.currentPlayer.diceCurse.value
      : this._tutorialDiceValue();
    const steps = await this.onCpuRoll(fixedDiceValue);
    this.rollDice(steps);
  }

  _cpuDisclosureCastForSpell(player, card) {
    const target = card.target;
    if (target === 'self' || target === 'none') return {};
    if (target === 'selfOrAllyPlayer') return { targetPlayerId: player.id };
    const enemies = this.players.filter((candidate) => !candidate.defeated && candidate.id !== player.id && !this._isAllyOf(candidate, player));
    if (target === 'enemyPlayer') return enemies[0] ? { targetPlayerId: enemies[0].id } : null;
    if (target === 'anyPlayer') {
      const beneficial = card.effect?.type === 'doubleNextDice'
        || (card.effect?.type === 'setNextDice' && card.effect.value === 6);
      const picked = beneficial ? player : enemies[0];
      return picked ? { targetPlayerId: picked.id } : null;
    }
    if (target === 'enemyMonster' || target === 'anyMonster' || target === 'ownMonster') {
      const candidates = this.tiles.filter((tile) => {
        if (!tile.unit) return false;
        if (target === 'enemyMonster') return tile.unit.ownerId !== player.id;
        if (target === 'ownMonster') return tile.unit.ownerId === player.id;
        return true;
      });
      return candidates[0] ? { targetTileId: candidates[0].id } : null;
    }
    if (target === 'anyTile' || target === 'ownTile') {
      const candidates = this.tiles.filter((tile) => tile.type === TileType.LAND && (target !== 'ownTile' || tile.owner === player.id));
      return candidates[0] ? { targetTileId: candidates[0].id } : null;
    }
    return null;
  }

  /** 「彼」・段ボール男共通: 開示請求はモンスター優先、その中でEX→R→S→Nの順に奪う。 */
  async _cpuMaybeUseDisclosureRequest(player) {
    // 対象選びは総資産・レアリティ・同盟だけを見る共通処理なので、名前で
    // 絞らずこのカードを引いたCPU全員が使う（邪神ヒトデマソの分も含む）。
    if (player.spellUsedThisTurn) return;
    const disclosure = player.hand.find((card) => card.type === CardType.SPELL && card.effect?.type === 'disclosureRequest');
    if (!disclosure || player.currency < (disclosure.cost || 0)) return;
    const rarityRank = { [Rarity.N]: 0, [Rarity.S]: 1, [Rarity.R]: 2, [Rarity.EX]: 3 };
    // 同盟戦では同盟者を絶対に対象に含めない。「彼」・段ボール男を含む
    // 全CPUがこの共通処理を通る。
    const candidates = this.players
      .filter((target) => !target.defeated && target.id !== player.id && !this._isAllyOf(target, player))
      .flatMap((target) => this._disclosureEligibleCards(player, target, disclosure.cost || 0)
        .map((card) => ({ target, card })));
    if (candidates.length === 0) return;
    const monsters = candidates.filter(({ card }) => card.type === CardType.MONSTER);
    const ordered = [...(monsters.length > 0 ? monsters : candidates)].sort((a, b) =>
      (rarityRank[b.card.rarity] ?? 0) - (rarityRank[a.card.rarity] ?? 0)
      || ((b.card.atk || 0) + (b.card.hp || 0)) - ((a.card.atk || 0) + (a.card.hp || 0))
      || (b.card.cost || 0) - (a.card.cost || 0));
    for (const picked of ordered) {
      const nestedCast = picked.card.type === CardType.SPELL
        ? this._cpuDisclosureCastForSpell(player, picked.card)
        : null;
      if (picked.card.type === CardType.SPELL && !nestedCast) continue;
      await this._cpuCastSpell(player, disclosure, {
        targetPlayerId: picked.target.id,
        targetCardId: picked.card.id,
        nestedCast,
      });
      return;
    }
  }

  /** ムール専用: 水連鎖と関所クラゲが揃った時だけタフネスを自分へ使う。 */
  async _cpuMaybeUseToughnessSpell(player) {
    if (player.spellUsedThisTurn || player.toughnessTurnsRemaining > 0) return;
    const card = player.hand.find((candidate) => candidate.effect?.type === 'summonBaseHpBoostCurse');
    if (!card || player.currency < (card.cost || 0)) return;

    if (player.name === 'ムール') {
      // ムールは強化した関所クラゲを水地に据えるのが狙い（_cpuChooseSummonCard
      // ForMuuru参照）。その形が組める時だけ使う。
      const hasJellyfish = player.hand.some((candidate) => catalogIdOf(candidate) === 'kaikyouSekishoKurage');
      if (!hasJellyfish || this._chainCount(player.id, Element.WATER) < 1) return;
      const hasWaterVacancy = this.tiles.some((tile) => tile.type === TileType.LAND
        && tile.owner == null && tile.element === Element.WATER);
      if (!hasWaterVacancy) return;
      await this._cpuCastSpell(player, card, { targetPlayerId: player.id });
      return;
    }

    // 汎用: これから空き地へ召喚できる算段（召喚可能なモンスター＋空き地）が
    // ある時だけ自分にかける。侵略には乗らないので、空き地が無い盤面では温存。
    if (this._affordableMonsterCards(player).length === 0) return;
    const hasVacancy = this.tiles.some((tile) => tile.type === TileType.LAND && tile.owner == null);
    if (!hasVacancy) return;
    await this._cpuCastSpell(player, card, { targetPlayerId: player.id });
  }

  /** ムール専用の水連鎖・税務スペル運用。タフネスを使わなかった手番だけ実行する。 */
  async _cpuMaybeUseMuuruStrategySpell(player) {
    if (player.name !== 'ムール' || player.spellUsedThisTurn) return;
    const affordable = (effectType) => player.hand.find((candidate) => candidate.type === CardType.SPELL
      && candidate.effect?.type === effectType && player.currency >= (candidate.cost || 0));

    // まず水モンスターを盤上へ増やし、関所クラゲの召喚条件となる水連鎖を作る。
    const circle = player.hand.find((candidate) => candidate.effect?.type === 'randomDeckMonsterSummon'
      && candidate.effect.element === Element.WATER && player.currency >= (candidate.cost || 0));
    const hasWaterInDeck = [...player.deck.drawPile, ...player.deck.discardPile]
      .some((candidate) => candidate.type === CardType.MONSTER && candidate.element === Element.WATER);
    const hasEmptyLand = this.tiles.some((tile) => tile.type === TileType.LAND && tile.owner == null);
    if (circle && hasWaterInDeck && hasEmptyLand) {
      await this._cpuCastSpell(player, circle, {});
      return;
    }

    // 所有する非水土地を水へ変え、連鎖数と水モンスターの土地HPを同時に伸ばす。
    const waterRelease = player.hand.find((candidate) => candidate.effect?.type === 'forceTileElement'
      && candidate.effect.element === Element.WATER && player.currency >= (candidate.cost || 0));
    const conversionTarget = this.tiles
      .filter((tile) => tile.owner === player.id && tile.element !== Element.WATER)
      .sort((a, b) => b.level - a.level || Number(!!b.unit) - Number(!!a.unit))[0];
    if (waterRelease && conversionTarget) {
      await this._cpuCastSpell(player, waterRelease, { targetTileId: conversionTarget.id });
      return;
    }

    const appraiser = affordable('enableAllOwnTileAbilities');
    if (appraiser && player.allTilesAccessTurnsRemaining <= 0 && this._ownedTiles(player).length >= 2) {
      await this._cpuCastSpell(player, appraiser, {});
      return;
    }

    // 追徴課税は自分の最も高い通行料を持つ守備土地へ付与する。
    const audit = affordable('tollBonusOnceCurse');
    const auditTarget = this._ownedTiles(player)
      .filter((tile) => tile.unit && !tile.tollBonusOnceMultiplier)
      .sort((a, b) => this._tollOfTile(b) - this._tollOfTile(a))[0];
    if (audit && auditTarget) await this._cpuCastSpell(player, audit, { targetTileId: auditTarget.id });
  }

  /** 帰巣本能のCPU判断。
   * 1) 敵が最後の未通過CPの1マス手前なら、その敵をゴールへ戻して妨害。
   * 2) 自分の所持Gが300G以下なら自分へ使用。ただし未通過CPが残り1つだけ
   *    の時は温存し、そのCP通過後（次の手番）に周回ボーナス込みで使う。 */
  async _cpuMaybeUseHomingInstinctSpell(player) {
    if (player.spellUsedThisTurn) return false;
    const card = player.hand.find((candidate) => candidate.effect?.type === 'returnPlayerToStart');
    if (!card || player.currency < (card.cost || 0)) return false;

    const checkpointTiles = this.tiles.filter((tile) => tile.type === TileType.EVENT);
    const remainingFor = (target) => checkpointTiles.filter((tile) => !target.passedCheckpoints.has(tile.id));
    const enemyAtLastCheckpoint = this.players
      .filter((target) => !target.defeated && target.id !== player.id && !this._isAllyOf(target, player))
      .map((target) => ({ target, remaining: remainingFor(target) }))
      .filter(({ target, remaining }) => remaining.length === 1
        && this._forwardTileDistance(target.tileId, target.previousTileId, remaining[0].id) <= 1)
      .sort((a, b) => this._totalAssetsOf(b.target) - this._totalAssetsOf(a.target))[0]?.target;

    if (enemyAtLastCheckpoint) {
      await this._cpuCastSpell(player, card, { targetPlayerId: enemyAtLastCheckpoint.id });
      return true;
    }

    const ownRemaining = remainingFor(player);
    if (player.currency <= 300 && ownRemaining.length !== 1) {
      await this._cpuCastSpell(player, card, { targetPlayerId: player.id });
      return true;
    }
    return false;
  }

  async _cpuMaybeUseForcedAscensionSpell(player) {
    if (player.name !== '邪神ヒトデマソ' || player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'cashOutOwnLand');
    if (!card || player.currency < (card.cost || 0)) return;
    const candidates = this.tiles
      .filter((tile) => tile.type === TileType.LAND && tile.owner === player.id)
      .map((tile) => ({ tile, value: this._landValueOfTile(tile) }))
      .filter(({ tile, value }) => tile.level >= 3 || value >= 600)
      .sort((a, b) => b.value - a.value);
    if (!candidates.length) return;
    await this._cpuCastSpell(player, card, { targetTileId: candidates[0].tile.id });
  }

  /** ダンボール男専用: 手札に「未知との遭遇」があれば最優先で使用（コスト40G以上あれば）。 */
  async _cpuMaybeUseEncounterSpell(player) {
    // ダンボール男専用だった判定を外し、このカードを持つCPU全員が使う。
    // 効果自体は「無属性モンスターを引き寄せる」だけで持ち主を選ばない。
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'encounterUnknown');
    if (!card || player.currency < (card.cost || 0)) return;
    await this._cpuCastSpell(player, card, {});
  }

  /** ダンボール男専用: 手札に「無色の魔法陣」があれば積極的に使用する（ギア/合体狙いのデッキと相性が良いため）。 */
  async _cpuMaybeUseMagicCircleSpell(player) {
    if (!this._isDanballBoss(player) || player.spellUsedThisTurn) return;
    const card = player.hand.find(
      (c) => c.type === CardType.SPELL && c.effect?.type === 'randomDeckMonsterSummon' && c.effect.element === Element.NEUTRAL,
    );
    if (!card || player.currency < (card.cost || 0)) return;
    await this._cpuCastSpell(player, card, {});
  }

  /** 占術: 手札が少ない種類を補い、候補が同数ならモンスター→アイテム→スペルを優先する。 */
  async _cpuMaybeUseDivinationSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((candidate) => candidate.effect?.type === 'drawRandomCardOfChosenType');
    if (!card || player.currency < (card.cost || 0)) return;
    const priority = [CardType.MONSTER, CardType.GEAR, CardType.SPELL];
    const candidates = priority
      .map((type) => ({
        type,
        handCount: player.hand.filter((candidate) => candidate.type === type).length,
        deckCount: [...player.deck.drawPile, ...player.deck.discardPile]
          .filter((candidate) => candidate.id !== card.id && candidate.type === type).length,
      }))
      .filter(({ deckCount }) => deckCount > 0)
      .sort((a, b) => a.handCount - b.handCount || priority.indexOf(a.type) - priority.indexOf(b.type));
    if (candidates.length === 0) return;
    await this._cpuCastSpell(player, card, { chosenCardType: candidates[0].type });
  }

  /** 配られたら即時使うスペル。アイキャンフライを副業収入より優先する。 */
  /**
   * 財布チューチュー(stealGoldRatio)のCPU使用判断: 同盟仲間を除く相手のうち
   * 手持ちGが最も多いプレイヤーを狙い、奪える見込み額（手持ちG×ratio）が
   * コストの2倍以上ある時だけ使う（30%・コスト100Gなら手持ち667G以上）。
   * 序盤の小銭に撃って無駄遣いせず、目標達成間際の貯め込みを崩す用途に絞る。
   */
  async _cpuMaybeUseStealGoldSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'stealGoldRatio');
    if (!card || player.currency < (card.cost || 0)) return;
    const target = this.players
      .filter((p) => !p.defeated && p.id !== player.id && !this._isAllyOf(p, player))
      .sort((a, b) => b.currency - a.currency)[0];
    if (!target) return;
    const expected = Math.round(target.currency * (card.effect.ratio || 0));
    if (expected < (card.cost || 0) * 2) return;
    await this._cpuCastSpell(player, card, { targetPlayerId: target.id });
  }

  /**
   * 呪い解除(cleanseCurses)のCPU使用判断: 有害なダイス呪いを受けているか、
   * 自分の配置モンスターに呪いが付いている時に使う。有益な状態（宝くじ・
   * 絶対攻撃・お前も〇ぬんだ・脱税チャージ・不動産鑑〇士・出目強化）まで
   * まとめて消えてしまう仕様のため、それらを持っている間は温存する。
   */
  async _cpuMaybeUseCurseCleanseSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'cleanseCurses');
    if (!card || player.currency < (card.cost || 0)) return;
    if (player.lotteryOnNextGoal || player.pierceNextInvasion || player.guaranteedNextInvasionWin
      || player.tollWaiverCharges > 0 || player.allTilesAccessTurnsRemaining > 0) return;
    if (player.diceCurse && !this._hasHarmfulDiceCurse(player)) return;
    const cursedTiles = this.tiles.filter(
      (t) => t.owner === player.id && t.unit?.ownerId === player.id && t.unit.curses.length > 0,
    );
    if (!this._hasHarmfulDiceCurse(player) && cursedTiles.length === 0) return;
    const target = [...cursedTiles].sort((a, b) => b.unit.curses.length - a.unit.curses.length)[0];
    await this._cpuCastSpell(player, card, target ? { targetTileId: target.id } : {});
  }

  /** ヒール(fullHeal)のCPU使用判断: HPを4割以上（かつ20以上）失っている
   * 自分の配置モンスターのうち、失いが最も大きい1体を全回復する。 */
  async _cpuMaybeUseHealSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'fullHeal');
    if (!card || player.currency < (card.cost || 0)) return;
    const wounded = this.tiles
      .filter((t) => t.owner === player.id && t.unit?.ownerId === player.id)
      .map((tile) => ({ tile, maxHp: this._baseStats(tile.unit).hp }))
      .map((x) => ({ ...x, missing: x.maxHp - x.tile.unit.currentHp }))
      .filter((x) => x.missing >= 20 && x.tile.unit.currentHp <= x.maxHp * 0.6);
    if (wounded.length === 0) return;
    const best = wounded.sort((a, b) => b.missing - a.missing || b.tile.level - a.tile.level)[0];
    await this._cpuCastSpell(player, card, { targetTileId: best.tile.id });
  }

  /** 不死鳥の呪い: 高レベル地や高価値モンスターを1回だけ致死回避できるよう守る。 */
  async _cpuMaybeUsePhoenixCurseSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'surviveLethalDamageCurse');
    if (!card || player.currency < (card.cost || 0)) return;
    const candidates = this.tiles
      .filter((t) => t.owner === player.id && t.unit?.ownerId === player.id)
      .filter((t) => !t.unit.items?.some((item) => item.effect?.type === 'surviveLethalDamage'))
      .map((tile) => {
        const def = tile.unit.def;
        const rarityScore = def.rarity === Rarity.EX ? 80 : def.rarity === Rarity.R ? 50 : def.rarity === Rarity.S ? 25 : 0;
        const statScore = (def.hp || 0) + (def.atk || 0);
        return { tile, score: tile.level * 35 + (def.cost || 0) + rarityScore + statScore };
      })
      .filter(({ score }) => score >= 170)
      .sort((a, b) => b.score - a.score);
    if (candidates.length === 0) return;
    await this._cpuCastSpell(player, card, { targetTileId: candidates[0].tile.id });
  }

  /**
   * 国士無双！！(chainStatCurse)のCPU使用判断: 呪いは「その土地の所有者の
   * 同属性連鎖数×perChain」だけHP/ATKを上げる＝敵にかけると敵を強化して
   * しまうので、必ず自分（同盟仲間含む）のモンスターに使う。連鎖が伸びて
   * いる土地ほど効果が大きいので、上がり幅が最大の1体を選び、上げ幅が
   * 小さすぎる（10未満）うちは温存する。
   */
  async _cpuMaybeUseChainStatCurseSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'chainStatCurse');
    if (!card || player.currency < (card.cost || 0)) return;
    const perChain = card.effect.perChain || 0;
    const candidates = this.tiles
      .filter((t) => t.unit && this._isFriendlyUnitTile(t, player))
      // 呪いは1体1つしか保持できない。既に有益な呪いが乗っている個体は避ける。
      .filter((t) => !t.unit.curses?.some((c) => (c.addedAtk || 0) > 0 || (c.addedHp || 0) > 0))
      .map((tile) => ({ tile, gain: this._chainCount(tile.unit.ownerId, tile.element) * perChain }))
      .filter(({ gain }) => gain >= 10)
      .sort((a, b) => b.gain - a.gain || b.tile.level - a.tile.level);
    if (candidates.length === 0) return;
    await this._cpuCastSpell(player, card, { targetTileId: candidates[0].tile.id });
  }

  /**
   * お前も〇ぬんだ(guaranteedNextInvasionWin)のCPU使用判断: 発動そのものの
   * コストに加えて侵略時に700Gを失うので、その両方を払ってなお備え
   * （_cpuSummonReserve）が残る時だけ仕込む。狙える敵地（同盟以外が守る
   * Lv2以上の土地）が無い、もしくは手札に侵略用モンスターが無い時は温存。
   */
  async _cpuMaybeUseGuaranteedWinSpell(player) {
    if (player.spellUsedThisTurn || player.guaranteedNextInvasionWin) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'guaranteedNextInvasionWin');
    if (!card) return;
    const upfront = (card.cost || 0) + (card.effect.cost || 0);
    if (player.currency - upfront < this._cpuSummonReserve(player)) return;
    if (this._affordableMonsterCards(player).length === 0) return;
    const worthwhile = this.tiles.some((t) => {
      if (t.type !== TileType.LAND || t.owner == null || t.owner === player.id || !t.unit) return false;
      const owner = this.players.find((p) => p.id === t.owner);
      if (!owner || owner.defeated || this._isAllyOf(owner, player)) return false;
      return t.level >= 2 && !t.transparentCursed;
    });
    if (!worthwhile) return;
    await this._cpuCastSpell(player, card, {});
  }

  /**
   * バックファイア(reverseNextDice)のCPU使用判断: 同盟以外の相手のうち、
   * 未通過CPが最も少なく（＝ゴールに一番近い）総資産も高い相手を後退させる。
   * 既に有害なダイス呪いがかかっている相手には重ねない。
   */
  async _cpuMaybeUseReverseDiceSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'reverseNextDice');
    if (!card || player.currency < (card.cost || 0)) return;
    const target = this.players
      .filter((p) => !p.defeated && p.id !== player.id && !this._isAllyOf(p, player))
      .filter((p) => !this._hasHarmfulDiceCurse(p))
      .sort((a, b) => b.passedCheckpoints.size - a.passedCheckpoints.size
        || this._totalAssetsOf(b) - this._totalAssetsOf(a))[0];
    if (!target) return;
    await this._cpuCastSpell(player, card, { targetPlayerId: target.id });
  }

  /**
   * シャッフル(swapTwoMonsters)のCPU使用判断: 最高レベルの土地の守備が
   * 明確に弱く（合計ステ差30以上）、レベル差2以上の低レベル土地に強い
   * モンスターが居る時、入れ替えて高地価の土地の守りを固める。
   */
  async _cpuMaybeUseShuffleSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'swapTwoMonsters');
    if (!card || player.currency < (card.cost || 0)) return;
    const owned = this.tiles.filter((t) => t.owner === player.id && t.unit?.ownerId === player.id);
    if (owned.length < 2) return;
    const power = (t) => t.unit.def.atk + t.unit.def.hp;
    const high = [...owned].sort((a, b) => b.level - a.level)[0];
    const strongest = [...owned].sort((a, b) => power(b) - power(a))[0];
    if (high.id === strongest.id) return;
    if (high.level - strongest.level < 2) return;
    if (power(strongest) - power(high) < 30) return;
    await this._cpuCastSpell(player, card, { targetTileIds: [high.id, strongest.id] });
  }

  /** 追徴課税(tollBonusOnceCurse)のCPU使用判断: 自分の土地のうち通行料が
   * 最も高い所へ仕込む。上乗せ見込み（通行料×+50%分）がコストを上回る時だけ。 */
  async _cpuMaybeUseTollBonusSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'tollBonusOnceCurse');
    if (!card || player.currency < (card.cost || 0)) return;
    const candidates = this.tiles.filter((t) => t.owner === player.id && !t.tollBonusOnceMultiplier);
    const best = [...candidates].sort((a, b) => this._tollOfTile(b) - this._tollOfTile(a))[0];
    if (!best) return;
    const gain = this._tollOfTile(best) * ((card.effect.multiplier || 1) - 1);
    if (gain < (card.cost || 0)) return;
    await this._cpuCastSpell(player, card, { targetTileId: best.id });
  }

  /** 増税通知(tollReductionCurse)のCPU使用判断: 同盟以外の敵の土地のうち
   * 通行料が最も高い所へかける。減額見込みがコストを上回る時だけ。 */
  async _cpuMaybeUseTollReductionSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'tollReductionCurse');
    if (!card || player.currency < (card.cost || 0)) return;
    const candidates = this.tiles.filter((t) => {
      if (t.owner == null || t.owner === player.id || t.tollReductionRatio) return false;
      const owner = this.players.find((p) => p.id === t.owner);
      return owner && !owner.defeated && !this._isAllyOf(owner, player);
    });
    const best = [...candidates].sort((a, b) => this._tollOfTile(b) - this._tollOfTile(a))[0];
    if (!best) return;
    if (this._tollOfTile(best) * (card.effect.ratio || 0) < (card.cost || 0)) return;
    await this._cpuCastSpell(player, card, { targetTileId: best.id });
  }

  /** 脱税(tollWaiverCurse)のCPU使用判断: 踏むと痛い敵地（コストの3倍以上の
   * 通行料）が存在する時、通行料無効チャージを1つだけ準備しておく。 */
  async _cpuMaybeUseTollWaiverSpell(player) {
    if (player.spellUsedThisTurn || player.tollWaiverCharges > 0) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'tollWaiverCurse');
    if (!card || player.currency < (card.cost || 0)) return;
    const dangerToll = this.tiles.reduce((max, t) => {
      if (t.owner == null || t.owner === player.id) return max;
      const owner = this.players.find((p) => p.id === t.owner);
      if (!owner || owner.defeated || this._isAllyOf(owner, player)) return max;
      return Math.max(max, this._tollOfTile(t));
    }, 0);
    if (dangerToll < (card.cost || 0) * 3) return;
    await this._cpuCastSpell(player, card, {});
  }

  /** 不動産鑑〇士(enableAllOwnTileAbilities)のCPU使用判断: 配置済みの所有地が
   * 3つ以上あり、レベルアップ資金（目安200G）も残る時に使う。効果中はどこに
   * 止まっても全所有地で土地コマンドが使える（_runLandCommandのisAdmin参照）
   * ため、CPUの既存の土地コマンドAI（レベルアップ・能力・移動）がそのまま活きる。 */
  async _cpuMaybeUseAppraiserSpell(player) {
    if (player.spellUsedThisTurn || player.allTilesAccessTurnsRemaining > 0) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'enableAllOwnTileAbilities');
    if (!card || player.currency < (card.cost || 0)) return;
    const garrisoned = this.tiles.filter((t) => t.owner === player.id && t.unit).length;
    if (garrisoned < 3 || player.currency < (card.cost || 0) + 200) return;
    await this._cpuCastSpell(player, card, {});
  }

  async _cpuMaybeUseImmediateSpell(player) {
    if (player.spellUsedThisTurn) return;
    const fly = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'doubleNextDice');
    if (fly && player.currency >= (fly.cost || 0)) {
      // 強化スペル（アイキャンフライ＝出目2倍）は基本は自分に使う。ただし同盟戦で
      // 同盟仲間が妨害呪い（1/3固定・後退）を受けている場合は、その仲間にかけて
      // 呪いを上書きし打ち消す（diceCurseは1枠なので上書き＝解除＋強化になる）。
      const cursedAlly = this.players.find(
        (p) => p.id !== player.id && !p.defeated && this._isAllyOf(p, player) && this._hasHarmfulDiceCurse(p),
      );
      const targetPlayerId = cursedAlly ? cursedAlly.id : player.id;
      await this._cpuCastSpell(player, fly, { targetPlayerId });
      return;
    }
    const income = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'lapCountGold');
    if (income && player.currency >= (income.cost || 0)) await this._cpuCastSpell(player, income, {});
  }

  /** 高額空き地があり、召喚可能な手札もある時はブルーオーシャンを優先使用。 */
  async _cpuMaybeWarpToHighValueLand(player) {
    if (player.spellUsedThisTurn || this._cpuHighValueEmptyLands().length === 0) return false;
    if (this._affordableMonsterCards(player).length === 0) return false;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'warpToNearbyEmptyLand');
    if (!card || player.currency < (card.cost || 0)) return false;
    return this._cpuCastSpell(player, card, {});
  }

  /**
   * ダメージ系スペル/土地コマンドの対象選び: ①そのダメージ量で1撃で
   * 倒せる相手がいれば最優先（複数いれば土地レベルが高い方）、②居なければ
   * 候補の中で土地レベルが最も高い相手を選ぶ。candidatesが空ならnull。
   */
  _cpuPickDamageTarget(candidates, amount) {
    if (candidates.length === 0) return null;
    const ownerAssets = (t) => {
      const owner = this.players.find((p) => p.id === t.unit.ownerId);
      return owner ? this._totalAssetsOf(owner) : 0;
    };
    // ①そのスペルで確実に倒せる相手モンスターがいれば最優先（複数なら総資産が
    // 最上位のプレイヤーのモンスター）。②倒せる相手がいなければ、総資産1位の
    // プレイヤーのモンスターを狙う。いずれも同点は土地レベルが高い方。
    const killable = candidates.filter((t) => t.unit.currentHp <= amount);
    const pool = killable.length > 0 ? killable : candidates;
    return [...pool].sort((a, b) => ownerAssets(b) - ownerAssets(a) || b.level - a.level)[0];
  }

  /**
   * directDamage型スペル（ファイヤーボール/千本桜等）のCPU使用判断。
   * 妨害スペルなので同盟戦では同盟仲間のモンスターは対象から除外し、同盟でない
   * 相手のモンスターだけを狙う。対象は_cpuPickDamageTargetで選ぶ。
   */
  /** 朕のサイコキネシス: 敵の高レベル土地から守備モンスターを引き剥がし、
   * 別所有者の配置モンスターへ強制侵略させる。酢なら固有の2マス移動も使う。
   * ①自陣で迎え撃つプランは、引き剥がした敵の勝率が
   *   CPU_PSYCHOKINESIS_MAX_ATTACKER_WIN_RATE以下（＝守備側有利）の時だけ採用。
   *   勝てない迎撃は自分の土地とモンスターを差し出すだけなので見送る。
   * ②敵同士をぶつけるプラン（移動先が別の敵の土地）はどちらが倒れても得なので
   *   勝率不問で、むしろ優先する。
   * ③同盟仲間の土地へは送らない（味方に勝手な防衛戦を押し付けない）。 */
  async _cpuMaybeUsePsychokinesisSpell(player) {
    // 判断材料は所有者・同盟・勝率だけで朕固有の前提が無いため、このカードを
    // 持つCPU全員が使う（邪神ヒトデマソのデッキで死に札にしない）。
    if (player.spellUsedThisTurn) return false;
    const card = player.hand.find((candidate) => catalogIdOf(candidate) === 'psychokinesis');
    if (!card || player.currency < (card.cost || 0)) return false;

    const plans = [];
    for (const source of this.tiles) {
      if (!source.unit || source.owner == null || source.owner === player.id) continue;
      const sourceOwner = this.players.find((candidate) => candidate.id === source.owner);
      if (sourceOwner?.allianceId != null && sourceOwner.allianceId === player.allianceId) continue;
      const destinations = this._moveCommandCandidates(source, sourceOwner)
        .map(({ tile }) => tile)
        .filter((target) => target.unit && target.owner != null && target.owner !== source.owner);
      for (const destination of destinations) {
        const destinationOwner = this.players.find((candidate) => candidate.id === destination.owner);
        const intoOwnLand = destination.owner === player.id;
        if (!intoOwnLand && this._isAllyOf(destinationOwner, player)) continue;
        // 実際の強制侵略（_spellForceRelocateOneStep→_runBattleScene）と同じ
        // 条件で、引き剥がした敵ユニットが勝つ確率を見積もる。
        const attackerWinRate = this._estimateUnitBattleWinProbability(source.unit, null, destination);
        if (intoOwnLand && attackerWinRate > CPU_PSYCHOKINESIS_MAX_ATTACKER_WIN_RATE) continue;
        const defenderPower = (destination.unit.currentHp || 0) + (destination.unit.def.atk || 0)
          + this._elementHpBonus(destination.unit, destination);
        plans.push({
          source,
          destination,
          score: source.level * 1000 + this._landValueOfTile(source) + defenderPower
            // 迎撃は守備側が有利なほど高評価。敵同士の同士討ちはさらに上乗せ。
            + Math.round((1 - attackerWinRate) * 400)
            + (intoOwnLand ? 0 : 600),
        });
      }
    }
    if (plans.length === 0) return false;
    plans.sort((a, b) => b.score - a.score);
    const plan = plans[0];
    await this._cpuCastSpell(player, card, {
      targetTileId: plan.source.id,
      destinationTileId: plan.destination.id,
    });
    return true;
  }

  async _cpuMaybeUseDamageSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'directDamage');
    if (!card || player.currency < (card.cost || 0)) return;

    const candidates = this.tiles.filter((t) => t.unit && !this._isFriendlyUnitTile(t, player));
    const target = this._cpuPickDamageTarget(candidates, card.effect.amount);
    if (!target) return;

    await this._cpuCastSpell(player, card, { targetTileId: target.id });
  }

  /** 同盟戦の妨害スペル用: そのマスのモンスターが自分または同盟仲間の所有か。 */
  _isFriendlyUnitTile(tile, player) {
    const ownerId = tile.unit?.ownerId;
    if (ownerId == null) return false;
    if (ownerId === player.id) return true;
    const owner = this.players.find((p) => p.id === ownerId);
    return owner?.allianceId != null && owner.allianceId === player.allianceId;
  }

  /** そのプレイヤーが同盟戦で自分の味方（自分自身または同盟仲間）か。 */
  _isAllyOf(other, player) {
    if (other.id === player.id) return true;
    return other.allianceId != null && other.allianceId === player.allianceId;
  }

  /**
   * サイコロ呪い（diceCurse）が「妨害系（＝そのプレイヤーに不利）」か。
   * 1/3固定（出目を小さく固定）と後退は妨害。6固定と出目2倍は有益なので除外。
   */
  _hasHarmfulDiceCurse(player) {
    const curse = player.diceCurse;
    if (!curse) return false;
    if (curse.type === 'reverse') return true;
    if (curse.type === 'fixed') return (curse.value ?? 6) < 6;
    return false;
  }

  /**
   * 毒霧（poisonArea）のCPU使用判断。妨害スペルなので同盟戦では味方を巻き込まない。
   * 自分・同盟仲間のモンスターを1体も含まない中心マスの中から、非同盟の相手
   * モンスターを最も多く毒にできるマスを選ぶ。相手を1体も巻き込めないなら使わない。
   */
  async _cpuMaybeUsePoisonSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'poisonArea');
    if (!card || player.currency < (card.cost || 0)) return;

    let best = null;
    for (const center of this.tiles) {
      const area = [center, ...center.neighbors.map((id) => this.tiles[id])];
      let enemy = 0;
      let friendly = 0;
      for (const t of area) {
        if (!t.unit) continue;
        if (this._isFriendlyUnitTile(t, player)) friendly += 1;
        else enemy += 1;
      }
      if (friendly > 0 || enemy === 0) continue; // 味方を巻き込むマス・敵ゼロのマスは避ける
      if (!best || enemy > best.enemy) best = { id: center.id, enemy };
    }
    if (!best) return;

    await this._cpuCastSpell(player, card, { targetTileId: best.id });
  }

  /**
   * キャンセルカルチャー（destroyHandCard）のCPU使用判断。妨害スペルなので
   * 同盟以外の相手を狙う。破壊できる手札（スペル/アイテム）を持つ相手のうち
   * 総資産が最上位のプレイヤーを対象にし、その中で最もコストの高い（＝価値の
   * 高い）1枚を破壊する。破壊できる手札を持つ相手がいなければ使わない。
   */
  async _cpuMaybeUseCancelCultureSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'destroyHandCard');
    if (!card || player.currency < (card.cost || 0)) return;

    const isDestroyable = (c) => c.type === CardType.SPELL || c.type === CardType.GEAR;
    const targetPlayer = this.players
      .filter((p) => !p.defeated && p.id !== player.id
        && !(p.allianceId != null && p.allianceId === player.allianceId)
        && p.hand.some(isDestroyable))
      .sort((a, b) => this._totalAssetsOf(b) - this._totalAssetsOf(a))[0];
    if (!targetPlayer) return;

    const targetCard = targetPlayer.hand
      .filter(isDestroyable)
      .sort((a, b) => (b.cost || 0) - (a.cost || 0))[0];
    if (!targetCard) return;

    await this._cpuCastSpell(player, card, { targetPlayerId: targetPlayer.id, targetCardId: targetCard.id });
  }

  /**
   * 魔力抽出（extractManaFromHandCard）のCPU使用判断。二面性のあるスペル
   * なので、手持ちGで使い分ける:
   * ①所持Gが CPU_MANA_EXTRACTION_RICH_LINE 以下 → 資金難。自分の手札の
   *   レアリティS以下（N/S）のカードだけを対象に自分へ撃ち、実質「弱い
   *   手札1枚を報酬G-コストGに換金」する。強いカード（R/EX）は換金しない。
   * ②上回っていれば余裕があるので妨害に回す。同盟以外の相手が持つR/EXの
   *   カードを1枚潰す（相手に報酬Gが渡るデメリットは資金力で許容する）。
   * ③どちらの条件にも当てはまる対象がいなければ使わない。
   */
  async _cpuMaybeUseManaExtractionSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'extractManaFromHandCard');
    if (!card || player.currency < (card.cost || 0)) return;

    const RARITY_RANK = { [Rarity.N]: 0, [Rarity.S]: 1, [Rarity.R]: 2, [Rarity.EX]: 3 };
    const rankOf = (c) => RARITY_RANK[c.rarity] ?? 0;
    // 詠唱中の魔力抽出そのものは対象にできない（この後どのみち捨札になる）。
    const handOf = (p) => p.hand.filter((c) => c.id !== card.id);

    if (player.currency <= CPU_MANA_EXTRACTION_RICH_LINE) {
      // 換金モード: 自分のN/Sから最も惜しくない1枚（低レアリティ→低コスト順）。
      const fodder = handOf(player)
        .filter((c) => rankOf(c) <= RARITY_RANK[Rarity.S])
        .sort((a, b) => rankOf(a) - rankOf(b) || (a.cost || 0) - (b.cost || 0))[0];
      if (!fodder) return;
      await this._cpuCastSpell(player, card, { targetPlayerId: player.id, targetCardId: fodder.id });
      return;
    }

    // 妨害モード: 同盟以外の相手が持つR/EXのうち最も価値の高い1枚を潰す。
    let best = null;
    for (const opponent of this.players) {
      if (opponent.defeated || opponent.id === player.id) continue;
      if (opponent.allianceId != null && opponent.allianceId === player.allianceId) continue;
      for (const candidate of handOf(opponent)) {
        if (rankOf(candidate) < RARITY_RANK[Rarity.R]) continue;
        if (!best
          || rankOf(candidate) > rankOf(best.card)
          || (rankOf(candidate) === rankOf(best.card) && (candidate.cost || 0) > (best.card.cost || 0))) {
          best = { player: opponent, card: candidate };
        }
      }
    }
    if (!best) return;
    await this._cpuCastSpell(player, card, { targetPlayerId: best.player.id, targetCardId: best.card.id });
  }

  /**
   * ネクロマンサー（reviveDeadMonster）の全AI共通の使用判断。
   * ①この試合で4体以上モンスターが死んでいない限り使わない。
   * ②手札が上限（HAND_LIMIT）に達していて余りそうな時だけ使う
   * （使うと手札から1枚減るので、上限に達した手札を有効活用できる）。
   * ③蘇生先の空き地が無ければ使わない。
   */
  async _cpuMaybeUseNecromancerSpell(player) {
    if (player.spellUsedThisTurn) return;
    const card = player.hand.find((c) => c.type === CardType.SPELL && c.effect?.type === 'reviveDeadMonster');
    if (!card || player.currency < (card.cost || 0)) return;
    if (this._deadMonstersThisMatch.length < 4) return;
    if (player.hand.length < HAND_LIMIT) return;
    if (!this.tiles.some((t) => t.type === TileType.LAND && t.owner == null)) return;

    const target = this._cpuChooseNecromancerTarget();
    if (!target) return;
    await this._cpuCastSpell(player, card, { targetDeadMonsterId: target.id });
  }

  /**
   * ネクロマンサーの蘇生対象選び: ①レアリティが高い順（EX→R→S→N）、
   * ②同レアリティならHP+ATK合計が高い順、③さらに同点なら先制/貫通持ちを優先。
   */
  _cpuChooseNecromancerTarget() {
    const RARITY_RANK = { [Rarity.EX]: 3, [Rarity.R]: 2, [Rarity.S]: 1, [Rarity.N]: 0 };
    const hasPriorityTrait = (def) => (def.traits?.includes('firstStrike') || def.traits?.includes('pierce')) ? 1 : 0;
    return [...this._deadMonstersThisMatch].sort((a, b) => (
      (RARITY_RANK[b.def.rarity] ?? 0) - (RARITY_RANK[a.def.rarity] ?? 0)
      || (b.def.hp + b.def.atk) - (a.def.hp + a.def.atk)
      || hasPriorityTrait(b.def) - hasPriorityTrait(a.def)
    ))[0];
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
    await this.onDamageEffect?.({ tileId: target.id, damage: ability.power, targetDied: targetUnit.currentHp <= 0, targetName: targetUnit.def.name });

    if (targetUnit.currentHp <= 0) {
      const targetOwner = this.players.find((p) => p.id === target.owner);
      const landLoss = this._captureLandLoss(targetOwner, target);
      target.unit = null;
      target.owner = null;
      target.transparentCursed = false;
      this._repaintTileToElement(target);
      this.onLog(`${targetOwner.name}の${targetUnit.def.name}は倒された`);
      await this._handleUnitDeath(targetUnit, targetOwner);
      await this._presentLandLoss(landLoss);
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
   * （1ターン1枚のため）。スイッチランド（無色化）は自分の土地を直す
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
   * スイッチランド（forceTileElement→NEUTRAL）専用のCPU使用判断。
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

    const opponents = this.players
      .filter((p) => !p.defeated && p.id !== player.id && !(p.allianceId != null && p.allianceId === player.allianceId))
      // 総資産が上位（1位）のプレイヤーの土地から優先的に妨害する。
      .sort((a, b) => this._totalAssetsOf(b) - this._totalAssetsOf(a));

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

    // 自分から高額空き地までの距離と一致する固定ダイスがあれば、自分へ
    // 使用して確保を狙う。妨害目的で相手へ使う判断より優先する。
    for (const tile of this._cpuHighValueEmptyLands()) {
      const distance = this._tileDistance(player.tileId, tile.id);
      const acquisitionCard = affordable.find((c) => c.effect.value === distance);
      if (acquisitionCard) {
        await this._cpuCastSpell(player, acquisitionCard, { targetPlayerId: player.id });
        return;
      }
    }

    // 6のダイスは基本的に前進用の有利カード。CPU自身へ使えば、その後の
    // 分岐AIが高額敵地を避けつつCP/ゴールへの最短路を選べるため、相手へ
    // 無目的に速度を与えるより先に自分へ使う。
    const sixDice = affordable.find((c) => c.effect.value === 6);
    if (sixDice) {
      await this._cpuCastSpell(player, sixDice, { targetPlayerId: player.id });
      return;
    }

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
    // ②総資産が最上位（＝1位）のプレイヤーを狙う（CPUも含む。自分・同盟は除外）。
    return candidates.reduce((best, p) => (this._totalAssetsOf(p) > this._totalAssetsOf(best) ? p : best));
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
        ? (card.effectDescription || '効果が発動した')
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
    this.onCardSeen?.(card);
    player.hand = player.hand.filter((c) => c.id !== card.id);
    this._discardUsedCard(player, card);
    player.currency -= card.cost || 0;
    player.spellUsedThisTurn = true;
    this.onLog(`${player.name}は「${card.name}」を使用した (-${card.cost || 0}G)`);
    this._notifyState();
    const casterTile = this.tiles[player.tileId];
    await this.onSpellUse({
      card,
      casterPosition: casterTile?.position
        ? { x: casterTile.position.x, z: casterTile.position.z }
        : null,
    });
    await this.onSpellCastEffect?.(this._buildSpellCastEffectPayload(player, cast, card));
    const endedTurn = await this._applySpellEffect(player, card, cast);
    await this.onSpellComplete();
    this._notifyState();
    return !!endedTurn;
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
    return teammates.reduce((sum, p) => sum + p.currency + this._landValueOf(p.id) + this._ofudaValueOf(p), 0);
  }

  /**
   * 正味財産の「全所有地を売った時の総額」部分。まとめて売るのではなく1枚ずつ
   * 売る想定で、売るたびに連鎖が減って残りの地価が下がるのを反映する（毎回いちばん
   * 高く売れる土地から売る順でシミュレート＝回収額を最大化）。実際には売らず、
   * tile.owner を一時的に外して計算し、最後に必ず元へ戻す。売値は地価の半額
   * （強制売却_sellLandTileと同じ）。無色地も売却対象。
   */
  _liquidationValueOf(player) {
    const owned = this._ownedTiles(player);
    if (owned.length === 0) return 0;
    const savedOwners = owned.map((t) => t.owner);
    const remaining = [...owned];
    let total = 0;
    while (remaining.length) {
      let bestIdx = 0;
      let bestVal = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const v = this._landValueOfTile(remaining[i]);
        if (v > bestVal) {
          bestVal = v;
          bestIdx = i;
        }
      }
      const tile = remaining.splice(bestIdx, 1)[0];
      total += Math.round(this._landValueOfTile(tile) / 2);
      tile.owner = null; // 売った扱いにして残りの連鎖計算へ反映（後で復元）
    }
    owned.forEach((t, i) => { t.owner = savedOwners[i]; });
    return total;
  }

  /** 隠しステータス「正味財産」= 手持ちG + 全土地を1枚ずつ売った時の総額（連鎖減衰込み）。 */
  _netWorthOf(player) {
    return player.currency + this._ofudaValueOf(player) + this._liquidationValueOf(player);
  }

  _notifyState() {
    this._syncUnitIcons();
    this._syncPieceRenderOrder();
    // 通信切断時のCPU自動引き継ぎ（main.js）やBANで、対局中に人間プレイヤーが
    // 1人もいなくなることがある。その場合にhuman.handでクラッシュしてこの
    // 通知自体が失敗すると、以後_beginTurn等の非同期チェーンが誰にも気づかれず
    // 停止する（フリーズの原因になる）ため、人間がいない時は空の手札を返す。
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
      ofuda: this.hasOfuda ? { ...(p.ofuda || {}) } : null,
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
      ofudaMarket: this.hasOfuda ? this._ofudaMarketSummary() : null,
      players: playersPayload,
      hand: human?.hand ?? [],
      showCenter,
      centerHand: this.currentPlayer.hand,
      currentPlayerIsCPU: this.currentPlayer.isCPU,
      spellUsedThisTurn: this.currentPlayer.spellUsedThisTurn,
      fixedDiceValue: this.currentPlayer.diceCurse?.type === 'fixed'
        ? this.currentPlayer.diceCurse.value
        : this._tutorialDiceValue(),
    });
    this.onPvpSync?.(this._pvpSnapshot(playersPayload));
    // 保存可能なのは、ドローや戦闘、移動、破産処理が終わってサイコロ／
    // スペルを選べる時だけ。処理途中を保存しないことで復帰時フリーズを防ぐ。
    if (this.storyMode && !this.tutorialMode && !this.storyEnded
      && this.awaitingRoll && !this.isBusy && this.onResumeCheckpoint) {
      this.onResumeCheckpoint(this.exportState());
    }
  }

  /** 行動者を最前面にし、以降の手番順にプレイヤー駒の描画優先度を下げる。 */
  _syncPieceRenderOrder() {
    const count = this.players.length;
    const playersByTile = new Map();
    for (const player of this.players) {
      if (!playersByTile.has(player.tileId)) playersByTile.set(player.tileId, []);
      playersByTile.get(player.tileId).push(player);
    }
    for (let offset = 0; offset < count; offset++) {
      const player = this.players[(this.currentPlayerIndex + offset) % count];
      const overlapsAnotherPlayer = (playersByTile.get(player.tileId)?.length || 0) > 1;
      this.scene.setPieceRenderOrder?.(player.mesh, 100 + count - offset, offset === 0 || !overlapsAnotherPlayer ? 1 : 0.45);
    }
    for (const tile of this.tiles) {
      const coveredByPlayer = (playersByTile.get(tile.id)?.length || 0) > 0;
      this.scene.setBoardObjectOpacity?.(tile.unitMesh, coveredByPlayer ? 0.4 : 1);
      this.scene.setBoardObjectOpacity?.(tile.markerSprite, coveredByPlayer ? 0.4 : 1);
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
      waitCutRate: getWaitCutRate(),
      turnHand: this.awaitingRoll && !this.isBusy ? this.currentPlayer.hand : [],
      checkpointNumbers: this.checkpointNumbers,
      ofudaMarket: this.hasOfuda ? this._ofudaMarketSummary() : null,
      players: playersPayload,
      tiles: this.tiles
        .filter((t) => t.type === TileType.LAND)
        .map((t) => ({
          id: t.id,
          owner: t.owner,
          level: t.level,
          element: t.element,
          landValue: this._landValueOfTile(t),
          toll: this._tollOfTile(t),
          chainCount: this._chainCount(t.owner, t.element),
          unit: t.unit
            ? {
                catalogId: t.unit.def.catalogId ?? null,
                name: t.unit.def.name,
                atk: t.unit.def.atk,
                maxHp: t.unit.def.hp ?? 0,
                hp: t.unit.currentHp ?? t.unit.def.hp,
                element: t.unit.def.element ?? null,
                imageDataUrl: t.unit.def.imageDataUrl ?? null,
                rarity: t.unit.def.rarity ?? null,
                cost: t.unit.def.cost ?? 0,
                traits: t.unit.def.traits ?? [],
                effectDescription: t.unit.def.effectDescription ?? '',
                imageFit: t.unit.def.imageFit ?? null,
                toll: this._tollOfTile(t),
                // 呪い一覧（マ〇ジャロ等）。ゲスト側main.jsは土地情報の
                // 「基礎値への上乗せ」表示（elementHpBonus/cheerAtkBonus/curses）を
                // Gameを持たずローカルで組み立てるため、名前と加算値だけ渡す。
                curses: t.unit.curses.map((c) => ({ name: c.name, addedAtk: c.addedAtk || 0, addedHp: c.addedHp || 0 })),
              }
            : null,
        })),
      hands: Object.fromEntries(this.players.filter((p) => !p.isCPU).map((p) => [p.id, p.hand])),
    };
  }
}
