import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, firebaseReady } from './firebase.js';
import { loadCustomCards } from './customCards.js';

// 旧バージョンのローカルデータは、最初のFirebaseログイン時に自動移行する。
const STORAGE_KEY = 'chinuquest2_users';

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function cleanForFirestore(value) {
  if (Array.isArray(value)) return value.map(cleanForFirestore);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanForFirestore(item)]));
  }
  return value;
}

function emailForPlayerId(id) {
  const bytes = new TextEncoder().encode(id.normalize('NFKC'));
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${token}@players.chinuquest.app`;
}

function localLoginOrRegister(id, password) {
  const users = loadUsers();
  const existing = users[id];
  if (existing) {
    if (existing.password !== password) return { ok: false, error: 'パスワードが違います' };
    return { ok: true, id, character: existing.character, customCards: loadCustomCards(id), isNew: false };
  }
  users[id] = { password, character: null };
  saveUsers(users);
  return { ok: true, id, character: null, customCards: loadCustomCards(id), isNew: true };
}

function firebaseErrorMessage(error) {
  if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') return 'IDまたはパスワードが違います';
  if (error?.code === 'auth/weak-password') return 'パスワードは6文字以上にしてください';
  if (error?.code === 'auth/operation-not-allowed') return 'Firebase Authenticationで「メール/パスワード」ログインを有効にしてください';
  if (error?.code === 'auth/network-request-failed') return '通信できません。接続を確認してもう一度お試しください';
  return 'ログインに失敗しました。時間をおいてもう一度お試しください';
}

/** UI上のIDはFirebase内部で専用メールアドレスに変換し、ID＋パスワード形式を維持する。 */
export async function loginOrRegister(id, password) {
  const normalizedId = id?.trim();
  if (!normalizedId || !password) return { ok: false, error: 'IDとパスワードを入力してください' };
  if (normalizedId.length > 40) return { ok: false, error: 'IDは40文字以内にしてください' };
  if (!firebaseReady) return localLoginOrRegister(normalizedId, password);

  try {
    const email = emailForPlayerId(normalizedId);
    let credential;
    let registered = false;
    try {
      credential = await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      // Firebase's email-enumeration protection reports an unknown account as
      // invalid-credential instead of user-not-found. Try registration for both;
      // an existing ID with a wrong password is then identified by email-already-in-use.
      if (error?.code !== 'auth/user-not-found' && error?.code !== 'auth/invalid-credential') throw error;
      try {
        credential = await createUserWithEmailAndPassword(auth, email, password);
        registered = true;
      } catch (registerError) {
        if (registerError?.code === 'auth/email-already-in-use') throw error;
        throw registerError;
      }
    }

    const uid = credential.user.uid;
    const profileRef = doc(db, 'players', uid);
    const profileSnapshot = await getDoc(profileRef);
    const legacy = loadUsers()[normalizedId];
    const legacyCards = loadCustomCards(normalizedId);
    let profile = profileSnapshot.exists() ? profileSnapshot.data() : null;

    if (!profile) {
      profile = { character: legacy?.character || null, customCards: legacyCards };
      await setDoc(profileRef, {
        schemaVersion: 1,
        character: cleanForFirestore(profile.character),
        customCards: cleanForFirestore(profile.customCards),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if ((profile.character == null && legacy?.character) || (!Array.isArray(profile.customCards) && legacyCards.length)) {
      profile = {
        ...profile,
        character: profile.character ?? legacy.character,
        customCards: Array.isArray(profile.customCards) ? profile.customCards : legacyCards,
      };
      await setDoc(profileRef, {
        character: cleanForFirestore(profile.character),
        customCards: cleanForFirestore(profile.customCards),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    return {
      ok: true,
      id: uid,
      character: profile.character || null,
      customCards: Array.isArray(profile.customCards) ? profile.customCards : [],
      isNew: registered && !profile.character,
    };
  } catch (error) {
    console.error('Firebase login failed', error);
    return { ok: false, error: firebaseErrorMessage(error) };
  }
}

/** Saves locally first, then mirrors the active Firebase account to Firestore. */
export function saveCharacter(id, character) {
  const users = loadUsers();
  users[id] = { ...(users[id] || {}), character };
  saveUsers(users);
  if (firebaseReady && auth?.currentUser?.uid === id) {
    return setDoc(doc(db, 'players', id), {
      character: cleanForFirestore(character),
      customCards: cleanForFirestore(loadCustomCards(id)),
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch((error) => console.warn('Cloud save failed; local play continues.', error));
  }
  return Promise.resolve();
}
