export const CardType = {
  MONSTER: 'monster',
  GEAR: 'gear',
  SPELL: 'spell',
};

// 火は水に弱く森に強い／水は火に強く雷に弱い／雷は水に強く森に弱い／森は火に弱く雷に強い
// = weak-to cycle 火→水→雷→森→火 (see battleCards.js WEAK_AGAINST). NEUTRAL
// is shared by both lands (無色 - doesn't chain) and monsters (無属性 - no
// weakness/advantage either way, and no same-element land HP bonus).
export const Element = {
  FIRE: 'fire',
  WATER: 'water',
  THUNDER: 'thunder',
  FOREST: 'forest',
  NEUTRAL: 'neutral',
};

export const ELEMENT_LABEL = {
  [Element.FIRE]: '火',
  [Element.WATER]: '水',
  [Element.THUNDER]: '雷',
  [Element.FOREST]: '森',
  [Element.NEUTRAL]: '無色',
};

export const CARD_COLOR = {
  [Element.FIRE]: '#e6553a',
  [Element.WATER]: '#3a86e6',
  [Element.THUNDER]: '#f0b429',
  [Element.FOREST]: '#4caf6e',
  [Element.NEUTRAL]: '#b8b8b8',
  gear: '#9aa0a6',
  spell: '#8e5ce6',
};

// Monster cards roll these 4 elements by default, or NEUTRAL (無属性)
// explicitly, or a book-restricted subset for themed starter decks (see
// buildCardPool's `elements` option).
export const MONSTER_ELEMENTS = [Element.FIRE, Element.WATER, Element.THUNDER, Element.FOREST];

export const Rarity = { N: 'N', S: 'S', R: 'R', EX: 'EX' };

// EX never sells (null price) - it's the top tier, meant to stay collected.
export const RARITY_SELL_PRICE = {
  [Rarity.N]: 15,
  [Rarity.S]: 30,
  [Rarity.R]: 100,
  [Rarity.EX]: null,
};

export const RARITY_COLOR = {
  [Rarity.N]: '#9aa0a6',
  [Rarity.S]: '#3a9ee6',
  [Rarity.R]: '#c98be6',
  [Rarity.EX]: '#ffd166',
};

// Shown top-right on every card face. 怪獣=monster, 稲妻=spell, 剣=weapon/armor.
export const TYPE_ICON = {
  [CardType.MONSTER]: '👹',
  [CardType.SPELL]: '⚡',
  [CardType.GEAR]: '⚔️',
};

// 40-card book total. Real, named cards (see battleCards.js) take up some
// of each category's slots; the rest are generic placeholders with modest
// baseline stats so every monster in the deck is actually summonable.
const DEFAULT_MONSTER_COUNT = 24;
const DEFAULT_GEAR_COUNT = 8;
export const DEFAULT_SPELL_COUNT = 8;

let cardIdCounter = 0;
function nextId() {
  cardIdCounter += 1;
  return `card-${cardIdCounter}`;
}

/** `elements` restricts which elements generic monsters roll from - used both for the default full-catalog pool and for a themed 2-element starter book. */
export function buildCardPool({
  monsterCount = DEFAULT_MONSTER_COUNT,
  gearCount = DEFAULT_GEAR_COUNT,
  spellCount = DEFAULT_SPELL_COUNT,
  elements = MONSTER_ELEMENTS,
} = {}) {
  const cards = [];

  for (let i = 0; i < monsterCount; i++) {
    const element = elements[i % elements.length];
    const rank = Math.floor(i / elements.length) + 1;
    const rarity = rank >= 6 ? Rarity.R : rank >= 4 ? Rarity.S : Rarity.N;
    cards.push({
      id: nextId(),
      type: CardType.MONSTER,
      element,
      rarity,
      name: `${ELEMENT_LABEL[element]}のモンスター${rank}`,
      atk: 10 + rank * 3,
      hp: 15 + rank * 3,
      cost: 15 + rank * 5,
    });
  }

  for (let i = 1; i <= gearCount; i++) {
    const rarity = i >= 8 ? Rarity.R : i >= 5 ? Rarity.S : Rarity.N;
    cards.push({
      id: nextId(),
      type: CardType.GEAR,
      element: null,
      rarity,
      name: `武器防具${i}`,
      atkBonus: 5,
      hpBonus: 5,
      cost: 10,
    });
  }

  for (let i = 1; i <= spellCount; i++) {
    const rarity = i >= 8 ? Rarity.R : i >= 5 ? Rarity.S : Rarity.N;
    cards.push({ id: nextId(), type: CardType.SPELL, element: null, rarity, name: `スペル${i}` });
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
  /** `extraCards` are mixed in alongside the generic pool, trimming an equal number of generic slots per category so the total stays fixed. `elements` restricts the generic monster fill to a theme (e.g. a 2-element starter book). */
  constructor(extraCards = [], { elements } = {}) {
    const countOf = (type) => extraCards.filter((c) => c.type === type).length;
    const generic = buildCardPool({
      monsterCount: DEFAULT_MONSTER_COUNT - countOf(CardType.MONSTER),
      gearCount: DEFAULT_GEAR_COUNT - countOf(CardType.GEAR),
      spellCount: DEFAULT_SPELL_COUNT - countOf(CardType.SPELL),
      elements,
    });
    this.drawPile = shuffle([...generic, ...extraCards]);
    this.discardPile = [];
  }

  /** Builds a deck from an explicit, already-decided card list (e.g. a saved/edited 40-card book) - each card gets a fresh unique `id`, ignoring whatever `id` it may have carried in storage. */
  static fromCardList(defs) {
    const deck = Object.create(Deck.prototype);
    deck.drawPile = shuffle(defs.map((def) => ({ ...def, id: nextId() })));
    deck.discardPile = [];
    return deck;
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

  /** drawPile+discardPile（手札は含まない）をまとめて再シャッフルする。draw()が捨て札切れ時に自動でやる部分シャッフルと違い、いつでも呼べる（ほこらの「混沌を愛せ」効果専用）。 */
  resetShuffle() {
    this.drawPile = shuffle([...this.drawPile, ...this.discardPile]);
    this.discardPile = [];
  }
}
