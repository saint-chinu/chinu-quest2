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
  ...(options.summonSacrifice ? { summonSacrifice: options.summonSacrifice } : {}),
  ...(options.commandCost ? { commandCost: options.commandCost } : {}),
  ...(options.ability ? { ability: options.ability } : {}),
  ...(options.traits ? { traits: options.traits } : {}),
  ...(options.effect ? { effect: options.effect } : {}),
  ...(options.effectDescription ? { effectDescription: options.effectDescription } : {}),
  // wip: 制作中で未公開のカード。パック・デッキ編集・図鑑から外す（cardCatalog.js）。
  ...(options.wip ? { wip: true } : {}),
  ...(options.npcExclusive ? { npcExclusive: true } : {}),
  ...(options.exclusiveOwnerName ? { exclusiveOwnerName: options.exclusiveOwnerName } : {}),
  ...(options.dualUseItem ? {
    dualUseItem: true,
    atkBonus: options.atkBonus || 0,
    hpBonus: options.hpBonus || 0,
  } : {}),
  imageDataUrl: options.imageDataUrl ?? assetUrl(`/images/card-art/${id}.jpg`),
});

export const BATTLE_TRAIN_ID = 'battleTrain';
export const SACRIFICE_CAR_ID = 'sacrificeCar';

/** 戦闘列車と供物車両を互いに装備した時だけ盤面上で生まれる合体形態。 */
export const Q_LINER_FIELD_MONSTER = neutralMonster('qLiner', '超特急・Qライナー', Rarity.EX, 60, 50, {
  cost: 110,
  traits: ['firstStrike', 'pierce'],
  effect: { type: 'fusionForm', tollMultiplier: 1.5 },
  effectDescription: '先制・貫通。このカードが配置された土地の通行料は1.5倍',
  imageDataUrl: assetUrl('/images/card-art/qLiner.png'),
});

export const Q_TRAIN_FIELD_MONSTER = neutralMonster('qTrain', '鉄壁環状・Qトレイン', Rarity.EX, 70, 30, {
  cost: 110,
  effect: { type: 'nonNeutralDamageCut', damage: 30, tollMultiplier: 1.5 },
  effectDescription: '無属性以外のモンスターから受ける攻撃ダメージを30軽減。このカードが配置された土地の通行料は1.5倍',
  imageDataUrl: assetUrl('/images/card-art/qTrain.png'),
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

/** 無属性モンスター一覧。画像未指定時はcardArt.jsの無属性共通画像を使う。 */
export const NEUTRAL_MONSTER_CATALOG = {
  // ■周回成長型の壁（5属性それぞれに1種ずつある新カード型）
  //
  //  ・置き方の制限: 移動コマンドで動かせず(immovableByMoveCommand)、侵略にも
  //    自分の土地の入れ替えにも使えない(emptyTileOnly＝空き地への召喚専用)。
  //    代わりに安く、ATKは低く、HPだけが高い。
  //  ・成長(effect.type: 'lapGrowth'): 置いたあと持ち主が1周するごとに
  //    effect.steps を1段ずつ適用する。1周目・2周目でステータスが伸び、
  //    3周目に属性ごとの特性を「覚醒」して覚える。伸び方も覚える特性も
  //    属性で違うので、一律の計算ではなくカード側の表で持たせている。
  //    成長のたびに盤上で演出が出る（game.js _growLapUnitsOnLap /
  //    main.js promptUnitGrowth）ので、初見でも育つカードだと分かる。
  //  ・覚醒した特性はカード定義ではなく盤上の個体(unit.awakenedTraits)に
  //    持たせる。定義はデッキ・図鑑と共有されうるため。
  //
  //  属性 名前           コスト  素     1周     2周      3周の覚醒
  //  火   溶岩竜          40G  35/30  35/40  40/50   40/60＋絶対先制
  //  水   アイランドホエール 40G  40/25  45/35  55/40   65/40＋1/2無効化（貫通不可）
  //  雷   甲鉄要塞         40G  40/10  50/10  65/20   強制停止（通る相手を必ず止める）
  //  森   巨珍兵          40G  55/10  65/15  75/20   繁栄（味方森ATK/HP+20）
  //  無   積み上がった伝票   35G  40/10  50/10  60/20   ダメージ半減
  //
  // 火・水・雷・森は公開済み（専用絵柄あり）。無属性だけ制作中で、公開時に専用絵柄へ差し替える。
  tsumiageDenpyou: neutralMonster('tsumiageDenpyou', '積み上がった伝票', Rarity.S, 40, 10, {
    cost: 35,
    // 制作中。パック・デッキ編集・図鑑には出さず、CPUのキャラ専用デッキでのみ使う。
    wip: true,
    traits: ['immovableByMoveCommand', 'emptyTileOnly'],
    effect: {
      type: 'lapGrowth',
      steps: [
        { hp: 10 },
        { hp: 10, atk: 10 },
        { trait: 'halfDamage', label: 'ダメージ半減' },
      ],
    },
    effectDescription: '空き地にしか召喚できず、移動・侵略にも使えない。持ち主の周回で成長する（1周目 HP50 → 2周目 HP60/ATK20 → 3周目「ダメージ半減」を覚え、受けるダメージが半分になる）',
    imageDataUrl: assetUrl('/images/card-art/neutral.png'),
  }),
  battleTrain: neutralMonster(BATTLE_TRAIN_ID, '戦闘列車', Rarity.S, 20, 30, {
    cost: 70,
    dualUseItem: true,
    atkBonus: 30,
    hpBonus: 20,
    effectDescription: '装備アイテムとしても使える。供物車両を装備すると合体する。',
    imageDataUrl: assetUrl('/images/card-art/battleTrain.png'),
  }),
  sacrificeCar: neutralMonster(SACRIFICE_CAR_ID, '供物車両', Rarity.S, 40, 10, {
    cost: 60,
    dualUseItem: true,
    atkBonus: 10,
    hpBonus: 40,
    effectDescription: '装備アイテムとしても使える。戦闘列車を装備すると合体する。',
    imageDataUrl: assetUrl('/images/card-art/sacrificeCar.png'),
  }),
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
    effectDescription: '受けるダメージを半減し、半減した分を相手に反射。ほかのギアが2種類配置された状態で召喚すると…',
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
  metaOn: neutralMonster('metaOn', 'めたんまん', Rarity.S, 10, 10, {
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
    effectDescription: '配置していると周回ボーナスの総額（基本＋領地＋お札利回り）が30%アップ',
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
  // 高ATK・低HPの貫通アサシン。守備には向かず、移動侵略で敵高レベル地を
  // 貫通で削り取るためのカード（「彼」の専用AIが移動侵略に活用する）。
  mysteriousInvader: {
    ...neutralMonster('mysteriousInvader', '未知の侵略者', Rarity.R, 10, 60, {
      cost: 30,
      traits: ['pierce'],
      commandCost: 30,
      ability: { type: 'warpToAnyEmptyLand' },
      effectDescription: '貫通。土地コマンド（30G）: 任意の空き地へ移動する',
    }),
    imageDataUrl: assetUrl('images/card-art/mysteriousInvader.png'),
  },
  thirtyBreedMonster: neutralMonster('thirtyBreedMonster', 'サーティーのブリモン', Rarity.R, 40, 40, {
    cost: 80,
    npcExclusive: true,
    exclusiveOwnerName: 'サーティー',
    effectDescription: 'サーティーが連れている専用ブリードモンスター。汎用性の高い無属性アタッカー',
    imageDataUrl: assetUrl('/images/card-art/burimon.png'),
  }),
};
