import test from 'node:test';
import assert from 'node:assert/strict';
import { PvpContiguousAckTracker, pvpQueueAnimationScale, pvpSequenceBase } from '../src/pvpQueue.js';

test('ACKは未処理イベントを飛び越えない', () => {
  const tracker = new PvpContiguousAckTracker(100);
  [101, 102, 103, 104, 105].forEach((id) => tracker.noteReceived(id));

  // 将来、対話イベントだけ先に処理する実装が入っても最大idをACKしない。
  assert.equal(tracker.markProcessed(105), 100);
  assert.equal(tracker.markProcessed(101), 101);
  assert.equal(tracker.markProcessed(103), 101);
  assert.equal(tracker.markProcessed(102), 103);
  assert.equal(tracker.markProcessed(104), 105);
});

test('時刻起点の大きなイベントIDでも受信順の先頭からACKできる', () => {
  const tracker = new PvpContiguousAckTracker();
  const first = 1_800_000_000_000;
  tracker.noteReceived(first);
  tracker.noteReceived(first + 1);
  assert.equal(tracker.markProcessed(first), first);
  assert.equal(tracker.markProcessed(first + 1), first + 1);
});

test('ホストのfast-forward水位で古い保留イベントを捨てられる', () => {
  const tracker = new PvpContiguousAckTracker(10);
  [11, 12, 13].forEach((id) => tracker.noteReceived(id));
  assert.equal(tracker.advanceBase(12), 12);
  assert.equal(tracker.markProcessed(13), 13);
});

test('遅延時は順序を変えず移動アニメ尺だけ段階的に短縮する', () => {
  assert.equal(pvpQueueAnimationScale(0), 1);
  assert.equal(pvpQueueAnimationScale(5), 1);
  assert.equal(pvpQueueAnimationScale(6), 0.75);
  assert.equal(pvpQueueAnimationScale(10), 0.55);
  assert.equal(pvpQueueAnimationScale(16), 0.4);
  assert.ok(pvpQueueAnimationScale(20) > 0);
});

test('高速な再読込でも新しい採番基準が前インスタンスより後ろになる', () => {
  const previousStartedAt = 1_800_000_000_000;
  const previousLastId = pvpSequenceBase(previousStartedAt) + 999;
  assert.ok(pvpSequenceBase(previousStartedAt + 1) > previousLastId);
  assert.ok(Number.isSafeInteger(pvpSequenceBase(previousStartedAt + 1)));
});
