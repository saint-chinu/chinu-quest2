const installButton = document.getElementById('install-app-button');
const installMessage = document.getElementById('install-app-message');
let deferredInstallPrompt = null;

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

function showInstalledState() {
  installButton.classList.add('hidden');
  installMessage.textContent = 'ホーム画面からアプリとして起動できます。';
}

if (isStandalone()) showInstalledState();

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.disabled = false;
});

installButton.addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return;
  }
  installMessage.textContent = isIos()
    ? 'Safariでは自動追加できません。「共有」→「表示を増やす」→「ホーム画面に追加」を選択し、横画面で操作してください。'
    : 'ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選び、横画面で操作してください。';
});

window.addEventListener('appinstalled', showInstalledState);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // 新しいデプロイ（＝新しいService Worker）が有効化されたら、開いている
  // ページを一度だけ自動リロードして最新のJS/HTMLに差し替える。これが無いと
  // iOSのホーム画面PWAはアプリスイッチャーから戻しても古いメモリ上のページを
  // 使い続け、修正がユーザーに反映されない。
  // controllerが既に存在する場合のみ（＝初回インストールではなく更新の場合のみ）
  // リロードする。初回インストール時の余計なリロードを避けるため。
  const hadControllerAtLoad = !!navigator.serviceWorker.controller;
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtLoad || reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((registration) => {
        registration.update();
        // 起動中も定期的に更新をチェックし、長時間開きっぱなしのPWAにも
        // 新バージョンを届ける（見つかればskipWaiting→controllerchangeで自動反映）。
        setInterval(() => registration.update(), 60 * 60 * 1000);
      })
      .catch((error) => {
        console.warn('Service Workerを登録できませんでした', error);
      });
  });
}
