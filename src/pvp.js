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
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい0/O・1/I/Lは除外
const ROOM_CODE_LENGTH = 5;

function randomRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function roomRef(roomCode) {
  return doc(db, 'pvpRooms', roomCode.toUpperCase());
}

function privateHandRef(roomCode, uid) {
  return doc(db, 'pvpRooms', roomCode.toUpperCase(), 'private', uid);
}

/** Creates a new waiting room and returns its code + this browser's Firebase uid (host). */
export async function createPvpRoom({ name, color }) {
  const uid = await ensurePvpUser();
  const roomCode = randomRoomCode();
  await setDoc(roomRef(roomCode), {
    hostUid: uid,
    hostName: name,
    hostColor: color,
    guestUid: null,
    guestName: null,
    guestColor: null,
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

/** Joins an existing waiting room as guest. Throws a Japanese-language Error on failure (room not found / already full). */
export async function joinPvpRoom(roomCodeInput, { name, color }) {
  const roomCode = roomCodeInput.trim().toUpperCase();
  const ref = roomRef(roomCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('その部屋コードは見つかりませんでした');
  const room = snap.data();
  if (room.status !== 'waiting' || room.guestUid) throw new Error('その部屋にはもう入れません（満員または対戦中）');

  const uid = await ensurePvpUser();
  await updateDoc(ref, {
    guestUid: uid,
    guestName: name,
    guestColor: color,
    status: 'active',
  });
  return { roomCode, uid, isHost: false };
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
    this.pending = null; // { requestId, resolve }
    this.unsubscribe = listenToRoom(roomCode, (room) => {
      if (!room || !this.pending) return;
      if (room.guestResponseId === this.pending.requestId) {
        const { resolve } = this.pending;
        this.pending = null;
        resolve(room.guestResponse);
      }
    });
  }

  ask(type, payload) {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve) => {
      this.pending = { requestId, resolve };
      publishHostRequest(this.roomCode, requestId, { type, payload });
    });
  }

  destroy() {
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
    const handler = this.handlers[type];
    const response = handler ? await handler(payload) : null;
    await sendGuestResponse(this.roomCode, requestId, response);
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

/** ゲスト側で使う、送信ごとにactionIdを自動採番する薄いラッパー。 */
export class GuestActionSender {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.nextActionId = 1;
  }
  send(action) {
    const actionId = this.nextActionId;
    this.nextActionId += 1;
    return sendGuestAction(this.roomCode, actionId, action);
  }
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
