// Read-only reference list of every known card definition (named + generic
// placeholders), for browsing (図鑑) and deck editing. Not deck instances -
// these carry no unique `id`/`catalogId` semantics of their own; the deck
// editor keys on `catalogId || name` (see main.js's cardKey).
import { buildCardPool } from './cards.js';
import { MONSTER_CATALOG, ITEM_CATALOG, SPELL_CATALOG } from './battleCards.js';

let cached = null;

export function getCardCatalog() {
  if (cached) return cached;
  // Default-size pool (24 monster / 8 gear / 8 spell, all 4 elements) as a
  // stand-in for the full ~20-per-element/30-item/40-spell catalog the real
  // content pass will eventually fill in.
  const generic = buildCardPool();
  cached = [...Object.values(MONSTER_CATALOG), ...Object.values(ITEM_CATALOG), ...Object.values(SPELL_CATALOG), ...generic];
  return cached;
}
