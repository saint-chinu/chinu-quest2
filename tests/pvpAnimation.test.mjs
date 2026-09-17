import test from 'node:test';
import assert from 'node:assert/strict';
import { tween, speedState } from '../src/utils.js';

test('描画の途中・最終フレームで例外が出ても演出待ちが解消する', async (t) => {
  const oldRaf = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  const oldSpeed = speedState.multiplier;
  t.after(() => { globalThis.requestAnimationFrame=oldRaf; globalThis.cancelAnimationFrame=oldCancel; speedState.multiplier=oldSpeed; });
  speedState.multiplier=1;
  globalThis.cancelAnimationFrame=clearTimeout;
  globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),0);
  await assert.rejects(tween(1000,()=>{throw new Error('mid-frame');}),/mid-frame/);
  await assert.rejects(tween(0,()=>{throw new Error('final-frame');}),/final-frame/);
  globalThis.requestAnimationFrame=()=>999999;
  await assert.rejects(tween(0,()=>{throw new Error('watchdog-frame');}),/watchdog-frame/);
});

test('描画例外後の次の演出が通常どおり完了する', async(t)=>{
  const oldRaf=globalThis.requestAnimationFrame, oldCancel=globalThis.cancelAnimationFrame;
  t.after(()=>{globalThis.requestAnimationFrame=oldRaf;globalThis.cancelAnimationFrame=oldCancel;});
  globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()+1000),0);
  globalThis.cancelAnimationFrame=clearTimeout;
  let result=0;
  await tween(1,value=>{result=value;});
  assert.equal(result,1);
});
