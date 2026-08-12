import test from 'node:test';
import assert from 'node:assert/strict';
import {
  drawBreedPartPack,
  BREED_PART_PACK,
  BREED_MAX_EQUIPPED_PARTS,
  canEquipPart,
} from '../src/breedParts.js';

function sequenceRandom(values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

test('ブリードパーツパックは3個で、全N抽選時に最後をSへ差し替える', () => {
  const parts = drawBreedPartPack(sequenceRandom([0.9, 0.9, 0.9, 0, 0, 0]));
  assert.equal(parts.length, BREED_PART_PACK.count);
  assert.deepEqual(parts.map((part) => part.rarity), ['N', 'N', 'S']);
});

test('通常抽選のR・S・Nをそのまま維持する', () => {
  const parts = drawBreedPartPack(sequenceRandom([0.05, 0.2, 0.9, 0, 0, 0]));
  assert.deepEqual(parts.map((part) => part.rarity), ['R', 'S', 'N']);
});

test('ブリードパーツは種類にかかわらず重複込みで合計8個まで装着できる', () => {
  const part = { id: 'test-part' };
  const sevenEquipped = { equippedPartIds: Array(7).fill(part.id) };
  assert.equal(canEquipPart(sevenEquipped, part).ok, true);

  const eightEquipped = { equippedPartIds: Array(BREED_MAX_EQUIPPED_PARTS).fill(part.id) };
  const result = canEquipPart(eightEquipped, part);
  assert.equal(result.ok, false);
  assert.match(result.error, /合計8個まで/);
});
