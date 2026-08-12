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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => {
        console.warn('Service Workerを登録できませんでした', error);
      });
  });
}
