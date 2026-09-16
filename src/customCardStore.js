// カスタムカードの端末側キャッシュ（localStorage）だけを扱う最小モジュール。
//
// customCards.js はクラウド同期のため firebase/firestore を import する。
// 図鑑・デッキ編集が使う cardCatalog.js は「カスタムカードを読む」だけなのに
// その経路で Firebase SDK まで束ねられ、game.js（cardCatalog.js を import）を
// ヘッドレス環境（Cloudflare Worker / Node）で読み込めなかった。読み取りを
// ここへ分離し、customCards.js は同じ関数を re-export する（呼び出し元は不変）。
//
// ユーザーごとに独立したキーに保存する（以前はアカウント横断の共通キー
// 1本で、別アカウントでも同じカスタムカード一覧が見えてしまっていた）。
export const CUSTOM_CARD_STORAGE_KEY_PREFIX = 'chinuquest2_custom_cards_';

function storage() {
  // Worker / Node には localStorage が無い。カスタムカードは端末固有の
  // 情報なので、無ければ「0件」として扱えばよい。
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadCustomCards(userId) {
  if (!userId) return [];
  const store = storage();
  if (!store) return [];
  try {
    const value = JSON.parse(store.getItem(CUSTOM_CARD_STORAGE_KEY_PREFIX + userId) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveCustomCardsLocally(userId, cards) {
  const store = storage();
  if (!store || !userId) return;
  store.setItem(CUSTOM_CARD_STORAGE_KEY_PREFIX + userId, JSON.stringify(Array.isArray(cards) ? cards : []));
}
