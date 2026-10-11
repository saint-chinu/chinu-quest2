import test from 'node:test';
import assert from 'node:assert/strict';
import { captureBattleResult, captureCloudResult, formatBattleResult, RESULT_GAME_URL } from '../src/resultShare.js';

test('captures a solo result before the game is cleared, with no account information', () => {
  const player = { id: 1, name: 'PRIVATE NAME', uid: 'PRIVATE UID', isCPU: false };
  const game = { players: [player], turnCount: 24, _totalAssetsOf: () => 12345 };
  const result = captureBattleResult(game, { mode: 'CPU戦', won: true, earnedM: 864 });
  game.turnCount = 100; player.name = 'changed';
  const text = formatBattleResult(result).copyText;
  assert.match(text, /CPU戦 勝利！/); assert.match(text, /総資産 12,345G/);
  assert.match(text, /24ターン/); assert.match(text, /獲得報酬 864M/);
  assert.doesNotMatch(text, /PRIVATE|changed|100ターン/);
  assert.ok(Object.isFrozen(result));
});
test('alliance assets stay team totals, including alliance ID zero', () => {
  const players = [{ id: 1, allianceId: 0 }, { id: 2, allianceId: 0, isCPU: true }];
  const result = captureBattleResult({ players, turnCount: 9, _totalAssetsOf: () => 20000 },
    { mode: 'ストーリー 2', won: false, earnedM: 700 });
  assert.match(formatBattleResult(result).text, /同盟総資産 20,000G/);
  assert.match(formatBattleResult(result).text, /敗北…/);
});
test('cloud sharing uses the final authoritative result for this player', () => {
  const result = captureCloudResult({ reason: 'settled', turnCount: 42, players: [
    { id: 4, won: false, totalAssets: 0, allianceSize: 1 },
    { id: 5, won: true, totalAssets: 15000, allianceSize: 2, endingAssetsShare: 7500 },
  ] }, 5);
  assert.match(formatBattleResult(result).text, /対人戦 勝利！/);
  assert.match(formatBattleResult(result).text, /同盟総資産 15,000G/);
  assert.match(formatBattleResult(result).text, /42ターン/);
});
test('disconnect, missing player and unconfirmed outcome do not produce shareable wins or losses', () => {
  for (const reason of ['hostLeft', 'abandoned', 'ended']) {
    assert.equal(captureCloudResult({ reason, players: [{ id: 1, won: false }] }, 1), null);
  }
  assert.equal(captureCloudResult({ reason: 'settled', players: [] }, 1), null);
  assert.equal(captureCloudResult({ reason: 'settled', players: [{ id: 1 }] }, 1), null);
});
test('unknown values are omitted, actual zero values preserved and Japanese URL text round-trips', () => {
  const content = formatBattleResult({ mode: 'ストーリー 1（再戦）', won: false, totalAssets: 0, earnedM: 0, turnCount: NaN });
  assert.match(content.text, /総資産 0G/); assert.match(content.text, /獲得報酬 0M/);
  assert.doesNotMatch(content.text, /ターン|NaN|undefined/);
  const url = new URL(content.intentUrl);
  assert.equal(url.origin, 'https://twitter.com');
  assert.equal(url.searchParams.get('text'), content.text);
  assert.equal(url.searchParams.get('url'), RESULT_GAME_URL);
  assert.equal(content.copyText, content.text + '\n' + RESULT_GAME_URL);
  assert.equal(formatBattleResult({}).outcome, '対戦終了');
});


test('CPU completion awards once, clears the board and opens a frozen final result', async () => {
  const { readFile } = await import('node:fs/promises');
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function handleCasualBattleEnd(');
  const end = source.indexOf('battleCpuButton.addEventListener', start);
  let rewards = 0, shown;
  const ctx = { game: { players: [{ id: 1 }], turnCount: 12, _totalAssetsOf: () => 5000 },
    captureBattleResult, grantExitReward: () => { rewards++; return { earnedM: 350 }; },
    blockMusicPlayback() {}, appEl: { classList: { add() {} } }, preGame: { classList: { remove() {} } },
    showScreen() {}, battleMenuScreen: {}, showToast() {}, showBattleResult: (result) => { shown = result; } };
  await runInNewContext(source.slice(start, end) + ';handleCasualBattleEnd({won: false})', ctx);
  assert.equal(rewards, 1); assert.equal(ctx.game, undefined);
  assert.equal(shown.won, false); assert.equal(shown.totalAssets, 5000);
  assert.equal(shown.turnCount, 12); assert.equal(shown.earnedM, 350);
});

test('remote completion tears down once without blocking alert and uses server totals', async () => {
  const { readFile } = await import('node:fs/promises');
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function endRemotePvpSession(');
  const end = source.indexOf('/**', start);
  let rewards = 0, shown, alerts = 0, teardown = 0;
  const ctx = { pvpBattleEndHandled: false, pvpMatch: { cloud: true, isHost: false, uid: 'private', lastAssets: 1 },
    grantExitReward: (assets) => { rewards++; assert.equal(assets, 7500); return { earnedM: 525 }; },
    clearPvpRejoinSession() {}, teardownRemotePvpMatch: () => { teardown++; ctx.pvpMatch = null; },
    blockMusicPlayback() {}, appEl: { classList: { add() {} } }, preGame: { classList: { remove() {} } },
    window: { alert() { alerts++; } }, showHubScreen() {}, showBattleResult: (result) => { shown = result; } };
  const invocation = ';endRemotePvpSession({share:7500,sharedResult:{mode:"対人戦",won:true,totalAssets:15000,allianceSize:2,turnCount:42}})';
  runInNewContext(source.slice(start, end) + invocation + invocation, ctx);
  assert.equal(rewards, 1); assert.equal(teardown, 1); assert.equal(alerts, 0);
  assert.equal(shown.totalAssets, 15000); assert.equal(shown.earnedM, 525); assert.equal(shown.turnCount, 42);
});
