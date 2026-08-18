import { CardType, Element, Rarity } from './cards.js';
import { assetUrl } from './assetUrl.js';

const NORMAL_COST = 50;
const forestMonster = (id, name, rarity, hp, atk, options = {}) => ({
  id,
  type: CardType.MONSTER,
  name,
  element: Element.FOREST,
  rarity,
  hp,
  atk,
  cost: options.cost ?? NORMAL_COST,
  ...(options.chainRequired ? { chainRequired: options.chainRequired } : {}),
  ...(options.summonSacrifice ? { summonSacrifice: options.summonSacrifice } : {}),
  ...(options.commandCost ? { commandCost: options.commandCost } : {}),
  ...(options.ability ? { ability: options.ability } : {}),
  ...(options.traits ? { traits: options.traits } : {}),
  ...(options.effect ? { effect: options.effect } : {}),
  ...(options.effectDescription ? { effectDescription: options.effectDescription } : {}),
  imageDataUrl: options.imageDataUrl ?? assetUrl(`/images/card-art/${id}.jpg`),
});

/** 森属性モンスター20種。画像未指定時はcardArt.jsの森属性共通画像を使う。 */
export const FOREST_MONSTER_CATALOG = {
  takenokoha: forestMonster('takenokoha', 'タケノコ派', Rarity.N, 30, 30, {
    effect: { type: 'synergyWithNamedAlly', allyCatalogId: 'kinokoha', hpBonus: 10 },
    effectDescription: 'きのこ派が配置されていると、戦闘中HP+10（シナジー）',
  }),
  kikoriNoOjisan: forestMonster('kikoriNoOjisan', 'きこりのおじさん', Rarity.N, 20, 30, {
    effect: { type: 'goldOnKillElement', targetElement: Element.FOREST, amount: 70 },
    effectDescription: '森属性モンスターを倒すと70G得られる',
  }),
  dryad: forestMonster('dryad', 'ドリアード', Rarity.N, 20, 20, {
    commandCost: 50,
    ability: { type: 'summonMonsterOnEmptyLand', catalogId: 'dryad' },
    effectDescription: '土地コマンド（50G）: ランダムな空き地にドリアードを召喚する',
  }),
  sanzokuFukurou: forestMonster('sanzokuFukurou', '山賊フクロウ', Rarity.N, 25, 25, {
    cost: 20,
    effect: { type: 'stealDamageMultiple', multiplier: 2 },
    effectDescription: '攻撃成功時、与えたダメージ×2Gを奪う',
  }),
  saboriTender: forestMonster('saboriTender', 'サボリーテンダー', Rarity.N, 30, 40, {
    traits: ['firstStrike'],
    effect: { type: 'challengeOdds', attackFailureChance: 0.5, negateIncomingChance: 0 },
    effectDescription: '先制。1/2の確率で攻撃が失敗する',
  }),
  kinokoha: forestMonster('kinokoha', 'きのこ派', Rarity.N, 30, 30, {
    effect: { type: 'synergyWithNamedAlly', allyCatalogId: 'takenokoha', atkBonus: 10 },
    effectDescription: 'タケノコ派が配置されていると、戦闘中ATK+10（シナジー）',
  }),
  moriNoKumasan: forestMonster('moriNoKumasan', '森のクマさん？', Rarity.N, 30, 30),
  yasugi: forestMonster('yasugi', '屋〇杉', Rarity.N, 50, 10, {
    effect: { type: 'chanceSelfDestructAfterAttack', chance: 0.5 },
    effectDescription: '自身の攻撃終了時、50%の確率で自身が倒れる（巨木ゆえの反動）',
  }),
  abareInoshishi: forestMonster('abareInoshishi', '暴れイノシシ', Rarity.N, 20, 40, { cost: 30 }),
  tsutaOnna: forestMonster('tsutaOnna', 'ツタ女', Rarity.N, 30, 30, { cost: 40 }),
  donguriInvestor: forestMonster('donguriInvestor', 'どんぐり投資家', Rarity.N, 25, 25, {
    cost: 30,
    imageDataUrl: assetUrl('/images/card-art/donguriInvestor.png'),
  }),

  trufuButa: forestMonster('trufuButa', 'トリュフ豚', Rarity.S, 30, 30, {
    effect: { type: 'chanceGoldAfterBattle', chance: 1 / 3, amount: 150 },
    effectDescription: '戦闘終了時、1/3の確率で150G得る',
  }),
  nashiNashiTankentai: forestMonster('nashiNashiTankentai', 'なしなし探検隊', Rarity.S, 30, 30, {
    effect: { type: 'challengeOdds', attackFailureChance: 0, negateIncomingChance: 1 / 3 },
    effectDescription: '1/3の確率でダメージ無効化',
  }),
  matagiNoKoshirou: forestMonster('matagiNoKoshirou', 'マタギの小四郎', Rarity.S, 30, 40, {
    commandCost: 50,
    ability: { type: 'damage', range: 3, power: 10 },
    effectDescription: '土地コマンド（50G）: 3マス以内の敵モンスターの基礎HPに10ダメージ（猟銃の一撃）',
  }),
  yamamba: forestMonster('yamamba', '山姥', Rarity.S, 30, 10, {
    effect: { type: 'chanceSetHpOnHit', chance: 1 / 3, hp: 10 },
    effectDescription: '攻撃成功時、相手が生き残っていたら1/3の確率でHPを10に固定する',
  }),
  jinmenchou: forestMonster('jinmenchou', '人面鳥', Rarity.S, 30, 30, {
    commandCost: 30,
    ability: { type: 'warpToEmptyElementLand', element: Element.FOREST },
    effectDescription: '土地コマンド（30G）: 任意の森属性の空き地へワープする',
  }),
  moriNoYousei: forestMonster('moriNoYousei', '森の妖精', Rarity.S, 30, 40, {
    cost: 80,
    chainRequired: 1,
    effect: { type: 'atkBonusAgainstRarity', targetRarity: Rarity.R, ratio: 0.4 },
    effectDescription: '召喚条件: 森の土地1連鎖以上。相手がRなら基礎ATKが40%上昇する',
  }),
  kokeRecoveryBear: forestMonster('kokeRecoveryBear', '苔むした回復熊', Rarity.S, 40, 20, {
    cost: 60,
    effect: { type: 'lapHealMultiplier', multiplier: 2 },
    effectDescription: '周回時に受けるHP回復量が2倍になる',
    imageDataUrl: assetUrl('/images/card-art/kokeRecoveryBear.png'),
  }),

  sekaiju: forestMonster('sekaiju', '世界樹', Rarity.R, 70, 0, {
    cost: 120,
    chainRequired: 1,
    effectDescription: '召喚条件: 1連鎖以上（純HP特化、ATK0）',
  }),
  jukaiNoOnryou: forestMonster('jukaiNoOnryou', '樹海の怨霊', Rarity.R, 20, 40, {
    traits: ['firstStrike'],
    effect: { type: 'instantKillOnHit', chance: 0.5 },
    effectDescription: '先制。攻撃成功時、1/2の確率で相手を即死させる',
    imageDataUrl: assetUrl('/images/card-art/jukainoonryou.png'),
  }),
  mountGorilla: forestMonster('mountGorilla', 'マウントゴリラ', Rarity.R, 30, 30, {
    effect: { type: 'atkDoubleIfRicher' },
    effectDescription: '攻撃開始時点で手持ちGが相手を上回っている場合、ATK2倍',
  }),
  yamagami: forestMonster('yamagami', '山神', Rarity.R, 30, 30, {
    cost: 150,
    chainRequired: 2,
    effect: { type: 'statsPerElementChain', element: Element.FOREST, atkPerChain: 7, hpPerChain: 7 },
    effectDescription: '召喚条件: 2連鎖以上。戦闘中、森の土地の連鎖数×7だけHP・ATKが上昇する',
  }),
  shinrinChouzeikan: forestMonster('shinrinChouzeikan', '森林徴税官', Rarity.R, 40, 35, {
    cost: 90,
    chainRequired: 2,
    effect: { type: 'tollMultiplier', tollMultiplier: 1.3 },
    effectDescription: '召喚条件: 森の土地2連鎖以上。この土地の通行料が1.3倍になる',
    imageDataUrl: assetUrl('/images/card-art/shinrinChouzeikan.png'),
  }),
};
