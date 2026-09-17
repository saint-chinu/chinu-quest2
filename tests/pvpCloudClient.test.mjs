import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Load the real client with only its Firebase transport dependency stubbed.
const source = readFileSync(new URL('../src/pvpCloud.js', import.meta.url), 'utf8')
  .replace("import { auth, firebaseReady } from './firebase.js';", 'const auth = null, firebaseReady = false;')
  .replace("'./pvpQueue.js'", JSON.stringify(new URL('../src/pvpQueue.js', import.meta.url).href));
const { CloudPvpConnection } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('描画例外で止まらず次イベントを再生し、復旧通知とACKを送る', async(t) => {
  const oldDocument = globalThis.document;
  const oldError = console.error;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  console.error = () => {};
  t.after(() => { globalThis.document = oldDocument; console.error = oldError; });
  const played = [], sent = [], recovered = [];
  const client = new CloudPvpConnection('', '123', 'u0', {
    pieceStep: async () => { throw new Error('renderer failed'); },
    moveComplete: async () => played.push('complete'),
    landCommand: async () => { played.push('land'); return 'end'; },
  }, { onPlaybackError: error => recovered.push(error) });
  client.socket = { readyState:1, send: value=>sent.push(JSON.parse(value)), close() {} };
  client.queue = [
    {id:1,type:'pieceStep'}, {id:2,type:'moveComplete'},
    {id:3,type:'landCommand',ack:true,wantValue:true},
  ];
  for (const event of client.queue) client.tracker.noteReceived(event.id);
  await client._pump();
  assert.deepEqual(played,['complete','land']);
  assert.equal(recovered[0].type,'pieceStep');
  assert.equal(sent[0].t,'clientError');
  assert.deepEqual(sent.at(-1),{t:'ack',through:3,value:{id:3,v:'end'}});
  client.destroy();
});

test('終わらない演出は番犬で飛ばして次へ進み、clientStall を送る', async (t) => {
  const oldDocument = globalThis.document;
  const oldWarn = console.warn;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  console.warn = () => {};
  t.after(() => { globalThis.document = oldDocument; console.warn = oldWarn; });
  const played = [], sent = [], stalled = [];
  const client = new CloudPvpConnection('', '123', 'u0', {
    summonEffect: () => new Promise(() => {}), // 永久に終わらない演出（画像待ち等）
    moveComplete: async () => played.push('complete'),
    landCommand: async () => { played.push('land'); return 'end'; },
  }, { onPlaybackStall: (info) => stalled.push(info), stallMs: 50 });
  client.socket = { readyState: 1, send: (value) => sent.push(JSON.parse(value)), close() {} };
  client.queue = [
    { id: 1, type: 'summonEffect' }, { id: 2, type: 'moveComplete' },
    { id: 3, type: 'landCommand', ack: true, wantValue: true },
  ];
  for (const event of client.queue) client.tracker.noteReceived(event.id);
  const started = Date.now();
  await client._pump();
  assert.ok(Date.now() - started < 2000, '番犬が効いて短時間で抜ける');
  assert.deepEqual(played, ['complete', 'land']);
  assert.equal(stalled[0].type, 'summonEffect');
  assert.equal(sent[0].t, 'clientStall');
  assert.deepEqual(sent.at(-1), { t: 'ack', through: 3, value: { id: 3, v: 'end' } });
  client.destroy();
});
