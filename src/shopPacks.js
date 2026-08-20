import { CardType, Element, Rarity } from './cards.js';

export const PACKS = [
  { id: 'fire', name: '火パック', description: '火モンスター4枚', cost: 200, count: 4, type: CardType.MONSTER, element: Element.FIRE },
  { id: 'forest', name: '森パック', description: '森モンスター4枚', cost: 200, count: 4, type: CardType.MONSTER, element: Element.FOREST },
  { id: 'water', name: '水パック', description: '水モンスター4枚', cost: 200, count: 4, type: CardType.MONSTER, element: Element.WATER },
  { id: 'thunder', name: '雷パック', description: '雷モンスター4枚', cost: 200, count: 4, type: CardType.MONSTER, element: Element.THUNDER },
  { id: 'neutral', name: '無属性パック', description: '無属性モンスター4枚', cost: 200, count: 4, type: CardType.MONSTER, element: Element.NEUTRAL },
  { id: 'item', name: 'アイテムパック', description: '武器・防具4枚', cost: 200, count: 4, type: CardType.GEAR },
  { id: 'spell', name: 'スペルパック', description: 'スペル4枚', cost: 200, count: 4, type: CardType.SPELL },
];

// Rだけを従来の半分（10%→5%）に絞る。Sは25%のまま据え置きなので、
// 「S以上は出るがRは当たり」という体感になる。
const rollRarity = (random) => {
  const roll = random();
  if (roll < 0.05) return Rarity.R;
  if (roll < 0.30) return Rarity.S;
  return Rarity.N;
};

export function drawPack(pack, catalog, random = Math.random) {
  const eligible = catalog.filter((card) => card.type === pack.type && (pack.element == null || card.element === pack.element));
  const pools = Object.fromEntries([Rarity.N, Rarity.S, Rarity.R].map((rarity) => [rarity, eligible.filter((card) => card.rarity === rarity)]));
  for (const rarity of [Rarity.N, Rarity.S, Rarity.R]) {
    if (!pools[rarity].length) throw new Error(`${pack.name}に${rarity}カードが登録されていません`);
  }

  const rarities = [];
  let highCount = 0;
  for (let i = 0; i < pack.count; i++) {
    const rarity = highCount >= 3 ? Rarity.N : rollRarity(random);
    if (rarity !== Rarity.N) highCount += 1;
    rarities.push(rarity);
  }
  if (highCount === 0) rarities[rarities.length - 1] = random() < 0.15 ? Rarity.R : Rarity.S;

  return rarities.map((rarity) => ({ ...pools[rarity][Math.floor(random() * pools[rarity].length)] }));
}
