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
  // 明示したnullは「専用絵なし・共通アイテム絵へフォールバック」の指定。
  // nullish coalescingだとnullまで存在しないJPGへ置換されるため、キーの有無で判定する。
  imageDataUrl: Object.prototype.hasOwnProperty.call(options, 'imageDataUrl')
    ? options.imageDataUrl
    : assetUrl(`/images/card-art/${id}.jpg`),
});

/**
 * アイテム39種（N13/S12/R13/EX1）。「オサフネ」は刀鍛冶（無属性モンスター）の
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
  // 画像は「スーツケースに収まった背広」＝持ち運べるスーツへ刷新済み。表示名も
  // それに合わせる（idと画像ファイル名は保存デッキ互換のため据え置き）。
  mobileSuit: item('mobileSuit', '出張スーツ', Rarity.N, ItemType.ARMOR, 40, 10, 30),
  nyoBou: item('nyoBou', 'にょ〇棒', Rarity.N, ItemType.WEAPON, 30, 10, 10, {
    traits: ['pierce'],
    effectDescription: '貫通（HPの土地レベルボーナス・ダメージ無効化・反射を無視するが、アイテムのHP増加は無視できない）',
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
    effectDescription: '受けるダメージを半減し、半減した分を相手に反射する',
  }),
  morohaNoTsurugi: item('morohaNoTsurugi', '諸刃の剣', Rarity.S, ItemType.WEAPON, 60, 40, -20),
  stegoro: item('stegoro', 'ステゴロ', Rarity.S, ItemType.WEAPON, 50, 0, 0, {
    effect: { type: 'destroyItemBeforeAttack' },
    effectDescription: '攻撃開始前に相手のアイテムを破壊する',
  }),
  ikasamaNoSaikoro: item('ikasamaNoSaikoro', 'イカサマのサイコロ', Rarity.S, ItemType.WEAPON, 40, 0, 0, {
    traits: ['pierce'],
    effect: { type: 'atkFromLastDiceRoll', multiplier: 5 },
    effectDescription: 'ATK+前回移動したサイコロの目×5。貫通（HPの土地レベルボーナス・ダメージ無効化・反射を無視するが、アイテムのHP増加は無視できない）',
  }),
  twinHammer: item('twinHammer', 'ツインハンマー', Rarity.S, ItemType.WEAPON, 65, 10, 0, {
    effect: { type: 'doubleStrike' },
    effectDescription: '2回攻撃する',
  }),
  lifeJacket: item('lifeJacket', 'ライフジャケット', Rarity.S, ItemType.ARMOR, 35, 0, 0, {
    effect: { type: 'surviveLethalDamage' },
    effectDescription: '一撃で受ける致死ダメージをHP1で耐える（1戦闘1回のみ）。ツインハンマーの2発目や毒のダメージは普通に受けるので、そのまま倒されることがある',
  }),
  // 通常の殴り合いを丸ごと置き換えるアイテム。ステータス・先制・防御効果が
  // 一切効かないので、格上の土地へ格安モンスターで挑む博打として使う。
  russianRoulette: item('russianRoulette', 'ロシアンルーレット', Rarity.S, ItemType.WEAPON, 50, 0, 0, {
    effect: { type: 'russianRoulette' },
    effectDescription: '通常の戦闘を行わず、攻撃側から順にサイコロを振って出目の大きい方が勝つ。負けた側は即死し、同じ出目なら両者死亡（土地は無人になり通行料も発生しない）。ATK/HP・先制・ライフジャケット等の効果はすべて無効',
  }),
  // 後攻は「守備側が装備しても普段どおり相手が先に殴る」＝実質デメリット
  // なしなので、防衛用としては破格のHP+60になる。侵略に持ち出すと相手に
  // 先攻を譲るぶん本当に不利になる、という使い分けのアイテム。
  diamondShield: item('diamondShield', 'ダイヤモンドの盾', Rarity.S, ItemType.ARMOR, 55, -20, 60, {
    traits: ['lastStrike'],
    effectDescription: '後攻。HP+60、ATK-20',
  }),
  // ATK/HPの実数値（素のステータス・アイテムのatkBonus/hpBonus）はそのまま、
  // 特殊能力だけを丸ごと交換する。詳細な実装はbattle.jsの
  // applyDimensionalSocketSwap参照。
  dimensionalSocket: {
    ...item('dimensionalSocket', '異次元ソケット', Rarity.S, ItemType.ARMOR, 60, 0, 0, {
      effect: { type: 'swapSpecialAbilities' },
      effectDescription: '戦闘中、自分と相手の特殊能力を入れ替える（先制・後攻・貫通・無効化・反射・強盗・周回覚醒・連鎖ボーナス加算等。装備アイテムの効果も対象）。ATK/HPの実数値そのものは入れ替わらない',
    }),
    imageDataUrl: null,
  },

  kaenHoushakiki: item('kaenHoushakiki', '火炎放射器', Rarity.R, ItemType.WEAPON, 80, 20, 0, {
    effect: { type: 'wielderElementAtkBonus', wielderElement: Element.FIRE, atkBonus: 30 },
    effectDescription: '火属性モンスターが使用するとATKがさらに30上昇',
  }),
  raijinKen: item('raijinKen', '雷神剣', Rarity.R, ItemType.WEAPON, 80, 20, 0, {
    effect: { type: 'wielderElementAtkBonus', wielderElement: Element.THUNDER, atkBonus: 30 },
    effectDescription: '雷属性モンスターが使用するとATKがさらに30上昇',
  }),
  gomuGoNoPistol: item('gomuGoNoPistol', '人食い草', Rarity.R, ItemType.WEAPON, 80, 20, 0, {
    effect: { type: 'wielderElementAtkBonus', wielderElement: Element.FOREST, atkBonus: 30 },
    effectDescription: '森属性モンスターが使用するとATKがさらに30上昇',
  }),
  iceSlugger: item('iceSlugger', '薄氷の剣', Rarity.R, ItemType.WEAPON, 80, 20, 0, {
    effect: { type: 'wielderElementAtkBonus', wielderElement: Element.WATER, atkBonus: 30 },
    effectDescription: '水属性モンスターが使用するとATKがさらに30上昇',
  }),

  // 属性神の盾4種。上のATK特化武器と対になる防具で、一致した属性の
  // モンスターが装備すると受けるダメージを丸ごと反射する
  // （battle.jsのdealDamageが被弾時点の装備者属性を毎回判定する）。一致しない
  // 場合もATK+10/HP+20・貫通は属性を問わず乗る（2026-08、コストが高すぎる
  // というユーザー指摘でコストを下げステータス・貫通を追加）。
  // ⚠️ この反射は**相手の貫通では無効化されない「絶対反射」**（ユーザー指定、
  // 2026-08）。battle.jsのdealDamageが盾効果だけをunpierceableとして扱い、
  // 貫通を無視して反射する。くねくね自身の反射は従来どおり貫通で抜けるので、
  // 両者を混同しないこと。
  suijinNoTate: item('suijinNoTate', '水神の盾', Rarity.R, ItemType.ARMOR, 80, 10, 20, {
    traits: ['pierce'],
    effect: { type: 'wielderElementReflect', wielderElement: Element.WATER },
    effectDescription: '貫通（HPの土地レベルボーナス・ダメージ無効化・反射を無視するが、アイテムのHP増加は無視できない）。水属性モンスターが装備すると、受けるダメージを反射する（この反射は相手の貫通では無効化されない）',
    imageDataUrl: null,
  }),
  kajinNoTate: item('kajinNoTate', '火神の盾', Rarity.R, ItemType.ARMOR, 80, 10, 20, {
    traits: ['pierce'],
    effect: { type: 'wielderElementReflect', wielderElement: Element.FIRE },
    effectDescription: '貫通（HPの土地レベルボーナス・ダメージ無効化・反射を無視するが、アイテムのHP増加は無視できない）。火属性モンスターが装備すると、受けるダメージを反射する（この反射は相手の貫通では無効化されない）',
    imageDataUrl: null,
  }),
  raijinNoTate: item('raijinNoTate', '雷神の盾', Rarity.R, ItemType.ARMOR, 80, 10, 20, {
    traits: ['pierce'],
    effect: { type: 'wielderElementReflect', wielderElement: Element.THUNDER },
    effectDescription: '貫通（HPの土地レベルボーナス・ダメージ無効化・反射を無視するが、アイテムのHP増加は無視できない）。雷属性モンスターが装備すると、受けるダメージを反射する（この反射は相手の貫通では無効化されない）',
    imageDataUrl: null,
  }),
  shinrinjinNoTate: item('shinrinjinNoTate', '森神の盾', Rarity.R, ItemType.ARMOR, 80, 10, 20, {
    traits: ['pierce'],
    effect: { type: 'wielderElementReflect', wielderElement: Element.FOREST },
    effectDescription: '貫通（HPの土地レベルボーナス・ダメージ無効化・反射を無視するが、アイテムのHP増加は無視できない）。森属性モンスターが装備すると、受けるダメージを反射する（この反射は相手の貫通では無効化されない）',
    imageDataUrl: null,
  }),

  fushichoNoTate: item('fushichoNoTate', '不死鳥の盾', Rarity.R, ItemType.ARMOR, 90, 10, 20, {
    returnsToHandIfUsed: true,
    effectDescription: '戦闘終了後に手札へ戻る。HP+20、ATK+10',
    imageDataUrl: assetUrl('/images/card-art/fushichoNoTate.png'),
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
  // 「負けない」ではなく「死なない」アイテム。侵略は止まるが土地は取られず、
  // 代金は受けるはずだったダメージに比例するので、大ダメージほど高くつく。
  satsutabaGuard: item('satsutabaGuard', '札束ガード', Rarity.R, ItemType.ARMOR, 60, 0, 0, {
    effect: { type: 'payDamageToEndBattle', multiplier: 3 },
    effectDescription: '本来受けるダメージ×3Gを相手に払い、ノーダメージのまま戦闘を終了させる（通行料は通常どおり発生）。真剣白刃取りで奪われた場合は、逆に奪った相手が同じ計算で支払う',
  }),
  zangokuKen: item('zangokuKen', '斬〇剣', Rarity.R, ItemType.WEAPON, 130, 30, -20, {
    traits: ['pierce'],
    effect: { type: 'instantKillOnHit', chance: 0.5 },
    effectDescription: '装備中HP-20。貫通（HPの土地レベルボーナス・ダメージ無効化・反射を無視するが、アイテムのHP増加は無視できない）。攻撃成功時50%で相手を即死させる',
  }),

  // ストーリー③クリア報酬（紫の魔女ホフクからのお礼）。story.jsのSTORY_STAGES[2].rewardから参照。
  peeStaff: {
    ...item('peeStaff', 'ペーの杖', Rarity.EX, ItemType.WEAPON, 20, 25, 10, {
      traits: ['firstStrike'],
      atkBonusRange: [25, 50],
      effectDescription: '先制。ATKボーナスは装備するたびに25〜50でランダムに決まる',
      imageDataUrl: assetUrl('/images/card-art/penotue.png'),
    }),
    rewardOnly: true,
  },
};

/**
 * ストーリー報酬・NPC専用として配るカードか。盤面のショップマスの品揃えから
 * 除外するために使う（図鑑・デッキ編集からは今まで通り見える／使える）。
 * これが無いと、③の報酬であるペーの杖(EX武器が20G)や、⑨⑩の報酬スペルが
 * ショップに普通に並んでしまう。
 */
export function isRewardOnlyCard(card) {
  return !!card?.rewardOnly;
}

const spell = (id, name, rarity, cost, target, effect, effectDescription) => ({
  id,
  type: CardType.SPELL,
  name,
  rarity,
  cost,
  target,
  effect,
  effectDescription,
  imageDataUrl: assetUrl(`/images/card-art/${id}.jpg`),
});

/**
 * スペル一覧。`target`はgame.jsの_resolveSpellCastが対象選択のUIフローを
 * 出し分けるための種別で、`effect.type`が実際の効果本体（game.jsの
 * _applySpellEffectがディスパッチする）。
 * - 'enemyMonster'/'anyMonster'/'ownMonster': モンスター1体（onPickAbilityTarget流用）
 * - 'enemyPlayer'/'anyPlayer': プレイヤー1人（同上、{id,label}形式）
 * - 'anyTile'/'ownTile': 土地1マス（同上、tileSummary形式）
 * - 'twoOwnMonsters': 自分のモンスター2体
 * - 'cardTypeChoice': モンスター・アイテム・スペルから、山札より引く種類を選ぶ
 * - 'self'/'none': 対象選択なし（'self'は発動者自身への適用、'none'は盤面全体等）
 */
export const SPELL_CATALOG = {
  divination: {
    ...spell(
      'divination',
      '占術',
      Rarity.N,
      40,
      'cardTypeChoice',
      { type: 'drawRandomCardOfChosenType' },
      'モンスター・アイテム・スペルから1種類を選び、デッキ内の該当カードをランダムに1枚手札へ加える',
    ),
    imageDataUrl: assetUrl('/images/card-art/divination.png'),
  },
  disclosureRequest: {
    ...spell(
      'disclosureRequest',
      '開示請求',
      Rarity.EX,
      150,
      'enemyPlayerDisclosureCard',
      { type: 'disclosureRequest' },
      '相手の手札からモンスターかスペルを1枚選ぶ。モンスターは自分の空き地へ召喚し、スペルは自分の詠唱として即時使用する。追加コストは使用者が負担。相手は1枚引き100Gを得る',
    ),
    imageDataUrl: null,
    rewardOnly: true,
  },
  toughness: {
    ...spell(
      'toughness',
      'タフネス',
      Rarity.EX,
      150,
      'selfOrAllyPlayer',
      { type: 'summonBaseHpBoostCurse', turns: 3, hpBonus: 10 },
      '自身か味方への呪い。3ターンの間、空き地へ召喚するモンスターの基礎HPが10上昇する（侵略には適用されない）',
    ),
    imageDataUrl: assetUrl('/images/card-art/toughness.png'),
    rewardOnly: true,
  },
  kokushiMusou: {
    ...spell(
      'kokushiMusou',
      '国士無双！！',
      Rarity.EX,
      120,
      'anyMonster',
      { type: 'chainStatCurse', perChain: 4 },
      '選んだ盤面上のモンスターに、所有者の同属性連鎖数×4だけHP/ATKが上昇する呪いをかける',
    ),
    imageDataUrl: assetUrl('/images/card-art/kokushiMusou.png'),
  },
  forcedAscension: {
    ...spell(
      'forcedAscension',
      '強制成仏',
      Rarity.EX,
      70,
      'ownTile',
      { type: 'cashOutOwnLand', multiplier: 1.2 },
      '自分の所有する土地を、地価の120%で強制換金する。配置モンスターは消滅し、土地は空き地Lv1に戻る',
    ),
    imageDataUrl: assetUrl('/images/card-art/forcedAscension.png'),
    rewardOnly: true,
  },
  capitalismIncarnate: {
    ...spell(
      'capitalismIncarnate',
      '資本主義の権化',
      Rarity.EX,
      30,
      'none',
      { type: 'capitalismIncarnate' },
      '自分の手札にあるモンスターを、手持ちGが尽きるまでランダムな空き地へ次々と召喚する。召喚条件と生け贄は無視し、コストの安い順に召喚する',
    ),
    imageDataUrl: assetUrl('/images/card-art/capitalismIncarnate.png'),
    rewardOnly: true,
  },
  ashToDust: {
    ...spell(
      'ashToDust',
      '灰塵',
      Rarity.EX,
      100,
      'self',
      { type: 'cashOutAllNeutralMonsterLands', multiplier: 2 },
      '自分の無属性モンスターが配置された土地をすべて手放し、地価の200%で換金する。配置モンスターは消滅し、土地は空き地Lv1に戻る',
    ),
    imageDataUrl: assetUrl('/images/card-art/ashToDust.jpg'),
    // ⑭の塞ぎ込んだ男専用。rewardOnlyを付けないと盤面のショップマス
    // （①と⑩にある）の品揃えへ100Gで並んでしまう。1回で地価の200%を
    // 何マスぶんも一括換金するカードなので、ペーの杖と同じ「実質バグ価格」
    // になる（_resolveShopTileはcard.costをそのまま請求する）。
    rewardOnly: true,
  },
  landlessOne: {
    ...spell(
      'landlessOne',
      '持たざる者',
      Rarity.S,
      0,
      'selfOrAllyPlayer',
      { type: 'landlessGoalBonusCurse', amount: 500 },
      '対象プレイヤーが土地を1つも持たずにゴールした時、ボーナスとして500Gを得るプレイヤー呪い。条件を満たすまで残る',
    ),
    imageDataUrl: assetUrl('/images/card-art/landlessOne.jpg'),
  },
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
    'anyPlayer',
    { type: 'returnPlayerToStart', reward: 250 },
    '選んだプレイヤーをゴールに戻し、そのプレイヤーは250Gを得る。全CP通過済みなら周回ボーナスも得る。このターンは他の行動不可',
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
  // 自分に撃てば「手札1枚を200Gに換金」、相手に撃てば「200Gを渡す代わりに
  // 強力な手札を1枚潰す」の二面性を持つスペル。手札が空のプレイヤーは対象外。
  manaExtraction: {
    ...spell(
      'manaExtraction',
      '魔力抽出',
      Rarity.S,
      100,
      'anyPlayerHandCard',
      { type: 'extractManaFromHandCard', reward: 200 },
      '自分を含む全プレイヤーから手札のあるプレイヤー1人を選び、その手札を見て1枚捨てさせる。捨てさせた代わりに、そのプレイヤーは200Gを得る',
    ),
    imageDataUrl: assetUrl('images/card-art/manaExtraction.png'),
  },

  // ── 攻撃系 ──
  senbonZakura: spell('senbonZakura', '千本桜', Rarity.R, 100, 'enemyMonster', { type: 'directDamage', amount: 30 }, '対象モンスターに30ダメージ'),
  fireball: spell('fireball', 'ファイヤーボール', Rarity.N, 40, 'enemyMonster', { type: 'directDamage', amount: 15 }, '相手モンスター1体に15ダメージ'),
  smallMeteor: spell('smallMeteor', '小隕石', Rarity.N, 50, 'none', { type: 'damageAllUnits', amount: 10 }, '場の全モンスターに10ダメージ（自分のモンスターも対象）'),
  // 土地神の怒り: 自分の土地属性と噛み合っていないモンスターだけを罰する
  // 全体スペル。小隕石(damageAllUnits)と同じ仕組みで、対象の絞り込みだけを
  // 「モンスターの属性 ≠ 立っている土地の属性」に変えている。無属性の
  // モンスターは無属性の土地以外では常に該当する点に注意（自分の
  // モンスターも巻き込む）。
  // ⚠️ ダメージは15から上げてはいけない。ゾンビがちょうどHP20なので、20だと
  // 「パンデミックで全モンスターをゾンビ(無属性)に変える → 無属性マスの無い
  // 盤面では全員が対象 → 20ダメージで盤面が丸ごと全滅」という即死コンボが
  // 成立してしまう（2026-08、ユーザー指摘で20→15へ引き下げ）。
  tochigamiNoIkari: {
    ...spell('tochigamiNoIkari', '土地神の怒り', Rarity.R, 60, 'none', { type: 'damageAllUnitsOnMismatchedLand', amount: 15 }, '自分の属性と異なる属性の土地にいる全モンスターに15ダメージ（自分のモンスターも対象）'),
    // 専用画像がまだ無い間は、存在しないJPGを読みに行かず共通スペル絵を使う。
    imageDataUrl: null,
  },

  // 社会不適合: 「土地に馴染めていない」モンスターを盤面から追い出す。
  // 土地神の怒り(ダメージ)と同じ「属性が噛み合っていない」判定を、
  // 除去ではなく手札バウンスに使う対の1枚。対象はランダム2体までで、
  // 1体しかいなければ1体だけ、0体なら何も起きずコストだけ損する。
  shakaiFutekigou: {
    ...spell('shakaiFutekigou', '社会不適合', Rarity.R, 70, 'enemyPlayer', { type: 'returnMismatchedMonstersToHand', count: 2 }, '対象プレイヤーの配置モンスターのうち、立っている土地と属性が合わないものをランダムに2体まで手札に戻す（該当が1体なら1体、0体なら何も起きない）'),
    // 専用画像がまだ無い間は、存在しないJPGを読みに行かず共通スペル絵を使う。
    imageDataUrl: null,
  },
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
  // 呪い（マ〇ジャロ等）ではなく基礎HPそのものを底上げする。呪いは1体に1つ
  // しか乗らず上書きで消えるが、こちらはその個体が土地を離れるまで残る。
  kotai: spell(
    'kotai',
    '鋼体',
    Rarity.N,
    50,
    'anyMonster',
    { type: 'boostBaseHp', amount: 15 },
    '対象の配置モンスターの基礎HPを15上げる（現在HPも15回復する）。呪いではないので上書きされず、その個体が土地を離れるまで永続',
  ),
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
  // 盤面の配置モンスターを一掃して全部ゾンビ(20/20)にする。土地の所有権も
  // レベルも変わらないので、育てた壁を潰す妨害としても、格上の土地へ挑む
  // 下準備としても効く。
  pandemic: spell(
    'pandemic',
    'パンデミック',
    Rarity.S,
    100,
    'none',
    { type: 'replaceAllUnitsWithZombie' },
    '盤面に召喚されているモンスターがすべてゾンビ（HP20/ATK20）に置き換わる。土地の所有者・レベルは変わらず、呪いは消える',
  ),
  // 全員の土地をLv2へ揃える。育てた側は資産が減り、Lv1で並べていた側は
  // 資産が増える。誰がどれだけ動いたかは頭上の総資産変動で見せる。
  horizon: spell(
    'horizon',
    'ホライズン',
    Rarity.R,
    200,
    'none',
    { type: 'setAllLandLevels', level: 2 },
    'すべてのプレイヤーの領地がレベル2になる。上がる土地も下がる土地もあり、総資産の変動が各プレイヤーの頭上に表示される',
  ),
  delayTactics: spell(
    'delayTactics',
    '遅延行為',
    Rarity.S,
    100,
    'anyTile',
    { type: 'lowerTileLevel', amount: 1 },
    '対象の土地のレベルを1下げる（Lv1の土地には効果がない）。下げた分の投資額は戻らない',
  ),
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
  twitterLand: spell('twitterLand', 'スイッチランド', Rarity.N, 100, 'anyTile', { type: 'forceTileElement', element: Element.NEUTRAL }, '対象の土地を無色に変える'),
  sanctuary: spell(
    'sanctuary',
    '聖域',
    Rarity.N,
    90,
    'anyMonster',
    { type: 'curseSanctuary' },
    '対象のモンスターに「聖域」の呪いをかける。その土地は他プレイヤーが侵略できず通行料も発生せず、モンスターは単体スペルの対象にならない（全体スペルは受ける）。モンスターへの呪いなので、別の呪いをかけられると上書きされて消える',
  ),
  // ステージ⑤・段ボール男初回撃破のクリア報酬。EXレア。使うと手札に戻る（捨てたら消滅）。
  encounterUnknown: {
    ...spell(
      'encounterUnknown',
      '未知との遭遇',
      Rarity.EX,
      40,
      'self',
      { type: 'encounterUnknown' },
      'デッキにセットしていてまだ一度もドローしていない無属性モンスターを1体手札に加える（使うと手札に戻る／捨てたら消滅）。全種遭遇済みなら復帰せず200G＋2ドロー',
    ),
    rewardOnly: true,
  },
  // 色の魔法陣シリーズ: デッキ内（drawPile/discardPile）の該当属性モンスターを
  // 1枚ランダムに引き当てて空き地へ直接召喚する（手札もコストも経由しない）。
  // 対象の属性モンスターがデッキ内に1体も残っていない場合は150Gを得る。
  neutralMagicCircle: spell(
    'neutralMagicCircle',
    '無色の魔法陣',
    Rarity.S,
    60,
    'none',
    { type: 'randomDeckMonsterSummon', element: Element.NEUTRAL },
    'デッキの中の無属性モンスターをランダムな空き地に召喚する。対象のモンスターがデッキにいない場合、150Gを得る',
  ),
  fireMagicCircle: spell(
    'fireMagicCircle',
    '赤色の魔法陣',
    Rarity.S,
    60,
    'none',
    { type: 'randomDeckMonsterSummon', element: Element.FIRE },
    'デッキの中の火属性モンスターをランダムな空き地に召喚する。対象のモンスターがデッキにいない場合、150Gを得る',
  ),
  waterMagicCircle: spell(
    'waterMagicCircle',
    '青色の魔法陣',
    Rarity.S,
    60,
    'none',
    { type: 'randomDeckMonsterSummon', element: Element.WATER },
    'デッキの中の水属性モンスターをランダムな空き地に召喚する。対象のモンスターがデッキにいない場合、150Gを得る',
  ),
  forestMagicCircle: spell(
    'forestMagicCircle',
    '緑色の魔法陣',
    Rarity.S,
    60,
    'none',
    { type: 'randomDeckMonsterSummon', element: Element.FOREST },
    'デッキの中の森属性モンスターをランダムな空き地に召喚する。対象のモンスターがデッキにいない場合、150Gを得る',
  ),
  thunderMagicCircle: spell(
    'thunderMagicCircle',
    '黄色の魔法陣',
    Rarity.S,
    60,
    'none',
    { type: 'randomDeckMonsterSummon', element: Element.THUNDER },
    'デッキの中の雷属性モンスターをランダムな空き地に召喚する。対象のモンスターがデッキにいない場合、150Gを得る',
  ),
  // この試合中に死んだモンスター（敵味方問わず）を1体選び、自分の配下として蘇生する。
  necromancer: spell(
    'necromancer',
    'ネクロマンサー',
    Rarity.R,
    100,
    'deadMonster',
    { type: 'reviveDeadMonster' },
    'この試合中に死んだモンスター（敵プレイヤーのものも対象）の中から1体を選び、ランダムな空き地に自分の所有として蘇生する',
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
 *
 * アイテム枠について: CPUは「装備した方が結果が良くなる時だけ装備する」
 * （game.jsの_chooseBattleItemByOutcome）ため、装備率の低いカードが出る。
 * ただし「装備率が低い＝弱いカード」ではないので、そこを根拠にデッキから
 * 抜かないこと。実例として真剣白刃取り（相手のアイテムを奪って自分が装備する）
 * は一時期どのCPUも一切選ばなかったが、原因はカードではなくAI側の見積もりが
 * 「相手はアイテムを使わない」前提だったこと（＝奪う対象が存在しないので効果が
 * 常にゼロと評価される）だった。今はCPU_OPPONENT_ARMED_CHANCEで相手の武装を
 * 確率的に織り込むので正しく評価される。ステゴロ（相手のアイテムを破壊）や
 * ハリネズミの服（反射）も同じ理由で生きている。
 * 抜いてよいのは「そのデッキでは効果が発動しようがないカード」だけ。
 */
export const CHARACTER_DECKS = {
  chin: {
    composition: {
      monsters: [
        // ボス強化: 最弱の半魚人(N 30/30)2枚を、嵐を呼ぶ〇女(R 50/50)と
        // 煉獄の門番兵(S 25/40・先制・60G)へ差し替え。水・火テーマは維持。
        { def: MONSTER_CATALOG.su, count: 2 }, { def: MONSTER_CATALOG.fireworksMaster, count: 3 },
        { def: MONSTER_CATALOG.arashiwoyobuOnna, count: 1 }, { def: MONSTER_CATALOG.rengokuMonbanhei, count: 1 },
        { def: MONSTER_CATALOG.kaikyouSekishoKurage, count: 2 },
        { def: MONSTER_CATALOG.mizuburoShugyoso, count: 2 }, { def: MONSTER_CATALOG.uminoieTencho, count: 2 },
        { def: MONSTER_CATALOG.bigMermaid, count: 2 }, { def: MONSTER_CATALOG.kyousenshi, count: 1 },
        { def: MONSTER_CATALOG.kontonNoAtama, count: 1 }, { def: MONSTER_CATALOG.metaOn, count: 1 },
      ],
      items: [
        // ハリネズミの服1枚を斬〇剣（後攻・貫通・50%即死）へ。itemGambleChance
        // 0.9と合わせて、侵略・迎撃どちらでも一撃の脅威を作る。
        { def: ITEM_CATALOG.fushichoNoTate, count: 1 }, { def: ITEM_CATALOG.fushichoNoKen, count: 1 },
        { def: ITEM_CATALOG.shinkenShirahadori, count: 1 }, { def: ITEM_CATALOG.lifeJacket, count: 1 },
        { def: ITEM_CATALOG.iceSlugger, count: 1 }, { def: ITEM_CATALOG.osafune, count: 1 },
        { def: ITEM_CATALOG.harinezumiNoFuku, count: 1 }, { def: ITEM_CATALOG.zangokuKen, count: 1 },
      ],
      spells: [
        // 不動産鑑〇士(realEstateAppraiser)はCPUに詠唱ハンドラが無い死に札
        // だったため、財布チューチュー（手持ちG30%強奪 -
        // _cpuMaybeUseStealGoldSpell参照）へ2枚差し替え。
        // アイキャンフライは罠用途以外でCPUが使わないため1枚に減らし、
        // 追徴課税（自分の高額地に1.5倍通行料 - _cpuMaybeUseTollBonusSpell）
        // を追加。1vs1の通行料プレッシャーを強める。
        { def: SPELL_CATALOG.senbonZakura, count: 2 }, { def: SPELL_CATALOG.walletVacuum, count: 2 },
        { def: SPELL_CATALOG.blueOcean, count: 1 }, { def: SPELL_CATALOG.psychokinesis, count: 2 },
        { def: SPELL_CATALOG.iCanFly, count: 1 }, { def: SPELL_CATALOG.specialAudit, count: 1 },
        { def: SPELL_CATALOG.sideIncome, count: 2 },
        { def: SPELL_CATALOG.manaExtraction, count: 1 }, { def: SPELL_CATALOG.homingInstinct, count: 1 },
        { def: SPELL_CATALOG.divination, count: 1 },
      ],
    },
  },
  kare: {
    composition: {
      // 水・森の神テーマは残しつつ、破産対策で「安価で腐りにくい50G級Rを厚く／
      // 高コストの神と大型は少数／収入と課税で経済を回す」構成へ見直し。
      // マウントゴリラ(手持ちG優位でATK2倍)は副業収入との相性が良い。
      monsters: [
        // 安価で効率のよい主力（50G中心・低い連鎖条件）。
        { def: MONSTER_CATALOG.kunekune, count: 3 },
        { def: MONSTER_CATALOG.uminoieTencho, count: 3 },
        { def: MONSTER_CATALOG.jukaiNoOnryou, count: 3 },
        { def: MONSTER_CATALOG.mountGorilla, count: 2 },
        { def: MONSTER_CATALOG.moriNoYousei, count: 2 },
        // 未知の侵略者（貫通アサシン、30G）。守備召喚はせず移動侵略で敵高レベル地を
        // 削る運用（_cpuChooseSummonCardForKare / _cpuMaybeUseAssassinTactics参照）。
        { def: MONSTER_CATALOG.mysteriousInvader, count: 2 },
        // 中量級の壁・アタッカー（120G前後、1連鎖）。
        { def: MONSTER_CATALOG.bigMermaid, count: 2 },
        { def: MONSTER_CATALOG.sekaiju, count: 1 },
        { def: MONSTER_CATALOG.kontonNoAtama, count: 1 },
        // フィニッシャーの神（150G・1連鎖、各1枚に抑える）。
        { def: MONSTER_CATALOG.suijin, count: 1 },
        { def: MONSTER_CATALOG.yamagami, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.fushichoNoTate, count: 1 },
        { def: ITEM_CATALOG.fushichoNoKen, count: 1 },
        { def: ITEM_CATALOG.shinkenShirahadori, count: 1 },
        // 火炎放射器（火属性が持つとATK+30）は水・森のこのデッキでは効果が
        // 一生発動しない死に枠だったので、同格・同コスト・同ステータスの
        // 森属性版である人食い草へ差し替えた。
        { def: ITEM_CATALOG.gomuGoNoPistol, count: 1 },
        { def: ITEM_CATALOG.iceSlugger, count: 1 },
        // 強めの武器: 斬〇剣（後攻・貫通・50%即死）。侵略の決定力を底上げする。
        { def: ITEM_CATALOG.zangokuKen, count: 1 },
      ],
      // 旧構成のphoenixCurse/psychokinesisはCPUが一切詠唱しない死に札だったため
      // 撤去。全てCPUが実際に使うスペルに差し替え、収入(副業収入)で通行料破産を
      // 防ぎ、占術で事故を減らす。追徴課税は1枚に抑える。
      spells: [
        { def: SPELL_CATALOG.sideIncome, count: 3 },
        { def: SPELL_CATALOG.divination, count: 2 },
        { def: SPELL_CATALOG.specialAudit, count: 1 },
        { def: SPELL_CATALOG.disclosureRequest, count: 1 },
        { def: SPELL_CATALOG.senbonZakura, count: 1 },
        { def: SPELL_CATALOG.blueOcean, count: 1 },
        { def: SPELL_CATALOG.manaExtraction, count: 2 },
        { def: SPELL_CATALOG.homingInstinct, count: 2 },
      ],
    },
  },
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
        { def: SPELL_CATALOG.realEstateAppraiser, count: 1 }, { def: SPELL_CATALOG.manaExtraction, count: 1 },
        { def: SPELL_CATALOG.curseCleanse, count: 2 },
        { def: SPELL_CATALOG.taxEvasion, count: 1 }, { def: SPELL_CATALOG.splitEvenly, count: 1 },
        { def: SPELL_CATALOG.poisonMist, count: 1 }, { def: SPELL_CATALOG.specialAudit, count: 1 },
        { def: SPELL_CATALOG.electrify, count: 3 },
      ],
    },
  },
  muuru: {
    composition: {
      // 召喚条件付きは関所クラゲ3＋ビッグマーメイド2の5枚だけに絞る（以前は
      // 20体中10体が連鎖待ちで、水地11マスしか使わないムールでは序盤に手札の
      // 半分が置けなかった）。残りは条件なしの主力で固める。
      monsters: [
        { def: MONSTER_CATALOG.kaikyouSekishoKurage, count: 3 },
        { def: MONSTER_CATALOG.bigMermaid, count: 2 },
        { def: MONSTER_CATALOG.arashiwoyobuOnna, count: 3 },
        { def: MONSTER_CATALOG.kaizokuS, count: 2 },
        { def: MONSTER_CATALOG.tsurara, count: 2 },
        { def: MONSTER_CATALOG.aoriika, count: 2 },
        { def: MONSTER_CATALOG.shinkaiCleaner, count: 2 },
        { def: MONSTER_CATALOG.hangyojin, count: 2 },
        { def: MONSTER_CATALOG.azarashisan, count: 1 },
        { def: MONSTER_CATALOG.kunekune, count: 1 },
      ],
      // 以前は8枚中6枚がATK+0の完全な受け身装備で、装備しても勝ちに行けな
      // かった。全員水属性なので薄氷の剣は実質ATK+50として働く。
      items: [
        { def: ITEM_CATALOG.iceSlugger, count: 2 },
        { def: ITEM_CATALOG.osafune, count: 1 },
        { def: ITEM_CATALOG.zangokuKen, count: 1 },
        { def: ITEM_CATALOG.fushichoNoTate, count: 1 },
        { def: ITEM_CATALOG.lifeJacket, count: 1 },
        { def: ITEM_CATALOG.nankaNoOmamori, count: 1 },
        { def: ITEM_CATALOG.shinkenShirahadori, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.toughness, count: 2 },
        { def: SPELL_CATALOG.waterRelease, count: 2 },
        { def: SPELL_CATALOG.waterMagicCircle, count: 2 },
        { def: SPELL_CATALOG.blueOcean, count: 1 },
        { def: SPELL_CATALOG.specialAudit, count: 1 },
        { def: SPELL_CATALOG.manaExtraction, count: 1 },
        { def: SPELL_CATALOG.sideIncome, count: 1 },
        { def: SPELL_CATALOG.realEstateAppraiser, count: 1 },
        { def: SPELL_CATALOG.homingInstinct, count: 1 },
      ],
    },
  },
  /**
   * ⑨の専門調査官・A（少女Aの裏の顔）。③の少女Aデッキとは別物で、
   * 雷＝先制の手数、森＝殴り合いの地力、無属性＝仕上げ役という構成。
   * 召喚条件付きは0枚にして、序盤から途切れず盤面を作れるようにしてある。
   * スペルは通行料と手持ちGを締め上げる「調査官」寄りに寄せ、盤面の森
   * （主人公が無競争で取りやすかった帯）も放牧で取りに行く。
   */
  investigatorA: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.tenhou, count: 2 },
        { def: MONSTER_CATALOG.thunderbird, count: 2 },
        { def: MONSTER_CATALOG.kadenryuuCheetah, count: 2 },
        { def: MONSTER_CATALOG.raiheishinZamurai, count: 2 },
        { def: MONSTER_CATALOG.raiun, count: 2 },
        { def: MONSTER_CATALOG.erekiKagayaki, count: 1 },
        { def: MONSTER_CATALOG.matagiNoKoshirou, count: 2 },
        { def: MONSTER_CATALOG.saboriTender, count: 2 },
        { def: MONSTER_CATALOG.jukaiNoOnryou, count: 2 },
        { def: MONSTER_CATALOG.mountGorilla, count: 1 },
        { def: MONSTER_CATALOG.kyousenshi, count: 1 },
        { def: MONSTER_CATALOG.ninja, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.raijinKen, count: 2 },
        { def: ITEM_CATALOG.gomuGoNoPistol, count: 1 },
        { def: ITEM_CATALOG.pegasusSword, count: 1 },
        { def: ITEM_CATALOG.zangokuKen, count: 1 },
        { def: ITEM_CATALOG.fushichoNoKen, count: 1 },
        { def: ITEM_CATALOG.nankaNoOmamori, count: 1 },
        { def: ITEM_CATALOG.lifeJacket, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.specialAudit, count: 2 },
        { def: SPELL_CATALOG.walletVacuum, count: 2 },
        { def: SPELL_CATALOG.electrify, count: 2 },
        { def: SPELL_CATALOG.taxHike, count: 1 },
        { def: SPELL_CATALOG.grazing, count: 1 },
        { def: SPELL_CATALOG.senbonZakura, count: 1 },
        { def: SPELL_CATALOG.divination, count: 1 },
        { def: SPELL_CATALOG.homingInstinct, count: 1 },
        { def: SPELL_CATALOG.sideIncome, count: 1 },
      ],
    },
  },
  hitodemaso: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.mysteriousInvader, count: 4 },
        { def: MONSTER_CATALOG.kontonNoAtama, count: 4 },
        { def: MONSTER_CATALOG.kyousenshi, count: 4 },
        { def: MONSTER_CATALOG.battleTrain, count: 2 },
        { def: MONSTER_CATALOG.sacrificeCar, count: 2 },
        { def: MONSTER_CATALOG.ninja, count: 4 },
      ],
      items: [
        { def: ITEM_CATALOG.peeStaff, count: 1 },
        { def: ITEM_CATALOG.ikasamaNoSaikoro, count: 4 },
        { def: ITEM_CATALOG.twinHammer, count: 2 },
        { def: ITEM_CATALOG.lifeJacket, count: 2 },
        { def: ITEM_CATALOG.fushichoNoTate, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.forcedAscension, count: 3 },
        { def: SPELL_CATALOG.homingInstinct, count: 2 },
        { def: SPELL_CATALOG.realEstateAppraiser, count: 1 },
        { def: SPELL_CATALOG.psychokinesis, count: 1 },
        { def: SPELL_CATALOG.disclosureRequest, count: 1 },
        { def: SPELL_CATALOG.encounterUnknown, count: 1 },
        { def: SPELL_CATALOG.toughness, count: 1 },
      ],
    },
  },
  /**
   * ⑯「魚群の王チヌ」の下僕3体（ウサギン／ムール／邪神ヒトデマソ）の専用デッキ。
   * ①〜⑮で使う`usagin`/`muuru`/`hitodemaso`とは別キーなので、既存ステージの
   * 難度には一切影響しない。
   *
   * 設計方針（2026-08 ユーザー指定）: ⑯は**強制敗北にしない**（勝った時の隠し
   * イベントがあるため）。1vs3という人数差そのものが壁なので、勝てなくする
   * 仕掛けは足さず、**デッキの地力だけで「ほぼ勝てない」を作る**。
   * - 3人とも`fireball`4／`senbonZakura`3で主人公のモンスターを焼き続ける。
   * - 3人とも`backfire`2／`diceOne`2を持ち、既存の妨害AI
   *   （`_cpuMaybeUseReverseDiceSpell`等）でゴールを遠ざける。交代で撃つ等の
   *   専用スクリプトは持たせない＝プレイヤー側の工夫で崩せる余地を残す。
   * - 自分たちは`iCanFly`／`homingInstinct`で周回を稼ぐ。
   * - 3人とも`cancelCulture`2枚（2026-09-01、実プレイで勝たれたので追加）。
   *   CPUの使用判断は焼き札・妨害札より**後**に評価されるので（game.jsの
   *   `_cpuMaybeUseCancelCultureSpell`の呼び出し順）、本来の動きを潰さずに
   *   「他にやることが無いターン」だけ主人公の手札を削る。同盟内は対象外
   *   なので下僕どうしで撃ち合うこともない。**相手のアイテムを優先して
   *   全部潰す**（`_cpuMaybeUseCancelCultureSpell`, 2026-09-01のユーザー指定）。
   * - 3人とも`ikasamaNoSaikoro`2枚（2026-09-01、ユーザー指定）。ATK+直前の
   *   出目×5・貫通で、土地の同属性HPボーナスを無視して殴れる。守り札
   *   （ナンカのお守り／ハリネズミの服／ライフジャケット）と入れ替えた＝
   *   キャンセルカルチャーで相手の装備を剥がしつつ、自分は打点で押し切る形。
   * - モンスターは各属性の上澄み。`chainRequired`持ちは1人4〜5枚までに抑える
   *   （⑯の想定盤面は属性ごとに4マスしかなく、連鎖待ちで手札が詰まるため）。
   *   `rainbowChameleon`は属性を問わずHPボーナスが乗るので3人とも採用。
   */
  chinuUsagin: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.yamagami, count: 2 }, { def: MONSTER_CATALOG.moriNoYousei, count: 2 },
        { def: MONSTER_CATALOG.mountGorilla, count: 2 }, { def: MONSTER_CATALOG.jukaiNoOnryou, count: 3 },
        { def: MONSTER_CATALOG.nazoNoKyotou, count: 2 }, { def: MONSTER_CATALOG.matagiNoKoshirou, count: 2 },
        { def: MONSTER_CATALOG.saboriTender, count: 2 }, { def: MONSTER_CATALOG.kyochinhei, count: 1 },
        { def: MONSTER_CATALOG.rainbowChameleon, count: 3 },
      ],
      items: [
        { def: ITEM_CATALOG.gomuGoNoPistol, count: 2 }, { def: ITEM_CATALOG.zangokuKen, count: 1 },
        { def: ITEM_CATALOG.ikasamaNoSaikoro, count: 2 },
      ],
      spells: [
        { def: SPELL_CATALOG.fireball, count: 4 }, { def: SPELL_CATALOG.senbonZakura, count: 3 },
        { def: SPELL_CATALOG.backfire, count: 2 }, { def: SPELL_CATALOG.diceOne, count: 2 },
        { def: SPELL_CATALOG.iCanFly, count: 2 }, { def: SPELL_CATALOG.homingInstinct, count: 1 },
        { def: SPELL_CATALOG.cancelCulture, count: 2 },
      ],
    },
  },
  chinuMuuru: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.bigMermaid, count: 2 }, { def: MONSTER_CATALOG.arashiwoyobuOnna, count: 3 },
        { def: MONSTER_CATALOG.suijin, count: 1 }, { def: MONSTER_CATALOG.uminoieTencho, count: 1 },
        { def: MONSTER_CATALOG.kaikyouSekishoKurage, count: 1 }, { def: MONSTER_CATALOG.tsurara, count: 2 },
        { def: MONSTER_CATALOG.aoriika, count: 2 }, { def: MONSTER_CATALOG.ryanmenSukuna, count: 2 },
        { def: MONSTER_CATALOG.shinkaiCleaner, count: 1 }, { def: MONSTER_CATALOG.yukiOnna, count: 1 },
        { def: MONSTER_CATALOG.rainbowChameleon, count: 3 },
      ],
      items: [
        { def: ITEM_CATALOG.iceSlugger, count: 2 }, { def: ITEM_CATALOG.zangokuKen, count: 1 },
        { def: ITEM_CATALOG.ikasamaNoSaikoro, count: 2 },
      ],
      spells: [
        { def: SPELL_CATALOG.fireball, count: 4 }, { def: SPELL_CATALOG.senbonZakura, count: 3 },
        { def: SPELL_CATALOG.backfire, count: 2 }, { def: SPELL_CATALOG.diceOne, count: 2 },
        { def: SPELL_CATALOG.iCanFly, count: 1 }, { def: SPELL_CATALOG.homingInstinct, count: 2 },
        { def: SPELL_CATALOG.cancelCulture, count: 2 },
      ],
    },
  },
  chinuHitodemaso: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.kontonNoAtama, count: 3 }, { def: MONSTER_CATALOG.kyousenshi, count: 3 },
        { def: MONSTER_CATALOG.ninja, count: 3 }, { def: MONSTER_CATALOG.netBenkei, count: 2 },
        { def: MONSTER_CATALOG.mysteriousInvader, count: 2 }, { def: MONSTER_CATALOG.kugutsuNoKengou, count: 2 },
        { def: MONSTER_CATALOG.sentinel, count: 1 }, { def: MONSTER_CATALOG.kunekune, count: 1 },
        { def: MONSTER_CATALOG.rainbowChameleon, count: 2 },
      ],
      items: [
        { def: ITEM_CATALOG.ikasamaNoSaikoro, count: 2 }, { def: ITEM_CATALOG.twinHammer, count: 1 },
        { def: ITEM_CATALOG.zangokuKen, count: 1 }, { def: ITEM_CATALOG.lifeJacket, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.fireball, count: 4 }, { def: SPELL_CATALOG.senbonZakura, count: 3 },
        { def: SPELL_CATALOG.backfire, count: 2 }, { def: SPELL_CATALOG.diceOne, count: 2 },
        { def: SPELL_CATALOG.homingInstinct, count: 1 },
        { def: SPELL_CATALOG.forcedAscension, count: 1 }, { def: SPELL_CATALOG.psychokinesis, count: 1 },
        { def: SPELL_CATALOG.cancelCulture, count: 2 },
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
  q: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.battleTrain, count: 4 },
        { def: MONSTER_CATALOG.sacrificeCar, count: 4 },
        { def: MONSTER_CATALOG.hatsudenNezumi, count: 3 },
        { def: MONSTER_CATALOG.tetsuo, count: 2 },
        { def: MONSTER_CATALOG.ironWool, count: 2 },
        { def: MONSTER_CATALOG.mechanicMaso, count: 2 },
        { def: MONSTER_CATALOG.raiheishinZamurai, count: 2 },
        { def: MONSTER_CATALOG.raiun, count: 1 },
        { def: MONSTER_CATALOG.erekiKagayaki, count: 1 },
        { def: MONSTER_CATALOG.gandamu, count: 1 },
        { def: MONSTER_CATALOG.raijin, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.tetsuPipe, count: 1 },
        { def: ITEM_CATALOG.boudanChokki, count: 1 },
        { def: ITEM_CATALOG.lifeJacket, count: 1 },
        { def: ITEM_CATALOG.ikasamaNoSaikoro, count: 1 },
        { def: ITEM_CATALOG.shinkenShirahadori, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.diceOne, count: 3 },
        { def: SPELL_CATALOG.diceThree, count: 3 },
        { def: SPELL_CATALOG.diceSix, count: 3 },
        { def: SPELL_CATALOG.sideIncome, count: 3 },
      ],
    },
  },
  darkHofuku: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.rengokuMonbanhei, count: 2 },
        { def: MONSTER_CATALOG.flameGod, count: 1 },
        { def: MONSTER_CATALOG.classicDragon, count: 2 },
        { def: MONSTER_CATALOG.hezumaDragon, count: 2 },
        { def: MONSTER_CATALOG.ironChef, count: 2 },
        { def: MONSTER_CATALOG.fireKick, count: 2 },
        { def: MONSTER_CATALOG.kaentake, count: 1 },
        { def: MONSTER_CATALOG.molotovMan, count: 1 },
        { def: MONSTER_CATALOG.flamingYoutuber, count: 1 },
        { def: MONSTER_CATALOG.kakouFudoumyouou, count: 2 },
        { def: MONSTER_CATALOG.kontonNoAtama, count: 2 },
        { def: MONSTER_CATALOG.mysteriousInvader, count: 1 },
        { def: MONSTER_CATALOG.kyousenshi, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.peeStaff, count: 1 },
        { def: ITEM_CATALOG.fushichoNoTate, count: 1 },
        { def: ITEM_CATALOG.twinHammer, count: 2 },
        { def: ITEM_CATALOG.shinkenShirahadori, count: 4 },
        { def: ITEM_CATALOG.ikasamaNoSaikoro, count: 2 },
      ],
      spells: [
        { def: SPELL_CATALOG.kokushiMusou, count: 2 },
        { def: SPELL_CATALOG.senbonZakura, count: 3 },
        { def: SPELL_CATALOG.fireball, count: 2 },
        { def: SPELL_CATALOG.homingInstinct, count: 1 },
        { def: SPELL_CATALOG.sideIncome, count: 1 },
        { def: SPELL_CATALOG.diceSix, count: 1 },
      ],
    },
  },
  darkShoujoA: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.raiheishinZamurai, count: 4 },
        { def: MONSTER_CATALOG.raijin, count: 3 },
        { def: MONSTER_CATALOG.tenhou, count: 3 },
        { def: MONSTER_CATALOG.aruKagakuNo, count: 2 },
        { def: MONSTER_CATALOG.rakuraiYohoushi, count: 3 },
        { def: MONSTER_CATALOG.gandamu, count: 2 },
        { def: MONSTER_CATALOG.hatsudenOni, count: 2 },
        { def: MONSTER_CATALOG.ninja, count: 2 },
        { def: MONSTER_CATALOG.kyousenshi, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.zangokuKen, count: 3 },
        { def: ITEM_CATALOG.fushichoNoTate, count: 1 },
        { def: ITEM_CATALOG.shinkenShirahadori, count: 1 },
        { def: ITEM_CATALOG.nankaNoOmamori, count: 1 },
        { def: ITEM_CATALOG.harinezumiNoFuku, count: 1 },
        { def: ITEM_CATALOG.ikasamaNoSaikoro, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.kokushiMusou, count: 2 },
        { def: SPELL_CATALOG.psychokinesis, count: 2 },
        { def: SPELL_CATALOG.electrify, count: 2 },
        { def: SPELL_CATALOG.homingInstinct, count: 1 },
        { def: SPELL_CATALOG.backfire, count: 1 },
        { def: SPELL_CATALOG.manaExtraction, count: 1 },
        { def: SPELL_CATALOG.realEstateAppraiser, count: 1 },
      ],
    },
  },
  thirty: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.hezumaDragon, count: 1 },
        { def: MONSTER_CATALOG.ironChef, count: 1 },
        { def: MONSTER_CATALOG.classicDragon, count: 2 },
        { def: MONSTER_CATALOG.arashiwoyobuOnna, count: 1 },
        { def: MONSTER_CATALOG.uminoieTencho, count: 1 },
        { def: MONSTER_CATALOG.bigMermaid, count: 2 },
        { def: MONSTER_CATALOG.sekaiju, count: 2 },
        { def: MONSTER_CATALOG.jukaiNoOnryou, count: 1 },
        { def: MONSTER_CATALOG.mountGorilla, count: 1 },
        { def: MONSTER_CATALOG.gandamu, count: 2 },
        { def: MONSTER_CATALOG.aruKagakuNo, count: 1 },
        { def: MONSTER_CATALOG.tenhou, count: 1 },
        { def: MONSTER_CATALOG.kunekune, count: 1 },
        { def: MONSTER_CATALOG.kyousenshi, count: 1 },
        { def: MONSTER_CATALOG.mysteriousInvader, count: 1 },
        { def: MONSTER_CATALOG.thirtyBreedMonster, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.fushichoNoKen, count: 1 },
        { def: ITEM_CATALOG.fushichoNoTate, count: 1 },
        { def: ITEM_CATALOG.kaenHoushakiki, count: 1 },
        { def: ITEM_CATALOG.raijinKen, count: 1 },
        { def: ITEM_CATALOG.gomuGoNoPistol, count: 1 },
        { def: ITEM_CATALOG.iceSlugger, count: 1 },
        { def: ITEM_CATALOG.shinkenShirahadori, count: 1 },
        { def: ITEM_CATALOG.zangokuKen, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.phoenixCurse, count: 1 },
        { def: SPELL_CATALOG.walletVacuum, count: 2 },
        { def: SPELL_CATALOG.senbonZakura, count: 3 },
        { def: SPELL_CATALOG.dieWithMe, count: 1 },
        { def: SPELL_CATALOG.optimize, count: 1 },
        { def: SPELL_CATALOG.psychokinesis, count: 2 },
        { def: SPELL_CATALOG.necromancer, count: 2 },
      ],
    },
  },
  // ⑫海上金融街のフィクサー。盤面は火・水・雷・森が各10マス、しかも一辺
  // ごとに連続しているので連鎖が伸びる＝地価もお札の相場も跳ねる。
  // 森で連鎖を固めて資産を膨らませ、金で殴る（マウントゴリラ）・通行料を
  // 吊り上げる（森林徴税官）のが芯。避雷針侍と海賊Sはプレイヤー対策の
  // テック枠で、属性は違うが盤面の雷／水マスに置く前提。
  que: {
    composition: {
      monsters: [
        // 森: 連鎖本体。金テーマのカードが森に集中している。
        { def: MONSTER_CATALOG.sanzokuFukurou, count: 2 },   // 20G 25/25 与ダメ×2G強奪
        // フリーランサー: 周回の基本ボーナス×1.3。倍率は基本部分にしか
        // ※現仕様では総額（基本＋領地＋お札利回り）に乗る。
        // 帰巣本能の周回カウント（lapsCompletedが早く伸びる＝基本部分が
        // 育つ）と資本主義の権化（無属性でも空き地へ自動展開される）の
        // 両方と噛み合う。50Gで失っても痛くない。
        { def: MONSTER_CATALOG.freelancer, count: 1 },
        { def: MONSTER_CATALOG.mountGorilla, count: 4 },     // 50G 30/30 Gで優位ならATK2倍
        { def: MONSTER_CATALOG.jukaiNoOnryou, count: 2 },    // 50G 40/20 先制＋1/2即死
        { def: MONSTER_CATALOG.nashiNashiTankentai, count: 2 }, // 50G 30/30 1/3ダメ無効
        { def: MONSTER_CATALOG.trufuButa, count: 1 },        // 50G 30/30 1/3で150G
        { def: MONSTER_CATALOG.shinrinChouzeikan, count: 2 }, // 90G 35/40 連鎖2 通行料1.3倍
        { def: MONSTER_CATALOG.yamagami, count: 2 },         // 150G 連鎖1 森連鎖×7
        { def: MONSTER_CATALOG.sekaiju, count: 2 },          // 120G 0/70 連鎖1 防衛拠点
        // テック枠。避雷針侍は生贄1が必要なので手札が薄い時は出せない。
        { def: MONSTER_CATALOG.raiheishinZamurai, count: 2 }, // 雷 50G 15/30 身代わり
        // 無属性。⑫は4属性が育つので盤面全体の連鎖数が伸びやすい。
        { def: MONSTER_CATALOG.kontonNoAtama, count: 2 },     // 150G 30/30 全連鎖×5
      ],
      items: [
        { def: ITEM_CATALOG.gomuGoNoPistol, count: 2 },  // 人食い草: 森が持つとATK+50
        { def: ITEM_CATALOG.nankaNoOmamori, count: 3 },
        { def: ITEM_CATALOG.ikasamaNoSaikoro, count: 1 }, // ATK+直前の出目×5、貫通
      ],
      spells: [
        // 財布チューチューは抜いた: ⑫の対人ではプレイヤーが現金をお札と
        // 土地に換えるため手持ちGが薄く、30%奪取がコスト100Gに見合わない
        // （CPUの発動条件も成立せず手札で腐る）。マウントゴリラのATK2倍は
        // 相手が現金を持っていない時点で最初から成立している。
        // 放牧: 敵の異属性の土地を森へ塗り替える。相手の連鎖を折りつつ、
        // 森のお札の基礎価格（所有者を問わず土地レベル合計で決まる）を
        // 押し上げる、フィクサーの相場操作そのもの。
        { def: SPELL_CATALOG.grazing, count: 1 },
        { def: SPELL_CATALOG.capitalismIncarnate, count: 2 },
        { def: SPELL_CATALOG.homingInstinct, count: 2 }, // 自分に撃って周回＝お札取引の回数を稼ぐ
        // 副業収入(0G): 純粋な収入源。捨て札が山に戻るたび再利用でき、
        // 周回が進むほど実入りが増える（周回数×50+50G）。スペル枠の
        // 暇な手番を現金化に充て、通行料での資金ショートを防ぐ。
        { def: SPELL_CATALOG.sideIncome, count: 3 },
        // 増税通知(40G): 相手の一番高い通行料を恒久的に30%減らす。
        // 「高額地1枚で通行料破産を狙う」対クエ戦術の直接の解毒剤
        // （CPUは減額見込みがコストを上回る土地にだけ使う既存AI）。
        { def: SPELL_CATALOG.taxHike, count: 1 },
        // 土地防衛2枚: フィクサーの資産は森連鎖とその上のお札価格に集中して
        // いるので、中核の1〜2マスさえ守れば体制が崩れない。
        // 不死鳥の呪い(100G): 致死ダメージをHP1で耐えて土地も守る（1回限り）。
        // 聖域(90G): 侵略不能＋通行料ゼロ。通行料を捨ててでも連鎖の中核を固定する。
        { def: SPELL_CATALOG.phoenixCurse, count: 1 },
        { def: SPELL_CATALOG.sanctuary, count: 1 },
        // アリジゴク（強制停止の呪い）対策の1枚。呪われた高額地は毎周
        // 通行料を搾り取ってくるうえ、壁が固いと普通の侵略では抜けない。
        // 差し押さえるように戦闘なしで奪い取り、呪いごと自分の資産へ変える。
        { def: SPELL_CATALOG.dieWithMe, count: 1 },
      ],
    },
  },
  /**
   * ⑬船上のロンドのQ。「土地をあげていく」純粋な籠城型で、雷＋火の2属性。
   * 武器はほぼ持たず、避雷針侍の身代わり・電柱の全体HP+10・火口の不動明王の
   * 強制停止で盤面を固め、聖域／不死鳥／アリジゴク／追徴課税で通行料を取る。
   * 2属性にしてあるのは、相方クエが仕込むお札を雷・火の2種類に広げるため
   * （levelPumpSignalの合図もこの2属性の合計で数える）。
   * 戦闘列車・供物車両の合体はQらしい鉄道要素として残す。
   */
  qKessan: {
    composition: {
      monsters: [
        // ばら撒き兼、3周目で強制停止を覚える成長型の壁。
        { def: MONSTER_CATALOG.koutetsuYousai, count: 4 },
        // ■雷コンボの中核■
        // 電柱を植える男 → 電柱（盤上の雷モンスター全員がHP+10）
        // メカニックマソ → 周回ごとに自分の雷モンスター全員が最大HPの20%回復
        // 避雷針侍       → 味方が倒される時、代わりに身代わりになって土地を守る
        // この3枚が噛み合うと「削っても毎周戻る・倒しても身代わりが立つ」壁になる。
        { def: MONSTER_CATALOG.denchuwoUeruOtoko, count: 2 },
        { def: MONSTER_CATALOG.mechanicMaso, count: 2 },
        { def: MONSTER_CATALOG.raiheishinZamurai, count: 3 },
        // サンダーバード: 先制持ちで、土地コマンド(90G)から雷雲を空き地へ
        // 送り込める。籠城しながら盤面を増やせる数少ない手。
        { def: MONSTER_CATALOG.thunderbird, count: 2 },
        // 連鎖スケール枠。雷神は「雷の連鎖数×7」でHP・ATKが伸びる。連鎖は
        // 同盟合算なので、クエも雷に塗るほどここが跳ね上がる（コンボの出口）。
        { def: MONSTER_CATALOG.raijin, count: 2 },
        // 落雷予報士: 戦闘開始時50%で相手の装備を無効化する。プレイヤーの
        // 「強い武器を積んで一点突破」という定番の対策を正面から潰す。
        { def: MONSTER_CATALOG.rakuraiYohoushi, count: 2 },
        { def: MONSTER_CATALOG.tetsuo, count: 1 },
        { def: MONSTER_CATALOG.raiun, count: 1 },
      ],
      items: [
        { def: ITEM_CATALOG.nankaNoOmamori, count: 1 },
        { def: ITEM_CATALOG.lifeJacket, count: 2 },
        { def: ITEM_CATALOG.shinkenShirahadori, count: 1 },
      ],
      spells: [
        // 雷単色なので塗り替えは放電に集中させる。
        { def: SPELL_CATALOG.electrify, count: 2 },
        // 周回加速。籠城型でも周回そのものは収入と成長の源なので、
        // 出目操作と帰巣本能で1周を早く畳む。
        { def: SPELL_CATALOG.homingInstinct, count: 2 },
        { def: SPELL_CATALOG.iCanFly, count: 2 },
        // 1のダイスは主人公を足止めする妨害札（stage 13のAI設定で人間を優先）。
        { def: SPELL_CATALOG.diceOne, count: 2 },
        { def: SPELL_CATALOG.sanctuary, count: 1 },
        { def: SPELL_CATALOG.phoenixCurse, count: 1 },
        { def: SPELL_CATALOG.capitalismIncarnate, count: 2 },
        { def: SPELL_CATALOG.sideIncome, count: 3 },
        { def: SPELL_CATALOG.divination, count: 2 },
      ],
    },
  },
  /**
   * ⑬船上のロンドのクエ。役割は「戦闘を避けてひたすら周回し、安いカードを
   * 空き地にばら撒きながらお札を買い占める」こと（aiProfile.scatterSummons
   * ＋lapRacer＋ofudaStyle:'fixer'）。
   * したがって高コストの殴り合い要員は一切入れず、0G〜50Gの土地マーカーと、
   * 周回・現金化・相場操作のスペルだけで構成する。放電/放火はQと同じ色を
   * 塗るための札で、塗った土地はそのまま自分の保有お札の値上がりになる。
   */
  queKessan: {
    composition: {
      monsters: [
        // 雷単色12枚。クエは戦闘を避けて周回する役なので数は絞り、
        // 「置いたら育つ」「守れる」「立っているだけで金になる」の3種に寄せた。
        // 甲鉄要塞がSレアなのが効いていて、無属性地に据えた瞬間から
        // 「Sレアの属性が土地と食い違っている」＝最適化の発動条件になる。
        { def: MONSTER_CATALOG.koutetsuYousai, count: 4 },   // 40G 周回成長→3周目で強制停止
        { def: MONSTER_CATALOG.tenhou, count: 2 },           // 50G R 先制・与ダメ×5G強奪
        { def: MONSTER_CATALOG.tetsuo, count: 3 },            // 30G HP40の無条件壁
        { def: MONSTER_CATALOG.erekiKagayaki, count: 1 },     // 30G S・先制は1枚だけ残す
        { def: MONSTER_CATALOG.thunderbird, count: 1 },       // 空き地に雷雲を増やせる先制役
        { def: MONSTER_CATALOG.rakuraiYohoushi, count: 1 },  // 90G R 連鎖2 装備50%無効化
      ],
        items: [
          { def: ITEM_CATALOG.nankaNoOmamori, count: 2 },
          { def: ITEM_CATALOG.lifeJacket, count: 1 },
          { def: ITEM_CATALOG.shinkenShirahadori, count: 1 },
      ],
      spells: [
        // 最適化(300G): 自分の土地を「置いてあるモンスターの属性」へ一斉に
        // 揃える。全マス無属性で始まるこのステージでは、ばら撒いた甲鉄要塞の
        // 数だけまとめて雷地に変わる＝放電を何枚も撃つより遥かに速い。
        { def: SPELL_CATALOG.optimize, count: 2 },
        { def: SPELL_CATALOG.electrify, count: 2 },
        // 金策。副業収入は周回するほど増えるので周回屋のクエと噛み合う。
        { def: SPELL_CATALOG.sideIncome, count: 4 },
        // 周回加速。帰巣本能で強制的に1周を締め、出目操作で距離を稼ぐ。
          { def: SPELL_CATALOG.homingInstinct, count: 4 },
          { def: SPELL_CATALOG.iCanFly, count: 3 },
        { def: SPELL_CATALOG.diceSix, count: 2 },
        // 引き当て。最適化と放電はどちらも撃てるかどうかで盤面が変わる。
        { def: SPELL_CATALOG.divination, count: 3 },
        { def: SPELL_CATALOG.capitalismIncarnate, count: 1 },
          { def: SPELL_CATALOG.taxHike, count: 1 },
          { def: SPELL_CATALOG.sanctuary, count: 1 },
          { def: SPELL_CATALOG.phoenixCurse, count: 1 },
      ],
    },
  },
  /** ⑭王都の番人？？。盤面へ数を撒き、パンデミック→ホライズン→灰塵の
   * 一連だけで資金化する専用構成。固定40枚。 */
  fusagikonda: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.thunderbird, count: 4 },
        // 電柱を植える男(80G): 土地コマンドでランダムな空き地に電柱を召喚する
        // ばら撒き役。CPがあるGループ(fusagikondaLoop)へ優先配置される
        // (_cpuChooseSummonCardForFusagikonda, game.js)。
        { def: MONSTER_CATALOG.denchuwoUeruOtoko, count: 4 },
        { def: MONSTER_CATALOG.kontonNoAtama, count: 2 },
        // 戦闘列車/供物車両(2026-08): dryad2/未知の侵略者4/狂戦士4の代わりに追加。
        // 互いを戦闘中に装備すると合体する(_trainFusionDef, game.js)ので召喚時は
        // 温存せず、_cpuChooseSummonCardForFusagikondaが安いほうから普通の
        // ばら撒き札として据える。合体・防御装備としての優先はCPU共通の
        // _chooseBattleItemByOutcome/_bestBattleItemFromHandが自動で行うため
        // 追加実装不要（isBattleItemCardがdualUseItemを装備候補に含める）。
        { def: MONSTER_CATALOG.battleTrain, count: 2 },
        { def: MONSTER_CATALOG.sacrificeCar, count: 2 },
        // ボムボックリ(2026-08、2→4に増量): 死亡すると空き地にボックリ2体を呼ぶ
        // 捨て駒。勝てない侵略の代わりに使う・Lv1地は積極的に狙って死なせる
        // (_cpuMaybeSacrificeBombBokkuri, game.js)。鉄男(1枚)を抜いて枠を確保。
        { def: MONSTER_CATALOG.bombBokkuri, count: 4 },
      ],
      items: [
        // 灰塵の発動条件を緩和した分、真剣白刃取りは温存より枚数を削って
        // パンデミック/バックファイア/ボムボックリの増量分に回す。
        { def: ITEM_CATALOG.shinkenShirahadori, count: 1 },
        { def: ITEM_CATALOG.zangokuKen, count: 1 },
        { def: ITEM_CATALOG.lifeJacket, count: 1 },
        { def: ITEM_CATALOG.nankaNoOmamori, count: 1 },
      ],
      spells: [
        { def: SPELL_CATALOG.ashToDust, count: 2 },
        // パンデミックは灰塵コンボの起点（2026-08、4→3に調整）。
        { def: SPELL_CATALOG.pandemic, count: 3 },
        { def: SPELL_CATALOG.horizon, count: 2 },
        { def: SPELL_CATALOG.landlessOne, count: 1 },
        { def: SPELL_CATALOG.poisonMist, count: 2 },
        { def: SPELL_CATALOG.delayTactics, count: 2 },
        { def: SPELL_CATALOG.diceOne, count: 2 },
        // 敵地のアリジゴクを剥がす/高額地を潰す用途（psychokinesisTargetAntlion）。
        { def: SPELL_CATALOG.psychokinesis, count: 1 },
        // バックファイア(2026-08、4→2に調整): 相手を後退させる妨害札。
        { def: SPELL_CATALOG.backfire, count: 2 },
        { def: SPELL_CATALOG.senbonZakura, count: 1 },
      ],
    },
  },
  danball: {
    composition: {
      monsters: [
        { def: MONSTER_CATALOG.kodaiNoGearA, count: 3 }, { def: MONSTER_CATALOG.kodaiNoGearB, count: 3 },
        { def: MONSTER_CATALOG.kodaiNoGearC, count: 3 }, { def: MONSTER_CATALOG.kunekune, count: 1 },
        { def: MONSTER_CATALOG.rainbowChameleon, count: 1 }, { def: MONSTER_CATALOG.kaentake, count: 1 },
        { def: MONSTER_CATALOG.fireKick, count: 1 }, { def: MONSTER_CATALOG.hitodama, count: 2 },
        { def: MONSTER_CATALOG.hezumaDragon, count: 1 }, { def: MONSTER_CATALOG.flameGod, count: 1 },
        { def: MONSTER_CATALOG.hatsudenOni, count: 1 }, { def: MONSTER_CATALOG.raiun, count: 2 },
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
        { def: SPELL_CATALOG.twitterLand, count: 1 }, { def: SPELL_CATALOG.senbonZakura, count: 2 },
        { def: SPELL_CATALOG.sideIncome, count: 1 }, { def: SPELL_CATALOG.neutralMagicCircle, count: 1 },
        { def: SPELL_CATALOG.necromancer, count: 1 }, { def: SPELL_CATALOG.encounterUnknown, count: 1 },
      ],
    },
  },
  /**
   * ⑮（story.js`kawada`、CLAUDE.md「新ストーリー『川田』」参照）の川田。
   * ビーバーだが本人はマーモットだと思い込んでいる王都のレジスタンス。
   * 「純粋な殴り合い」というユーザー要望どおり、専用モンスターや妨害トリック
   * を持たない水メインの真正面ビートダウン。ゆきおんなの全水属性ATK+30を
   * 軸に、先制持ちで押し込みつつ連鎖系(関所クラゲ/水風呂修行僧)で
   * 息切れを防ぎ、くぐつの剣豪の自動侵略で盤面を広げ続ける
   * （2026-08、ユーザー指摘でファイヤーマン・まんぼーを高火力の
   * 嵐を呼ぶ〇女・水風呂修行僧へ、ダイヤモンドの盾を不死鳥の剣へ差し替え。
   * さらに鋼体2・占術1を削り、リャンメンすくな・水神の盾を1ずつ増量、
   * サイコキネシス1を追加。加えてシミュレーションで判明した
   * 「初期資金500Gに対して重すぎる」問題（CLAUDE.md「⑮の勝率シミュレーション
   * 結果」参照）を受け、ビッグマーメイド120G→嵐を呼ぶ〇女100G、
   * くぐつの剣豪150G×3のうち1枚→逆流カジキ30Gへ差し替えてカーブを下げた）。
   */
  kawada: {
    composition: {
      monsters: [
        // 周回成長型の壁。空き地専用召喚だが、据え置くほど先制→1/2無効化と
        // 育つので後半の壁として機能する。40Gでこのデッキ最高の1.63 pts/Gなので、
        // 水神150Gを抜いた枠もここへ回して3枚にした（2026-08、シミュレーションで
        // 4シード×120戦 32.3%→35.4%）。
        // 資本主義の権化を戻すため、島鯨は3枚に戻す。
        { def: MONSTER_CATALOG.islandWhale, count: 3 }, // S 40G 40/25 成長: 先制→1/2無効化
        // ゆきおんな3体: 1体でも盤面にいれば全水属性モンスターがATK+30
        // （重複なし）。本体も先制持ちなので単体でも押せる。
        { def: MONSTER_CATALOG.yukiOnna, count: 3 }, // S 50G 15/35 先制/水全体ATK+30
        // 安価な先制アタッカーで序盤から押し込む主力。
        { def: MONSTER_CATALOG.hangyojin, count: 2 }, // N 50G 30/30 先制
        // ゆきおんなの+30が2回乗るので、素の30/20が実質60/20×2連撃になる。
        { def: MONSTER_CATALOG.ryanmenSukuna, count: 3 }, // R 50G 30/20 2回攻撃
        { def: MONSTER_CATALOG.kaikyouSekishoKurage, count: 1 }, // R 80G 30/30 連鎖1 強制停止
        // 素のATK/HPが50/50と高水準な高火力アタッカー。攻撃時1/2の確率で
        // 自身にも10ダメージが乗るが、ゆきおんな込みなら80/50で十分ペイする。
        { def: MONSTER_CATALOG.arashiwoyobuOnna, count: 2 }, // R 100G 50/50 攻撃時1/2で自傷10
        // 水の土地1連鎖以上が召喚条件で、既に水神/混沌の頭で連鎖前提の
        // デッキなので運用しやすい。相手がRなら基礎ATKが+40%されるテック。
        { def: MONSTER_CATALOG.mizuburoShugyoso, count: 1 }, // S 80G 30/40 連鎖1 対R+40%ATK
        // 無属性だが水デッキでも普通に運用できるテック枠。
        { def: MONSTER_CATALOG.kugutsuNoKengou, count: 3 }, // R 120G 50/50 自動侵略
        { def: MONSTER_CATALOG.kunekune, count: 1 }, // R 50G 10/0 反射
      ],
      items: [
        // 水神の盾: 水属性が装備すると被ダメージを反射する新アイテム
        // （battleCards.js/battle.js参照）。ゆきおんな・水神等に乗せて壁にする。
        { def: ITEM_CATALOG.suijinNoTate, count: 3 }, // R 80G +10/+20 貫通、水属性限定で反射
        { def: ITEM_CATALOG.dimensionalSocket, count: 2 }, // S 60G 特殊能力を入れ替え
        { def: ITEM_CATALOG.twinHammer, count: 2 }, // S 65G +10/0 2回攻撃
        { def: ITEM_CATALOG.shinkenShirahadori, count: 1 }, // R 110G 相手のアイテムを奪う
        { def: ITEM_CATALOG.nankaNoOmamori, count: 1 }, // S 45G ダメージ1回無効化
        { def: ITEM_CATALOG.lifeJacket, count: 1 }, // S 35G 致死ダメージをHP1で耐える
        // 使って効果を発動した場合のみ手札に戻る＝実質ロスなしでATK+20/HP+10を
        // 使い回せる武器。ダイヤモンドの盾（後攻付与）より純粋な殴り合いに合う。
        { def: ITEM_CATALOG.fushichoNoKen, count: 1 }, // R 80G +20/+10 使用後手札に戻る
      ],
      spells: [
        // ファイヤーボールの15ダメージは、川田の侵略を止めてくる避雷針侍(HP15)と
        // くねくね(HP10)をどちらも1撃で落とせる。CPUの対象選択もこの2種を
        // 最優先で狙う（game.js `_cpuPickDamageTarget`）。
        { def: SPELL_CATALOG.fireball, count: 2 }, // N 40G 相手モンスター1体に15ダメージ
        { def: SPELL_CATALOG.backfire, count: 2 }, // S 50G 出目分後退させる
        // 放水: 敵地・空き地を水属性へ塗り替え、水神/混沌の頭の連鎖ボーナスを
        // 押し上げる。相手の連鎖破壊にも使える。
        { def: SPELL_CATALOG.waterRelease, count: 1 }, // S 150G 対象の土地を水属性に
        { def: SPELL_CATALOG.waterMagicCircle, count: 1 }, // S 60G デッキの水属性をランダム召喚
        { def: SPELL_CATALOG.divination, count: 1 }, // N 40G 指定種類をデッキからランダムに引く
        // 対象を1マス強制移動させる（移動先が相手土地なら強制戦闘）。CPUの
        // 使用判断はowner/同盟/勝率だけで決まる汎用ロジック(game.js
        // _cpuMaybeUsePsychokinesisSpell)なので、このデッキでも死に札にならない。
        { def: SPELL_CATALOG.psychokinesis, count: 1 }, // R 100G 配置モンスターを1マス強制移動
        // 社会不適合: ひなんじょの雷/無属性はkawadaマップ(無属性マス無し)では
        // ほぼ常に土地と属性が噛み合わないので刺さる。川田の水モンスターは
        // 自分の水土地にいる限り対象外。土地神の怒りと違い自分は巻き込まない。
        { def: SPELL_CATALOG.shakaiFutekigou, count: 1 }, // R 70G 属性違い2体を手札に戻す
        // クエから奪った切り札を川田が使う、という演出上の遊び枠。
        { def: SPELL_CATALOG.capitalismIncarnate, count: 1 }, // EX 30G 手札のモンスターを連続召喚
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
