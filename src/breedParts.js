import { CardType, Element, ELEMENT_LABEL, Rarity } from './cards.js';

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

export const CHANGEABLE_BREED_ELEMENTS = [Element.FIRE, Element.WATER, Element.THUNDER, Element.FOREST];

export const TRAIT_LABEL = {
  firstStrike: '先制',
  halfDamage: '被ダメージ半減',
  pierce: '貫通',
  phoenix: '不死鳥',
  robber: '強盗',
};

/**
 * 初期実装パーツ。`atkDelta`/`hpDelta`/`costDelta` はブリードモンスターの
 * ステータス（召喚コストはG）への加算（減算パーツは負値）。`element` を
 * 持つパーツは装着すると属性がそれに上書きされる。`chooseElement` は
 * 「属性パッチ」専用 - 装着時に無色を除く4属性から選ぶ（固定ではない）。
 * `trait` は戦闘中の特殊効果キー（battle.js/game.jsが参照、下記参照）。
 * `price` はショップでの購入M（レアリティ帯ごとの目安: N=40 / S=60 / R=90）。
 */
export const BREED_PARTS = [
  { id: 'part-element-patch', name: '属性パッチ', rarity: Rarity.S, costDelta: 30, chooseElement: true, price: 60 },
  { id: 'part-atk-up', name: 'ATKアップ', rarity: Rarity.N, atkDelta: 10, costDelta: 20, price: 40 },
  { id: 'part-hp-up', name: 'HPアップ', rarity: Rarity.N, hpDelta: 10, costDelta: 20, price: 40 },
  { id: 'part-double-up', name: 'ダブルアップ', rarity: Rarity.R, atkDelta: 10, hpDelta: 10, costDelta: 35, price: 90 },
  { id: 'part-atk-focus', name: '攻撃特化', rarity: Rarity.N, atkDelta: 20, hpDelta: -10, costDelta: 20, price: 40 },
  { id: 'part-hp-focus', name: '防御特化', rarity: Rarity.N, atkDelta: -10, hpDelta: 20, costDelta: 20, price: 40 },
  { id: 'part-first-strike', name: '先制付与', rarity: Rarity.S, costDelta: 30, trait: 'firstStrike', price: 60 },
  { id: 'part-half-damage', name: '被ダメージ半減', rarity: Rarity.R, costDelta: 60, trait: 'halfDamage', price: 90 },
  { id: 'part-pierce', name: '貫通', rarity: Rarity.R, costDelta: 70, trait: 'pierce', price: 90 },
  { id: 'part-phoenix', name: '不死鳥', rarity: Rarity.S, costDelta: 40, trait: 'phoenix', price: 60 },
  { id: 'part-robber', name: '強盗', rarity: Rarity.S, costDelta: 30, trait: 'robber', price: 60 },
];

export const BREED_PART_PACK = { cost: 150, count: 3 };

const rollBreedPartRarity = (random) => {
  const roll = random();
  if (roll < 0.10) return Rarity.R;
  if (roll < 0.35) return Rarity.S;
  return Rarity.N;
};

/** 1回3個。各枠N65%/S25%/R10%、全てNなら最後の1個をSにして最低保証。 */
export function drawBreedPartPack(random = Math.random) {
  const pools = Object.fromEntries(
    [Rarity.N, Rarity.S, Rarity.R].map((rarity) => [rarity, BREED_PARTS.filter((part) => part.rarity === rarity)])
  );
  for (const rarity of [Rarity.N, Rarity.S, Rarity.R]) {
    if (!pools[rarity].length) throw new Error(`ブリードパーツに${rarity}が登録されていません`);
  }
  const rarities = Array.from({ length: BREED_PART_PACK.count }, () => rollBreedPartRarity(random));
  if (rarities.every((rarity) => rarity === Rarity.N)) rarities[rarities.length - 1] = Rarity.S;
  return rarities.map((rarity) => ({ ...pools[rarity][Math.floor(random() * pools[rarity].length)] }));
}

export function findBreedPart(id) {
  return BREED_PARTS.find((p) => p.id === id) || null;
}

/**
 * Current computed stats + traits: base + every currently-equipped part's
 * deltas. `breedMonster.elementPatchChoice` supplies 属性パッチ's element
 * (chosen at equip time - see main.js's equip flow) since that part itself
 * carries no fixed `element`.
 */
export function computeBreedStats(breedMonster) {
  const stats = { atk: BREED_BASE.atk, hp: BREED_BASE.hp, cost: BREED_BASE.cost, element: BREED_BASE.element, traits: [] };
  for (const partId of breedMonster.equippedPartIds || []) {
    const part = findBreedPart(partId);
    if (!part) continue;
    stats.atk += part.atkDelta || 0;
    stats.hp += part.hpDelta || 0;
    stats.cost += part.costDelta || 0;
    if (part.chooseElement) {
      if (breedMonster.elementPatchChoice) stats.element = breedMonster.elementPatchChoice;
    } else if (part.element) {
      stats.element = part.element;
    }
    if (part.trait) stats.traits.push(part.trait);
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
  if (part.chooseElement) bits.push('属性を選択して上書き');
  if (part.element) bits.push(`属性→${ELEMENT_LABEL[part.element]}`);
  if (part.trait) bits.push(`特殊効果: ${TRAIT_LABEL[part.trait]}`);
  return bits.join(' / ');
}

// 質素な絵合わせアイコン（剣=ATK、盾=HP、金貨=コスト、パレット=属性、
// 特殊効果ごとに1文字絵文字）。パーツ一覧を数値バッジとして表示するのに使う。
const STAT_ICON = { atk: '⚔️', hp: '🛡️', cost: '💰' };
const TRAIT_ICON = { firstStrike: '⚡', halfDamage: '💠', pierce: '🏹', phoenix: '🔥', robber: '🥷' };

/** {icon, text} badges for one part - e.g. ATKアップ → [{icon:'⚔️', text:'+10'}, {icon:'💰', text:'+20G'}]. */
export function breedPartBadges(part) {
  const badges = [];
  if (part.atkDelta) badges.push({ icon: STAT_ICON.atk, text: `${part.atkDelta > 0 ? '+' : ''}${part.atkDelta}` });
  if (part.hpDelta) badges.push({ icon: STAT_ICON.hp, text: `${part.hpDelta > 0 ? '+' : ''}${part.hpDelta}` });
  if (part.costDelta) badges.push({ icon: STAT_ICON.cost, text: `${part.costDelta > 0 ? '+' : ''}${part.costDelta}G` });
  if (part.chooseElement) badges.push({ icon: '🎨', text: '属性選択' });
  if (part.trait) badges.push({ icon: TRAIT_ICON[part.trait] || '✨', text: TRAIT_LABEL[part.trait] });
  return badges;
}

/**
 * The breed monster as a real, playable Rarity.EX monster card - live
 * stats/traits computed from whatever's currently equipped. `catalogId`
 * stays 'breedMonster' regardless of the player's chosen name, so deck
 * tracking survives renames (see main.js's cardKey).
 */
export function buildBreedCardDef(character) {
  const stats = computeBreedStats(character.breedMonster);
  return {
    id: 'breedMonster',
    catalogId: 'breedMonster',
    type: CardType.MONSTER,
    name: character.breedMonster.name,
    element: stats.element,
    rarity: Rarity.EX,
    atk: stats.atk,
    hp: stats.hp,
    cost: stats.cost,
    traits: stats.traits,
    imageDataUrl: character.breedMonster.imageDataUrl || '',
  };
}
