export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * 盤面の速度調整（メニューの1.5倍速/2倍速/3倍速）用の共有状態。tween/delay
 * （game.js・scene.jsの移動/演出タイミングが最終的にどちらかを経由する）が
 * これを参照して所要時間を短縮する。main.jsのsetTimeout/setIntervalも
 * これを参照するローカルシャドウ経由で同じ倍率がかかる（main.js側参照）。
 */
export const speedState = { multiplier: 1, waitCutRate: 0 };
export function setSpeedMultiplier(value) {
  speedState.multiplier = value > 0 ? value : 1;
}
export function getSpeedMultiplier() {
  return speedState.multiplier;
}

/** 対人戦専用の固定待機カット率（0〜0.7）。移動tweenには適用しない。 */
export function setWaitCutRate(value) {
  speedState.waitCutRate = Math.min(0.7, Math.max(0, Number(value) || 0));
}
export function getWaitCutRate() {
  return speedState.waitCutRate;
}

/**
 * Resolves after `durationMs`（速度倍率で短縮）, calling onUpdate(t) once per
 * animation frame with t in [0,1].
 *
 * requestAnimationFrameはタブが非アクティブ（バックグラウンド化・画面回転・
 * 別アプリ切替など）になると完全に停止する。それだけに頼ると、演出の最中に
 * 画面が隠れた瞬間tweenのPromiseが永久に解決されず、召喚後のカメラ戻し等で
 * 「行動終了と共にフリーズ」してターンが進まなくなる。setTimeoutは背景でも
 * （間引かれはするが）必ず発火するので、所要時間＋余裕の保険タイマーで必ず
 * 最終状態へスナップして解決させる。通常時はrAF側が先に完走し保険は解除される。
 */
export function tween(durationMs, onUpdate) {
  return new Promise((resolve) => {
    const scaledDuration = durationMs / speedState.multiplier;
    const start = performance.now();
    let settled = false;
    let watchdog = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (watchdog !== null) clearTimeout(watchdog);
      onUpdate(1);
      resolve();
    };
    watchdog = setTimeout(finish, scaledDuration + 500);
    function step(now) {
      if (settled) return;
      const t = scaledDuration <= 0 ? 1 : Math.min(1, (now - start) / scaledDuration);
      if (t < 1) {
        onUpdate(t);
        requestAnimationFrame(step);
      } else {
        finish();
      }
    }
    requestAnimationFrame(step);
  });
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, (ms * (1 - speedState.waitCutRate)) / speedState.multiplier));
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
