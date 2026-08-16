import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const PROJECT_ID = 'demo-chinuquest2';
const ROOM = 'ABCDEFGH';
let env;

const roomData = (hostUid = 'host') => ({
  hostUid,
  hostName: 'ホスト',
  hostColor: 123,
  mapId: 'stage1',
  goalCurrency: 5000,
  playerCount: 2,
  allianceMode: false,
  randomAlliance: false,
  cpuNames: [],
  participants: [{ uid: hostUid, name: 'ホスト', color: 123, iconDataUrl: '', deckList: null, ready: true }],
  participantUids: [hostUid],
  guestUid: null,
  guestName: null,
  guestColor: null,
  guestDeckList: null,
  status: 'waiting',
  createdAt: new Date(),
  publicState: null,
  hostRequestId: 0,
  hostRequest: null,
  guestResponseId: 0,
  guestResponse: null,
  guestActionId: 0,
  guestAction: null,
});

async function seedRoom(data = roomData()) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'pvpRooms', ROOM), data);
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

after(async () => {
  await env.cleanup();
});

test('unauthenticated users cannot read a waiting room', async () => {
  await seedRoom();
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'pvpRooms', ROOM)));
});

test('an authenticated user who knows the code can read and validly join a waiting room', async () => {
  await seedRoom();
  const guestDb = env.authenticatedContext('guest').firestore();
  const ref = doc(guestDb, 'pvpRooms', ROOM);
  await assertSucceeds(getDoc(ref));
  const deckList = Array.from({ length: 40 }, (_, i) => ({ name: `card-${i}` }));
  await assertSucceeds(updateDoc(ref, {
    guestUid: 'guest', guestName: 'ゲスト', guestColor: 456,
    guestDeckList: deckList,
    participants: [roomData().participants[0], { uid: 'guest', name: 'ゲスト', color: 456, iconDataUrl: '', deckList, ready: true }],
    participantUids: ['host', 'guest'],
  }));
});

test('a joining guest cannot seize host authority or change unrelated fields', async () => {
  await seedRoom();
  const ref = doc(env.authenticatedContext('attacker').firestore(), 'pvpRooms', ROOM);
  await assertFails(updateDoc(ref, {
    hostUid: 'attacker', guestUid: 'attacker', guestName: '攻撃者', guestColor: 1,
    guestDeckList: Array(40).fill({ name: 'x' }), status: 'active', publicState: { winner: 'attacker' },
  }));
});

test('guest responses are monotonic and cannot update public state', async () => {
  await seedRoom({ ...roomData(), guestUid: 'guest', guestName: 'ゲスト', guestColor: 456, guestDeckList: Array(40).fill({ name: 'x' }), participantUids: ['host', 'guest'], status: 'battling', hostRequestId: 2 });
  const ref = doc(env.authenticatedContext('guest').firestore(), 'pvpRooms', ROOM);
  await assertSucceeds(updateDoc(ref, { guestResponseId: 2, guestResponse: { choice: 1 } }));
  await assertFails(updateDoc(ref, { guestResponseId: 1, guestResponse: null }));
  await assertFails(updateDoc(ref, { guestResponseId: 2, guestResponse: null, publicState: { currency: 999999 } }));
});

test('private hands are readable only by their participant and writable only by host', async () => {
  await seedRoom({ ...roomData(), guestUid: 'guest', guestName: 'ゲスト', guestColor: 456, guestDeckList: Array(40).fill({ name: 'x' }), participantUids: ['host', 'guest'], status: 'battling' });
  const guestHand = doc(env.authenticatedContext('guest').firestore(), 'pvpRooms', ROOM, 'private', 'guest');
  const hostWritingGuestHand = doc(env.authenticatedContext('host').firestore(), 'pvpRooms', ROOM, 'private', 'guest');
  await assertSucceeds(setDoc(hostWritingGuestHand, { hand: Array(7).fill({ name: 'x' }) }));
  await assertSucceeds(getDoc(guestHand));
  await assertFails(getDoc(doc(env.authenticatedContext('stranger').firestore(), 'pvpRooms', ROOM, 'private', 'guest')));
  await assertFails(setDoc(guestHand, { hand: [] }));
  await assertFails(setDoc(hostWritingGuestHand, { hand: Array(8).fill({ name: 'x' }) }));
});

test('friend entries are private to their owner', async () => {
  const ownerRef = doc(env.authenticatedContext('alice').firestore(), 'pvpFriends', 'alice', 'entries', 'bob');
  await assertSucceeds(setDoc(ownerRef, { uid: 'bob', name: 'ボブ', lastPlayedAt: new Date() }));
  await assertSucceeds(getDoc(ownerRef));
  await assertFails(getDoc(doc(env.authenticatedContext('mallory').firestore(), 'pvpFriends', 'alice', 'entries', 'bob')));
  await assertFails(setDoc(doc(env.authenticatedContext('mallory').firestore(), 'pvpFriends', 'alice', 'entries', 'mallory'), { uid: 'mallory' }));
});

test('presence is writable only by self and readable only by listed friends', async () => {
  const aliceDb = env.authenticatedContext('alice').firestore();
  const bobDb = env.authenticatedContext('bob').firestore();
  await assertSucceeds(setDoc(doc(aliceDb, 'pvpFriends', 'alice', 'entries', 'bob'), { uid: 'bob', name: 'ボブ' }));
  await assertSucceeds(setDoc(doc(bobDb, 'pvpPresence', 'bob'), { uid: 'bob', name: 'ボブ', online: true, lastSeenAt: new Date() }));
  await assertSucceeds(getDoc(doc(aliceDb, 'pvpPresence', 'bob')));
  await assertFails(getDoc(doc(env.authenticatedContext('mallory').firestore(), 'pvpPresence', 'bob')));
  await assertFails(updateDoc(doc(aliceDb, 'pvpPresence', 'bob'), { online: false }));
});

test('only mutual friends can send and receive invitations', async () => {
  const aliceDb = env.authenticatedContext('alice').firestore();
  const bobDb = env.authenticatedContext('bob').firestore();
  const malloryDb = env.authenticatedContext('mallory').firestore();
  await assertSucceeds(setDoc(doc(aliceDb, 'pvpFriends', 'alice', 'entries', 'bob'), { uid: 'bob', name: 'ボブ' }));
  await assertSucceeds(setDoc(doc(bobDb, 'pvpFriends', 'bob', 'entries', 'alice'), { uid: 'alice', name: 'アリス' }));
  const inviteRef = doc(aliceDb, 'pvpInvites', 'invite-1');
  await assertSucceeds(setDoc(inviteRef, { inviterUid: 'alice', inviterName: 'アリス', recipientUid: 'bob', roomCode: '123', createdAt: new Date() }));
  await assertSucceeds(getDoc(doc(bobDb, 'pvpInvites', 'invite-1')));
  await assertFails(getDoc(doc(malloryDb, 'pvpInvites', 'invite-1')));
  await assertSucceeds(getDocs(query(collection(bobDb, 'pvpInvites'), where('recipientUid', '==', 'bob'))));
  await assertSucceeds(deleteDoc(doc(bobDb, 'pvpInvites', 'invite-1')));

  await assertSucceeds(setDoc(doc(malloryDb, 'pvpFriends', 'mallory', 'entries', 'bob'), { uid: 'bob', name: 'ボブ' }));
  await assertFails(setDoc(doc(malloryDb, 'pvpInvites', 'invite-spam'), { inviterUid: 'mallory', inviterName: 'マロリー', recipientUid: 'bob', roomCode: '999', createdAt: new Date() }));
});
