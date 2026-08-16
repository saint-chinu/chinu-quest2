import { db, ensurePvpUser } from './firebase.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

const ONLINE_WINDOW_MS = 120000;
// 期限切れを自力で検出するための再評価間隔（スナップショットは来ないため）。
const PRESENCE_RECHECK_MS = 20000;

const friendRef = (uid, friendUid) => doc(db, 'pvpFriends', uid, 'entries', friendUid);
const presenceRef = (uid) => doc(db, 'pvpPresence', uid);

export async function registerPvpFriends(room) {
  const uid = await ensurePvpUser();
  const participants = Array.isArray(room?.participants) ? room.participants : [];
  const opponents = participants.filter((entry) => entry?.uid && entry.uid !== uid);
  await Promise.all(opponents.map((entry) => setDoc(friendRef(uid, entry.uid), {
    uid: entry.uid,
    name: String(entry.name || 'プレイヤー').slice(0, 10),
    lastPlayedAt: serverTimestamp(),
  }, { merge: true })));
}

export function listenToPvpFriends(uid, onChange, onError = console.warn) {
  return onSnapshot(collection(db, 'pvpFriends', uid, 'entries'), (snapshot) => {
    const friends = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    friends.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
    onChange(friends);
  }, onError);
}

export function removePvpFriend(uid, friendUid) {
  return deleteDoc(friendRef(uid, friendUid));
}

export function updatePvpPresence(uid, name, online = true) {
  if (!uid) return Promise.resolve();
  return setDoc(presenceRef(uid), {
    uid,
    name: String(name || 'プレイヤー').slice(0, 10),
    online,
    lastSeenAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * フレンド1人の在席を購読する。オンライン判定はlastSeenAtの鮮度で行うため、
 * スナップショット受信時だけ評価すると「相手がブラウザを強制終了した／回線が
 * 切れた」ケースでは書き込みが発生せず、いつまでもオンライン表示のまま固まる。
 * 最後に受け取ったデータを保持して定期的に再評価し、期限切れを自力で検出する。
 * 値が変わった時だけ通知するので、再描画は増えない。
 */
export function listenToPvpPresence(uid, onChange) {
  let latest = null;
  let lastReported = null;
  const evaluate = () => {
    const lastSeenMs = latest?.lastSeenAt?.toMillis?.() || 0;
    const online = Boolean(latest?.online && Date.now() - lastSeenMs <= ONLINE_WINDOW_MS);
    if (online === lastReported) return;
    lastReported = online;
    onChange(online);
  };
  const stopSnapshot = onSnapshot(presenceRef(uid), (snapshot) => {
    latest = snapshot.data() ?? null;
    evaluate();
  }, () => { latest = null; evaluate(); });
  const timer = setInterval(evaluate, PRESENCE_RECHECK_MS);
  return () => {
    clearInterval(timer);
    stopSnapshot();
  };
}

export async function sendPvpInvite({ recipientUid, roomCode, hostName }) {
  const inviterUid = await ensurePvpUser();
  return addDoc(collection(db, 'pvpInvites'), {
    inviterUid,
    inviterName: String(hostName || 'プレイヤー').slice(0, 10),
    recipientUid,
    roomCode: String(roomCode || '').slice(0, 3),
    createdAt: serverTimestamp(),
  });
}

export function listenToPvpInvites(uid, onChange, onError = console.warn) {
  const inviteQuery = query(collection(db, 'pvpInvites'), where('recipientUid', '==', uid));
  return onSnapshot(inviteQuery, (snapshot) => {
    const invites = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    invites.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    onChange(invites);
  }, onError);
}

export function dismissPvpInvite(inviteId) {
  return deleteDoc(doc(db, 'pvpInvites', inviteId));
}
