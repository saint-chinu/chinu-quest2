import { CardType, Element, Rarity, Deck } from './cards.js';
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
  nyoBou: item('nyoBou', 'にょ〇棒', Rarity.N, ItemType.WEAPON, 30, 15, 15),
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
    effect: { type: 'atkFromLastDiceRoll', multiplier: 11 },
    effectDescription: 'ATK+前回移動したサイコロの目×11',
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
    traits: ['lastStrike'],
    effect: { type: 'instantKillOnHit', chance: 0.5 },
    effectDescription: '後攻。攻撃成功時50%で相手を即死させる',
  }),

  // ストーリー③クリア報酬（紫の魔女ホフクからのお礼）。story.jsのSTORY_STAGES[2].rewardから参照。
  peeStaff: item('peeStaff', 'ペーの杖', Rarity.EX, ItemType.WEAPON, 20, 25, 10, {
    traits: ['firstStrike'],
    atkBonusRange: [25, 50],
    effectDescription: '先制。ATKボーナスは装備するたびに25〜50でランダムに決まる',
  }),
};

export const SPELL_CATALOG = {
  manjaro: {
    id: 'manjaro',
    type: CardType.SPELL,
    name: 'マ〇ジャロ',
    rarity: Rarity.S,
    target: 'monster',
    permanent: true, // a "curse" - stays until the monster it's on dies
    addedAtk: 10,
    addedHp: 20,
  },
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

/** The named cards to mix into a starter book, 4 copies of the monster/item and 2 of the shared spell. `bookId` picks which of STARTER_DECKS; defaults to the fire/forest book. */
export function buildStarterExtraCards(bookId = 'fireForest') {
  const book = STARTER_DECKS[bookId] || STARTER_DECKS.fireForest;
  return [
    ...duplicateForDeck(book.featuredMonster, 4),
    ...duplicateForDeck(book.featuredItem, 4),
    ...duplicateForDeck(SPELL_CATALOG.manjaro, 2),
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
    ...duplicateForDeck(SPELL_CATALOG.manjaro, 2),
  ];
  return new Deck(extra, { elements }).drawPile;
}

/** The stable catalog key for ability/effect lookups, for both raw catalog defs and deck copies. */
export function catalogIdOf(def) {
  return def.catalogId || def.id;
}
