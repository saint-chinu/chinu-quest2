export const CardType = {
  MONSTER: 'monster',
  GEAR: 'gear',
  SPELL: 'spell',
};

export const Element = {
  FIRE: 'fire',
  WATER: 'water',
  WIND: 'wind',
  EARTH: 'earth',
  // Land-only - never assigned to a monster card (see buildCardPool, which
  // enumerates monster elements explicitly rather than via Object.values).
  NEUTRAL: 'neutral',
};

export const ELEMENT_LABEL = {
  [Element.FIRE]: '炎',
  [Element.WATER]: '水',
  [Element.WIND]: '風',
  [Element.EARTH]: '地',
  [Element.NEUTRAL]: '無色',
};

export const CARD_COLOR = {
  [Element.FIRE]: '#e6553a',
  [Element.WATER]: '#3a86e6',
  [Element.WIND]: '#4caf6e',
  [Element.EARTH]: '#c8963e',
  [Element.NEUTRAL]: '#b8b8b8',
  gear: '#9aa0a6',
  spell: '#8e5ce6',
};

// Monster cards only ever roll these 4 elements - NEUTRAL is land-only.
const MONSTER_ELEMENTS = [Element.FIRE, Element.WATER, Element.WIND, Element.EARTH];

// 40-card book total. Real, named cards (see battleCards.js) take up some
// of each category's slots; the rest are generic placeholders with modest
// baseline stats so every monster in the deck is actually summonable.
const DEFAULT_MONSTER_COUNT = 24;
const DEFAULT_GEAR_COUNT = 8;
const DEFAULT_SPELL_COUNT = 8;

let cardIdCounter = 0;
function nextId() {
  cardIdCounter += 1;
  return `card-${cardIdCounter}`;
}

function buildCardPool({
  monsterCount = DEFAULT_MONSTER_COUNT,
  gearCount = DEFAULT_GEAR_COUNT,
  spellCount = DEFAULT_SPELL_COUNT,
} = {}) {
  const cards = [];
  const elements = MONSTER_ELEMENTS;

  for (let i = 0; i < monsterCount; i++) {
    const element = elements[i % elements.length];
    const rank = Math.floor(i / elements.length) + 1;
    cards.push({
      id: nextId(),
      type: CardType.MONSTER,
      element,
      name: `${ELEMENT_LABEL[element]}のモンスター${rank}`,
      atk: 10 + rank * 3,
      hp: 15 + rank * 3,
      cost: 15 + rank * 5,
    });
  }

  for (let i = 1; i <= gearCount; i++) {
    cards.push({
      id: nextId(),
      type: CardType.GEAR,
      element: null,
      name: `武器防具${i}`,
      atkBonus: 5,
      hpBonus: 5,
      cost: 10,
    });
  }

  for (let i = 1; i <= spellCount; i++) {
    cards.push({ id: nextId(), type: CardType.SPELL, element: null, name: `スペル${i}` });
  }

  return cards;
}

function shuffle(cards) {
  const result = cards.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class Deck {
  /** `extraCards` are mixed in alongside the generic pool, trimming an equal number of generic slots per category so the total stays fixed. */
  constructor(extraCards = []) {
    const countOf = (type) => extraCards.filter((c) => c.type === type).length;
    const generic = buildCardPool({
      monsterCount: DEFAULT_MONSTER_COUNT - countOf(CardType.MONSTER),
      gearCount: DEFAULT_GEAR_COUNT - countOf(CardType.GEAR),
      spellCount: DEFAULT_SPELL_COUNT - countOf(CardType.SPELL),
    });
    this.drawPile = shuffle([...generic, ...extraCards]);
    this.discardPile = [];
  }

  /** Draws one card, reshuffling the discard pile back in once the draw pile runs out. */
  draw() {
    if (this.drawPile.length === 0) {
      if (this.discardPile.length === 0) return null;
      this.drawPile = shuffle(this.discardPile);
      this.discardPile = [];
    }
    return this.drawPile.pop();
  }

  discard(card) {
    this.discardPile.push(card);
  }
}
