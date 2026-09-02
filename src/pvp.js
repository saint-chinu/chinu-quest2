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
import { PvpContiguousAckTracker, pvpSequenceBase } from './pvpQueue.js';
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

/**
 * ホストが選んだ盤面BGM（audio.jsのTRACK_SRCキー）を部屋へ書き込む。
 *
 * createPvpRoomのペイロードに混ぜないのは、firestore.rulesのcreateが
 * keys().hasOnly([...])でフィールドを固定しているため。ルール側は手動
 * デプロイ（CIに含まれていない）なので、キーを増やすとルールを更新する
 * までPvPの部屋作成そのものが permission-denied で全滅する。ホストの
 * updateはキー制限が無い（hostUid/guestUidを変えないことだけが条件）ので、
 * 作成直後の追記なら既存ルールのまま通る。
 * 失敗しても対戦自体は成立させたいので、呼び出し側で握り潰してよい。
 */
export async function setPvpRoomBgmTrack(roomCode, bgmTrack) {
  if (!bgmTrack) return;
  await updateDoc(roomRef(roomCode), { bgmTrack });
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

/** ゲスト切断復帰用: 購読を張る前に一度だけ部屋の現況を読む（存在確認・状態確認）。 */
export async function fetchPvpRoomOnce(roomCode) {
  const snap = await getDoc(roomRef(roomCode));
  return snap.exists() ? snap.data() : null;
}

/** Subscribes to `uid`'s private hand within the room (only that uid can read it per firestore.rules). */
export function listenToPrivateHand(roomCode, uid, onChange) {
  return onSnapshot(privateHandRef(roomCode, uid), (snap) => onChange(snap.exists() ? snap.data().hand : []));
}

export function leavePvpRoom(roomCode, { isHost }) {
  return isHost ? deleteDoc(roomRef(roomCode)) : Promise.resolve();
}

// ---- ホスト専用: 権威状態のpublish ----

/**
 * 公開状態のpublish。tilesは全体の9割超（盤面が埋まると約10KB）を占める一方、
 * 実際に変わるのは召喚・侵略・レベルアップの時だけ。対してisBusy/awaitingRoll等の
 * 軽い項目は1手番に何度も切り替わる。毎回まるごと書くと、変わっていない盤面を
 * 何度も送り直すことになり、通信の遅い回線では召喚・通行料・分岐のたびに
 * 目に見えて重くなる。そこでtilesが変わっていない時はドット記法で軽い項目だけを
 * 更新し、部屋ドキュメント自体は常に完全な状態を保つ（再接続時の復元に必要）。
 */
export function publishPublicState(roomCode, publicState, { includeTiles = true, includeTurnHand = true } = {}) {
  const { tiles, turnHand, ...light } = publicState;
  const update = {};
  for (const [key, value] of Object.entries(light)) update[`publicState.${key}`] = value;
  if (includeTiles) update['publicState.tiles'] = tiles ?? [];
  // turnHand（手番プレイヤーの公開手札）はカード定義まるごとで3〜5KBある割に
  // 変わるのはドロー・使用時だけ。tilesと同じく据え置き時は送らない。
  if (includeTurnHand) update['publicState.turnHand'] = turnHand ?? [];
  return updateDoc(roomRef(roomCode), update);
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
/**
 * Firestoreはフィールド値にundefinedを一切許さず、setDoc()は
 * 「Unsupported field value: undefined」を**同期的にthrow**する。
 * 中継する演出ペイロードは各所でオブジェクトリテラルとして組まれており、
 * 値が入らない項目（例: 反射・道連れのexchangeにはattackPower/
 * elementMultiplierが無い）はundefinedのまま載る。これをそのまま送ると
 * 送信時に例外が飛び、呼び出し元の戦闘処理ごと巻き添えで停止していた
 * （対人戦だけで起きる現象。CPU戦はFirestoreを通らないため無害）。
 * 送信直前にundefinedをnullへ均し、キー自体は保つ（受信側は?? / 既定値で
 * 扱っており、nullでも従来と同じ挙動になる）。
 */
function stripUndefined(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripUndefined);
  const out = {};
  for (const [key, entry] of Object.entries(value)) out[key] = stripUndefined(entry);
  return out;
}

export class HostGuestRelay {
  constructor(roomCode, { enableLegacy = false } = {}) {
    this.roomCode = roomCode;
    this.nextRequestId = 1;
    this.pending = null; // { requestId, resolve, reject, timer }
    // 旧: room.hostRequest 1本のレガシーチャンネル（現行コードでは未使用だが
    // 保守のため残す）。
    this.legacyQueue = Promise.resolve();
    // 参加者チャンネルはprompts/{uid}へ「未ACKイベントの配列」をまとめて書く
    // アウトボックス方式。旧実装は1文書=1イベントで、応答が返るまで次を送れず
    // 演出1件ごとにFirestore往復1回ぶんの待ちが直列に積み上がっていた
    // （移動1ターンで7件≈3〜6秒の純粋な通信待ち）。配列ならリスナーの
    // スナップショット合体（連続書き込みで最新だけ届く）でも取りこぼさない。
    // uid → { outbox, nextId, lastFlushedId, flushing, dirty,
    //         doneWaiters:[{id,resolve,reject,timer}], valueWaiters:Map,
    //         respUnsub }
    this.participants = new Map();
    this.destroyed = false;
    this.unsubscribe = null;
    if (enableLegacy) this._ensureLegacyListener();
  }

  _ensureLegacyListener() {
    if (this.unsubscribe) return;
    this.unsubscribe = listenToRoom(this.roomCode, (room) => {
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
    this._ensureLegacyListener();
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

  _participantState(uid) {
    let state = this.participants.get(uid);
    if (state) return state;
    state = {
      outbox: [],
      // ホストの再読込をまたいでも必ず増加するよう時刻起点で採番する
      // （GuestActionSenderと同じ理屈。ゲスト側はid比較だけで新旧を判定する）。
      nextId: pvpSequenceBase(),
      lastFlushedId: 0,
      flushing: false,
      dirty: false,
      doneWaiters: [],
      valueWaiters: new Map(),
      respUnsub: null,
      degraded: false,
      generation: 0,
      offline: false,
    };
    state.respUnsub = onSnapshot(promptResponseRef(this.roomCode, uid), (snap) => {
      const data = snap.data();
      if (!data) return;
      // requestId = ゲストが処理し終えた最後のイベントid（単調増加の水位）。
      // スナップショットが合体して途中の応答が飛んでも、水位比較なら安全。
      const doneSeq = Number(data.requestId) || 0;
      if (doneSeq > (state.ackedThrough || 0)) state.ackedThrough = doneSeq;
      state.degraded = false; // 応答が来た＝追いついたので演出同期の待機を再開する
      const before = state.outbox.length;
      state.outbox = state.outbox.filter((event) => event.id > doneSeq);
      state.doneWaiters = state.doneWaiters.filter((waiter) => {
        if (waiter.id > doneSeq) return true;
        clearTimeout(waiter.timer);
        waiter.resolve();
        return false;
      });
      // 対話プロンプトの回答は value = { id, v }。対話は必ず1件ずつしか
      // 出さない（Game側がawaitする）ので上書き競合は起きない。
      const answer = data.value;
      if (answer && typeof answer === 'object' && state.valueWaiters.has(answer.id)) {
        const waiter = state.valueWaiters.get(answer.id);
        state.valueWaiters.delete(answer.id);
        clearTimeout(waiter.timer);
        waiter.resolve(answer.v);
      }
      // ACKでアウトボックスが縮んだら、書き込みサイズ上限で送り残していた
      // 後続イベントを次のflushで届ける。
      if (before !== state.outbox.length && state.outbox.length > 0) this._flushParticipant(uid);
      // 全件ACKでアウトボックスが空になったら、文書に残った送信済みイベントを
      // 掃除する（残したままだとゲストの再読込時にackedThroughが古いままの
      // 文書から過去の演出が再放送される）。連続する演出の合間に無駄な書込を
      // しないよう少し待ち、新規イベントが来たらキャンセルする。
      if (before !== state.outbox.length && state.outbox.length === 0) {
        clearTimeout(state.cleanupTimer);
        state.cleanupTimer = setTimeout(() => {
          if (this.destroyed || state.outbox.length > 0) return;
          setDoc(promptRef(this.roomCode, uid), {
            requestId: state.lastFlushedId,
            type: '__batch',
            payload: { events: [], ackedThrough: state.ackedThrough || 0 },
          }).catch(() => {});
        }, 1500);
      }
    });
    this.participants.set(uid, state);
    return state;
  }

  /**
   * 参加者チャンネルへの送信。mode:
   *  'fire'  = 投げっぱなし演出（即resolve。ゲストは順番に再生するだけ）
   *  'done'  = ゲストの再生完了まで待つ演出（pieceMove等。値は返らない）
   *  'value' = 対話プロンプト（回答値が返る）
   * どのmodeも同じアウトボックスに積まれるため、ゲスト側の実行順序は
   * 常にenqueue順と一致する（旧実装の1件ずつ直列と同じ保証）。
   */
  enqueueParticipant(uid, type, payload, mode = 'value') {
    if (this.destroyed) return Promise.reject(new Error('対戦リレーが終了しました'));
    const state = this._participantState(uid);
    // 切断中の端末へ演出列を積み続けない。復帰時はpublicStateの完全状態を先に
    // 適用するため、見ていなかった装飾イベントを全再生する必要はない。
    if (state.offline) {
      if (mode === 'fire') return Promise.resolve();
      return Promise.reject(new Error('参加者はオフラインです'));
    }
    clearTimeout(state.cleanupTimer);
    // 応答が滞っている相手('done'が一度時間切れした相手)には、以後の演出同期を
    // 待たない。相手のイベント列が人間の入力待ち等で止まっている間、こちらは
    // 演出のたびに待ち時間を丸ごと積み増して盤面全体が固まってしまうため。
    // 配信自体は続けるので、相手が追いついた時点（応答受信）で自動復帰する。
    if (mode === 'done' && state.degraded) mode = 'fire';
    const id = state.nextId++;
    state.outbox.push({ id, type, payload: stripUndefined(payload), ack: mode !== 'fire', wantValue: mode === 'value' });
    // 投げっぱなし演出は50msだけ待ってまとめて送る（手番開始時のturnFocus/
    // diceResult/moveDestination等の連発を1書き込みに束ね、未ACK再送の重複も
    // 減らす）。応答を待つ質問・完了待ちは即時送信。
    this._scheduleFlush(uid, mode !== 'fire');
    if (mode === 'fire') return Promise.resolve();
    // 'value'（人間への質問）は考える時間が要るので長め。'done'（演出の同期待ち）は
    // 人の入力を待たない画面合わせでしかないので、届かなければ短時間で見切る。
    // ここを質問と同じ45秒にしていたため、相手の画面が何かで止まると1演出ごとに
    // 45秒積み上がり、ホスト側の進行が数十秒単位で凍りついていた。
    const timeoutMs = mode === 'value' ? 45000 : 4000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.doneWaiters = state.doneWaiters.filter((waiter) => waiter.id !== id);
        state.valueWaiters.delete(id);
        if (mode === 'done') state.degraded = true;
        reject(new Error('参加者の応答がタイムアウトしました'));
      }, timeoutMs);
      if (mode === 'value') state.valueWaiters.set(id, { resolve, reject, timer });
      else state.doneWaiters.push({ id, resolve, reject, timer });
    });
  }

  askParticipant(uid, type, payload) {
    return this.enqueueParticipant(uid, type, payload, 'value');
  }

  broadcastParticipant(uid, type, payload, awaitDone = false) {
    return this.enqueueParticipant(uid, type, payload, awaitDone ? 'done' : 'fire');
  }

  /**
   * A disconnected guest cannot answer its already-issued prompt. Reject the
   * host wait immediately and fast-forward that guest's cosmetic backlog; the
   * authoritative publicState rebuilds the current board on reconnect.
   */
  markParticipantOffline(uid) {
    // まだ演出を1件も送っていない相手でも切断状態を保持する。
    // get()だけにすると、その後の最初の質問で新規stateがoffline=false
    // として作られ、45秒の応答待ちに入ってしまう。
    const state = this._participantState(uid);
    const resetThrough = Math.max(
      state.ackedThrough || 0,
      state.lastFlushedId || 0,
      state.outbox[state.outbox.length - 1]?.id || 0,
    );
    const error = new Error('参加者の通信が切断されました');
    for (const waiter of state.doneWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    for (const waiter of state.valueWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    state.doneWaiters = [];
    state.valueWaiters.clear();
    state.outbox = [];
    state.ackedThrough = resetThrough;
    state.lastFlushedId = resetThrough;
    state.degraded = true;
    state.offline = true;
    state.dirty = false;
    state.generation += 1;
    clearTimeout(state.cleanupTimer);
    if (state.flushTimer) { clearTimeout(state.flushTimer); state.flushTimer = null; }
    setDoc(promptRef(this.roomCode, uid), {
      requestId: resetThrough,
      type: '__batch',
      payload: { events: [], ackedThrough: resetThrough },
    }).catch(() => {});
  }

  markParticipantOnline(uid) {
    const state = this.participants.get(uid);
    if (!state) return;
    state.offline = false;
    // degradedはハートビート（生存確認、約10秒ごと）ではなく応答受信
    // （respUnsub、キューに追いついた時点）でのみ解除する。ここで毎回
    // 解除すると、生きてはいるがキューが詰まっているだけの参加者に対して
    // 4秒ブロッキングのdone waitを何度も再武装してしまう。
  }

  _scheduleFlush(uid, urgent) {
    const state = this._participantState(uid);
    if (urgent) {
      if (state.flushTimer) { clearTimeout(state.flushTimer); state.flushTimer = null; }
      // 送信の失敗で呼び出し元（進行中の戦闘・移動処理）を巻き込まない。
      // 同期throwはPromiseの外で飛ぶため、relayable側の.catchでは受けられない。
      try { this._flushParticipant(uid); } catch (error) { console.warn('PvP prompt flush threw synchronously', error); }
      return;
    }
    if (state.flushTimer) return;
    state.flushTimer = setTimeout(() => {
      state.flushTimer = null;
      try { this._flushParticipant(uid); } catch (error) { console.warn('PvP prompt flush threw synchronously', error); }
    }, 50);
  }

  _flushParticipant(uid) {
    const state = this.participants.get(uid);
    if (!state || this.destroyed) return;
    if (state.flushing) { state.dirty = true; return; }
    if (state.outbox.length === 0) return;
    // Firestoreの1MB文書上限対策: 送信分をおおまかなJSONサイズで区切る。
    // 送り残しはACKでアウトボックスが縮んだ時に再flushされる。
    const events = [];
    let size = 0;
    for (const event of state.outbox) {
      size += JSON.stringify(event).length;
      if (events.length > 0 && size > 200000) break;
      events.push(event);
    }
    const requestId = events[events.length - 1].id;
    if (requestId === state.lastFlushedId && !state.dirty) return;
    state.flushing = true;
    state.lastFlushedId = requestId;
    const generation = state.generation;
    // 旧ルールのフィールド制限（requestId/type/payload）の枠内に収める:
    // type='__batch'、payload.eventsに未ACKイベント一覧。スナップショットが
    // 合体しても常に「未ACKの全件」が入っているので取りこぼさない。
    // ackedThroughはゲストがACK済みの水位。ゲストの再読込直後、文書に残る
    // 処理済みイベントをもう一度再生してしまわないための基準線になる。
    Promise.resolve()
      .then(() => {
        if (state.generation !== generation) return null;
        return setDoc(promptRef(this.roomCode, uid), { requestId, type: '__batch', payload: { events, ackedThrough: state.ackedThrough || 0 } });
      })
      .catch((error) => console.warn('PvP prompt flush failed', error))
      .finally(() => {
        state.flushing = false;
        if (state.dirty) {
          state.dirty = false;
          this._flushParticipant(uid);
        }
      });
  }

  destroy() {
    this.destroyed = true;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('対戦リレーが終了しました'));
      this.pending = null;
    }
    for (const state of this.participants.values()) {
      clearTimeout(state.cleanupTimer);
      if (state.flushTimer) clearTimeout(state.flushTimer);
      state.respUnsub?.();
      for (const waiter of state.doneWaiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('対戦リレーが終了しました'));
      }
      for (const waiter of state.valueWaiters.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('対戦リレーが終了しました'));
      }
      state.doneWaiters = [];
      state.valueWaiters.clear();
    }
    this.participants.clear();
    this.unsubscribe?.();
  }
}

/**
 * ゲスト側のリレー: hostRequestの変化を監視し、`handlers[type](payload)`
 * を呼んでその戻り値をguestResponseとして送り返す。handlersは
 * main.jsの既存prompt*関数（promptConfirmMove等）をtypeごとに束ねたもの
 * を渡す想定 - ローカル対戦のUIをそのまま再利用できる。
 */
export class GuestHostListener {
  constructor(roomCode, uid, handlers, { enableLegacy = false, onFastForward = null } = {}) {
    this.roomCode = roomCode;
    this.uid = uid;
    this.handlers = handlers;
    this.lastHandledRequestId = 0;
    this.lastHandledPromptId = 0;
    // '__batch'（アウトボックス方式）用: 受信済みイベントの最大idと、
    // 未再生イベントのローカルキュー。ホストの1書き込みに複数イベントが
    // 入っていても、ここで必ず1件ずつ順番にawaitして再生する（演出の
    // 同時再生・カメラの取り合いは起こさない）。
    this.batchLastSeenId = 0;
    this.batchQueue = [];
    this.batchPumping = false;
    this.batchAckTracker = new PvpContiguousAckTracker();
    this.currentBatchEventId = null;
    this.onFastForward = onFastForward;
    this.lastInteractiveAnswer = null; // { id, v } 直近の対話回答（応答文書に常に同梱）
    this.destroyed = false;
    // 現行クライアントは参加者別prompts文書だけを使う。旧room.hostRequestの
    // 購読を通常時は張らず、同じ巨大room文書をpublicState購読と二重に
    // 受信・デコードする負荷を避ける。互換確認が必要な時だけ明示的に有効化可能。
    this.unsubscribe = enableLegacy
      ? listenToRoom(roomCode, (room) => {
          if (!room || !room.hostRequest) return;
          if (room.hostRequestId <= this.lastHandledRequestId) return;
          this.lastHandledRequestId = room.hostRequestId;
          this._handle(room.hostRequestId, room.hostRequest);
        })
      : null;
    this.promptUnsubscribe = onSnapshot(promptRef(roomCode, uid), (snap) => {
      const prompt = snap.data();
      if (!prompt) return;
      if (prompt.type === '__batch') {
        // 再読込直後はbatchLastSeenId=0なので、ホストがACK済みと知っている
        // 水位（ackedThrough）までは再生済みとして飛ばす（再生し直すと
        // 過去の演出が一斉に流れてしまう）。それ以降の未ACK分は再生する＝
        // 切断直前に届いていなかった演出・質問の自然な復元になる。
        const ackedThrough = Number(prompt.payload?.ackedThrough) || 0;
        this.batchAckTracker.advanceBase(ackedThrough);
        // 切断中にホストがAI代行した場合、回答待ちの古いモーダルを
        // 開いたままにしない。キューにまだ入っている未開始イベントだけで
        // なく、現在await中の質問もキャンセルしてpublicStateへ追いつく。
        if (this.currentBatchEventId != null && ackedThrough >= this.currentBatchEventId) {
          try { this.onFastForward?.(this.currentBatchEventId); } catch { /* 復帰処理を止めない */ }
        }
        // ホストが切断中の演出列を破棄してpublicStateへ追いつかせた場合、既に
        // ローカルキューへ入っていた古いイベントもここで捨てる。これが無いと
        // 復帰後に終わった手番の質問モーダルが出る。
        if (ackedThrough > 0 && this.batchQueue.length > 0) {
          this.batchQueue = this.batchQueue.filter((event) => event.id > ackedThrough);
        }
        const base = Math.max(this.batchLastSeenId, ackedThrough);
        if (base > this.batchLastSeenId) this.batchLastSeenId = base;
        for (const event of prompt.payload?.events || []) {
          if (!event || !(event.id > this.batchLastSeenId)) continue;
          this.batchLastSeenId = event.id;
          this.batchAckTracker.noteReceived(event.id);
          this.batchQueue.push(event);
        }
        this._pumpBatch();
        return;
      }
      // 旧ホスト（1文書=1イベント）との互換経路。
      if (prompt.requestId <= this.lastHandledPromptId) return;
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

  async _pumpBatch() {
    if (this.batchPumping) return;
    this.batchPumping = true;
    try {
      while (this.batchQueue.length > 0 && !this.destroyed) {
        // 質問も演出も必ず到着順に処理する。質問だけを追い越させると、分岐UIが
        // 駒の到着より先に出るだけでなく、その大きいidをACKした瞬間にホストが
        // 手前の未再生イベントまで削除してしまう。遅延時の追いつきはmain.js側で
        // 移動アニメの尺だけ短縮し、因果順序そのものは崩さない。
        const event = this.batchQueue.shift();
        this.currentBatchEventId = event.id;
        let result = null;
        try {
          result = this.handlers[event.type]
            ? await this.handlers[event.type](event.payload, { queueDepth: this.batchQueue.length })
            : null;
        } catch { /* 演出の失敗で列全体を止めない */ }
        if (event.wantValue) this.lastInteractiveAnswer = { id: event.id, v: result ?? null };
        const ackedThrough = this.batchAckTracker.markProcessed(event.id);
        this.currentBatchEventId = null;
        // handlers[event.type]のawait中にdestroy()され得る（画面遷移等）。
        // destroy済みならbatchQueueは空にされ再購読も解除済みなので、ここで
        // ACKを書くと別の対戦（同じroomCodeへの再入室）にまで古い水位が
        // 届いてホストのackedThroughを不用意に進めてしまう。
        if (this.destroyed) break;
        // 応答文書は {requestId: 処理済み水位, value: 直近の対話回答} の固定形。
        // 毎イベント書くと往復直列化が復活するので、ホストが待つイベント
        // （ack）とキューを飲み干した時だけ「待つ書き込み」をする。valueを
        // 常に同梱するのは、連続書き込みがスナップショット合体で1回に
        // まとまっても回答が消えないようにするため。
        if (event.ack || this.batchQueue.length === 0) {
          // 書き込み完了は待たない。ホストは応答スナップショットの到着だけを
          // 見ており、同一クライアントの書き込みは順序保証されるので、ここで
          // awaitして次の演出（歩行の次の1歩等）を遅らせる意味がない。
          const body = { requestId: ackedThrough, value: this.lastInteractiveAnswer };
          void setDoc(promptResponseRef(this.roomCode, this.uid), body)
            .catch(() => setDoc(promptResponseRef(this.roomCode, this.uid), body).catch(() => {}));
          this._lastAckWriteAt = performance.now();
        } else if (performance.now() - (this._lastAckWriteAt || 0) > 400) {
          // 演出ラッシュ中の中間ACK（投げっぱなし・再生は止めない）。これが無いと
          // 長い演出列の間ホストのアウトボックスが痩せず、フラッシュのたびに
          // 送信済みイベントまで全部再送されて書き込み量が雪だるま式に膨らむ
          // （実測で1ターン36KB。歩行ストリーミング化で件数も増えるため必須）。
          this._lastAckWriteAt = performance.now();
          const body = { requestId: ackedThrough, value: this.lastInteractiveAnswer };
          void setDoc(promptResponseRef(this.roomCode, this.uid), body).catch(() => {});
        }
      }
    } finally {
      this.batchPumping = false;
    }
    if (this.batchQueue.length > 0) this._pumpBatch();
  }

  async _handleParticipant(requestId, { type, payload }) {
    try {
      const response = this.handlers[type] ? await this.handlers[type](payload) : null;
      await setDoc(promptResponseRef(this.roomCode, this.uid), { requestId, value: response ?? null });
    } catch { await setDoc(promptResponseRef(this.roomCode, this.uid), { requestId, value: null }); }
  }

  destroy() {
    this.destroyed = true;
    this.batchQueue.length = 0;
    if (this.currentBatchEventId != null) {
      try { this.onFastForward?.(this.currentBatchEventId); } catch { /* 終了処理を止めない */ }
    }
    this.currentBatchEventId = null;
    this.unsubscribe?.();
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

/**
 * Heartbeat updates only lastSeen.  Sending it as a new action used to bump
 * actionId and overwrite a dice/spell action in the same single document;
 * Firestore snapshot coalescing could then deliver only the heartbeat and the
 * real input was lost.  The initial action document is created by the
 * constructor heartbeat below, so normal heartbeats can safely be field-only.
 */
function touchParticipantHeartbeat(roomCode, uid) {
  return updateDoc(participantActionRef(roomCode, uid), { lastSeen: serverTimestamp() });
}

/** ゲスト側で使う、送信ごとにactionIdを自動採番する薄いラッパー。 */
export class GuestActionSender {
  constructor(roomCode, uid) {
    this.roomCode = roomCode;
    this.uid = uid;
    // 再接続・再読込後も以前のactionIdより必ず大きくなるよう時刻を起点にする。
    this.nextActionId = pvpSequenceBase();
    // 最初の購読スナップショットが実操作になって取り落とされないよう、生成直後
    // に基準用heartbeat文書を作る。以後のheartbeatはactionを上書きしない。
    this.send({ type: 'heartbeat' }).catch(() => {});
    this.heartbeat = setInterval(() => this._touchHeartbeat(), 10000);
    // モバイルはバックグラウンドタブのタイマーを間引く/止めるため、10秒
    // 間隔だけに頼るとアプリ切り替え程度でもホスト側の30秒無応答判定に
    // 引っかかりやすい。フォアグラウンド復帰の瞬間に即送って追いつく
    // （lobby側のupdatePvpPresenceと同じ考え方）。
    this._onVisible = () => {
      if (!document.hidden) this._touchHeartbeat();
    };
    document.addEventListener('visibilitychange', this._onVisible);
  }
  send(action) {
    const actionId = this.nextActionId;
    this.nextActionId += 1;
    const payload = { ...action, actionId, uid: this.uid };
    return sendParticipantAction(this.roomCode, this.uid, actionId, payload);
  }
  _touchHeartbeat() {
    // 初回setDocがまだ完了していない／文書が掃除された場合だけ、完全な形で
    // 作り直す。通常経路ではactionId/actionを触らないので入力を消さない。
    return touchParticipantHeartbeat(this.roomCode, this.uid)
      .catch((error) => {
        if (error?.code === 'not-found') return this.send({ type: 'heartbeat' });
        throw error;
      })
      .catch(() => {});
  }
  destroy() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    document.removeEventListener('visibilitychange', this._onVisible);
  }
}

export class HostParticipantActionListener {
  constructor(roomCode, participantUids, onAction, {
    onOffline = null,
    onReconnect = null,
    onHeartbeat = null,
    offlineAfterMs = 30000,
  } = {}) {
    this.unsubscribers = [];
    this.lastHandled = new Map();
    this.lastSeen = new Map();
    this.offlineUids = new Set();
    const uids = (participantUids || []).filter(Boolean);
    const startedAt = Date.now();
    for (const uid of uids) this.lastSeen.set(uid, startedAt);
    // actions/{uid}は入力とheartbeatを同じ文書で持つ。以前は入力監視と在席監視が
    // それぞれonSnapshotを張っていたため、参加人数ぶん同じ更新を二重処理して
    // いた。1購読・1タイマーへ統合する。
    this.offlineTimer = setInterval(() => {
      const now = Date.now();
      for (const uid of uids) {
        const seen = this.lastSeen.get(uid);
        if (seen != null && now - seen > offlineAfterMs && !this.offlineUids.has(uid)) {
          this.offlineUids.add(uid);
          onOffline?.(uid);
        }
      }
    }, Math.min(10000, Math.max(1000, Math.floor(offlineAfterMs / 3))));
    for (const uid of uids) {
      const unsubscribe = onSnapshot(participantActionRef(roomCode, uid), (snap) => {
        const data = snap.data();
        if (data?.lastSeen) {
          // サーバー時刻と端末時刻を直接比較すると時計ずれで誤切断になるため、
          // スナップショットを受け取ったローカル時刻を生存時刻として使う。
          this.lastSeen.set(uid, Date.now());
          onHeartbeat?.(uid);
          if (this.offlineUids.delete(uid)) onReconnect?.(uid);
        }
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
  destroy() {
    if (this.offlineTimer) clearInterval(this.offlineTimer);
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  }
}
