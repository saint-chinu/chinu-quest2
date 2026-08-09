// Firebase初期化。対人戦（PvP）のリアルタイム同期専用 - 既存のログイン/
// キャラクターデータ（auth.js、localStorage）には一切関与しない。PvPの
// ルーム参加者を識別するためだけにFirebase Anonymous Authenticationを
// 使う（既存のID/パスワードのログイン画面はそのまま維持される）。
//
// 設定値はVite環境変数（.env、.env.example参照）から読み込む。本物の設定
// 値が無い場合、開発時（vite dev）は自動的にローカルのFirebaseエミュレー
// タ（firebase.json参照。`npx firebase emulators:start`で起動）に接続する
// - 本物のFirebaseプロジェクトが無くても対人戦の動作確認ができる。本番
// ビルドで設定値が無い場合はfirebaseReady=falseになり、対人戦系の呼び出
// し元はそれを見て「準備中」表示にフォールバックできる。
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasRealConfig = Boolean(envConfig.apiKey && envConfig.projectId);
// firebase.jsonのemulators設定と対応するダミープロジェクトID・ポート。
const DEMO_PROJECT_ID = 'demo-chinuquest2';
const useEmulator = !hasRealConfig && import.meta.env.DEV;

const firebaseConfig = hasRealConfig
  ? envConfig
  : { apiKey: 'demo-emulator-key', projectId: DEMO_PROJECT_ID, authDomain: `${DEMO_PROJECT_ID}.firebaseapp.com` };

export const firebaseReady = hasRealConfig || useEmulator;

let app = null;
let authInstance = null;
let dbInstance = null;

if (firebaseReady) {
  app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
  if (useEmulator) {
    connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
  }
}

export const auth = authInstance;
export const db = dbInstance;

let anonUserPromise = null;

/** Resolves once anonymously signed in, returning the Firebase uid. Cached - safe to call from multiple places (room create/join). */
export function ensurePvpUser() {
  if (!firebaseReady) return Promise.reject(new Error('Firebase未設定'));
  if (anonUserPromise) return anonUserPromise;

  anonUserPromise = new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user.uid);
        }
      },
      (error) => {
        unsubscribe();
        reject(error);
      },
    );
    signInAnonymously(auth).catch((error) => {
      unsubscribe();
      reject(error);
    });
  });
  return anonUserPromise;
}
