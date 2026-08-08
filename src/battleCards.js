import { CardType, Element } from './cards.js';

// Elemental weakness cycle: each element takes bonus damage from the next
// one. 火→水→地→風→火 (fire is weak to water, water to earth, earth to
// wind, wind to fire). First-pass design choice, easy to revisit.
export const WEAK_AGAINST = {
  [Element.FIRE]: Element.WATER,
  [Element.WATER]: Element.EARTH,
  [Element.EARTH]: Element.WIND,
  [Element.WIND]: Element.FIRE,
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
    atk: 30,
    hp: 20,
    cost: 50,
  },
  minatoJoshi: {
    id: 'minatoJoshi',
    type: CardType.MONSTER,
    name: '港区女子',
    element: Element.WATER,
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
    cost: 5,
    atkBonus: 10,
    hpBonus: 0,
  },
  potLid: {
    id: 'potLid',
    type: CardType.GEAR,
    itemType: ItemType.ARMOR,
    name: 'なべのふた',
    cost: 5,
    atkBonus: 0,
    hpBonus: 10,
  },
};

export const SPELL_CATALOG = {
  manjaro: {
    id: 'manjaro',
    type: CardType.SPELL,
    name: 'マ〇ジャロ',
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
 * The two character-creation starter decks - same battle mechanics
 * (WEAK_AGAINST cycle etc.) but a different named-card lean, since the
 * catalog only has two named monsters so far. `salarymander` is the
 * fire-aggro pick (weapon-backed), `minatoJoshi` is the water-defensive
 * pick (armor-backed). Both still mix in SPELL_CATALOG.manjaro.
 */
export const STARTER_DECKS = {
  salarymander: { id: 'salarymander', name: 'サラリーマンダー編成（炎・攻撃寄り）' },
  minatoJoshi: { id: 'minatoJoshi', name: '港区女子編成（水・防御寄り）' },
};

/** The real cards to mix into a player's starting book, 2 copies each. `variant` picks which of STARTER_DECKS to lean on; defaults to the fire deck. */
export function buildStarterExtraCards(variant = 'salarymander') {
  const monster = variant === 'minatoJoshi' ? MONSTER_CATALOG.minatoJoshi : MONSTER_CATALOG.salarymander;
  const item = variant === 'minatoJoshi' ? ITEM_CATALOG.potLid : ITEM_CATALOG.knife;
  return [
    ...duplicateForDeck(monster, 4),
    ...duplicateForDeck(item, 4),
    ...duplicateForDeck(SPELL_CATALOG.manjaro, 2),
  ];
}

/** The stable catalog key for ability/effect lookups, for both raw catalog defs and deck copies. */
export function catalogIdOf(def) {
  return def.catalogId || def.id;
}
