import { CardType, Element, Rarity } from './cards.js';

const NORMAL_COST = 50;
const thunderMonster = (id, name, rarity, hp, atk, options = {}) => ({
  id,
  type: CardType.MONSTER,
  name,
  element: Element.THUNDER,
  rarity,
  hp,
  atk,
  cost: options.cost ?? NORMAL_COST,
  ...(options.chainRequired ? { chainRequired: options.chainRequired } : {}),
  ...(options.commandCost ? { commandCost: options.commandCost } : {}),
  ...(options.ability ? { ability: options.ability } : {}),
  ...(options.traits ? { traits: options.traits } : {}),
  ...(options.effect ? { effect: options.effect } : {}),
  ...(options.effectDescription ? { effectDescription: options.effectDescription } : {}),
});

/**
 * 電柱を植える男の土地コマンドが盤面に生成する専用カード。図鑑登録はせず
 * （MONSTER_CATALOGに含めない）、game.jsの_humanAbilityFlowが直接
 * importしてこの定義から即席インスタンスを作る。所有者を問わず盤面に
 * 1体でもいる間、全ての雷属性モンスターがHP+10になる（game.jsの
 * _battleBonus参照、catalogId='denchu-field'で判定）。
 */
export const DENCHU_FIELD_MONSTER = {
  id: 'denchu-field',
  catalogId: 'denchu-field',
  type: CardType.MONSTER,
  name: '電柱',
  element: Element.THUNDER,
  rarity: Rarity.N,
  hp: 10,
  atk: 0,
  cost: 0,
};

/** 雷属性モンスター20種。画像未指定時はcardArt.jsの雷属性共通画像を使う。 */
export const THUNDER_MONSTER_CATALOG = {
  hatsudenNezumi: thunderMonster('hatsudenNezumi', '発電ネズミ', Rarity.N, 30, 30, {
    effect: { type: 'survivalGold', multiplier: 2 },
    effectDescription: '戦闘で生き残った場合、残りHP×2Gを得る',
  }),
  denkiUnagi: thunderMonster('denkiUnagi', '電気ウナギ', Rarity.N, 20, 30),
  denchuwoUeruOtoko: thunderMonster('denchuwoUeruOtoko', '電柱を植える男', Rarity.N, 20, 20, {
    commandCost: 80,
    ability: { type: 'summonFieldMonster' },
    effectDescription: '土地コマンド（80G）: ランダムな空き地に「電柱」を召喚する（図鑑登録なしの専用駒、配置されている間すべての雷属性モンスターがHP+10）',
  }),
  seidenkiYarou: thunderMonster('seidenkiYarou', '静電気野郎', Rarity.N, 25, 25, {
    cost: 20,
    effect: { type: 'atkDownOnHit', amount: 10 },
    effectDescription: '攻撃成功時、相手のATKを10下げる（永続）',
  }),
  ironWool: thunderMonster('ironWool', 'アイアンウール', Rarity.N, 30, 30),
  tetsuo: thunderMonster('tetsuo', '鉄男', Rarity.N, 40, 20),
  nazoNoKagakusha: thunderMonster('nazoNoKagakusha', '謎の科学者', Rarity.N, 30, 30, {
    effect: { type: 'itemOnSummon' },
    effectDescription: '召喚時、アイテムカードを1枚入手する（全アイテムからランダム。N70%・S20%・R10%）',
  }),
  mechanicMaso: thunderMonster('mechanicMaso', 'メカニックマソ', Rarity.N, 40, 10, {
    effectDescription: '配置していると、周回ごとに自分の雷属性モンスター全員が最大HPの10%回復する',
  }),
  biribiTama: thunderMonster('biribiTama', 'ビリビリ玉', Rarity.N, 20, 40, { cost: 30 }),
  sonicMove: thunderMonster('sonicMove', 'ソニックムーヴ', Rarity.N, 30, 30, {
    cost: 50,
    ability: { type: 'cursePlayerHaste', turns: 2 },
    effectDescription: '土地コマンド: 選んだプレイヤーに高速化の呪いをかける（2ターン継続。サイコロ・スペルフェーズがスキップされ、代わりに6マス固定で移動する）',
  }),

  thunderbird: thunderMonster('thunderbird', 'サンダーバード', Rarity.S, 30, 30, {
    traits: ['firstStrike'],
    commandCost: 90,
    ability: { type: 'summonMonsterOnEmptyLand', catalogId: 'raiun' },
    effectDescription: '先制。土地コマンド（90G）: 雷雲をランダムな空き地に召喚する',
  }),
  raiun: thunderMonster('raiun', '雷雲', Rarity.S, 30, 30, {
    effect: { type: 'shockOnHit', chance: 1 / 3 },
    effectDescription: '攻撃成功時、相手を感電状態にする（以後の攻撃が1/3の確率で不発になる。入れ替え/死亡まで継続）',
  }),
  raiheishinZamurai: thunderMonster('raiheishinZamurai', '避雷針侍', Rarity.S, 40, 30, {
    effectDescription: '配置されていると、味方モンスターが相手の攻撃で死ぬ場合、代わりに避雷針侍が身代わりになって死亡する（本来死ぬはずのモンスターはノーダメージ）',
  }),
  erekiKagayaki: thunderMonster('erekiKagayaki', 'エレキ輝', Rarity.S, 30, 30, {
    cost: 30,
    traits: ['firstStrike'],
    effectDescription: '先制',
  }),
  erekiMagician: thunderMonster('erekiMagician', 'エレキマジシャン', Rarity.S, 30, 30, {
    commandCost: 30,
    ability: { type: 'warpToEmptyElementLand', element: Element.THUNDER },
    effectDescription: '土地コマンド（30G）: 任意の雷属性の空き地へワープする',
  }),
  hatsudenOni: thunderMonster('hatsudenOni', '発電鬼', Rarity.S, 30, 40, {
    cost: 80,
    chainRequired: 1,
    effect: { type: 'atkBonusAgainstRarity', targetRarity: Rarity.R, ratio: 0.4 },
    effectDescription: '召喚条件: 雷の土地1連鎖以上。相手がRなら基礎ATKが40%上昇する',
  }),

  gandamu: thunderMonster('gandamu', '願駄無', Rarity.R, 30, 55, {
    cost: 120,
    chainRequired: 1,
    effectDescription: '召喚条件: 1連鎖以上',
  }),
  aruKagakuNo: thunderMonster('aruKagakuNo', 'とある科学の...', Rarity.R, 10, 40, {
    traits: ['firstStrike'],
    effect: { type: 'instantKillOnHit', chance: 0.66, targetElement: Element.WATER },
    effectDescription: '先制。攻撃成功時、水属性モンスターを66%の確率で即死させる',
  }),
  tenhou: thunderMonster('tenhou', 'テンホウ', Rarity.R, 30, 30, {
    traits: ['firstStrike'],
    effect: { type: 'stealDamageMultiple', multiplier: 5 },
    effectDescription: '先制。攻撃成功時、与えたダメージ×5Gを相手から奪う',
  }),
  raijin: thunderMonster('raijin', '雷神', Rarity.R, 30, 30, {
    cost: 150,
    chainRequired: 2,
    effect: { type: 'statsPerElementChain', element: Element.THUNDER, atkPerChain: 7, hpPerChain: 7 },
    effectDescription: '召喚条件: 2連鎖以上。戦闘中、雷の土地の連鎖数×7だけHP・ATKが上昇する',
  }),
};
