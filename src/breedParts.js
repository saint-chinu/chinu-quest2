import { Element, ELEMENT_LABEL } from './cards.js';

// ブリードモンスターの初期ステータス。名前だけがブリード画面で変更可能
// (属性/ATK/HP/コストはパーツ装着でのみ変化する)。
export const BREED_BASE = {
  defaultName: 'ブリモン',
  element: Element.NEUTRAL,
  atk: 15,
  hp: 15,
  cost: 30,
};

// パーツ装着の上限（それぞれ独立に判定 - どれか1つが上限に達しても、他の
// ステータスがまだ上限未満なら、そちらを動かすパーツは引き続き装着できる）。
export const BREED_CAPS = { atk: 70, hp: 70, cost: 200 };

/**
 * 初期実装パーツ（先行実装カード同様、少数の手作りデータ）。`price` は
 * ショップでの購入コスト（M）、`atkDelta`/`hpDelta`/`costDelta` はブリード
 * モンスターの召喚コスト(G)を含む各ステータスへの加算（減算パーツは負値）。
 * `element` を持つパーツは装着すると属性がそれに上書きされる。
 */
export const BREED_PARTS = [
  { id: 'part-fang', name: '鋭い牙', price: 40, atkDelta: 15, hpDelta: 0, costDelta: 10 },
  { id: 'part-shell', name: '硬い甲羅', price: 40, atkDelta: 0, hpDelta: 20, costDelta: 10 },
  { id: 'part-light-frame', name: '軽量化フレーム', price: 60, atkDelta: -5, hpDelta: -5, costDelta: -15 },
  { id: 'part-fire-core', name: '火のコア', price: 50, atkDelta: 10, hpDelta: 0, costDelta: 10, element: Element.FIRE },
  { id: 'part-water-core', name: '水のコア', price: 50, atkDelta: 0, hpDelta: 10, costDelta: 10, element: Element.WATER },
  { id: 'part-amplifier', name: '暴走増幅器', price: 70, atkDelta: 25, hpDelta: -10, costDelta: 20 },
];

export function findBreedPart(id) {
  return BREED_PARTS.find((p) => p.id === id) || null;
}

/** Current computed stats: base + every currently-equipped part's deltas (later element-setting parts simply overwrite earlier ones, in equip order). */
export function computeBreedStats(breedMonster) {
  const stats = { atk: BREED_BASE.atk, hp: BREED_BASE.hp, cost: BREED_BASE.cost, element: BREED_BASE.element };
  for (const partId of breedMonster.equippedPartIds || []) {
    const part = findBreedPart(partId);
    if (!part) continue;
    stats.atk += part.atkDelta || 0;
    stats.hp += part.hpDelta || 0;
    stats.cost += part.costDelta || 0;
    if (part.element) stats.element = part.element;
  }
  return stats;
}

/**
 * Whether `part` can be equipped on top of `breedMonster`'s current build.
 * Each of the 3 caps (ATK/HP/コスト) is checked independently - see
 * BREED_CAPS's doc comment. Also rejects any part that would drop HP or ATK
 * to 0 or below (無効なステータス), or cost below 0.
 */
export function canEquipPart(breedMonster, part) {
  const current = computeBreedStats(breedMonster);
  const nextAtk = current.atk + (part.atkDelta || 0);
  const nextHp = current.hp + (part.hpDelta || 0);
  const nextCost = current.cost + (part.costDelta || 0);

  if (nextHp <= 0) return { ok: false, error: 'HPが0以下になるため装着できません' };
  if (nextAtk <= 0) return { ok: false, error: 'ATKが0以下になるため装着できません' };
  if (nextCost < 0) return { ok: false, error: 'コストが0未満になるため装着できません' };
  if (nextAtk > BREED_CAPS.atk) return { ok: false, error: `ATKが上限(${BREED_CAPS.atk})を超えるため装着できません` };
  if (nextHp > BREED_CAPS.hp) return { ok: false, error: `HPが上限(${BREED_CAPS.hp})を超えるため装着できません` };
  if (nextCost > BREED_CAPS.cost) return { ok: false, error: `コストが上限(${BREED_CAPS.cost})を超えるため装着できません` };
  return { ok: true };
}

export function describeBreedPart(part) {
  const bits = [];
  if (part.atkDelta) bits.push(`ATK${part.atkDelta > 0 ? '+' : ''}${part.atkDelta}`);
  if (part.hpDelta) bits.push(`HP${part.hpDelta > 0 ? '+' : ''}${part.hpDelta}`);
  if (part.costDelta) bits.push(`コスト${part.costDelta > 0 ? '+' : ''}${part.costDelta}`);
  if (part.element) bits.push(`属性→${ELEMENT_LABEL[part.element]}`);
  return bits.join(' / ');
}
