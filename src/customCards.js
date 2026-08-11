import { CardType, Element, Rarity } from './cards.js';

// ユーザーごとに独立したキーに保存する（以前はアカウント横断の共通キー
// 1本で、別アカウントでも同じカスタムカード一覧が見えてしまっていた）。
const STORAGE_KEY_PREFIX = 'chinuquest2_custom_cards_';

export const CARD_EFFECTS = [
  { id: 'firstStrike', label: '先制', types: [CardType.MONSTER, CardType.GEAR, CardType.SPELL] },
  { id: 'halfDamage', label: '被ダメージ半減', types: [CardType.MONSTER, CardType.GEAR, CardType.SPELL] },
  { id: 'pierce', label: '貫通', types: [CardType.MONSTER, CardType.GEAR, CardType.SPELL] },
  { id: 'phoenix', label: '不死鳥', types: [CardType.MONSTER, CardType.GEAR, CardType.SPELL] },
  { id: 'robber', label: '強盗', types: [CardType.MONSTER, CardType.GEAR, CardType.SPELL] },
];

export function loadCustomCards(userId) {
  if (!userId) return [];
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFIX + userId) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

let bulkSlugCounter = 0;

/** Builds one custom-card record from a validated `input` (same shape saveCustomCard/saveCustomCardsBulk take) - no storage side effect. */
function buildCustomCard(input) {
  bulkSlugCounter += 1;
  const slug = `${Date.now()}-${bulkSlugCounter}-${Math.random().toString(36).slice(2, 8)}`;
  const card = {
    id: `custom-${slug}`,
    catalogId: `custom-${slug}`,
    custom: true,
    name: input.name.trim(),
    type: input.type,
    rarity: input.rarity,
    element: input.type === CardType.MONSTER ? input.element : null,
    cost: Number(input.cost) || 0,
    imageDataUrl: input.imageDataUrl || '',
    traits: input.traits || [],
    effectDescription: input.effectDescription?.trim() || '',
  };
  if (input.type === CardType.MONSTER) {
    card.atk = Number(input.atk) || 0;
    card.hp = Number(input.hp) || 0;
  } else if (input.type === CardType.GEAR) {
    card.atkBonus = Number(input.atk) || 0;
    card.hpBonus = Number(input.hp) || 0;
  } else {
    card.addedAtk = 0;
    card.addedHp = 0;
    card.permanent = true;
  }
  return card;
}

export function saveCustomCard(userId, input) {
  const cards = loadCustomCards(userId);
  const card = buildCustomCard(input);
  cards.push(card);
  localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(cards));
  return card;
}

/** CSV一括登録用: 検証済みのinput配列をまとめて1回のlocalStorage書き込みで保存する（1件ずつsaveCustomCardを呼ぶと件数分の書き込みが発生するため）。 */
export function saveCustomCardsBulk(userId, inputs) {
  const cards = loadCustomCards(userId);
  const saved = inputs.map((input) => buildCustomCard(input));
  cards.push(...saved);
  localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(cards));
  return saved;
}

export function validateCustomCard(userId, input) {
  if (!input.name.trim()) return 'カード名を入力してください';
  if (!Object.values(CardType).includes(input.type)) return '種類を選択してください';
  if (!Object.values(Rarity).includes(input.rarity)) return 'レアリティを選択してください';
  if (input.type === CardType.MONSTER && !Object.values(Element).includes(input.element)) return '属性を選択してください';
  if (input.cost === '' || Number(input.cost) < 0) return 'コストを0以上で入力してください';
  // モンスターは生存に正のHPが要る（0以下は存在できない）が、アイテムの
  // ATK/HP加算値は0が正常値（既存の「ナイフ」ATK+10/HP+0、「なべのふた」
  // ATK+0/HP+10と同じ形）なので、モンスターだけHP>=1を要求する。
  if (input.type === CardType.MONSTER && (Number(input.atk) < 0 || Number(input.hp) <= 0)) {
    return 'ATKは0以上、HPは1以上で入力してください';
  }
  if (input.type === CardType.GEAR && (Number(input.atk) < 0 || Number(input.hp) < 0)) {
    return 'ATK・HPは0以上で入力してください';
  }
  if (loadCustomCards(userId).some((card) => card.name === input.name.trim())) return '同じ名前のカードが既にあります';
  return null;
}
