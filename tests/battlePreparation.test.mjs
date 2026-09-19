import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { prepareBattleAssets, cancelBattlePreparation } from '../src/battlePreparation.js';
import { loadImage } from '../src/imageLoader.js';
import { resolveCharacterIcon } from '../src/playerIcons.js';
import { loadNpcTokenImage } from '../src/npcArt.js';

class Element {
  children = []; listeners = {};
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  appendChild(child) { this.append(child); }
  setAttribute() {}
  addEventListener(event, handler) { this.listeners[event] = handler; }
  focus() {}
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
}
function dom() { globalThis.document = { body: new Element(), createElement: () => new Element() }; }
afterEach(() => { cancelBattlePreparation(); delete globalThis.document; delete globalThis.Image; });

test('successful preparation removes loading UI', async () => {
  dom();
  assert.deepEqual(await prepareBattleAssets(() => 42), { ok: true, value: 42 });
  assert.equal(document.body.children.length, 0);
});
test('back cancels immediately; late image completion cannot start battle', async () => {
  dom();
  let finish; let starts = 0;
  const pending = prepareBattleAssets(() => new Promise((resolve) => { finish = resolve; }));
  const continuation = pending.then((result) => { if (result.ok) starts++; });
  await Promise.resolve();
  document.body.children[0].children[0].children[1].listeners.click();
  assert.equal((await pending).reason, 'cancelled');
  finish('late image');
  await continuation;
  await Promise.resolve();
  assert.equal(starts, 0);
  assert.equal(document.body.children.length, 0);
});
test('timeout and load error both release overlay', async () => {
  dom();
  assert.equal((await prepareBattleAssets(() => new Promise(() => {}), { timeoutMs: 5 })).reason, 'timeout');
  assert.equal((await prepareBattleAssets(() => { throw new Error('canvas'); })).reason, 'error');
  assert.equal(document.body.children.length, 0);
});
test('navigation and newer preparation invalidate old preparation', async () => {
  dom();
  const first = prepareBattleAssets(() => new Promise(() => {}));
  const second = prepareBattleAssets(() => new Promise(() => {}));
  assert.equal((await first).reason, 'superseded');
  assert.equal(document.body.children.length, 1);
  cancelBattlePreparation();
  assert.equal((await second).reason, 'navigation');
  assert.equal(document.body.children.length, 0);
});
test('image timeout detaches callbacks and aborts stuck request', async () => {
  let image;
  globalThis.Image = class { constructor() { image = this; } };
  await assert.rejects(loadImage('/stalled', 5), /タイムアウト/);
  assert.equal(image.onload, null);
  assert.equal(image.onerror, null);
  assert.equal(image.src, '');
});
test('only selected preset fetched; conversion errors reject and cache retries', async () => {
  dom();
  const urls = [];
  globalThis.Image = class {
    set src(url) { if (url) { urls.push(url); queueMicrotask(() => this.onload?.()); } }
  };
  await assert.rejects(resolveCharacterIcon({ iconPreset: 'chinu' }));
  await assert.rejects(resolveCharacterIcon({ iconPreset: 'chinu' }));
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.endsWith('/chinu.png')));
});
test('NPC retries once, evicts failed cache and reuses successful image', async () => {
  dom();
  let failed = true; let loads = 0;
  document.createElement = () => ({ getContext: () => ({ drawImage() {} }) });
  globalThis.Image = class {
    naturalWidth = 256; naturalHeight = 256;
    set src(url) { if (url) { loads++; queueMicrotask(() => failed ? this.onerror?.() : this.onload?.()); } }
  };
  assert.equal(await loadNpcTokenImage('Q'), null);
  assert.equal(loads, 2);
  failed = false;
  const canvas = await loadNpcTokenImage('Q');
  assert.equal(canvas.width, 256);
  assert.equal(await loadNpcTokenImage('Q'), canvas);
  assert.equal(loads, 3);
});
test('story preparation guard precedes state commit and battle start', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const story = source.slice(source.indexOf('async function startStoryBattle('));
  const check = story.indexOf('if (!prepared.ok)');
  assert.ok(check > 0);
  for (const marker of ['activeStoryStageIndex = index', 'startStoryBattleLog()', 'startBattle(character,']) {
    assert.ok(story.indexOf(marker) > check);
  }
  assert.match(source, /function showScreen\(el\) \{\s*cancelBattlePreparation\(\)/);
});

test('actual story startup preamble cannot commit state after cancel and late images', async () => {
  dom();
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function startStoryBattle(');
  const end = source.indexOf('  const startedGame = startBattle(character,', start);
  const preamble = source.slice(start, end) + 'return startBattle(); }';
  let finishImages; let starts = 0; let menus = 0;
  const context = vm.createContext({
    STORY_STAGES: [{}], currentCharacter: { name: 'test' },
    prepareBattleAssets,
    resolveCharacterIcon: () => new Promise((resolve) => { finishImages = resolve; }),
    buildBattlePlayerConfigs: async () => [{}],
    showHubScreen: () => menus++, showToast() {},
    confirmLandscapeReady: async () => {},
    activeStoryStageIndex: null, activeStorySessionMeta: null, latestStoryCheckpoint: 'saved',
    startStoryBattleLog() { throw new Error('cancelled start created log'); },
    startBattle: () => starts++,
  });
  vm.runInContext(preamble, context);
  const running = context.startStoryBattle(0, [], false);
  await Promise.resolve();
  cancelBattlePreparation('cancelled');
  await running;
  finishImages(null);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(starts, 0);
  assert.equal(menus, 1);
  assert.equal(context.activeStoryStageIndex, null);
  assert.equal(context.latestStoryCheckpoint, 'saved');
});
