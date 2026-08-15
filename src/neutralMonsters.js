import { CardType, Element, Rarity } from './cards.js';
import { assetUrl } from './assetUrl.js';

const NORMAL_COST = 50;
const neutralMonster = (id, name, rarity, hp, atk, options = {}) => ({
  id,
  type: CardType.MONSTER,
  name,
  element: Element.NEUTRAL,
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
  imageDataUrl: options.imageDataUrl ?? assetUrl(`/images/card-art/${id}.jpg`),
});

/**
 * 古代のギアA・B・Cが3枚とも自分の盤面に揃った状態で（どれか1枚を）召喚
 * すると、game.js の _maybeFuseGear がこのカードに自動で差し替える
 * （EXレア・図鑑登録なし＝MONSTER_CATALOGには含めない。denchu-field/
 * thunderMonsters.jsのDENCHU_FIELD_MONSTERと同じ「盤面限定カード」の
 * 扱い）。元データはギアA・Bが70/70、ギアCだけ80/70と表記が食い違って
 * いたため、2箇所で一致している70/70を採用した（ユーザーへ要確認）。
 */
export const GASHAAN_FIELD_MONSTER = {
  id: 'gashaan-field',
  catalogId: 'gashaan-field',
  type: CardType.MONSTER,
  name: '合体ロボ・ガシャーン',
  element: Element.NEUTRAL,
  rarity: Rarity.EX,
  hp: 70,
  atk: 70,
  cost: 0,
  traits: ['pierce'],
  ability: { type: 'warpToAnyEmptyLand' },
  effectDescription: '貫通。土地コマンド: 任意の空き地へ移動する',
  imageDataUrl: assetUrl('/images/card-art/gasya-n.png'),
};

/** 無属性モンスター20種。画像未指定時はcardArt.jsの無属性共通画像を使う。 */
export const NEUTRAL_MONSTER_CATALOG = {
  sekizou: neutralMonster('sekizou', '石像', Rarity.N, 30, 10, { cost: 0 }),
  netBenkei: neutralMonster('netBenkei', 'ネット弁慶', Rarity.N, 50, 50, {
    effect: { type: 'statOverrideInBattle', hp: 20, atk: 20 },
    effectDescription: '戦闘時、HP/ATKともに20/20になる（実質弱体化）',
  }),
  zombie: neutralMonster('zombie', 'ゾンビ', Rarity.N, 20, 20, {
    effect: { type: 'deathRespawnChance', chance: 0.5 },
    effectDescription: '倒された時、1/2の確率で別の空き地に再出現する',
  }),
  kodaiNoGearA: neutralMonster('kodaiNoGearA', '古代のギアA', Rarity.S, 25, 10, {
    cost: 10,
    traits: ['reflectHalfDamage'],
    effect: { type: 'fusionSummon', partners: ['kodaiNoGearB', 'kodaiNoGearC'] },
    effectDescription: '受けたダメージの1/2を相手に反射。ほかのギアが2種類配置された状態で召喚すると…',
    imageDataUrl: assetUrl('/images/card-art/gearA.png'),
  }),
  kodaiNoGearB: neutralMonster('kodaiNoGearB', '古代のギアB', Rarity.S, 25, 10, {
    cost: 10,
    traits: ['elementHpBonusIgnoreElement'],
    effect: { type: 'fusionSummon', partners: ['kodaiNoGearA', 'kodaiNoGearC'] },
    effectDescription: 'どの属性の土地でも土地レベル×10のHP加算を受ける。ほかのギアが2種類配置された状態で召喚すると…',
    imageDataUrl: assetUrl('/images/card-art/gearB.png'),
  }),
  kodaiNoGearC: neutralMonster('kodaiNoGearC', '古代のギアC', Rarity.S, 25, 10, {
    cost: 10,
    traits: ['neutralHpAura'],
    effect: { type: 'fusionSummon', partners: ['kodaiNoGearA', 'kodaiNoGearB'] },
    effectDescription: '配置中、すべての無属性モンスターは戦闘中HP+10。ほかのギアが2種類配置された状態で召喚すると…',
    imageDataUrl: assetUrl('/images/card-art/gearC.png'),
  }),
  toumeiNingen: neutralMonster('toumeiNingen', '透明人間', Rarity.N, 10, 20, {
    effect: { type: 'challengeOdds', attackFailureChance: 0, negateIncomingChance: 0.75 },
    effectDescription: '相手の攻撃を75%の確率で回避する',
  }),
  ayashiiRoujin: neutralMonster('ayashiiRoujin', '怪しい老人', Rarity.N, 30, 10, {
    effect: { type: 'randomSpellAfterBattle' },
    effectDescription: '戦闘終了時、ランダムにスペルカードを手札に加える',
  }),
  mafia: neutralMonster('mafia', 'マフィア', Rarity.N, 20, 40, { cost: 30 }),
  tokkouhei: neutralMonster('tokkouhei', '特攻兵', Rarity.N, 10, 50, {
    effect: { type: 'selfDamageAfterAttack', damage: 10 },
    effectDescription: '攻撃終了時、自身が必ず10ダメージを受ける',
  }),

  inishieNoMahoutsukai: neutralMonster('inishieNoMahoutsukai', '古の魔法使い', Rarity.S, 20, 20, {
    commandCost: 30,
    ability: { type: 'changeOwnLandElement' },
    effectDescription: '土地コマンド（30G）: 自身の所有する土地の属性を任意に選択・変更できる',
  }),
  katanakaji: neutralMonster('katanakaji', '刀鍛冶', Rarity.S, 30, 30, {
    commandCost: 100,
    ability: { type: 'grantItem', itemId: 'osafune' },
    effectDescription: '土地コマンド（100G）: アイテムカード「オサフネ」を入手',
  }),
  metaOn: neutralMonster('metaOn', 'メタ〇ン', Rarity.S, 10, 10, {
    effect: { type: 'copyOnSummon' },
    effectDescription: '盤面に存在するモンスターの中から1体を選択し変身する（基礎値のみコピー）',
  }),
  ninja: neutralMonster('ninja', 'Ninja', Rarity.S, 40, 40, {
    traits: ['firstStrike'],
    effect: { type: 'doubleItemEffect' },
    effectDescription: '先制。装備アイテムの効果が2倍になる（マイナス効果も2倍）',
  }),
  freelancer: neutralMonster('freelancer', 'フリーランサー', Rarity.S, 30, 30, {
    effect: { type: 'lapBonusMultiplier', multiplier: 1.3 },
    effectDescription: '配置していると周回ボーナス30%アップ',
  }),
  rainbowChameleon: neutralMonster('rainbowChameleon', 'レインボーカメレオン', Rarity.S, 25, 30, {
    cost: 80,
    effect: { type: 'elementHpBonusIgnoreElement' },
    effectDescription: 'どの属性の土地でも、戦闘中の加算HPは「土地レベル×10」になる',
  }),

  kunekune: neutralMonster('kunekune', 'くねくね', Rarity.R, 10, 0, {
    effect: { type: 'reflectDamage' },
    effectDescription: '相手の攻撃を反射する（自身はノーダメージ、相手がそのままダメージを受ける）',
    imageDataUrl: assetUrl('/images/card-art/kunekune.png'),
  }),
  kyousenshi: neutralMonster('kyousenshi', '狂戦士', Rarity.R, 40, 30, {
    effect: { type: 'atkMultiplier', multiplier: 1.5 },
    effectDescription: '全属性の相手に対してATK1.5倍',
  }),
  sentinel: neutralMonster('sentinel', 'センチネル', Rarity.R, 30, 30, {
    cost: 100,
    commandCost: 150,
    ability: { type: 'damageAndSelfDestruct', power: 30 },
    effectDescription: '土地コマンド（150G）: 相手モンスター1体を選び、基礎HPに30ダメージを与えて自身は消滅する',
  }),
  kontonNoAtama: neutralMonster('kontonNoAtama', '混沌の頭', Rarity.R, 30, 30, {
    cost: 150,
    effect: { type: 'statsPerTotalChain', atkPerChain: 5, hpPerChain: 5 },
    effectDescription: '戦闘中、盤面全体の連鎖数（属性問わず合計）×5だけHP/ATKともに上昇する',
  }),
};
