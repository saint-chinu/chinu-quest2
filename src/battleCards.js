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
 * cards.js, these carry real stats and battle abilities. `id` doubles as
 * the ability lookup key in battle.js.
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
    // Not specified by design - estimated from salarymander's stat-total-
    // to-cost ratio (50/50). Flagged for confirmation.
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
