import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { createBoard, TileType } from '../src/board.js';
import { setSpeedMultiplier } from '../src/utils.js';

setSpeedMultiplier(10000);
test.after(() => setSpeedMultiplier(1));

function setup(mapId = 'kessan', isCPU = false) {
  const tiles = createBoard(mapId), events = [];
  const g = new Game({ tiles, mapId, scene: {}, onLog() {}, onStateChange() {},
    playerConfigs: [{ name: 'プレイヤー', isCPU, deckList: [] }, { name: 'CPU', isCPU: true, deckList: [] }] });
  g._notifyState = () => {};
  g._emitPieceStep = () => {};
  g._stepWithCamera = async () => {};
  g._visitCheckpoint = async () => {};
  g._grantGoalBonus = async () => {};
  g.onPieceMove = async e => events.push({ type: 'walk', ...e });
  g.onWarpEffect = async e => events.push({ type: 'warp', ...e });
  g.onPickAbilityTarget = async options => options.at(-1).id;
  const p = g.players[0];
  return { g, p, tiles, events };
}

for (const source of createBoard('kessan').filter(t => t.warpKind === 'choice')) {
  for (const exact of [false, true]) test(`${source.warpLabel}: ${exact ? 'ぴったり停止' : '通過'}で選択ワープし、残り歩数を保持`, async () => {
    const { g, p, tiles, events } = setup();
    const target = tiles[source.warpChoices.at(-1)];
    p.tileId = source.neighbors[0]; p.previousTileId = null; p.tileHistory = [p.tileId];
    const start = p.tileId;
    g._chooseNextTile = async (_p, from, options) => from.id === start ? source.id : options[0];
    await g._movePlayer(p, exact ? 1 : 2);
    assert.equal(p.tileId, exact ? target.id : target.neighbors[0]);
    assert.equal(p.diceCurse, null, '⑧の次のサイコロ2倍を付けない');
    assert.equal(events.filter(e => e.type === 'warp').length, 1);
    assert.deepEqual(events.map(e => e.type), exact ? ['walk', 'warp'] : ['walk', 'warp', 'walk']);
    assert.deepEqual(g._turnPathIds, exact ? [source.id] : [source.id, target.neighbors[0]], '通過済み土地コマンド権限を保持');
    assert.equal(p.tileHistory[0], p.tileId);
    if (exact) {
      assert.equal(p.previousTileId, null);
      await g._resolveSpecialTile(p);
      assert.equal(events.filter(e => e.type === 'warp').length, 1, '着地処理で再ワープしない');
    } else {
      assert.equal(p.previousTileId, target.id);
      assert.equal(p.skipWarpResolveTileId, null);
    }
  });
}

test('選択前の着地予測とCPU経路は3つの出口をすべて辿る', () => {
  const { g, p, tiles } = setup();
  const source = tiles.find(t => t.warpLabel === 'ゴール島①');
  p.tileId = source.neighbors[0];
  const prior = tiles[p.tileId].neighbors.find(id => id !== source.id);
  p.previousTileId = prior;
  const one = g._forwardDestinationIds(p, 1);
  const two = g._forwardDestinationIds(p, 2);
  for (const id of source.warpChoices) {
    assert.ok(one.includes(id));
    assert.equal(g._tileDistance(p.tileId, id), 1);
    assert.equal(g._forwardTileDistance(p.tileId, prior, id), 1);
    for (const next of tiles[id].neighbors) assert.ok(two.includes(next));
  }
  assert.ok(!one.includes(source.id), '通過ワープの入口を最終着地点にしない');
  assert.ok(g._forwardDestinationIds(p, 24).length <= tiles.length, '長い出目も重複を集約する');
});

test('CPUも通過時に有効な島を選んで残り歩数を進む', async () => {
  const { g, p, tiles, events } = setup('kessan', true);
  const source = tiles.find(t => t.warpLabel === 'ゴール島①');
  p.tileId = source.neighbors[0]; p.tileHistory = [p.tileId];
  const start = p.tileId;
  const choose = g._chooseNextTile.bind(g);
  g._chooseNextTile = (...args) => args[1].id === start ? Promise.resolve(source.id) : choose(...args);
  g.onPickAbilityTarget = () => { throw new Error('CPUに人間用選択を出さない'); };
  await g._movePlayer(p, 2);
  assert.equal(events.filter(e => e.type === 'warp').length, 1);
  assert.ok(source.warpChoices.some(id => tiles[id].neighbors.includes(p.tileId)));
});

test('ワープ選択中に退出した旧盤面は駒・演出・残り移動を再開しない', async () => {
  const { g, p, tiles, events } = setup();
  const source = tiles.find(t => t.warpKind === 'choice');
  p.tileId = source.neighbors[0]; p.tileHistory = [p.tileId];
  g._chooseNextTile = async () => source.id;
  g.onPickAbilityTarget = async options => { g.cancel(); return options[0].id; };
  await g._movePlayer(p, 2);
  assert.equal(p.tileId, source.id);
  assert.equal(events.filter(e => e.type === 'warp').length, 0);
});

test('旧セーブの停止式ワープ情報で最新マップの通過ワープを上書きしない', () => {
  const { g, p, tiles } = setup();
  const snapshot = g.exportState();
  const source = tiles.find(t => t.warpKind === 'choice');
  const links = [...source.warpChoices];
  snapshot.tiles[source.id].warpOnPass = false;
  snapshot.tiles[source.id].warpChoices = [];
  snapshot.tiles[source.id].warpTargetId = null;
  g._restoreState(snapshot);
  assert.equal(source.warpOnPass, true);
  assert.deepEqual(source.warpChoices, links);
  assert.ok(g.players.includes(p));
});

test('⑧のぴったりワームホールは2倍呪いを維持し、⑦は停止式のまま', async () => {
  const { g, p, tiles } = setup('chin-harbor');
  const source = tiles.find(t => t.warpKind === 'wormhole');
  p.tileId = source.neighbors[0]; p.tileHistory = [p.tileId];
  g._chooseNextTile = async () => source.id;
  await g._movePlayer(p, 1);
  assert.equal(p.tileId, source.warpTargetId);
  assert.equal(p.diceCurse.type, 'double');
  assert.ok(createBoard('final-alliance').filter(t => t.type === TileType.WARP).every(t => !t.warpOnPass));
});
