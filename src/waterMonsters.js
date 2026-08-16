import { CardType, Element, Rarity } from './cards.js';
import { assetUrl } from './assetUrl.js';

const NORMAL_COST = 50;
const waterMonster = (id, name, rarity, hp, atk, options = {}) => ({
  id,
  type: CardType.MONSTER,
  name,
  element: Element.WATER,
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
  ...(options.npcExclusive ? { npcExclusive: true } : {}),
  imageDataUrl: options.imageDataUrl ?? assetUrl(`/images/card-art/${id}.jpg`),
});

/**
 * 水属性モンスター20種。画像未指定時はcardArt.jsの水属性共通画像を使う。
 * `minatoJoshi`（港〇女子）は元々ここではなくbattleCards.jsに直書きされた
 * 仮ステータス（R/ATK15/HP30、battle.js側にハードコードされた耐性+ダメージ
 * 分ゴールドを奪う特性）だったが、正式な水属性モンスター表が届いたので
 * こちらのfireMonster同様のデータ駆動な形に差し替えた（idは
 * STARTER_DECKS.waterThunder.featuredMonsterやstory.jsの複数キャラの
 * テーマから参照されているので維持）。
 */
export const WATER_MONSTER_CATALOG = {
  su: waterMonster('su', '酢', Rarity.EX, 60, 60, {
    cost: 300,
    npcExclusive: true,
    traits: ['pierce', 'twoStepMove'],
    effectDescription: '貫通。土地コマンドの移動で最大2マス移動でき、特殊マス1つを飛び越えられる（特殊マスには着地不可）',
    imageDataUrl: assetUrl('/images/card-art/su.png'),
  }),
  minatoJoshi: waterMonster('minatoJoshi', '港〇女子', Rarity.N, 30, 30, {
    effect: { type: 'stealGoldOnHit', amount: 30 },
    effectDescription: '攻撃成功時、相手の手持ちGから30G消費させる',
    imageDataUrl: assetUrl('/images/card-art/minatojoshi.png'),
  }),
  amoeba: waterMonster('amoeba', 'アメーバ', Rarity.N, 20, 30),
  ohijineRakko: waterMonster('ohijineRakko', 'おひ〇ねラッコ', Rarity.N, 40, 10, {
    effect: { type: 'selfHealAfterBattle', healAmount: 10, cost: 30 },
    effectDescription: '戦闘終了時に基礎HP10回復し30G消費する',
  }),
  suikenKurage: waterMonster('suikenKurage', '泥酔クラゲ', Rarity.N, 20, 20, { cost: 10 }),
  hangyojin: waterMonster('hangyojin', '半魚人', Rarity.N, 30, 30, {
    traits: ['firstStrike'],
    effectDescription: '先制',
  }),
  penpen: waterMonster('penpen', 'ペンペン', Rarity.N, 40, 25),
  shinkaigyoX: waterMonster('shinkaigyoX', '深海魚X', Rarity.N, 30, 20, {
    commandCost: 80,
    ability: { type: 'curseTransparency' },
    effectDescription: '土地コマンド（80G）: 透過の呪いを自身にかける（侵略不能な代わりに通行料ゼロ）',
  }),
  redEi: waterMonster('redEi', 'レッドエイ', Rarity.N, 10, 40),
  hiyashiChuka: waterMonster('hiyashiChuka', '冷やし中華？', Rarity.N, 40, 10, { cost: 30 }),
  manbo: waterMonster('manbo', 'まんぼー', Rarity.N, 30, 10, {
    cost: 40,
    traits: ['halfDamage'],
    effectDescription: '被ダメージ半減',
  }),
  baketsuRelayTai: waterMonster('baketsuRelayTai', 'バケツリレー隊', Rarity.N, 35, 15, {
    cost: 30,
    imageDataUrl: assetUrl('/images/card-art/baketsuRelayTai.png'),
  }),

  kaizokuS: waterMonster('kaizokuS', '海賊S', Rarity.S, 30, 30, {
    cost: 100,
    effect: { type: 'destroyItemBeforeAttack' },
    effectDescription: '召喚コスト100G。攻撃開始前に相手のアイテムを破壊する',
    imageDataUrl: assetUrl('/images/card-art/kaizokuS.webp'),
  }),
  aoriika: waterMonster('aoriika', 'アオリイカ', Rarity.S, 40, 30, {
    traits: ['lastStrike'],
    effect: { type: 'blindOnHit' },
    effectDescription: '後攻。攻撃成功時、相手を目くらまし状態にする（次の攻撃を1回スキップさせる）',
  }),
  tsurara: waterMonster('tsurara', '氷柱', Rarity.S, 60, 10, {
    effect: { type: 'selfDamageAfterBattle', damage: 10 },
    effectDescription: '戦闘終了時にHPマイナス10',
  }),
  fireman: waterMonster('fireman', 'ファイヤーマン', Rarity.S, 30, 20, {
    traits: ['firstStrike'],
    effect: { type: 'elementDamageBonus', targetElement: Element.FIRE, multiplier: 2 },
    effectDescription: '先制。火属性モンスターに2倍ダメージ（アイテム効果も対象）',
  }),
  azarashisan: waterMonster('azarashisan', 'あざらしさん', Rarity.S, 30, 30, {
    commandCost: 30,
    ability: { type: 'drawCard' },
    effectDescription: '土地コマンド（30G）: 選んだ種類のカードをランダムに1枚引ける',
  }),
  mizuburoShugyoso: waterMonster('mizuburoShugyoso', '水風呂修行僧', Rarity.S, 30, 40, {
    cost: 80,
    chainRequired: 1,
    effect: { type: 'atkBonusAgainstRarity', targetRarity: Rarity.R, ratio: 0.4 },
    effectDescription: '召喚条件: 水の土地1連鎖以上。相手がRなら基礎ATKが40%上昇する',
  }),
  shinkaiCleaner: waterMonster('shinkaiCleaner', '深海のクリーナー', Rarity.S, 30, 30, {
    cost: 60,
    effect: { type: 'cleanseSelfAtBattleStart' },
    effectDescription: '戦闘開始時、自身にかかっている呪いをすべて解除する',
    imageDataUrl: assetUrl('/images/card-art/shinkaiCleaner.png'),
  }),

  arashiwoyobuOnna: waterMonster('arashiwoyobuOnna', '嵐を呼ぶ〇女', Rarity.R, 50, 50, {
    cost: 100,
    effect: { type: 'chanceSelfDamageOnAttack', chance: 0.5, damage: 10 },
    effectDescription: '攻撃時、1/2の確率で自身にも10ダメージ',
  }),
  uminoieTencho: waterMonster('uminoieTencho', '海の家店長', Rarity.R, 45, 20, {
    chainRequired: 1,
    commandCost: 150,
    ability: { type: 'healAllOwnedAndCleanse' },
    effectDescription: '召喚条件: 1連鎖以上。土地コマンド（150G）: 自身所有モンスターを全回復し、呪いを除去する',
  }),
  bigMermaid: waterMonster('bigMermaid', 'ビッグマーメイド', Rarity.R, 55, 55, {
    cost: 120,
    chainRequired: 1,
    effectDescription: '召喚条件: 1連鎖以上',
  }),
  suijin: waterMonster('suijin', '水神', Rarity.R, 30, 30, {
    cost: 150,
    chainRequired: 2,
    effect: { type: 'statsPerElementChain', element: Element.WATER, atkPerChain: 7, hpPerChain: 7 },
    effectDescription: '召喚条件: 2連鎖以上。戦闘中、水の土地の連鎖数×7だけHP・ATKが上昇する',
  }),
  kaikyouSekishoKurage: waterMonster('kaikyouSekishoKurage', '海峡の関所クラゲ', Rarity.R, 30, 30, {
    cost: 80,
    chainRequired: 1,
    traits: ['permanentForcedStop'],
    effectDescription: '召喚条件: 水の土地1連鎖以上。敵はこの土地で必ず停止する',
    imageDataUrl: assetUrl('/images/card-art/kaikyouSekishoKurage.png'),
  }),
};
