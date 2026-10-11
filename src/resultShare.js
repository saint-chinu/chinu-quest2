export const RESULT_GAME_URL = 'https://saint-chinu.github.io/chinu-quest2/';

// Capture before the game/session is discarded. Never retain player names or room IDs.
export function captureBattleResult(game, { mode, won, earnedM, player } = {}) {
  const human = player ?? game?.players?.find((p) => !p.isCPU);
  const allianceSize = human?.allianceId != null
    ? game.players.filter((p) => p.allianceId === human.allianceId).length : 1;
  return Object.freeze({ mode, won, earnedM, allianceSize,
    totalAssets: human ? game._totalAssetsOf(human) : undefined,
    turnCount: game?.turnCount });
}

export function captureCloudResult(result, playerId) {
  const me = result?.players?.find((p) => p.id === playerId);
  if (result?.reason !== 'settled' || typeof me?.won !== 'boolean') return null;
  return Object.freeze({ mode: '対人戦', won: me.won, totalAssets: me.totalAssets,
    allianceSize: me.allianceSize, turnCount: result.turnCount });
}

export function formatBattleResult(result) {
  const outcome = result.won === true ? '勝利！' : result.won === false ? '敗北…' : '対戦終了';
  const stats = [];
  const number = (value) => Math.floor(value).toLocaleString('ja-JP');
  if (Number.isFinite(result.totalAssets)) {
    stats.push((result.allianceSize > 1 ? '同盟総資産' : '総資産') + ' ' + number(result.totalAssets) + 'G');
  }
  if (Number.isFinite(result.turnCount) && result.turnCount >= 0) stats.push(number(result.turnCount) + 'ターン');
  if (Number.isFinite(result.earnedM) && result.earnedM >= 0) stats.push('獲得報酬 ' + number(result.earnedM) + 'M');
  const text = ['チヌクエスト｜' + (result.mode || '対戦') + ' ' + outcome,
    ...stats, '#チヌクエスト #ブラウザゲーム'].join('\n');
  const intent = new URL('https://twitter.com/intent/tweet');
  intent.searchParams.set('text', text);
  intent.searchParams.set('url', RESULT_GAME_URL);
  return { outcome, text, copyText: text + '\n' + RESULT_GAME_URL, intentUrl: intent.href };
}
