import { CardType, Element, Rarity } from './cards.js';
import { assetUrl } from './assetUrl.js';

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
  ...(options.summonSacrifice ? { summonSacrifice: options.summonSacrifice } : {}),
  ...(options.commandCost ? { commandCost: options.commandCost } : {}),
  ...(options.ability ? { ability: options.ability } : {}),
  ...(options.traits ? { traits: options.traits } : {}),
  ...(options.effect ? { effect: options.effect } : {}),
  ...(options.effectDescription ? { effectDescription: options.effectDescription } : {}),
  // wip: 制作中で未公開のカード。パック・デッキ編集・図鑑から外す（cardCatalog.js）。
  ...(options.wip ? { wip: true } : {}),
  imageDataUrl: options.imageDataUrl ?? assetUrl(`/images/card-art/${id}.jpg`),
});

/** 火属性モンスター20種。画像未指定時はcardArt.jsの火属性共通画像を使う（renderCardElがcard.imageDataUrlを優先するので、指定した分だけ自然に上書きされる）。 */
export const FIRE_MONSTER_CATALOG = {
  // 周回成長型の壁。火は攻撃寄りで、ATKが一番よく伸びる。
  // 3周目で「不死鳥」を覚え、致死ダメージを一度だけHP1で耐える。
  //   素 30/15 → 1周 40/20 → 2周 50/35 → 3周 不死鳥
  youkouro: fireMonster('youkouro', '溶鉱炉', Rarity.S, 30, 15, {
    cost: 40,
    // 制作中。パック・デッキ編集・図鑑には出さず、CPUのキャラ専用デッキでのみ使う。
    wip: true,
    traits: ['immovableByMoveCommand', 'emptyTileOnly'],
    effect: {
      type: 'lapGrowth',
      steps: [
        { hp: 10, atk: 5 },
        { hp: 10, atk: 15 },
        { trait: 'phoenix', label: '不死鳥' },
      ],
    },
    effectDescription: '空き地にしか召喚できず、移動・侵略にも使えない。持ち主の周回で成長する（1周目 HP40/ATK20 → 2周目 HP50/ATK35 → 3周目「不死鳥」を覚え、致死ダメージを一度だけHP1で耐える）',
    imageDataUrl: assetUrl('/images/card-art/fire.png'),
  }),
  salarymander: fireMonster('salarymander', 'サラリーマンダー', Rarity.N, 30, 30, {
    effect: { type: 'survivalGold', multiplier: 2 },
    effectDescription: '戦闘で生き残った場合、残りHP×2Gを得る',
    imageDataUrl: assetUrl('/images/card-art/salarymander.webp'),
  }),
  moeMoeKyun: fireMonster('moeMoeKyun', '燃え燃えきゅん', Rarity.N, 40, 30, {
    cost: 45,
    imageDataUrl: assetUrl('/images/card-art/moeMoeKyun.jpg'),
  }),
  heavySmoker: fireMonster('heavySmoker', 'ヘビースモーカー', Rarity.N, 40, 30, {
    effect: { type: 'selfDamageAfterAttack', damage: 5 },
    effectDescription: '攻撃終了時、自身が5ダメージを受ける',
    imageDataUrl: assetUrl('/images/card-art/heavySmoker.jpg'),
  }),
  fireStarter: fireMonster('fireStarter', '火付け役', Rarity.N, 20, 20, {
    cost: 10,
    traits: ['firstStrike'],
    effectDescription: '先制',
    imageDataUrl: assetUrl('/images/card-art/fireStarter.jpg'),
  }),
  magman: fireMonster('magman', 'マグマン', Rarity.N, 20, 20, {
    effect: { type: 'chanceDamageReduction', chance: 0.5, multiplier: 0.5 },
    effectDescription: '相手の攻撃を1/2の確率で半減する',
    imageDataUrl: assetUrl('/images/card-art/magman.jpg'),
  }),
  fireworksMaster: fireMonster('fireworksMaster', '花火師', Rarity.N, 30, 30, {
    effect: { type: 'deathRetaliation', damage: 10, trigger: 'enemyAttack' },
    effectDescription: '相手の攻撃で死亡した場合、相手に追加10ダメージ',
    imageDataUrl: assetUrl('/images/card-art/fireworksMaster.jpg'),
  }),
  mogumoguVolcano: fireMonster('mogumoguVolcano', 'もぐもぐ風〇火山', Rarity.N, 30, 20, {
    effect: { type: 'randomGoldAfterBattle', min: 10, max: 50, step: 10 },
    effectDescription: '戦闘終了時、ランダムで10〜50Gを得る',
    imageDataUrl: assetUrl('/images/card-art/mogumoguVolcano.jpg'),
  }),
  ignitionMan: fireMonster('ignitionMan', '着火まん', Rarity.N, 10, 50, {
    effect: { type: 'chanceSelfDestructAfterAttack', chance: 0.5 },
    effectDescription: '自身の攻撃終了時、50%の確率で自身が死亡する',
    imageDataUrl: assetUrl('/images/card-art/ignitionMan.jpg'),
  }),
  bonfireUncle: fireMonster('bonfireUncle', '焚火おじさん', Rarity.N, 40, 10, { cost: 30, imageDataUrl: assetUrl('/images/card-art/bonfireUncle.jpg') }),
  flameLizard: fireMonster('flameLizard', '炎トカゲ', Rarity.N, 30, 30, { cost: 40, imageDataUrl: assetUrl('/images/card-art/flameLizard.jpg') }),
  yakiTomorokoshiHei: fireMonster('yakiTomorokoshiHei', '焼きとうもろこし兵', Rarity.N, 30, 20, {
    cost: 30,
    imageDataUrl: assetUrl('/images/card-art/yakiTomorokoshiHei.png'),
  }),

  flameChallenger: fireMonster('flameChallenger', '炎のバクチ打ち', Rarity.S, 30, 40, {
    traits: ['firstStrike'],
    effect: { type: 'challengeOdds', attackFailureChance: 1 / 3, negateIncomingChance: 1 / 3 },
    effectDescription: '先制。1/3の確率で攻撃失敗。1/3の確率で相手の攻撃を無効化する',
    imageDataUrl: assetUrl('/images/card-art/flameChallenger.jpg'),
  }),
  kaentake: fireMonster('kaentake', 'カエンタケ', Rarity.S, 30, 30, {
    effect: { type: 'poisonOnHit', baseHpRatio: 0.15, duration: 'untilSwapOrDeath' },
    effectDescription: '攻撃成功時、相手を毒状態にする（戦闘終了後に基礎HPの15%ダメージ。入れ替えか死亡まで継続）',
    imageDataUrl: assetUrl('/images/card-art/kaentake.jpg'),
  }),
  molotovMan: fireMonster('molotovMan', '火炎瓶男', Rarity.S, 20, 40, {
    commandCost: 50,
    ability: { type: 'damage', range: 3, power: 10 },
    effectDescription: '土地コマンド（50G）: 3マス以内の敵モンスターの基礎HPに10ダメージ',
    imageDataUrl: assetUrl('/images/card-art/molotovMan.jpg'),
  }),
  flamingYoutuber: fireMonster('flamingYoutuber', '炎上系ユーチュー〇ー', Rarity.S, 20, 50, {
    effect: { type: 'payOnKill', amount: 80 },
    effectDescription: '相手を倒すと、その所有者へ賠償金80Gを支払う',
    imageDataUrl: assetUrl('/images/card-art/flamingYoutuber.jpg'),
  }),
  hitodama: fireMonster('hitodama', '人魂', Rarity.S, 30, 30, {
    commandCost: 30,
    ability: { type: 'warpToEmptyElementLand', element: Element.FIRE },
    effectDescription: '土地コマンド（30G）: 任意の火属性の空き地へワープする',
    imageDataUrl: assetUrl('/images/card-art/hitodama.jpg'),
  }),
  fireKick: fireMonster('fireKick', 'ファイアキック', Rarity.S, 30, 40, {
    cost: 80,
    chainRequired: 1,
    effect: { type: 'atkBonusAgainstRarity', targetRarity: Rarity.R, ratio: 0.4 },
    effectDescription: '召喚条件: 火の土地1連鎖以上。相手がRなら基礎ATKが40%上昇する',
    imageDataUrl: assetUrl('/images/card-art/fireKick.jpg'),
  }),
  rengokuMonbanhei: fireMonster('rengokuMonbanhei', '煉獄の門番兵', Rarity.S, 25, 40, {
    cost: 60,
    traits: ['firstStrike'],
    effectDescription: '先制',
    imageDataUrl: assetUrl('/images/card-art/rengokuMonbanhei.png'),
  }),

  hezumaDragon: fireMonster('hezumaDragon', 'ヘチマ竜', Rarity.R, 50, 50, {
    effect: { type: 'chanceSelfDamageOnAttack', chance: 0.5, damage: 10 },
    effectDescription: '攻撃時、1/2の確率で自身も10ダメージを受ける',
    imageDataUrl: assetUrl('/images/card-art/hezumaDragon.jpg'),
  }),
  ironChef: fireMonster('ironChef', '鉄火の料理人', Rarity.R, 45, 20, {
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
  flameGod: fireMonster('flameGod', '炎神', Rarity.R, 40, 25, {
    cost: 150,
    chainRequired: 1,
    effect: { type: 'statsPerElementChain', element: Element.FIRE, atkPerChain: 7, hpPerChain: 7 },
    effectDescription: '召喚条件: 1連鎖以上。戦闘中、火の土地の連鎖数×7だけHP・ATKが上昇する',
  }),
  kakouFudoumyouou: fireMonster('kakouFudoumyouou', '火口の不動明王', Rarity.R, 35, 20, {
    cost: 90,
    chainRequired: 2,
    traits: ['immovableByMoveCommand', 'permanentForcedStop'],
    effectDescription: '召喚条件: 火の土地2連鎖以上。通常の移動不可。敵はこの土地で必ず停止する',
    imageDataUrl: assetUrl('/images/card-art/kakouFudoumyouou.png'),
  }),
};
