import { CardType, Element, Rarity, Deck, DEFAULT_SPELL_COUNT } from './cards.js';
import { FIRE_MONSTER_CATALOG } from './fireMonsters.js';
import { WATER_MONSTER_CATALOG } from './waterMonsters.js';
import { THUNDER_MONSTER_CATALOG } from './thunderMonsters.js';
import { FOREST_MONSTER_CATALOG } from './forestMonsters.js';
import { NEUTRAL_MONSTER_CATALOG } from './neutralMonsters.js';

// Elemental weakness cycle: each element takes bonus damage from the next
// one. 火→水→雷→森→火 (fire is weak to water, water to thunder, thunder to
// forest, forest to fire). NEUTRAL (無属性) sits outside this cycle entirely
// - no entry here means no weakness bonus either way.
export const WEAK_AGAINST = {
  [Element.FIRE]: Element.WATER,
  [Element.WATER]: Element.THUNDER,
  [Element.THUNDER]: Element.FOREST,
  [Element.FOREST]: Element.FIRE,
};

export const ItemType = {
  WEAPON: 'weapon',
  ARMOR: 'armor',
};

/**
 * Named monster catalog - unlike the generic placeholder monsters in
 * cards.js, these carry real stats and battle abilities. `id` here is the
 * catalog/ability-lookup key; deck copies get their own unique instance
 * `id` (see duplicateForDeck) plus a `catalogId` pointing back to this.
 */
export const MONSTER_CATALOG = {
  ...FIRE_MONSTER_CATALOG,
  ...WATER_MONSTER_CATALOG,
  ...THUNDER_MONSTER_CATALOG,
  ...FOREST_MONSTER_CATALOG,
  ...NEUTRAL_MONSTER_CATALOG,
};

const item = (id, name, rarity, itemType, cost, atkBonus, hpBonus, options = {}) => ({
  id,
  type: CardType.GEAR,
  itemType,
  name,
  rarity,
  cost,
  atkBonus,
  hpBonus,
  ...(options.traits ? { traits: options.traits } : {}),
  ...(options.effect ? { effect: options.effect } : {}),
  ...(options.effectDescription ? { effectDescription: options.effectDescription } : {}),
  ...(options.atkBonusRange ? { atkBonusRange: options.atkBonusRange } : {}),
  ...(options.forceZeroAtk ? { forceZeroAtk: true } : {}),
  ...(options.returnsToHandIfUsed ? { returnsToHandIfUsed: true } : {}),
});

/**
 * アイテム30種（N13/S9/R7/EX1）。「オサフネ」は刀鍛冶（無属性モンスター）の
 * 土地コマンドで入手する専用アイテムだが、ショップ等では他アイテムと同じ
 * ように扱う（購入自体は現状想定していないが、カタログには通常のS枠として
 * 登録しておく）。
 */
export const ITEM_CATALOG = {
  knife: item('knife', 'ナイフ', Rarity.N, ItemType.WEAPON, 5, 10, 0),
  kombo: item('kombo', 'こん棒', Rarity.N, ItemType.WEAPON, 20, 10, 10),
  tetsuPipe: item('tetsuPipe', '鉄パイプ', Rarity.N, ItemType.WEAPON, 25, 20, -5),
  denryuMuchi: item('denryuMuchi', '電流ムチ', Rarity.N, ItemType.WEAPON, 40, 15, 0, {
    effect: { type: 'chanceBlindOnHit', chance: 0.4 },
    effectDescription: '攻撃成功時40%で相手を1ターン行動不能にする',
  }),
  potLid: item('potLid', 'なべのふた', Rarity.N, ItemType.ARMOR, 10, 0, 10),
  tetsuNoYoroi: item('tetsuNoYoroi', '鉄の鎧', Rarity.N, ItemType.ARMOR, 25, -5, 20),
  boudanChokki: item('boudanChokki', '防弾チョッキ', Rarity.N, ItemType.ARMOR, 30, 10, 20),
  danboorNoYoroi: item('danboorNoYoroi', 'ダンボールの鎧', Rarity.N, ItemType.ARMOR, 35, 0, 35, {
    forceZeroAtk: true,
    effectDescription: 'HP+35。ただし装備中はATKが0になる',
  }),
  medashiBou: item('medashiBou', '目出し帽', Rarity.N, ItemType.WEAPON, 30, 0, 0, {
    effect: { type: 'stealDamageMultiple', multiplier: 3 },
    effectDescription: '攻撃成功時、与えたダメージ×3Gを奪う',
  }),
  heikeNoYoroi: item('heikeNoYoroi', '平家の鎧', Rarity.N, ItemType.ARMOR, 40, 0, 40),
  mobileSuit: item('mobileSuit', 'モバイルスーツ', Rarity.N, ItemType.ARMOR, 40, 10, 30),
  nyoBou: item('nyoBou', 'にょ〇棒', Rarity.N, ItemType.WEAPON, 30, 10, 10, {
    traits: ['pierce'],
    effectDescription: '貫通（反射・無効化・土地レベルボーナスを無視する）',
  }),
  unitoroNoFuku: item('unitoroNoFuku', 'ウニトロの服', Rarity.N, ItemType.ARMOR, 25, 0, 25),

  osafune: item('osafune', 'オサフネ', Rarity.S, ItemType.WEAPON, 40, 30, 10),
  nankaNoOmamori: item('nankaNoOmamori', 'ナンカのお守り', Rarity.S, ItemType.ARMOR, 45, 0, 0, {
    effect: { type: 'negateNextDamage' },
    effectDescription: 'ダメージを1回無効化する',
  }),
  pegasusSword: item('pegasusSword', 'ペガサスソード', Rarity.S, ItemType.WEAPON, 45, 25, 0, {
    traits: ['firstStrike'],
    effectDescription: '先制',
  }),
  harinezumiNoFuku: item('harinezumiNoFuku', 'ハリネズミの服', Rarity.S, ItemType.ARMOR, 50, 0, 0, {
    effect: { type: 'reflectHalfDamage' },
    effectDescription: '受けるダメージの1/2を相手に反射する',
  }),
  morohaNoTsurugi: item('morohaNoTsurugi', '諸刃の剣', Rarity.S, ItemType.WEAPON, 60, 40, -20),
  stegoro: item('stegoro', 'ステゴロ', Rarity.S, ItemType.WEAPON, 50, 0, 0, {
    effect: { type: 'destroyItemBeforeAttack' },
    effectDescription: '攻撃開始前に相手のアイテムを破壊する',
  }),
  ikasamaNoSaikoro: item('ikasamaNoSaikoro', 'イカサマのサイコロ', Rarity.S, ItemType.WEAPON, 40, 0, 0, {
    traits: ['pierce'],
    effect: { type: 'atkFromLastDiceRoll', multiplier: 11 },
    effectDescription: 'ATK+前回移動したサイコロの目×11。貫通（反射・無効化・土地レベルボーナスを無視する）',
  }),
  twinHammer: item('twinHammer', 'ツインハンマー', Rarity.S, ItemType.WEAPON, 65, 10, 0, {
    effect: { type: 'doubleStrike' },
    effectDescription: '2回攻撃する',
  }),
  lifeJacket: item('lifeJacket', 'ライフジャケット', Rarity.S, ItemType.ARMOR, 35, 0, 0, {
    effect: { type: 'surviveLethalDamage' },
    effectDescription: '致死ダメージを受けてもHPが1残る（1戦闘1回のみ）',
  }),

  kaenHoushakiki: item('kaenHoushakiki', '火炎放射器', Rarity.R, ItemType.WEAPON, 80, 20, 0, {
    effect: { type: 'elementDamageBonus', targetElement: Element.FOREST, multiplier: 1.5 },
    effectDescription: '相手が森属性の場合ATK1.5倍',
  }),
  raijinKen: item('raijinKen', '雷神剣', Rarity.R, ItemType.WEAPON, 80, 20, 0, {
    effect: { type: 'elementDamageBonus', targetElement: Element.WATER, multiplier: 1.5 },
    effectDescription: '相手が水属性の場合ATK1.5倍',
  }),
  gomuGoNoPistol: item('gomuGoNoPistol', 'ゴムゴ〇のピストル', Rarity.R, ItemType.WEAPON, 80, 20, 0, {
    effect: { type: 'elementDamageBonus', targetElement: Element.THUNDER, multiplier: 1.5 },
    effectDescription: '相手が雷属性の場合ATK1.5倍',
  }),
  iceSlugger: item('iceSlugger', 'アイ〇ラッガー', Rarity.R, ItemType.WEAPON, 80, 20, 0, {
    effect: { type: 'elementDamageBonus', targetElement: Element.FIRE, multiplier: 1.5 },
    effectDescription: '相手が火属性の場合ATK1.5倍',
  }),
  fushichoNoKen: item('fushichoNoKen', '不死鳥の剣', Rarity.R, ItemType.WEAPON, 80, 20, 10, {
    returnsToHandIfUsed: true,
    effectDescription: '使用して効果を発動した場合のみ手札に戻る',
  }),
  shinkenShirahadori: item('shinkenShirahadori', '真剣白刃取り', Rarity.R, ItemType.WEAPON, 110, 0, 0, {
    effect: { type: 'stealItemBeforeAttack' },
    effectDescription: '相手のアイテムを奪って自分が装備する',
  }),
  zangokuKen: item('zangokuKen', '斬〇剣', Rarity.R, ItemType.WEAPON, 130, 30, 0, {
    traits: ['lastStrike', 'pierce'],
    effect: { type: 'instantKillOnHit', chance: 0.5 },
    effectDescription: '後攻・貫通（反射・無効化・土地レベルボーナスを無視する）。攻撃成功時50%で相手を即死させる',
  }),

  // ストーリー③クリア報酬（紫の魔女ホフクからのお礼）。story.jsのSTORY_STAGES[2].rewardから参照。
  peeStaff: item('peeStaff', 'ペーの杖', Rarity.EX, ItemType.WEAPON, 20, 25, 10, {
    traits: ['firstStrike'],
    atkBonusRange: [25, 50],
    effectDescription: '先制。ATKボーナスは装備するたびに25〜50でランダムに決まる',
  }),
};

const spell = (id, name, rarity, cost, target, effect, effectDescription) => ({
  id,
  type: CardType.SPELL,
  name,
  rarity,
  cost,
  target,
  effect,
  effectDescription,
});

/**
 * スペル40種。`target`はgame.jsの_resolveSpellCastが対象選択のUIフローを
 * 出し分けるための種別で、`effect.type`が実際の効果本体（game.jsの
 * _applySpellEffectがディスパッチする）。
 * - 'enemyMonster'/'anyMonster'/'ownMonster': モンスター1体（onPickAbilityTarget流用）
 * - 'enemyPlayer'/'anyPlayer': プレイヤー1人（同上、{id,label}形式）
 * - 'anyTile'/'ownTile': 土地1マス（同上、tileSummary形式）
 * - 'twoOwnMonsters': 自分のモンスター2体
 * - 'self'/'none': 対象選択なし（'self'は発動者自身への適用、'none'は盤面全体等）
 */
export const SPELL_CATALOG = {
  // ── 移動系 ──
  diceOne: spell('diceOne', '1のダイス', Rarity.N, 30, 'enemyPlayer', { type: 'setNextDice', value: 1 }, '相手の次のサイコロを1にする'),
  backfire: spell('backfire', 'バックファイア', Rarity.S, 50, 'enemyPlayer', { type: 'reverseNextDice' }, '相手の次のサイコロの数だけ後退させる'),
  diceThree: spell('diceThree', '3のダイス', Rarity.N, 30, 'enemyPlayer', { type: 'setNextDice', value: 3 }, '相手の次のサイコロを3にする'),
  // 元データは名前「6のダイス」なのに効果文が「次のサイコロを1にする」と
  // なっていた（1のダイスとの重複ミスと判断）。名前に合わせて6として実装。
  diceSix: spell('diceSix', '6のダイス', Rarity.N, 30, 'enemyPlayer', { type: 'setNextDice', value: 6 }, '相手の次のサイコロを6にする'),
  iCanFly: spell('iCanFly', 'アイキャンフライ', Rarity.N, 30, 'enemyPlayer', { type: 'doubleNextDice' }, '相手の次のサイコロの出目×2進む'),
  blueOcean: spell(
    'blueOcean',
    'ブルーオーシャン',
    Rarity.S,
    60,
    'self',
    { type: 'warpToNearbyEmptyLand' },
    '近くの空き地に飛ぶ。そのターンはサイコロ不可、土地コマンド・召喚は可能',
  ),
  antlion: spell(
    'antlion',
    'アリジゴク',
    Rarity.R,
    150,
    'anyMonster',
    { type: 'curseForcedStop' },
    '対象モンスターの土地に強制停止の呪い。使用者・同盟者以外は通過できない',
  ),
  homingInstinct: spell(
    'homingInstinct',
    '帰巣本能',
    Rarity.S,
    50,
    'self',
    { type: 'returnToStartDoubleBonus' },
    '自分のコマをスタート地点に戻し、周回ボーナスの2倍のGを獲得する。このターンは他の行動不可',
  ),

  // ── 経済系 ──
  sideIncome: spell('sideIncome', '副業収入', Rarity.N, 0, 'self', { type: 'lapCountGold', perLap: 50, flat: 50 }, '周回数×50G+50Gを得る'),
  taxHike: spell(
    'taxHike',
    '増税通知',
    Rarity.N,
    40,
    'anyTile',
    { type: 'tollReductionCurse', ratio: 0.3 },
    '対象の土地に「通行料30%減」の呪いをかける',
  ),
  splitEvenly: spell('splitEvenly', '山分け', Rarity.S, 100, 'none', { type: 'redistributeGoldEvenly' }, '場の手持ちG合計を全員で均等に分配し直す'),
  specialAudit: spell(
    'specialAudit',
    '追徴課税',
    Rarity.S,
    70,
    'anyTile',
    { type: 'tollBonusOnceCurse', multiplier: 1.5 },
    '対象の土地に止まった次の相手から、通常の1.5倍の通行料を得る（1回限り）',
  ),
  taxEvasion: spell('taxEvasion', '脱税', Rarity.N, 80, 'self', { type: 'tollWaiverCurse' }, '自分が次に支払うはずだった通行料を1回無効化する'),
  lottery: spell(
    'lottery',
    '宝くじ',
    Rarity.N,
    50,
    'self',
    { type: 'lotteryOnNextGoal' },
    '次にゴールした時、0〜500Gの間でランダムに獲得する（100G刻み、500Gのみ確率10%）',
  ),
  walletVacuum: spell('walletVacuum', '財布チューチュー', Rarity.R, 100, 'enemyPlayer', { type: 'stealGoldRatio', ratio: 0.3 }, '対象プレイヤーから手持ちGの30%を奪う'),

  // ── 攻撃系 ──
  senbonZakura: spell('senbonZakura', '千本桜', Rarity.R, 100, 'enemyMonster', { type: 'directDamage', amount: 30 }, '対象モンスターに30ダメージ'),
  fireball: spell('fireball', 'ファイヤーボール', Rarity.N, 40, 'enemyMonster', { type: 'directDamage', amount: 15 }, '相手モンスター1体に15ダメージ'),
  smallMeteor: spell('smallMeteor', '小隕石', Rarity.N, 50, 'none', { type: 'damageAllUnits', amount: 10 }, '場の全モンスターに10ダメージ（自分のモンスターも対象）'),
  poisonMist: spell(
    'poisonMist',
    '毒霧',
    Rarity.S,
    60,
    'anyTile',
    { type: 'poisonArea', ratio: 0.15 },
    '選んだマスと隣接マスのモンスター全員を毒状態にする（最大基礎HPの15%、戦闘終了直前にダメージ）',
  ),
  absoluteAttack: spell(
    'absoluteAttack',
    '絶対攻撃',
    Rarity.N,
    50,
    'anyPlayer',
    { type: 'grantPierceNextInvasion' },
    '対象プレイヤーが次に侵略する時、召喚したモンスターが一時的に「貫通」を得る',
  ),
  manjaro: spell(
    'manjaro',
    'マ〇ジャロ',
    Rarity.S,
    30,
    'anyMonster',
    { type: 'statCurse', addedAtk: 10, addedHp: 20 },
    '対象の配置モンスターは戦闘中HP+20・ATK+10になる呪い。そのモンスターがその土地にいる限り永続',
  ),
  dieWithMe: spell(
    'dieWithMe',
    'お前も〇ぬんだ',
    Rarity.R,
    100,
    'self',
    { type: 'guaranteedNextInvasionWin', cost: 700 },
    '自分への呪い。次に相手の土地を侵略する時、700Gを失う代わりに戦闘なしでそのモンスターを倒す',
  ),
  floodDamage: spell('floodDamage', '洪水', Rarity.S, 80, 'none', { type: 'damageAllUnitsOfElement', element: Element.FIRE, amount: 20 }, 'すべての火属性モンスターに20ダメージ'),
  droughtDamage: spell('droughtDamage', '干ばつ', Rarity.S, 80, 'none', { type: 'damageAllUnitsOfElement', element: Element.WATER, amount: 20 }, 'すべての水属性モンスターに20ダメージ'),
  wireAccident: spell('wireAccident', '断線事故', Rarity.S, 80, 'none', { type: 'damageAllUnitsOfElement', element: Element.THUNDER, amount: 20 }, 'すべての雷属性モンスターに20ダメージ'),
  forestFireDamage: spell('forestFireDamage', '森林火災', Rarity.S, 80, 'none', { type: 'damageAllUnitsOfElement', element: Element.FOREST, amount: 20 }, 'すべての森属性モンスターに20ダメージ'),

  // ── 回復系 ──
  heal: spell('heal', 'ヒール', Rarity.N, 30, 'ownMonster', { type: 'fullHeal' }, '自分のモンスター1体のHPを全回復する'),
  philanthropy: spell('philanthropy', '博愛精神', Rarity.N, 50, 'none', { type: 'healAllUnitsRatio', ratio: 0.3 }, '場のすべてのモンスターのHPを30%回復する'),
  curseCleanse: spell(
    'curseCleanse',
    '呪い解除',
    Rarity.N,
    40,
    'ownMonster',
    { type: 'cleanseCurses' },
    '自分と選択したモンスター1体の呪い状態をすべて解除する',
  ),
  phoenixCurse: spell(
    'phoenixCurse',
    '不死鳥の呪い',
    Rarity.R,
    100,
    'ownMonster',
    { type: 'surviveLethalDamageCurse' },
    '対象モンスターは戦闘で致死ダメージを受けてもHP1で踏みとどまり、土地も奪われない（1回限り発動）',
  ),

  // ── 土地操作系 ──
  realEstateAppraiser: spell(
    'realEstateAppraiser',
    '不動産鑑〇士',
    Rarity.S,
    60,
    'self',
    { type: 'enableAllOwnTileAbilities', turns: 2 },
    '自分への呪い。2ターンの間、自身のすべての土地の土地コマンドが使用可能になる',
  ),
  optimize: spell(
    'optimize',
    '最適化',
    Rarity.R,
    300,
    'none',
    { type: 'autoMatchAllTileElements' },
    'すべての土地で、土地の属性と配置モンスターの属性が違う場合、モンスターの属性に合わせて土地を変更する',
  ),
  arson: spell('arson', '放火', Rarity.S, 150, 'anyTile', { type: 'forceTileElement', element: Element.FIRE }, '対象の土地を土地レベルによらず火の土地に変える'),
  waterRelease: spell('waterRelease', '放水', Rarity.S, 150, 'anyTile', { type: 'forceTileElement', element: Element.WATER }, '対象の土地を土地レベルによらず水の土地に変える'),
  electrify: spell('electrify', '放電', Rarity.S, 150, 'anyTile', { type: 'forceTileElement', element: Element.THUNDER }, '対象の土地を土地レベルによらず雷の土地に変える'),
  grazing: spell('grazing', '放牧', Rarity.S, 150, 'anyTile', { type: 'forceTileElement', element: Element.FOREST }, '対象の土地を土地レベルによらず森の土地に変える'),
  shuffleMonsters: spell(
    'shuffleMonsters',
    'シャッフル',
    Rarity.N,
    40,
    'twoOwnMonsters',
    { type: 'swapTwoMonsters' },
    '自身の配置モンスターを2体選択し入れ替える。対象の呪いは消滅する',
  ),
  psychokinesis: spell(
    'psychokinesis',
    'サイコキネシス',
    Rarity.R,
    100,
    'anyMonster',
    { type: 'forceRelocateOneStep' },
    '配置された全モンスターから1体選択し、1マス強制移動させる（移動先が味方土地・特殊マスなら移動不可。相手土地なら強制戦闘）',
  ),
  twitterLand: spell('twitterLand', 'ツイッ〇ランド', Rarity.N, 100, 'anyTile', { type: 'forceTileElement', element: Element.NEUTRAL }, '対象の土地を無色に変える'),
  sanctuary: spell(
    'sanctuary',
    '聖域',
    Rarity.N,
    90,
    'anyMonster',
    { type: 'curseSanctuary' },
    '対象のモンスターを他プレイヤーが侵略できない状態にする。通行料も発生しない',
  ),
};

let instanceCounter = 0;

/** N unique deck/hand copies of a catalog definition, each with its own id. */
function duplicateForDeck(def, count) {
  const copies = [];
  for (let i = 0; i < count; i++) {
    instanceCounter += 1;
    copies.push({ ...def, id: `${def.id}-${instanceCounter}`, catalogId: def.id });
  }
  return copies;
}

/**
 * The two character-creation starter books. Each leans on 2 of the 4
 * elements - the generic monster fill (see buildCardPool's `elements`
 * option) is restricted to just those two, plus whichever named catalog
 * monster/item matches, so the two books actually play differently instead
 * of just swapping which named card is mixed in.
 */
export const STARTER_DECKS = {
  fireForest: {
    id: 'fireForest',
    name: '火・森ブック',
    elements: [Element.FIRE, Element.FOREST],
    featuredMonster: MONSTER_CATALOG.salarymander,
    featuredItem: ITEM_CATALOG.knife,
  },
  waterThunder: {
    id: 'waterThunder',
    name: '水・雷ブック',
    elements: [Element.WATER, Element.THUNDER],
    featuredMonster: MONSTER_CATALOG.minatoJoshi,
    featuredItem: ITEM_CATALOG.potLid,
  },
};

/**
 * 40種のスペルからレアリティ別重み（N70%/S20%/R10%、_randomItemCardForSummon
 * と同じ配分）で`count`枚を抽選する。以前はマ〇ジャロ固定2枚＋残りは
 * 完全に無機能なプレースホルダー「スペル1」等（buildCardPool参照）で
 * 埋めていたが、実在する40種を実際にデッキへ混ぜるよう置き換えた。
 */
function buildRandomSpellSelection(count) {
  const pool = Object.values(SPELL_CATALOG);
  const byRarity = { [Rarity.N]: [], [Rarity.S]: [], [Rarity.R]: [] };
  for (const c of pool) {
    if (byRarity[c.rarity]) byRarity[c.rarity].push(c);
  }
  const picks = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    const rarity = roll < 0.1 ? Rarity.R : roll < 0.3 ? Rarity.S : Rarity.N;
    const tier = byRarity[rarity].length ? byRarity[rarity] : byRarity[Rarity.N];
    picks.push(tier[Math.floor(Math.random() * tier.length)]);
  }
  return picks.flatMap((def) => duplicateForDeck(def, 1));
}

/** The named cards to mix into a starter book, 4 copies of the monster/item and DEFAULT_SPELL_COUNT random real spells. `bookId` picks which of STARTER_DECKS; defaults to the fire/forest book. */
export function buildStarterExtraCards(bookId = 'fireForest') {
  const book = STARTER_DECKS[bookId] || STARTER_DECKS.fireForest;
  return [
    ...duplicateForDeck(book.featuredMonster, 4),
    ...duplicateForDeck(book.featuredItem, 4),
    ...buildRandomSpellSelection(DEFAULT_SPELL_COUNT),
  ];
}

/** The full 40-card starter book as a plain, persistable card-definition list (not a live Deck) - what character creation saves as the player's initial deckList. */
export function buildStarterDeckList(bookId = 'fireForest') {
  const book = STARTER_DECKS[bookId] || STARTER_DECKS.fireForest;
  const extra = buildStarterExtraCards(bookId);
  return new Deck(extra, { elements: book.elements }).drawPile;
}

/**
 * A themed 40-card deck list for an NPC (ストーリーモードの敵/味方キャラ
 * 等) - same shape as buildStarterDeckList's output, but not tied to the
 * 2 fixed STARTER_DECKS book ids. `elements` restricts the generic monster
 * fill to give the deck a real identity; `featuredMonster`/`featuredItem`
 * (optional catalog defs) get mixed in 4 copies each, same as a player
 * starter book, for a signature card. See story.js's STORY_STAGES for the
 * per-character theme assignments.
 */
export function buildThemedDeckList({ elements, featuredMonster, featuredItem }) {
  const extra = [
    ...(featuredMonster ? duplicateForDeck(featuredMonster, 4) : []),
    ...(featuredItem ? duplicateForDeck(featuredItem, 4) : []),
    ...buildRandomSpellSelection(DEFAULT_SPELL_COUNT),
  ];
  return new Deck(extra, { elements }).drawPile;
}

/** The stable catalog key for ability/effect lookups, for both raw catalog defs and deck copies. */
export function catalogIdOf(def) {
  return def.catalogId || def.id;
}
