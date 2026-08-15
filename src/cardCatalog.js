// Read-only reference list of every正式カード definition, for browsing
// (図鑑) and deck editing. Not deck instances -
// these carry no unique `id`/`catalogId` semantics of their own; the deck
// editor keys on `catalogId || name` (see main.js's cardKey).
import { MONSTER_CATALOG, ITEM_CATALOG, SPELL_CATALOG } from './battleCards.js';
import { loadCustomCards } from './customCards.js';

let cached = null;

/**
 * `userId`'s custom cards are merged in fresh on every call (never part of the
 * static cache below), since they're per-account, not global - see customCards.js.
 * MONSTER_CATALOG already spreads in NEUTRAL_MONSTER_CATALOG (see
 * battleCards.js), so it is NOT listed separately here - doing so used to
 * duplicate every neutral monster in the deck editor's card list.
 */
export function getCardCatalog(userId) {
  if (cached) return [...cached, ...loadCustomCards(userId)];
  cached = [
    ...Object.values(MONSTER_CATALOG),
    ...Object.values(ITEM_CATALOG),
    ...Object.values(SPELL_CATALOG),
  ];
  return [...cached, ...loadCustomCards(userId)];
}

/** 旧版が自動生成していた仮カード名。既存セーブから安全に取り除く移行処理で使う。 */
export function isLegacyPlaceholderCardName(name) {
  return /^(?:(?:火|水|雷|森|無色)のモンスター\d+|武器防具\d+|スペル\d+)$/.test(name || '');
}
