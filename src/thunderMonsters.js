import { CardType, Element, Rarity } from './cards.js';
import { assetUrl } from './assetUrl.js';

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
  // 周回成長型の壁（5属性共通の型・詳細はneutralMonsters.jsのtsumiageDenpyou参照）。
  // 雷はバランス型。3周目で「強制停止」を覚え、通行料装置に化ける。
  //   素 40/10 → 1周 50/10 → 2周 65/20 → 3周 強制停止
  koutetsuYousai: thunderMonster('koutetsuYousai', '甲鉄要塞', Rarity.S, 40, 10, {
    cost: 40,
    // 制作中。パック・デッキ編集・図鑑には出さず、CPUのキャラ専用デッキでのみ使う。
    wip: true,
    traits: ['immovableByMoveCommand', 'emptyTileOnly'],
    effect: {
      type: 'lapGrowth',
      steps: [
        { hp: 10 },
        { hp: 15, atk: 10 },
        { trait: 'permanentForcedStop', label: '強制停止' },
      ],
    },
    effectDescription: '空き地にしか召喚できず、移動・侵略にも使えない。持ち主の周回で成長する（1周目 HP50 → 2周目 HP65/ATK20 → 3周目「強制停止」を覚え、このマスを通る相手を必ず停止させる）',
    imageDataUrl: assetUrl('/images/card-art/koutetsuYousai.png'),
  }),
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
    commandCost: 80,
    ability: { type: 'cursePlayerHaste', turns: 2 },
    effectDescription: '土地コマンド（80G）: 選んだプレイヤーに高速化の呪いをかける（2ターン継続。サイコロ・スペルフェーズがスキップされ、代わりに6マス固定で移動する）',
    imageDataUrl: assetUrl('/images/card-art/sonicMove.png'),
  }),
  juudenGireRobot: thunderMonster('juudenGireRobot', '充電切れロボ', Rarity.N, 20, 35, {
    cost: 30,
    imageDataUrl: assetUrl('/images/card-art/juudenGireRobot.png'),
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
  // 身代わり性能が強すぎたため、HPを15へ下げたうえで召喚時の生贄（手札から
  // 任意の1枚を捨てる）を条件に追加した。壁として置くのではなく、身代わり
  // 要員に徹させるための下方修正。
  raiheishinZamurai: thunderMonster('raiheishinZamurai', '避雷針侍', Rarity.S, 15, 30, {
    summonSacrifice: 1,
    effectDescription: '召喚条件: 手札から任意の1枚を生贄にする（捨てる）。配置されていると、味方モンスターが相手の攻撃で死ぬ場合、代わりに避雷針侍が身代わりになって死亡する（本来死ぬはずのモンスターはノーダメージ）',
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
  kadenryuuCheetah: thunderMonster('kadenryuuCheetah', '過電流チーター', Rarity.S, 25, 40, {
    cost: 60,
    traits: ['firstStrike'],
    effect: { type: 'selfDamageRatioAfterAttack', ratio: 0.2 },
    effectDescription: '先制。攻撃後、自身の基礎HPの20%ダメージを受ける',
    imageDataUrl: assetUrl('/images/card-art/kadenryuuCheetah.png'),
  }),

  gandamu: thunderMonster('gandamu', 'ロボ戦士', Rarity.R, 30, 55, {
    cost: 120,
    chainRequired: 1,
    effectDescription: '召喚条件: 1連鎖以上',
  }),
  aruKagakuNo: thunderMonster('aruKagakuNo', '超電磁科学者', Rarity.R, 10, 40, {
    traits: ['firstStrike'],
    effect: { type: 'instantKillOnHit', chance: 0.66, targetElement: Element.WATER },
    effectDescription: '先制。攻撃成功時、水属性モンスターを66%の確率で即死させる',
  }),
  tenhou: thunderMonster('tenhou', 'テンホウ', Rarity.R, 30, 30, {
    traits: ['firstStrike'],
    effect: { type: 'stealDamageMultiple', multiplier: 5 },
    effectDescription: '先制。攻撃成功時、与えたダメージ×5Gを相手から奪う',
  }),
  raijin: thunderMonster('raijin', '雷神', Rarity.R, 40, 25, {
    cost: 150,
    chainRequired: 1,
    effect: { type: 'statsPerElementChain', element: Element.THUNDER, atkPerChain: 7, hpPerChain: 7 },
    effectDescription: '召喚条件: 1連鎖以上。戦闘中、雷の土地の連鎖数×7だけHP・ATKが上昇する',
  }),
  rakuraiYohoushi: thunderMonster('rakuraiYohoushi', '落雷予報士', Rarity.R, 35, 40, {
    cost: 90,
    chainRequired: 2,
    effect: { type: 'chanceDestroyItemBeforeAttack', chance: 0.5 },
    effectDescription: '召喚条件: 雷の土地2連鎖以上。戦闘開始時、50%の確率で相手の装備アイテムを無効化する',
    imageDataUrl: assetUrl('/images/card-art/rakuraiYohoushi.png'),
  }),
};
