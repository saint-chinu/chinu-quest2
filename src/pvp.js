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

const ROOM_CODE_LENGTH = 3;

export function normalizePvpParticipants(room) {
  if (!room) return [];
  const source = Array.isArray(room.participants) ? room.participants.filter((p) => p?.uid) : [];
  // playerIdはGame内の配列順そのものになる。Firestore更新や旧ルーム移行で
  // participantsの並びが変わっても、ホストは必ずplayerId=0に固定する。
  // ここがずれるとゲスト画面でホストの駒にCPU（例: 少女A）の名前が対応する。
  const seen = new Set();
  const unique = source.filter((p) => {
    if (seen.has(p.uid)) return false;
    seen.add(p.uid);
    return true;
  });
  const host = room.hostUid ? unique.find((p) => p.uid === room.hostUid) : null;
  const list = host ? [host, ...unique.filter((p) => p.uid !== room.hostUid)] : [...unique];
  if (room.hostUid && !list.some((p) => p.uid === room.hostUid)) list.unshift({ uid: room.hostUid, name: room.hostName, color: room.hostColor, deckList: null, ready: true });
  if (room.guestUid && !list.some((p) => p.uid === room.guestUid)) list.push({ uid: room.guestUid, name: room.guestName, color: room.guestColor, deckList: room.guestDeckList, ready: true });
  return list.slice(0, 4).map((p, playerId) => ({ ...p, playerId }));
}

function randomRoomCode() {
  const randomValue = new Uint32Array(1);
  crypto.getRandomValues(randomValue);
  return String(randomValue[0] % (10 ** ROOM_CODE_LENGTH)).padStart(ROOM_CODE_LENGTH, '0');
}

function roomRef(roomCode) {
  return doc(db, 'pvpRooms', roomCode.toUpperCase());
}

function privateHandRef(roomCode, uid) {
  return doc(db, 'pvpRooms', roomCode.toUpperCase(), 'private', uid);
}
function promptRef(roomCode, uid) {
  return doc(db, 'pvpRooms', roomCode.toUpperCase(), 'prompts', uid);
}
function promptResponseRef(roomCode, uid) {
  return doc(db, 'pvpRooms', roomCode.toUpperCase(), 'promptResponses', uid);
}

/** Creates a new waiting room and returns its code + this browser's Firebase uid (host). `mapId` is the board layout the host picked (see board.js MAPS) - stored on the room so the guest builds the identical board. */
export async function createPvpRoom({ name, color, iconDataUrl = '', mapId, goalCurrency = 5000, playerCount = 2, allianceMode = false, randomAlliance = false, cpuNames = [] }) {
  const uid = await ensurePvpUser();
  const roomData = {
    hostUid: uid,
    hostName: name,
    hostColor: color,
    mapId,
    goalCurrency,
    playerCount,
    allianceMode,
    randomAlliance,
    cpuNames: Array.isArray(cpuNames) ? cpuNames.slice(0, 3) : [],
    participants: [{ uid, name, color, iconDataUrl, deckList: null, ready: true }],
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
  };
  // 3桁コードは総数が少ないため、既存ルームへの上書きを避けて衝突時は再抽選する。
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const roomCode = randomRoomCode();
    try {
      // 他人の既存ルームならFirestoreルールがupdateを拒否するので再抽選。
      // 存在確認のgetを先に行うと、存在しない文書のread自体がルールで拒否
      // されるため、createを直接試す。
      await setDoc(roomRef(roomCode), roomData);
      return { roomCode, uid, isHost: true };
    } catch (error) {
      if (error?.code === 'permission-denied') continue;
      throw error;
    }
  }
  throw new Error('空いている部屋コードを確保できませんでした。少し待って再試行してください');
}

/** Joins an existing waiting room as guest, submitting their deck choice in the same write (guests can only write further fields once past 'waiting' status per firestore.rules, so the deck has to ride along with the join itself). Throws a Japanese-language Error on failure (room not found / already full). */
export async function joinPvpRoom(roomCodeInput, { name, color, iconDataUrl = '', deckList }) {
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
    const update = { participants: [...participants, { uid, name, color, iconDataUrl, deckList, ready: true }], participantUids: [...participants.map((p) => p.uid), uid] };
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
    // Firestore上の要求欄は各相手につき1本しかない。演出を投げっぱなしで
    // 連続送信すると後の要求が前を上書きするため、相手ごとに必ず直列化する。
    this.legacyQueue = Promise.resolve();
    this.participantQueues = new Map();
    this.participantPending = new Set();
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
    const task = this.legacyQueue.catch(() => {}).then(() => this._askLegacyNow(type, payload));
    this.legacyQueue = task.catch(() => {});
    return task;
  }

  _askLegacyNow(type, payload) {
    const requestId = this.nextRequestId++;
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

  askParticipant(uid, type, payload) {
    const previous = this.participantQueues.get(uid) || Promise.resolve();
    const task = previous.catch(() => {}).then(() => this._askParticipantNow(uid, type, payload));
    this.participantQueues.set(uid, task.catch(() => {}));
    return task;
  }

  _askParticipantNow(uid, type, payload) {
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const record = { uid, requestId, timer: null, stop: null, reject };
      const finish = (fn, value) => {
        clearTimeout(record.timer);
        record.stop?.();
        this.participantPending.delete(record);
        fn(value);
      };
      record.timer = setTimeout(() => finish(reject, new Error('参加者の応答がタイムアウトしました')), 45000);
      this.participantPending.add(record);
      const stop = onSnapshot(promptResponseRef(this.roomCode, uid), (snap) => {
        const data = snap.data();
        if (!data || data.requestId !== requestId || !this.participantPending.has(record)) return;
        finish(resolve, data.value);
      });
      record.stop = stop;
      setDoc(promptRef(this.roomCode, uid), { requestId, type, payload }).catch((error) => finish(reject, error));
    });
  }

  destroy() {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('対戦リレーが終了しました'));
      this.pending = null;
    }
    for (const record of this.participantPending) {
      clearTimeout(record.timer);
      record.stop?.();
      record.reject(new Error('対戦リレーが終了しました'));
    }
    this.participantPending.clear();
    this.participantQueues.clear();
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
    this.lastHandledPromptId = 0;
    this.unsubscribe = listenToRoom(roomCode, (room) => {
      if (!room || !room.hostRequest) return;
      if (room.hostRequestId <= this.lastHandledRequestId) return;
      this.lastHandledRequestId = room.hostRequestId;
      this._handle(room.hostRequestId, room.hostRequest);
    });
    this.promptUnsubscribe = onSnapshot(promptRef(roomCode, uid), (snap) => {
      const prompt = snap.data();
      if (!prompt || prompt.requestId <= this.lastHandledPromptId) return;
      this.lastHandledPromptId = prompt.requestId;
      this._handleParticipant(prompt.requestId, prompt);
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

  async _handleParticipant(requestId, { type, payload }) {
    try {
      const response = this.handlers[type] ? await this.handlers[type](payload) : null;
      await setDoc(promptResponseRef(this.roomCode, this.uid), { requestId, value: response ?? null });
    } catch { await setDoc(promptResponseRef(this.roomCode, this.uid), { requestId, value: null }); }
  }

  destroy() {
    this.unsubscribe();
    this.promptUnsubscribe?.();
  }
}

// ---- ゲスト発の自発的アクション（ダイスを振る/スペルを使う）----
// hostRequest/guestResponse（ホストが尋ねてゲストが答える）とは逆方向の
// 一方向チャンネル。ゲストが手番中に「自分から」起こす操作用 - 応答は
// 待たない（ホスト側のGameシミュレーションが結果を計算し、その結果は
// 通常のpublicState/private hand経由で両者に伝わる）。
//
// 参加者ごとの`actions/{uid}`サブコレクション（sendParticipantAction）が
// 唯一の経路。旧2人専用の`sendGuestAction`（room文書の`guestActionId`/
// `guestAction`フィールド）は、GuestActionSenderが常にuid付きで生成される
// ようになった時点で到達不能になったため削除した（`HostActionListener`も
// 同様に不要になったため削除 - 参加者チャンネルはHostParticipantActionListener
// が一元的にカバーする）。

function participantActionRef(roomCode, uid) {
  return doc(db, 'pvpRooms', roomCode.toUpperCase(), 'actions', uid);
}

export function sendParticipantAction(roomCode, uid, actionId, action) {
  return setDoc(participantActionRef(roomCode, uid), { actionId, action, uid, lastSeen: serverTimestamp() });
}

/** ゲスト側で使う、送信ごとにactionIdを自動採番する薄いラッパー。 */
export class GuestActionSender {
  constructor(roomCode, uid) {
    this.roomCode = roomCode;
    this.uid = uid;
    // 再接続・再読込後も以前のactionIdより必ず大きくなるよう時刻を起点にする。
    this.nextActionId = Date.now();
    this.heartbeat = setInterval(() => this.send({ type: 'heartbeat' }).catch(() => {}), 10000);
  }
  send(action) {
    const actionId = this.nextActionId;
    this.nextActionId += 1;
    const payload = { ...action, actionId, uid: this.uid };
    return sendParticipantAction(this.roomCode, this.uid, actionId, payload);
  }
  destroy() { if (this.heartbeat) clearInterval(this.heartbeat); }
}

export class HostParticipantPresenceMonitor {
  constructor(roomCode, participantUids, onOffline) {
    this.lastSeen = new Map();
    this.timers = (participantUids || []).filter(Boolean).map((uid) => setInterval(() => {
      const seen = this.lastSeen.get(uid);
      if (seen && Date.now() - seen > 30000) { this.lastSeen.delete(uid); onOffline(uid); }
    }, 10000));
    this.unsubscribe = (participantUids || []).filter(Boolean).map((uid) => onSnapshot(participantActionRef(roomCode, uid), (snap) => {
      const ts = snap.data()?.lastSeen;
      if (ts?.toMillis) this.lastSeen.set(uid, ts.toMillis());
    }));
  }
  destroy() { this.timers.forEach(clearInterval); this.unsubscribe.forEach((stop) => stop()); }
}

export class HostParticipantActionListener {
  constructor(roomCode, participantUids, onAction) {
    this.unsubscribers = [];
    this.lastHandled = new Map();
    for (const uid of (participantUids || []).filter(Boolean)) {
      const unsubscribe = onSnapshot(participantActionRef(roomCode, uid), (snap) => {
        const data = snap.data();
        // 購読開始時にFirestoreへ残っている前回の操作は基準値として記録し、
        // 現在の対戦で新しく届いた操作だけを実行する。
        if (!this.lastHandled.has(uid)) {
          this.lastHandled.set(uid, Number(data?.actionId) || 0);
          return;
        }
        if (!data || data.uid !== uid || Number(data.actionId) <= (this.lastHandled.get(uid) || 0)) return;
        this.lastHandled.set(uid, Number(data.actionId));
        onAction(data.action);
      });
      this.unsubscribers.push(unsubscribe);
    }
  }
  destroy() { this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe()); }
}
