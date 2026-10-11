import { formatBattleResult } from './resultShare.js';

let activeDialog = null;

export function showBattleResult(result) {
  if (!result) return;
  activeDialog?.close();
  const content = formatBattleResult(result);
  const dialog = document.createElement('dialog');
  dialog.className = 'result-share-dialog';
  dialog.setAttribute('aria-labelledby', 'result-share-title');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'result-share-eyebrow';
  eyebrow.textContent = 'チヌクエスト / ' + result.mode;
  const title = document.createElement('h2');
  title.id = 'result-share-title';
  title.textContent = content.outcome;
  const label = document.createElement('label');
  label.htmlFor = 'result-share-text';
  label.textContent = 'この結果を共有';
  const preview = document.createElement('textarea');
  preview.id = 'result-share-text';
  preview.readOnly = true;
  preview.value = content.copyText;
  preview.rows = 7;
  const status = document.createElement('p');
  status.className = 'result-share-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Xの投稿画面で内容を確認できます。';
  const actions = document.createElement('div');
  actions.className = 'result-share-actions';
  const share = document.createElement('a');
  share.className = 'result-share-primary';
  share.textContent = 'Xで結果を共有';
  share.href = content.intentUrl;
  share.target = '_blank';
  share.rel = 'noopener noreferrer';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '文面をコピー';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(content.copyText);
      status.textContent = 'コピーしました。好きな場所に貼り付けられます。';
    } catch {
      preview.focus();
      preview.select();
      preview.setSelectionRange(0, preview.value.length);
      status.textContent = '文面を選択しました。長押しまたはコピー操作でコピーしてください。';
    }
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'result-share-close';
  close.textContent = 'ゲームに戻る';
  close.autofocus = true;
  close.addEventListener('click', () => dialog.close());
  actions.append(share, copy);
  dialog.append(eyebrow, title, label, preview, actions, status, close);
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (activeDialog === dialog) activeDialog = null;
  }, { once: true });
  document.body.appendChild(dialog);
  activeDialog = dialog;
  dialog.showModal();
}
