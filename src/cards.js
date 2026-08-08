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
};

export const ELEMENT_LABEL = {
  [Element.FIRE]: '炎',
  [Element.WATER]: '水',
  [Element.WIND]: '風',
  [Element.EARTH]: '地',
};

export const CARD_COLOR = {
  [Element.FIRE]: '#e6553a',
  [Element.WATER]: '#3a86e6',
  [Element.WIND]: '#4caf6e',
  [Element.EARTH]: '#c8963e',
  gear: '#9aa0a6',
  spell: '#8e5ce6',
};

// 40-card book: 6 monsters per element (24) + 8 gear + 8 spells.
const MONSTERS_PER_ELEMENT = 6;
const GEAR_COUNT = 8;
const SPELL_COUNT = 8;

let cardIdCounter = 0;
function nextId() {
  cardIdCounter += 1;
  return `card-${cardIdCounter}`;
}

function buildCardPool() {
  const cards = [];

  for (const element of Object.values(Element)) {
    for (let i = 1; i <= MONSTERS_PER_ELEMENT; i++) {
      cards.push({
        id: nextId(),
        type: CardType.MONSTER,
        element,
        name: `${ELEMENT_LABEL[element]}のモンスター${i}`,
      });
    }
  }

  for (let i = 1; i <= GEAR_COUNT; i++) {
    cards.push({ id: nextId(), type: CardType.GEAR, element: null, name: `武器防具${i}` });
  }

  for (let i = 1; i <= SPELL_COUNT; i++) {
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
  constructor() {
    this.drawPile = shuffle(buildCardPool());
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
