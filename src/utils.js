export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * 盤面の速度調整（メニューの1.5倍速/2倍速/3倍速）用の共有状態。tween/delay
 * （game.js・scene.jsの移動/演出タイミングが最終的にどちらかを経由する）が
 * これを参照して所要時間を短縮する。main.jsのsetTimeout/setIntervalも
 * これを参照するローカルシャドウ経由で同じ倍率がかかる（main.js側参照）。
 */
export const speedState = { multiplier: 1 };
export function setSpeedMultiplier(value) {
  speedState.multiplier = value > 0 ? value : 1;
}
export function getSpeedMultiplier() {
  return speedState.multiplier;
}

/** Resolves after `durationMs`（速度倍率で短縮）, calling onUpdate(t) once per animation frame with t in [0,1]. */
export function tween(durationMs, onUpdate) {
  return new Promise((resolve) => {
    const scaledDuration = durationMs / speedState.multiplier;
    const start = performance.now();
    function step(now) {
      const t = scaledDuration <= 0 ? 1 : Math.min(1, (now - start) / scaledDuration);
      onUpdate(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms / speedState.multiplier));
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
