import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-chinuquest2';
const ROOM = 'ABCDEFGH';
let env;

const roomData = (hostUid = 'host') => ({
  hostUid,
  hostName: 'ホスト',
  hostColor: 123,
  mapId: 'stage1',
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
  await assertSucceeds(updateDoc(ref, {
    guestUid: 'guest', guestName: 'ゲスト', guestColor: 456,
    guestDeckList: Array.from({ length: 40 }, (_, i) => ({ name: `card-${i}` })),
    status: 'active',
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
  await seedRoom({ ...roomData(), guestUid: 'guest', guestName: 'ゲスト', guestColor: 456, guestDeckList: Array(40).fill({ name: 'x' }), status: 'battling', hostRequestId: 2 });
  const ref = doc(env.authenticatedContext('guest').firestore(), 'pvpRooms', ROOM);
  await assertSucceeds(updateDoc(ref, { guestResponseId: 2, guestResponse: { choice: 1 } }));
  await assertFails(updateDoc(ref, { guestResponseId: 1, guestResponse: null }));
  await assertFails(updateDoc(ref, { guestResponseId: 2, guestResponse: null, publicState: { currency: 999999 } }));
});

test('private hands are readable only by their participant and writable only by host', async () => {
  await seedRoom({ ...roomData(), guestUid: 'guest', guestName: 'ゲスト', guestColor: 456, guestDeckList: Array(40).fill({ name: 'x' }), status: 'battling' });
  const guestHand = doc(env.authenticatedContext('guest').firestore(), 'pvpRooms', ROOM, 'private', 'guest');
  const hostWritingGuestHand = doc(env.authenticatedContext('host').firestore(), 'pvpRooms', ROOM, 'private', 'guest');
  await assertSucceeds(setDoc(hostWritingGuestHand, { hand: Array(7).fill({ name: 'x' }) }));
  await assertSucceeds(getDoc(guestHand));
  await assertFails(getDoc(doc(env.authenticatedContext('stranger').firestore(), 'pvpRooms', ROOM, 'private', 'guest')));
  await assertFails(setDoc(guestHand, { hand: [] }));
  await assertFails(setDoc(hostWritingGuestHand, { hand: Array(8).fill({ name: 'x' }) }));
});
