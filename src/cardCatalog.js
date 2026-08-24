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
    ...Object.values(MONSTER_CATALOG).filter((card) => !card.npcExclusive && !card.wip),
    ...Object.values(ITEM_CATALOG),
    ...Object.values(SPELL_CATALOG),
  ];
  return [...cached, ...loadCustomCards(userId)];
}

/** 旧版が自動生成していた仮カード名。既存セーブから安全に取り除く移行処理で使う。 */
export function isLegacyPlaceholderCardName(name) {
  return /^(?:(?:火|水|雷|森|無色)のモンスター\d+|武器防具\d+|スペル\d+)$/.test(name || '');
}

/**
 * 制作中で未公開のカード名一覧（カード定義のwipフラグ）。
 * パック・デッキ編集・図鑑からは外れているが、CPUのキャラ専用デッキは
 * MONSTER_CATALOGを直接見るのでそのまま使える。
 * 既に配布してしまった分は、main.jsのensureBreedFieldsが
 * character.wipCardHoldingsへ枚数を記録したうえで手元から外す
 * （完成して公開する時に、この記録を見て配り直す）。
 */
export const WIP_CARD_NAMES = Object.values(MONSTER_CATALOG)
  .filter((card) => card.wip)
  .map((card) => card.name);

/**
 * 現在配布されている（wipでもNPC専用でもない）正規カード名の集合。
 * wipCardHoldingsへ退避した枚数を配り直してよいかの判定に使う
 * （main.jsのapplyWipRollback ③）。ここに無い名前は「まだ未公開」か
 * 「改名・廃止されて今のカタログに存在しない」のどちらかで、前者は
 * WIP_CARD_NAMESで先に弾かれるので、残りは配り直しようがない。
 */
export const RELEASED_CARD_NAMES = new Set([
  ...Object.values(MONSTER_CATALOG).filter((card) => !card.wip && !card.npcExclusive).map((card) => card.name),
  ...Object.values(ITEM_CATALOG).map((card) => card.name),
  ...Object.values(SPELL_CATALOG).map((card) => card.name),
]);

/**
 * wipCardHoldingsへ退避してある枚数のうち、公開済みになったカードを
 * ownedCardsへ戻す（main.jsのapplyWipRollback ③の本体）。
 *
 * ・戻し方は退避時と同じ「最大値」。ログインのたびに走るので、加算に
 *   すると再ログインで際限なく増える。
 * ・改名・廃止で今のカタログに無い名前は戻す先が無いため、記録だけ捨てる。
 * ・まだwipのカードは触らない（退避したまま次の公開を待つ）。
 *
 * DOMに触らない純粋な関数として切り出してある。この経路は1アカウントに
 * つき一度きり・無言で走るので、壊れると「カードが消えた」「増えた」に
 * 直結する。tests/newCards.test.mjsで検証すること。
 * 変更があればtrueを返す。
 */
export function reclaimReleasedWipHoldings(character) {
  const holdings = character?.wipCardHoldings;
  if (!holdings) return false;
  const stillWip = new Set(WIP_CARD_NAMES);
  let changed = false;
  for (const [name, count] of Object.entries(holdings)) {
    if (stillWip.has(name)) continue;
    delete holdings[name];
    changed = true;
    if (!RELEASED_CARD_NAMES.has(name)) continue;
    character.ownedCards = character.ownedCards || {};
    character.ownedCards[name] = Math.max(character.ownedCards[name] || 0, count);
  }
  if (Object.keys(holdings).length === 0) delete character.wipCardHoldings;
  return changed;
}
