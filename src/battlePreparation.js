let cancelActive = null;

export function cancelBattlePreparation(reason = 'navigation') {
  cancelActive?.(reason);
}

/** Only read-only asset work is allowed in load. Late results must never start a game. */
export function prepareBattleAssets(load, { timeoutMs = 12000 } = {}) {
  cancelBattlePreparation('superseded');
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'landscape-ready-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '対戦の準備');
    const box = document.createElement('div');
    box.className = 'landscape-ready-box';
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = '対戦の画像を読み込み中です…';
    const back = document.createElement('button');
    back.textContent = 'メニューに戻る';
    box.append(message, back);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      overlay.remove();
      if (cancelActive === cancel) cancelActive = null;
      resolve(result);
    };
    const cancel = (reason) => finish({ ok: false, reason });
    cancelActive = cancel;
    const timer = setTimeout(() => cancel('timeout'), timeoutMs);
    back.addEventListener('click', () => cancel('cancelled'), { once: true });
    back.focus();
    Promise.resolve().then(load).then(
      (value) => finish({ ok: true, value }),
      () => cancel('error'),
    );
  });
}
