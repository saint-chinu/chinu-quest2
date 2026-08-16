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

export function listenToPvpPresence(uid, onChange) {
  return onSnapshot(presenceRef(uid), (snapshot) => {
    const data = snapshot.data();
    const lastSeenMs = data?.lastSeenAt?.toMillis?.() || 0;
    onChange(Boolean(data?.online && Date.now() - lastSeenMs <= ONLINE_WINDOW_MS));
  }, () => onChange(false));
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
