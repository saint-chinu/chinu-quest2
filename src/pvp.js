// 対人戦（PvP）のルーム管理 + ホスト権威モデルのリレー層。
//
// アーキテクチャ: 部屋を作った側（ホスト）のブラウザだけが本物のGame
// インスタンスを持ち、盤面計算・ダイス・カード抽選など全ロジックを実行
// する「権威」。参加した側（ゲスト）は入力を送るだけの薄いクライアント
// で、ホストが публish する公開状態（publicState）と自分の手札
// （private/{uid}.hand）を購読して画面を再現する。
//
// 同期はFirestoreのリアルタイムリスナー（onSnapshot）を使う - ターン制
// ゲームなので数百ms単位のレイテンシで十分「滑らか」に感じられる。
import { db, ensurePvpUser } from './firebase.js';
import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい0/O・1/I/Lは除外
const ROOM_CODE_LENGTH = 8;

export function normalizePvpParticipants(room) {
  if (!room) return [];
  const list = Array.isArray(room.participants) ? room.participants.filter((p) => p?.uid) : [];
  if (room.hostUid && !list.some((p) => p.uid === room.hostUid)) list.unshift({ uid: room.hostUid, name: room.hostName, color: room.hostColor, deckList: null, ready: true });
  if (room.guestUid && !list.some((p) => p.uid === room.guestUid)) list.push({ uid: room.guestUid, name: room.guestName, color: room.guestColor, deckList: room.guestDeckList, ready: true });
  return list.slice(0, 4).map((p, playerId) => ({ ...p, playerId }));
}

function randomRoomCode() {
  const randomBytes = new Uint32Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(randomBytes);
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[randomBytes[i] % ROOM_CODE_CHARS.length];
  }
  return code;
}

function roomRef(roomCode) {
  return doc(db, 'pvpRooms', roomCode.toUpperCase());
}

function privateHandRef(roomCode, uid) {
  return doc(db, 'pvpRooms', roomCode.toUpperCase(), 'private', uid);
}

/** Creates a new waiting room and returns its code + this browser's Firebase uid (host). `mapId` is the board layout the host picked (see board.js MAPS) - stored on the room so the guest builds the identical board. */
export async function createPvpRoom({ name, color, mapId, goalCurrency = 5000, playerCount = 2, allianceMode = false, randomAlliance = false, cpuNames = [] }) {
  const uid = await ensurePvpUser();
  const roomCode = randomRoomCode();
  await setDoc(roomRef(roomCode), {
    hostUid: uid,
    hostName: name,
    hostColor: color,
    mapId,
    goalCurrency,
    playerCount,
    allianceMode,
    randomAlliance,
    cpuNames: Array.isArray(cpuNames) ? cpuNames.slice(0, 3) : [],
    participants: [{ uid, name, color, deckList: null, ready: true }],
    participantUids: [uid],
    guestUid: null,
    guestName: null,
    guestColor: null,
    guestDeckList: null,
    status: 'waiting',
    createdAt: serverTimestamp(),
    publicState: null,
    hostRequestId: 0,
    hostRequest: null,
    guestResponseId: 0,
    guestResponse: null,
    guestActionId: 0,
    guestAction: null,
  });
  return { roomCode, uid, isHost: true };
}

/** Joins an existing waiting room as guest, submitting their deck choice in the same write (guests can only write further fields once past 'waiting' status per firestore.rules, so the deck has to ride along with the join itself). Throws a Japanese-language Error on failure (room not found / already full). */
export async function joinPvpRoom(roomCodeInput, { name, color, deckList }) {
  const roomCode = roomCodeInput.trim().toUpperCase();
  if (!Array.isArray(deckList) || deckList.length !== 40) throw new Error('参加には40枚のデッキ確定が必要です');
  const uid = await ensurePvpUser();
  const ref = roomRef(roomCode);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('その部屋コードは見つかりませんでした');
    const room = snap.data();
    if (room.status !== 'waiting') throw new Error('その部屋にはもう入れません（満員または対戦中）');
    const participants = Array.isArray(room.participants) ? room.participants.filter((p) => p?.uid) : [];
    const limit = Math.max(2, Math.min(4, Number(room.playerCount) || 2));
    if (participants.some((p) => p.uid === uid) || participants.length >= limit) throw new Error('その部屋にはもう入れません（満員または対戦中）');
    const update = { participants: [...participants, { uid, name, color, deckList, ready: true }], participantUids: [...participants.map((p) => p.uid), uid] };
    if (!room.guestUid) Object.assign(update, { guestUid: uid, guestName: name, guestColor: color, guestDeckList: deckList });
    tx.update(ref, update);
  });
  return { roomCode, uid, isHost: false };
}

/** ホスト専用: ロビーの「対戦開始」クリックと同時に呼ぶ。ゲスト側で購読中のroomリスナーがstatus:'battling'への変化を検知し、それを合図にゲスト側の盤面構築(startPvpGuestBattle)を始める。 */
export function beginPvpMatch(roomCode) {
  return updateDoc(roomRef(roomCode), { status: 'battling' });
}

/** Subscribes to the room document. `onChange(room|null)` fires on every update; call the returned function to unsubscribe. */
export function listenToRoom(roomCode, onChange) {
  return onSnapshot(roomRef(roomCode), (snap) => onChange(snap.exists() ? snap.data() : null));
}

/** Subscribes to `uid`'s private hand within the room (only that uid can read it per firestore.rules). */
export function listenToPrivateHand(roomCode, uid, onChange) {
  return onSnapshot(privateHandRef(roomCode, uid), (snap) => onChange(snap.exists() ? snap.data().hand : []));
}

export function leavePvpRoom(roomCode, { isHost }) {
  return isHost ? deleteDoc(roomRef(roomCode)) : Promise.resolve();
}

// ---- ホスト専用: 権威状態のpublish ----

export function publishPublicState(roomCode, publicState) {
  return updateDoc(roomRef(roomCode), { publicState });
}

export function publishPrivateHand(roomCode, uid, hand) {
  return setDoc(privateHandRef(roomCode, uid), { hand });
}

export function publishHostRequest(roomCode, requestId, request) {
  return updateDoc(roomRef(roomCode), { hostRequestId: requestId, hostRequest: request });
}

export function finishPvpRoom(roomCode) {
  return updateDoc(roomRef(roomCode), { status: 'finished' });
}

// ---- ゲスト専用: hostRequestへの回答 ----

export function sendGuestResponse(roomCode, requestId, response) {
  // Firestoreはフィールド値にundefinedを許さない（promptCardReveal等、
  // 「確認しました」の意味でresolve()を引数なしで呼ぶ型があるため、ここで
  // 必ずnullへ丸める）。
  return updateDoc(roomRef(roomCode), { guestResponseId: requestId, guestResponse: response === undefined ? null : response });
}

/**
 * ホスト側のリレー: ゲストの手番の意思決定をFirestore経由で尋ね、答えが
 * 返ってくるまで待つPromiseを返す。Gameの各onXxxコールバックにそのまま
 * differのtypeで束縛して渡す想定（例: onConfirmMove:
 * (payload) => relay.ask('confirmMove', payload)）。
 */
export class HostGuestRelay {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.nextRequestId = 1;
    this.pending = null; // { requestId, resolve, reject, timer }
    this.unsubscribe = listenToRoom(roomCode, (room) => {
      if (!room || !this.pending) return;
      if (room.guestResponseId === this.pending.requestId) {
        const { resolve, timer } = this.pending;
        this.pending = null;
        clearTimeout(timer);
        resolve(room.guestResponse);
      }
    });
  }

  ask(type, payload) {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending || this.pending.requestId !== requestId) return;
        this.pending = null;
        reject(new Error('対戦相手からの応答がタイムアウトしました'));
      }, 45000);
      this.pending = { requestId, resolve, reject, timer };
      publishHostRequest(this.roomCode, requestId, { type, payload });
    });
  }

  destroy() {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('対戦リレーが終了しました'));
      this.pending = null;
    }
    this.unsubscribe();
  }
}

/**
 * ゲスト側のリレー: hostRequestの変化を監視し、`handlers[type](payload)`
 * を呼んでその戻り値をguestResponseとして送り返す。handlersは
 * main.jsの既存prompt*関数（promptConfirmMove等）をtypeごとに束ねたもの
 * を渡す想定 - ローカル対戦のUIをそのまま再利用できる。
 */
export class GuestHostListener {
  constructor(roomCode, uid, handlers) {
    this.roomCode = roomCode;
    this.uid = uid;
    this.handlers = handlers;
    this.lastHandledRequestId = 0;
    this.unsubscribe = listenToRoom(roomCode, (room) => {
      if (!room || !room.hostRequest) return;
      if (room.hostRequestId <= this.lastHandledRequestId) return;
      this.lastHandledRequestId = room.hostRequestId;
      this._handle(room.hostRequestId, room.hostRequest);
    });
  }

  async _handle(requestId, { type, payload }) {
    try {
      const handler = this.handlers[type];
      const response = handler ? await handler(payload) : null;
      await sendGuestResponse(this.roomCode, requestId, response);
    } catch (error) {
      await sendGuestResponse(this.roomCode, requestId, null);
    }
  }

  destroy() {
    this.unsubscribe();
  }
}

// ---- ゲスト発の自発的アクション（ダイスを振る/スペルを使う）----
// hostRequest/guestResponse（ホストが尋ねてゲストが答える）とは逆方向の
// 一方向チャンネル。ゲストが手番中に「自分から」起こす操作用 - 応答は
// 待たない（ホスト側のGameシミュレーションが結果を計算し、その結果は
// 通常のpublicState/private hand経由で両者に伝わる）。

export function sendGuestAction(roomCode, actionId, action) {
  return updateDoc(roomRef(roomCode), { guestActionId: actionId, guestAction: action });
}

function participantActionRef(roomCode, uid) {
  return doc(db, 'pvpRooms', roomCode.toUpperCase(), 'actions', uid);
}

export function sendParticipantAction(roomCode, uid, actionId, action) {
  return setDoc(participantActionRef(roomCode, uid), { actionId, action, uid });
}

/** ゲスト側で使う、送信ごとにactionIdを自動採番する薄いラッパー。 */
export class GuestActionSender {
  constructor(roomCode, uid = null) {
    this.roomCode = roomCode;
    this.uid = uid;
    this.nextActionId = 1;
  }
  send(action) {
    const actionId = this.nextActionId;
    this.nextActionId += 1;
    const payload = { ...action, actionId, uid: this.uid };
    return this.uid ? sendParticipantAction(this.roomCode, this.uid, actionId, payload) : sendGuestAction(this.roomCode, actionId, payload);
  }
}

export class HostParticipantActionListener {
  constructor(roomCode, participantUids, onAction) {
    this.unsubscribers = [];
    this.lastHandled = new Map();
    for (const uid of (participantUids || []).filter(Boolean)) {
      const unsubscribe = onSnapshot(participantActionRef(roomCode, uid), (snap) => {
        const data = snap.data();
        if (!data || data.uid !== uid || Number(data.actionId) <= (this.lastHandled.get(uid) || 0)) return;
        this.lastHandled.set(uid, Number(data.actionId));
        onAction(data.action);
      });
      this.unsubscribers.push(unsubscribe);
    }
  }
  destroy() { this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe()); }
}

/** ホスト側: ゲストの自発的アクションを購読する。onActionは新しいアクションが来るたびに呼ばれる。 */
export class HostActionListener {
  constructor(roomCode, onAction) {
    this.roomCode = roomCode;
    this.lastHandledActionId = 0;
    this.unsubscribe = listenToRoom(roomCode, (room) => {
      if (!room || !room.guestAction) return;
      if (room.guestActionId <= this.lastHandledActionId) return;
      this.lastHandledActionId = room.guestActionId;
      onAction(room.guestAction);
    });
  }

  destroy() {
    this.unsubscribe();
  }
}
