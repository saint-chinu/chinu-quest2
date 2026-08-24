// 周回成長型モンスター（火・水・森）のカード定義と覚醒能力の回帰テスト。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { MONSTER_CATALOG } = await vite.ssrLoadModule('/src/battleCards.js');
const { Game } = await vite.ssrLoadModule('/src/game.js');
const battle = await vite.ssrLoadModule('/src/battle.js');
test.after(() => vite.close());

const unit = (def, ownerId) => battle.createFieldUnit(def, ownerId);

function growthStub(def) {
  const player = { id: 'owner', name: '育成者', allianceId: null };
  const tile = {
    id: 0,
    owner: player.id,
    unit: unit(def, player.id),
    position: { x: 0, z: 0 },
    neighbors: [],
  };
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    players: [player],
    tiles: [tile],
    _isCancelled: false,
    _ownedTiles: () => [tile],
    _notifyState: () => {},
    onLog: () => {},
    onUnitGrowth: async () => {},
  });
  return { game, player, tile, fieldUnit: tile.unit };
}

test('仮カード3枚は正式なS・40G成長型へ置き換わっている', () => {
  assert.equal(MONSTER_CATALOG.hyouketsuDock, undefined);
  assert.equal(MONSTER_CATALOG.youkouro, undefined);
  assert.equal(MONSTER_CATALOG.taijuNoToride, undefined);

  const expected = [
    ['islandWhale', 'アイランドホエール', 'water', 40, 25],
    ['lavaDragon', '溶岩竜', 'fire', 35, 30],
    ['kyochinhei', '巨珍兵', 'forest', 55, 10],
  ];
  for (const [id, name, element, hp, atk] of expected) {
    const card = MONSTER_CATALOG[id];
    assert.ok(card, `${id}がカタログにない`);
    assert.equal(card.name, name);
    assert.equal(card.element, element);
    assert.equal(card.rarity, 'S');
    assert.equal(card.cost, 40);
    assert.equal(card.hp, hp);
    assert.equal(card.atk, atk);
    assert.ok(card.traits.includes('immovableByMoveCommand'));
    assert.ok(card.traits.includes('emptyTileOnly'));
    assert.equal(card.wip, undefined);
    assert.match(card.imageDataUrl, new RegExp(`${id}\\.png$`));
  }
});

test('アイランドホエールは3周で65/40・先制・貫通不可の1/2無効化になる', async () => {
  const { game, player, fieldUnit } = growthStub(MONSTER_CATALOG.islandWhale);
  await game._growLapUnitsOnLap(player);
  assert.deepEqual(game._baseStats(fieldUnit), { hp: 45, atk: 35 });
  await game._growLapUnitsOnLap(player);
  assert.deepEqual(game._baseStats(fieldUnit), { hp: 55, atk: 40 });
  assert.ok(fieldUnit.awakenedTraits.includes('firstStrike'));
  await game._growLapUnitsOnLap(player);
  assert.deepEqual(game._baseStats(fieldUnit), { hp: 65, atk: 40 });
  assert.ok(fieldUnit.awakenedTraits.includes('unpierceableChanceNegate'));

  const attacker = unit({ id: 'piercer', name: '貫通役', element: 'fire', rarity: 'N', hp: 100, atk: 50, traits: ['pierce'] }, 'enemy');
  const originalRandom = Math.random;
  Math.random = () => 0.1;
  try {
    const before = fieldUnit.currentHp;
    const result = battle.resolveBattle(attacker, fieldUnit, new battle.GoldLedger());
    assert.equal(fieldUnit.currentHp, before, '貫通攻撃を無効化できていない');
    assert.ok(result.log.some((line) => line.includes('1/2無効化')));
  } finally {
    Math.random = originalRandom;
  }
});

test('溶岩竜は3周で40/60になり絶対先制が通常先制と後攻装備を上回る', async () => {
  const { game, player, fieldUnit } = growthStub(MONSTER_CATALOG.lavaDragon);
  await game._growLapUnitsOnLap(player);
  await game._growLapUnitsOnLap(player);
  await game._growLapUnitsOnLap(player);
  assert.deepEqual(game._baseStats(fieldUnit), { hp: 40, atk: 60 });
  assert.ok(fieldUnit.awakenedTraits.includes('firstStrike'));
  assert.ok(fieldUnit.awakenedTraits.includes('absoluteFirstStrike'));
  fieldUnit.items.push({ traits: ['lastStrike'] });
  assert.equal(battle.strikeOrderScore(fieldUnit), 100);
  const ordinaryFirst = unit({ id: 'first', name: '通常先制', element: 'water', rarity: 'N', hp: 30, atk: 30, traits: ['firstStrike'] }, 'enemy');
  assert.ok(battle.strikeOrderScore(fieldUnit) > battle.strikeOrderScore(ordinaryFirst));
});

test('巨珍兵は2周目に再生、3周目に味方森全体への繁栄を得る', async () => {
  const grown = growthStub(MONSTER_CATALOG.kyochinhei);
  await grown.game._growLapUnitsOnLap(grown.player);
  await grown.game._growLapUnitsOnLap(grown.player);
  assert.deepEqual(grown.game._baseStats(grown.fieldUnit), { hp: 75, atk: 20 });
  assert.ok(grown.fieldUnit.awakenedTraits.includes('regenerate'));
  await grown.game._growLapUnitsOnLap(grown.player);
  assert.ok(grown.fieldUnit.awakenedTraits.includes('forestProsperity'));

  const ally = { id: 'ally', name: '味方', allianceId: 'red' };
  const owner = { id: 'owner', name: '巨珍兵の主', allianceId: 'red' };
  const enemy = { id: 'enemy', name: '敵', allianceId: 'white' };
  grown.fieldUnit.ownerId = owner.id;
  const allyForest = unit({ id: 'allyForest', name: '味方森', element: 'forest', rarity: 'N', hp: 30, atk: 30 }, ally.id);
  const enemyForest = unit({ id: 'enemyForest', name: '敵森', element: 'forest', rarity: 'N', hp: 30, atk: 30 }, enemy.id);
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    players: [owner, ally, enemy],
    tiles: [{ id: 0, unit: grown.fieldUnit, neighbors: [] }],
    onLog: () => {},
  });
  assert.deepEqual(game._battleBonus(allyForest, null, { neighbors: [] }), { atk: 20, hp: 20 });
  assert.deepEqual(game._battleBonus(enemyForest, null, { neighbors: [] }), { atk: 0, hp: 0 });
});
