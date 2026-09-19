import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('function playOverlayDialogueLines('), source.indexOf('async function playStoryStage('));
function element() {
  const classes = new Set();
  return {
    dataset: {}, listeners: new Map(),
    classList: {
      add: (key) => classes.add(key), remove: (key) => classes.delete(key),
      contains: (key) => classes.has(key),
      toggle: (key, value) => value ? classes.add(key) : classes.delete(key),
    },
    addEventListener(type, cb) { this.listeners.set(type, cb); },
    removeEventListener(type) { this.listeners.delete(type); },
    click() { this.listeners.get('click')?.({ stopPropagation() {} }); },
  };
}
function context() {
  const ctx = { withHeroName: (s) => s };
  for (const name of ['Dialogue', 'PortraitLeft', 'PortraitRight', 'ImgLeft', 'ImgRight', 'NameLeft', 'NameRight', 'Skip', 'Speaker', 'Text', 'Bubble']) {
    ctx[`storyOverlay${name}`] = element();
  }
  vm.createContext(ctx);
  vm.runInContext(fn, ctx);
  return ctx;
}
test('rescue dialogue shows Chinu last, then returns to board and clears portrait sizing markers', async () => {
  const ctx = context();
  let returned = false;
  const lines = ['サーティー', '主人公', 'サーティー', '主人公', 'チヌ'].map((speaker, i) => ({ speaker, text: String(i) }));
  const done = ctx.playOverlayDialogueLines(lines, {
    leftName: '主人公', rightName: 'サーティー', leftPortraitUrl: 'hero', rightPortraitUrl: 'thirty',
    heroPortraitUrl: 'hero', stageKey: 'ou-final',
    speakerSides: { 主人公: 'left', サーティー: 'right', チヌ: 'left' },
    speakerPortraitUrls: { 主人公: 'hero', サーティー: 'thirty', チヌ: 'chinu' },
  }).then(() => { returned = true; });
  for (let i = 0; i < 5; i++) {
    assert.equal(returned, false);
    assert.equal(ctx.storyOverlayText.textContent, String(i));
    assert.equal(ctx.storyOverlayImgLeft.src, i === 4 ? 'chinu' : 'hero');
    if (i === 4) {
      assert.equal(ctx.storyOverlayPortraitLeft.dataset.hero, undefined);
      assert.ok(ctx.storyOverlayBubble.classList.contains('side-left'));
      assert.equal(ctx.storyOverlaySpeaker.textContent, 'チヌ');
    }
    assert.equal(ctx.storyOverlayImgRight.src, 'thirty');
    assert.equal(ctx.storyOverlayPortraitRight.dataset.character, 'サーティー');
    ctx.storyOverlayDialogue.click();
  }
  await done;
  assert.equal(returned, true);
  assert.ok(ctx.storyOverlayDialogue.classList.contains('hidden'));
  assert.equal(ctx.storyOverlayPortraitRight.dataset.character, undefined);
  assert.equal(ctx.storyOverlayDialogue.listeners.size, 0);
});
test('stage 11 shared portrait slot resets enlargement when hero replaces Thirty; skip resolves', async () => {
  const ctx = context();
  const done = ctx.playOverlayDialogueLines([
    { speaker: 'サーティー', text: '救援' }, { speaker: '主人公', text: '感謝' },
  ], {
    leftName: '闇・ホフク', rightName: 'サーティー', rightPortraitUrl: 'thirty',
    speakerSides: { サーティー: 'right', 主人公: 'right' },
    speakerPortraitUrls: { サーティー: 'thirty', 主人公: 'hero' }, heroPortraitUrl: 'hero',
  });
  assert.equal(ctx.storyOverlayPortraitRight.dataset.character, 'サーティー');
  ctx.storyOverlayDialogue.click();
  assert.equal(ctx.storyOverlayPortraitRight.dataset.character, '主人公');
  assert.equal(ctx.storyOverlayPortraitRight.dataset.hero, 'true');
  ctx.storyOverlaySkip.click();
  await done;
  assert.equal(ctx.storyOverlayPortraitRight.dataset.hero, undefined);
});
