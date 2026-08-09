import { CardType, Element, Rarity, Deck } from './cards.js';

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
  salarymander: {
    id: 'salarymander',
    type: CardType.MONSTER,
    name: 'サラリーマンダー',
    element: Element.FIRE,
    rarity: Rarity.R,
    atk: 30,
    hp: 20,
    cost: 50,
  },
  minatoJoshi: {
    id: 'minatoJoshi',
    type: CardType.MONSTER,
    name: '港区女子',
    element: Element.WATER,
    rarity: Rarity.R,
    atk: 15,
    hp: 30,
    cost: 45,
  },
};

export const ITEM_CATALOG = {
  knife: {
    id: 'knife',
    type: CardType.GEAR,
    itemType: ItemType.WEAPON,
    name: 'ナイフ',
    rarity: Rarity.N,
    cost: 5,
    atkBonus: 10,
    hpBonus: 0,
  },
  potLid: {
    id: 'potLid',
    type: CardType.GEAR,
    itemType: ItemType.ARMOR,
    name: 'なべのふた',
    rarity: Rarity.N,
    cost: 5,
    atkBonus: 0,
    hpBonus: 10,
  },
  // ストーリー③クリア報酬（ぶどうからのお礼）。story.jsのSTORY_STAGES[2].rewardから参照。
  peeStaff: {
    id: 'peeStaff',
    type: CardType.GEAR,
    itemType: ItemType.WEAPON,
    name: 'ペーの杖',
    rarity: Rarity.EX,
    cost: 20,
    atkBonus: 25,
    hpBonus: 10,
    traits: ['firstStrike'],
  },
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

/** The stable catalog key for ability/effect lookups, for both raw catalog defs and deck copies. */
export function catalogIdOf(def) {
  return def.catalogId || def.id;
}
