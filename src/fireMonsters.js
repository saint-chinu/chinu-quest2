import { CardType, Element, Rarity } from './cards.js';

const NORMAL_COST = 50;
const fireMonster = (id, name, rarity, hp, atk, options = {}) => ({
  id,
  type: CardType.MONSTER,
  name,
  element: Element.FIRE,
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

/** 火属性モンスター20種。画像未指定時はcardArt.jsの火属性共通画像を使う。 */
export const FIRE_MONSTER_CATALOG = {
  salarymander: fireMonster('salarymander', 'サラリーマンダー', Rarity.N, 30, 30, {
    effect: { type: 'survivalGold', multiplier: 2 },
    effectDescription: '戦闘で生き残った場合、残りHP×2Gを得る',
  }),
  moeMoeKyun: fireMonster('moeMoeKyun', '燃え燃えきゅん', Rarity.N, 20, 30),
  heavySmoker: fireMonster('heavySmoker', 'ヘビースモーカー', Rarity.N, 40, 30, {
    effect: { type: 'selfDamageAfterAttack', damage: 5 },
    effectDescription: '攻撃終了時、自身が5ダメージを受ける',
  }),
  fireStarter: fireMonster('fireStarter', '火付け役', Rarity.N, 20, 20, { cost: 10 }),
  magman: fireMonster('magman', 'マグマン', Rarity.N, 20, 20, {
    effect: { type: 'chanceDamageReduction', chance: 0.5, multiplier: 0.5 },
    effectDescription: '相手の攻撃を1/2の確率で半減する',
  }),
  fireworksMaster: fireMonster('fireworksMaster', '花火師', Rarity.N, 30, 30, {
    effect: { type: 'deathRetaliation', damage: 10, trigger: 'enemyAttack' },
    effectDescription: '相手の攻撃で死亡した場合、相手に追加10ダメージ',
  }),
  mogumoguVolcano: fireMonster('mogumoguVolcano', 'もぐもぐ風〇火山', Rarity.N, 30, 20, {
    effect: { type: 'randomGoldAfterBattle', min: 10, max: 50, step: 10 },
    effectDescription: '戦闘終了時、ランダムで10〜50Gを得る',
  }),
  ignitionMan: fireMonster('ignitionMan', '着火まん', Rarity.N, 10, 50, {
    effect: { type: 'chanceSelfDestructAfterAttack', chance: 0.5 },
    effectDescription: '自身の攻撃終了時、50%の確率で自身が死亡する',
  }),
  bonfireUncle: fireMonster('bonfireUncle', '焚火おじさん', Rarity.N, 40, 10, { cost: 30 }),
  flameLizard: fireMonster('flameLizard', '炎トカゲ', Rarity.N, 30, 30, { cost: 40 }),

  flameChallenger: fireMonster('flameChallenger', '炎のチャレンジャー', Rarity.S, 30, 40, {
    effect: { type: 'challengeOdds', attackFailureChance: 1 / 3, negateIncomingChance: 1 / 3 },
    effectDescription: '1/3の確率で攻撃失敗。1/3の確率で相手の攻撃を無効化する',
  }),
  kaentake: fireMonster('kaentake', 'カエンタケ', Rarity.S, 30, 30, {
    effect: { type: 'poisonOnHit', baseHpRatio: 0.15, duration: 'untilSwapOrDeath' },
    effectDescription: '攻撃成功時、相手を毒状態にする（戦闘終了後に基礎HPの15%ダメージ。入れ替えか死亡まで継続）',
  }),
  molotovMan: fireMonster('molotovMan', '火炎瓶男', Rarity.S, 20, 40, {
    commandCost: 50,
    ability: { type: 'damage', range: 3, power: 10 },
    effectDescription: '土地コマンド（50G）: 3マス以内の敵モンスターの基礎HPに10ダメージ',
  }),
  flamingYoutuber: fireMonster('flamingYoutuber', '炎上系ユーチュー〇ー', Rarity.S, 20, 50, {
    effect: { type: 'payOnKill', amount: 80 },
    effectDescription: '相手を倒すと、その所有者へ賠償金80Gを支払う',
  }),
  hitodama: fireMonster('hitodama', '人魂', Rarity.S, 30, 30, {
    commandCost: 30,
    ability: { type: 'warpToEmptyElementLand', element: Element.FIRE },
    effectDescription: '土地コマンド（30G）: 任意の火属性の空き地へワープする',
  }),
  fireKick: fireMonster('fireKick', 'ファイアキック', Rarity.S, 30, 40, {
    cost: 80,
    chainRequired: 1,
    effect: { type: 'atkBonusAgainstRarity', targetRarity: Rarity.R, ratio: 0.4 },
    effectDescription: '召喚条件: 火の土地1連鎖以上。相手がRなら基礎ATKが40%上昇する',
  }),

  hezumaDragon: fireMonster('hezumaDragon', 'へ〇ま竜', Rarity.R, 50, 50, {
    effect: { type: 'chanceSelfDamageOnAttack', chance: 0.5, damage: 10 },
    effectDescription: '攻撃時、1/2の確率で自身も10ダメージを受ける',
  }),
  ironChef: fireMonster('ironChef', '料〇の鉄人', Rarity.R, 45, 20, {
    chainRequired: 1,
    commandCost: 150,
    ability: { type: 'healAllOwnedAndCleanse' },
    effectDescription: '召喚条件: 1連鎖以上。土地コマンド（150G）: 自身所有モンスターを全回復し、呪いを除去する',
  }),
  classicDragon: fireMonster('classicDragon', '王道っぽいドラゴン', Rarity.R, 55, 55, {
    cost: 120,
    chainRequired: 1,
    effectDescription: '召喚条件: 1連鎖以上',
  }),
  flameGod: fireMonster('flameGod', '炎神', Rarity.R, 30, 30, {
    cost: 150,
    chainRequired: 2,
    effect: { type: 'statsPerElementChain', element: Element.FIRE, atkPerChain: 7, hpPerChain: 7 },
    effectDescription: '召喚条件: 2連鎖以上。戦闘中、火の土地の連鎖数×7だけHP・ATKが上昇する',
  }),
};
