// Read-only reference list of every known card definition (named + generic
// placeholders), for browsing (図鑑) and deck editing. Not deck instances -
// these carry no unique `id`/`catalogId` semantics of their own; the deck
// editor keys on `catalogId || name` (see main.js's cardKey).
import { buildCardPool, Element } from './cards.js';
import { MONSTER_CATALOG, ITEM_CATALOG, SPELL_CATALOG } from './battleCards.js';
import { loadCustomCards } from './customCards.js';

let cached = null;

/** `userId`'s custom cards are merged in fresh on every call (never part of the static cache below), since they're per-account, not global - see customCards.js. */
export function getCardCatalog(userId) {
  if (cached) return [...cached, ...loadCustomCards(userId)];
  // Default-size pool (24 monster / 8 gear / 8 spell, all 4 elements) as a
  // stand-in for the full ~20-per-element/30-item/40-spell catalog the real
  // content pass will eventually fill in.
  const generic = buildCardPool();
  const neutralMonsters = buildCardPool({ monsterCount: 6, gearCount: 0, spellCount: 0, elements: [Element.NEUTRAL] });
  cached = [...Object.values(MONSTER_CATALOG), ...Object.values(ITEM_CATALOG), ...Object.values(SPELL_CATALOG), ...generic, ...neutralMonsters];
  return [...cached, ...loadCustomCards(userId)];
}
