import { CardType, Element, Rarity, Deck, DEFAULT_SPELL_COUNT } from './cards.js';
import { assetUrl } from './assetUrl.js';
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
  ...(options.imageDataUrl ? { imageDataUrl: options.imageDataUrl } : {}),
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
    imageDataUrl: assetUrl('/images/card-art/fenixsword.png'),
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
    imageDataUrl: assetUrl('/images/card-art/penotue.png'),
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
  diceOne: spell('diceOne', '1のダイス', Rarity.N, 30, 'anyPlayer', { type: 'setNextDice', value: 1 }, '選んだプレイヤーの次のサイコロを1にする'),
  backfire: spell('backfire', 'バックファイア', Rarity.S, 50, 'anyPlayer', { type: 'reverseNextDice' }, '選んだプレイヤーを次のサイコロの数だけ後退させる'),
  diceThree: spell('diceThree', '3のダイス', Rarity.N, 30, 'anyPlayer', { type: 'setNextDice', value: 3 }, '選んだプレイヤーの次のサイコロを3にする'),
  // 元データは名前「6のダイス」なのに効果文が「次のサイコロを1にする」と
  // なっていた（1のダイスとの重複ミスと判断）。名前に合わせて6として実装。
  diceSix: spell('diceSix', '6のダイス', Rarity.N, 30, 'anyPlayer', { type: 'setNextDice', value: 6 }, '選んだプレイヤーの次のサイコロを6にする'),
  iCanFly: spell('iCanFly', 'アイキャンフライ', Rarity.N, 30, 'anyPlayer', { type: 'doubleNextDice' }, '選んだプレイヤーの次のサイコロの出目×2進む'),
  cancelCulture: spell('cancelCulture', 'キャンセルカルチャー', Rarity.N, 40, 'enemyPlayerHandCard', { type: 'destroyHandCard' }, '指定した相手の手札を見て、スペルかアイテムを1枚選んで捨てさせる'),
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
  walletVacuum: spell('walletVacuum', '財布チューチュー', Rarity.R, 100, 'anyPlayer', { type: 'stealGoldRatio', ratio: 0.3 }, '選んだプレイヤーから手持ちGの30%を奪う'),

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
    Rarity.N,
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
  // 段ボール男初回撃破のクリア報酬。EXレア。使うと手札に戻る（捨てたら消滅）。
  encounterUnknown: spell(
    'encounterUnknown',
    '未知との遭遇',
    Rarity.EX,
    40,
    'self',
    { type: 'encounterUnknown' },
    'デッキにセットしていてまだ一度もドローしていない無属性モンスターを1体手札に加える（使うと手札に戻る／捨てたら消滅）。全種遭遇済みなら復帰せず200G＋2ドロー',
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
 * The two character-creation starter books. `composition` is the curated
 * 39-card list from chinu-quest2-starter-decks-v3.md (originally 20
 * monsters + 7 items + 13 spells = 40, minus 1 monster - see the
 * "N-1" note below) - unlike buildThemedDeckList's NPC decks, starter
 * books carry NO generic/random filler at all; see buildStarterCardList
 * below. `elements` is kept only for display/theming purposes (e.g.
 * tile-preview UI), not for any generic pool fill anymore.
 *
 * 39ではなく40と仕様書にはあったが、main.jsのキャラメイクでブリード
 * モンスター（レアリティEX）を必ず1枚差し込む仕様のため、両デッキとも
 * N モンスター1種の枚数を1つ減らして合計39枚にしてある（山賊フクロウ/
 * 静電気野郎をそれぞれ3→2）。buildStarterCardList自体は素の39枚を返し、
 * main.jsのcharmakeSubmitがブリードモンスターを足して40枚に確定する。
 */
export const STARTER_DECKS = {
  fireForest: {
    id: 'fireForest',
    name: '火・森デッキ',
    elements: [Element.FIRE, Element.FOREST],
    featuredMonster: MONSTER_CATALOG.salarymander,
    featuredItem: ITEM_CATALOG.knife,
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.salarymander, count: 4 },
        { def: MONSTER_CATALOG.magman, count: 4 },
        { def: MONSTER_CATALOG.takenokoha, count: 4 },
        { def: MONSTER_CATALOG.kinokoha, count: 4 },
        { def: MONSTER_CATALOG.sanzokuFukurou, count: 2 },
        { def: MONSTER_CATALOG.kaentake, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.knife, count: 2 },
        { def: ITEM_CATALOG.potLid, count: 2 },
        { def: ITEM_CATALOG.kombo, count: 4 },
        { def: ITEM_CATALOG.boudanChokki, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.diceOne, count: 1 },
        { def: SPELL_CATALOG.diceThree, count: 1 },
        // ファイヤーボール/ヒールを計5枚減らした枠は、指定された基本装備
        // 各1枚追加と6のダイス計3枚追加で埋め、スターター39枚を維持する。
        { def: SPELL_CATALOG.diceSix, count: 4 },
        { def: SPELL_CATALOG.iCanFly, count: 1 },
        { def: SPELL_CATALOG.fireball, count: 2 },
        { def: SPELL_CATALOG.cancelCulture, count: 1 },
        { def: SPELL_CATALOG.poisonMist, count: 1 },
      ],
    },
  },
  waterThunder: {
    id: 'waterThunder',
    name: '水・雷デッキ',
    elements: [Element.WATER, Element.THUNDER],
    featuredMonster: MONSTER_CATALOG.minatoJoshi,
    featuredItem: ITEM_CATALOG.potLid,
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.minatoJoshi, count: 4 },
        { def: MONSTER_CATALOG.hangyojin, count: 4 },
        { def: MONSTER_CATALOG.hatsudenNezumi, count: 4 },
        { def: MONSTER_CATALOG.tetsuo, count: 4 },
        { def: MONSTER_CATALOG.seidenkiYarou, count: 2 },
        { def: MONSTER_CATALOG.fireman, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.knife, count: 2 },
        { def: ITEM_CATALOG.potLid, count: 2 },
        { def: ITEM_CATALOG.kombo, count: 4 },
        { def: ITEM_CATALOG.boudanChokki, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.diceOne, count: 1 },
        { def: SPELL_CATALOG.diceThree, count: 1 },
        { def: SPELL_CATALOG.diceSix, count: 4 },
        { def: SPELL_CATALOG.iCanFly, count: 1 },
        { def: SPELL_CATALOG.fireball, count: 2 },
        { def: SPELL_CATALOG.cancelCulture, count: 1 },
        { def: SPELL_CATALOG.specialAudit, count: 1 },
      ],
    },
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

/** Expands a `{monsters, items, spells}` composition (each a `{def, count}` array) into a flat card list via duplicateForDeck - shared by starter books and character-fixed decks, neither of which use any generic/random filler. */
function buildCardListFromComposition({ monsters, items, spells }) {
  return [...monsters, ...items, ...spells].flatMap(({ def, count }) => duplicateForDeck(def, count));
}

/**
 * The exact, fully curated 39-card list for a starter book
 * (chinu-quest2-starter-decks-v3.md minus 1 N monster - see STARTER_DECKS'
 * doc comment) - no generic placeholder or random-spell filler at all,
 * unlike buildThemedDeckList's NPC decks. `bookId` picks which of
 * STARTER_DECKS; defaults to the fire/forest book. Character creation
 * (main.js charmakeSubmit) adds the player's breed monster as the 40th card.
 */
export function buildStarterCardList(bookId = 'fireForest') {
  const book = STARTER_DECKS[bookId] || STARTER_DECKS.fireForest;
  return buildCardListFromComposition(book.composition);
}

/** The 39-card starter book as a plain, persistable card-definition list (not a live Deck) - character creation pushes the breed monster on top to reach 40. */
export function buildStarterDeckList(bookId = 'fireForest') {
  return Deck.fromCardList(buildStarterCardList(bookId)).drawPile;
}

/**
 * Character-specific fixed 40-card decks for story-mode NPCs (chinu-quest2-deck-<name>_1.md).
 * Same shape/spirit as STARTER_DECKS.composition - a fully curated, closed
 * list with no generic/random filler - but keyed by a story.js `deckKey`
 * instead of a book id. Characters without an entry here still fall back to
 * buildThemedDeckList's themed-random deck (see main.js buildBattlePlayerConfigs).
 */
export const CHARACTER_DECKS = {
  hitode: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.minatoJoshi, count: 4 },
        { def: MONSTER_CATALOG.hangyojin, count: 1 },
        { def: MONSTER_CATALOG.amoeba, count: 1 },
        { def: MONSTER_CATALOG.suikenKurage, count: 1 },
        { def: MONSTER_CATALOG.redEi, count: 1 },
        { def: MONSTER_CATALOG.penpen, count: 4 },
        { def: MONSTER_CATALOG.shinkaigyoX, count: 4 },
        { def: MONSTER_CATALOG.fireman, count: 1 },
        { def: MONSTER_CATALOG.sekizou, count: 3 },
        { def: MONSTER_CATALOG.kunekune, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.kombo, count: 4 },
        { def: ITEM_CATALOG.boudanChokki, count: 3 },
        { def: ITEM_CATALOG.harinezumiNoFuku, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.diceOne, count: 1 },
        { def: SPELL_CATALOG.diceThree, count: 3 },
        { def: SPELL_CATALOG.diceSix, count: 3 },
        { def: SPELL_CATALOG.iCanFly, count: 2 },
        { def: SPELL_CATALOG.waterRelease, count: 2 },
      ],
    },
  },
  madai: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.minatoJoshi, count: 3 },
        { def: MONSTER_CATALOG.hangyojin, count: 3 },
        { def: MONSTER_CATALOG.tsurara, count: 3 },
        { def: MONSTER_CATALOG.aoriika, count: 2 },
        { def: MONSTER_CATALOG.suijin, count: 1 },
        { def: MONSTER_CATALOG.penpen, count: 1 },
        { def: MONSTER_CATALOG.hatsudenNezumi, count: 2 },
        { def: MONSTER_CATALOG.tetsuo, count: 2 },
        { def: MONSTER_CATALOG.hatsudenOni, count: 2 },
        { def: MONSTER_CATALOG.raiun, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.kombo, count: 2 },
        { def: ITEM_CATALOG.tetsuPipe, count: 2 },
        { def: ITEM_CATALOG.morohaNoTsurugi, count: 2 },
        { def: ITEM_CATALOG.pegasusSword, count: 1 },
        { def: ITEM_CATALOG.zangokuKen, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.diceSix, count: 3 },
        { def: SPELL_CATALOG.diceOne, count: 3 },
        { def: SPELL_CATALOG.iCanFly, count: 3 },
        { def: SPELL_CATALOG.sideIncome, count: 1 },
        { def: SPELL_CATALOG.splitEvenly, count: 1 },
        { def: SPELL_CATALOG.poisonMist, count: 1 },
      ],
    },
  },
  oniku: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.takenokoha, count: 3 },
        { def: MONSTER_CATALOG.kinokoha, count: 3 },
        { def: MONSTER_CATALOG.moriNoYousei, count: 2 },
        { def: MONSTER_CATALOG.matagiNoKoshirou, count: 2 },
        { def: MONSTER_CATALOG.yamamba, count: 1 },
        { def: MONSTER_CATALOG.sekaiju, count: 1 },
        { def: MONSTER_CATALOG.salarymander, count: 2 },
        { def: MONSTER_CATALOG.magman, count: 2 },
        { def: MONSTER_CATALOG.kaentake, count: 2 },
        { def: MONSTER_CATALOG.hitodama, count: 1 },
        { def: MONSTER_CATALOG.classicDragon, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.tetsuNoYoroi, count: 2 },
        { def: ITEM_CATALOG.boudanChokki, count: 3 },
        { def: ITEM_CATALOG.nankaNoOmamori, count: 1 },
        { def: ITEM_CATALOG.harinezumiNoFuku, count: 1 },
        { def: ITEM_CATALOG.fushichoNoKen, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.diceOne, count: 3 },
        { def: SPELL_CATALOG.diceThree, count: 3 },
        { def: SPELL_CATALOG.sideIncome, count: 2 },
        { def: SPELL_CATALOG.splitEvenly, count: 1 },
        { def: SPELL_CATALOG.poisonMist, count: 1 },
        { def: SPELL_CATALOG.specialAudit, count: 1 },
        { def: SPELL_CATALOG.senbonZakura, count: 1 },
      ],
    },
  },
  usagin: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.takenokoha, count: 2 }, { def: MONSTER_CATALOG.kinokoha, count: 2 },
        { def: MONSTER_CATALOG.saboriTender, count: 2 }, { def: MONSTER_CATALOG.sanzokuFukurou, count: 1 },
        { def: MONSTER_CATALOG.nashiNashiTankentai, count: 2 }, { def: MONSTER_CATALOG.matagiNoKoshirou, count: 2 },
        { def: MONSTER_CATALOG.yamamba, count: 2 }, { def: MONSTER_CATALOG.jinmenchou, count: 1 },
        { def: MONSTER_CATALOG.jukaiNoOnryou, count: 2 }, { def: MONSTER_CATALOG.mountGorilla, count: 1 },
        { def: MONSTER_CATALOG.yamagami, count: 1 }, { def: MONSTER_CATALOG.rainbowChameleon, count: 3 },
      ],
      items: [
        { def: ITEM_CATALOG.kombo, count: 1 }, { def: ITEM_CATALOG.denryuMuchi, count: 1 },
        { def: ITEM_CATALOG.potLid, count: 1 }, { def: ITEM_CATALOG.stegoro, count: 2 },
        { def: ITEM_CATALOG.ikasamaNoSaikoro, count: 1 }, { def: ITEM_CATALOG.shinkenShirahadori, count: 1 },
        { def: ITEM_CATALOG.zangokuKen, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.diceOne, count: 1 }, { def: SPELL_CATALOG.diceThree, count: 1 },
        { def: SPELL_CATALOG.taxHike, count: 1 }, { def: SPELL_CATALOG.poisonMist, count: 1 },
        { def: SPELL_CATALOG.splitEvenly, count: 1 }, { def: SPELL_CATALOG.specialAudit, count: 1 },
        { def: SPELL_CATALOG.grazing, count: 4 }, { def: SPELL_CATALOG.twitterLand, count: 1 },
      ],
    },
  },
  shoujoA: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.hatsudenNezumi, count: 2 }, { def: MONSTER_CATALOG.tetsuo, count: 2 },
        { def: MONSTER_CATALOG.ironWool, count: 2 }, { def: MONSTER_CATALOG.mechanicMaso, count: 1 },
        { def: MONSTER_CATALOG.raiheishinZamurai, count: 3 }, { def: MONSTER_CATALOG.raiun, count: 2 },
        { def: MONSTER_CATALOG.erekiKagayaki, count: 2 }, { def: MONSTER_CATALOG.gandamu, count: 2 },
        { def: MONSTER_CATALOG.raijin, count: 2 }, { def: MONSTER_CATALOG.rainbowChameleon, count: 3 },
      ],
      items: [
        { def: ITEM_CATALOG.boudanChokki, count: 1 }, { def: ITEM_CATALOG.tetsuNoYoroi, count: 1 },
        { def: ITEM_CATALOG.danboorNoYoroi, count: 1 }, { def: ITEM_CATALOG.nankaNoOmamori, count: 2 },
        { def: ITEM_CATALOG.harinezumiNoFuku, count: 1 }, { def: ITEM_CATALOG.fushichoNoKen, count: 2 },
      ],
      spells: [
        { def: SPELL_CATALOG.heal, count: 2 }, { def: SPELL_CATALOG.curseCleanse, count: 2 },
        { def: SPELL_CATALOG.taxEvasion, count: 1 }, { def: SPELL_CATALOG.splitEvenly, count: 1 },
        { def: SPELL_CATALOG.poisonMist, count: 1 }, { def: SPELL_CATALOG.specialAudit, count: 1 },
        { def: SPELL_CATALOG.electrify, count: 3 },
      ],
    },
  },
  hofuku: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.minatoJoshi, count: 2 }, { def: MONSTER_CATALOG.hangyojin, count: 2 },
        { def: MONSTER_CATALOG.penpen, count: 2 }, { def: MONSTER_CATALOG.shinkaigyoX, count: 1 },
        { def: MONSTER_CATALOG.kaizokuS, count: 1 }, { def: MONSTER_CATALOG.aoriika, count: 2 },
        { def: MONSTER_CATALOG.tsurara, count: 1 }, { def: MONSTER_CATALOG.azarashisan, count: 2 },
        { def: MONSTER_CATALOG.mizuburoShugyoso, count: 1 }, { def: MONSTER_CATALOG.bigMermaid, count: 2 },
        { def: MONSTER_CATALOG.suijin, count: 1 }, { def: MONSTER_CATALOG.uminoieTencho, count: 1 },
        { def: MONSTER_CATALOG.rainbowChameleon, count: 3 },
      ],
      items: [
        { def: ITEM_CATALOG.kombo, count: 1 }, { def: ITEM_CATALOG.boudanChokki, count: 1 },
        { def: ITEM_CATALOG.nyoBou, count: 1 }, { def: ITEM_CATALOG.pegasusSword, count: 1 },
        { def: ITEM_CATALOG.lifeJacket, count: 1 }, { def: ITEM_CATALOG.twinHammer, count: 1 },
        { def: ITEM_CATALOG.gomuGoNoPistol, count: 1 }, { def: ITEM_CATALOG.shinkenShirahadori, count: 1 },
        { def: ITEM_CATALOG.peeStaff, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.fireball, count: 1 }, { def: SPELL_CATALOG.heal, count: 1 },
        { def: SPELL_CATALOG.sideIncome, count: 1 }, { def: SPELL_CATALOG.shuffleMonsters, count: 1 },
        { def: SPELL_CATALOG.poisonMist, count: 1 }, { def: SPELL_CATALOG.splitEvenly, count: 1 },
        { def: SPELL_CATALOG.specialAudit, count: 1 }, { def: SPELL_CATALOG.waterRelease, count: 3 },
      ],
    },
  },
  danball: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.kodaiNoGearA, count: 2 }, { def: MONSTER_CATALOG.kodaiNoGearB, count: 2 },
        { def: MONSTER_CATALOG.kodaiNoGearC, count: 2 }, { def: MONSTER_CATALOG.kunekune, count: 1 },
        { def: MONSTER_CATALOG.rainbowChameleon, count: 1 }, { def: MONSTER_CATALOG.kaentake, count: 2 },
        { def: MONSTER_CATALOG.fireKick, count: 2 }, { def: MONSTER_CATALOG.hitodama, count: 2 },
        { def: MONSTER_CATALOG.hezumaDragon, count: 1 }, { def: MONSTER_CATALOG.flameGod, count: 1 },
        { def: MONSTER_CATALOG.hatsudenOni, count: 2 }, { def: MONSTER_CATALOG.raiun, count: 2 },
        { def: MONSTER_CATALOG.erekiMagician, count: 1 }, { def: MONSTER_CATALOG.aruKagakuNo, count: 1 },
        { def: MONSTER_CATALOG.raijin, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.morohaNoTsurugi, count: 1 }, { def: ITEM_CATALOG.harinezumiNoFuku, count: 1 },
        { def: ITEM_CATALOG.stegoro, count: 1 }, { def: ITEM_CATALOG.twinHammer, count: 1 },
        { def: ITEM_CATALOG.fushichoNoKen, count: 1 }, { def: ITEM_CATALOG.heikeNoYoroi, count: 1 },
        { def: ITEM_CATALOG.zangokuKen, count: 1 }, { def: ITEM_CATALOG.shinkenShirahadori, count: 1 },
        { def: ITEM_CATALOG.peeStaff, count: 1 }, { def: ITEM_CATALOG.pegasusSword, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.twitterLand, count: 2 }, { def: SPELL_CATALOG.senbonZakura, count: 2 },
        { def: SPELL_CATALOG.sideIncome, count: 1 }, { def: SPELL_CATALOG.iCanFly, count: 1 },
        { def: SPELL_CATALOG.encounterUnknown, count: 1 },
      ],
    },
  },
};

/** The exact 40-card list for a story-mode character's fixed deck (see CHARACTER_DECKS). */
export function buildCharacterCardList(deckKey) {
  return buildCardListFromComposition(CHARACTER_DECKS[deckKey].composition);
}

/** Plain, shuffled 40-card list (same return shape as buildThemedDeckList) for a character's fixed deck. */
export function buildCharacterDeckList(deckKey) {
  return Deck.fromCardList(buildCharacterCardList(deckKey)).drawPile;
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
