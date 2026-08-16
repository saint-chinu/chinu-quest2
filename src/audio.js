// BGM再生。以前はWeb Audio APIによるプロシージャル生成（音声ファイル無し）
// だったが、ユーザー提供の実音源（MP3、public/audio/）に差し替えた。
// 盤面BGMはマップごとに専用曲がある（playMapTheme(mapId)、無いマップは
// 共通のboard-theme.mp3にフォールバック）。バトルシーン自体は全マップ
// 共通のbattle-theme.mp3のまま（専用のマップ別戦闘曲は無いため）。
// ブラウザの自動再生ポリシー上、最初のユーザー操作（クリック等）が起きる
// までplay()が失敗しうる - 失敗は無視する（次にテーマ切り替えが呼ばれた
// 時に再度play()される想定なので、実害はゲーム開始後の最初の一瞬だけ）。

import { assetUrl } from './assetUrl.js';

const TRACK_SRC = {
  board: assetUrl('/audio/board-theme.mp3'), // ①ヒトデの縄張り・専用曲の無いマップの既定
  battle: assetUrl('/audio/battle-theme.mp3'),
  madai: assetUrl('/audio/stage2-theme.mp3'), // ②マダイの岩礁
  budou: assetUrl('/audio/stage3-theme.mp3'), // ③決闘の浜辺
  qTrain: assetUrl('/audio/stage4-theme.mp3'), // ④暴走列車Q号
  boss: assetUrl('/audio/boss-theme.mp3'), // ⑤暗転した世界
  kare: assetUrl('/audio/stage6-theme.mp3'), // ⑥創造主の世界
};

// mapId(board.jsのMAPS)→専用トラック。無いキーはplayMapTheme側でboardに
// フォールバックする。
const MAP_TRACK = {
  madai: 'madai',
  budou: 'budou',
  'q-train': 'qTrain',
  danball: 'boss',
  kare: 'kare',
  'final-alliance': 'kare',
};

const VOLUME = 0.5;

let muted = false;
let currentTrack = null; // TRACK_SRCのキー | null
const audioEls = {}; // track -> HTMLAudioElement（遅延生成、以後使い回す）
let unlockAttempted = false;
let pageExited = false;

// iOS Safariの既知の挙動対策: Web Audio API（playSfxが使うAudioContext）で
// 鳴らす音は、マナーモード（サイレントスイッチ）が入っていても関係なく
// 鳴ってしまう（<audio>要素の再生は正しくスイッチに従うのに対し、Web Audio
// はページの音声セッションが「メディア再生中」扱いになっていない限りこれを
// 無視する）。完全無音の<audio>要素を最初のユーザー操作から鳴らしっぱなしに
// しておくと音声セッションがメディア再生中として扱われ、Web Audio側の音も
// 正しくスイッチに従うようになる。BGM要素（audioEls）はミュート/曲切替の
// たびに一時停止するので、それとは別にこの専用要素を用意し、一度鳴らしたら
// 止めない（0.1秒の無音を無限ループ）。
const SILENT_ANCHOR_SRC = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
let silentAnchorEl = null;
function startSilentAnchor() {
  if (silentAnchorEl) return;
  silentAnchorEl = new Audio(SILENT_ANCHOR_SRC);
  silentAnchorEl.loop = true;
  silentAnchorEl.volume = 0;
  silentAnchorEl.play().catch(() => {});
}

function getAudioEl(track) {
  if (!audioEls[track]) {
    const el = new Audio(TRACK_SRC[track]);
    el.loop = true;
    el.muted = muted;
    el.volume = muted ? 0 : VOLUME;
    audioEls[track] = el;
  }
  return audioEls[track];
}

/**
 * Safari/iOSでは、盤面BGMとは別のAudio要素をCPU戦開始時に初めてplayすると、
 * 直前のユーザー操作から時間が空いているため自動再生として拒否されることが
 * ある。最初のタップ時に全BGM要素を無音で一度だけ起動し、CPU同士の戦闘でも
 * 後から戦闘曲へ切り替えられる状態にしておく。
 */
function unlockAudioElements() {
  if (unlockAttempted) return;
  unlockAttempted = true;
  startSilentAnchor();
  for (const track of Object.keys(TRACK_SRC)) {
    const el = getAudioEl(track);
    // iOS Safariではvolume=0が即時反映されず、一瞬だけ実音が出る場合がある。
    // 要素自体もmutedにしてから事前再生し、停止後にだけ通常状態へ戻す。
    el.muted = true;
    el.volume = 0;
    el.play()
      .then(() => {
        if (muted || currentTrack !== track) {
          el.pause();
          if (currentTrack !== track) el.currentTime = 0;
        }
        el.muted = muted;
        el.volume = muted ? 0 : VOLUME;
      })
      .catch(() => {
        el.muted = muted;
        el.volume = muted ? 0 : VOLUME;
      });
  }
}

window.addEventListener('pointerdown', unlockAudioElements, { once: true, capture: true, passive: true });
window.addEventListener('touchstart', unlockAudioElements, { once: true, capture: true, passive: true });
window.addEventListener('keydown', unlockAudioElements, { once: true, capture: true });

export function setMuted(value) {
  muted = value;
  for (const el of Object.values(audioEls)) {
    el.muted = muted;
    el.volume = muted ? 0 : VOLUME;
    if (muted) el.pause();
  }
  // 解除時だけ、盤面／戦闘で選択中だった曲をその位置から再開する。
  if (!muted && currentTrack && !pageExited) getAudioEl(currentTrack).play().catch(() => {});
}
export function isMuted() {
  return muted;
}
export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

function playTrack(track) {
  // pagehide後に古い戦闘演出Promiseが完了してplayMapThemeを呼んでも再生しない。
  if (pageExited) return;
  if (muted) {
    if (currentTrack && currentTrack !== track) getAudioEl(currentTrack).pause();
    currentTrack = track;
    return;
  }
  const el = getAudioEl(track);
  el.muted = false;
  el.volume = VOLUME;
  // 以前のplay()が自動再生制限などで失敗して停止中なら、同じテーマでも
  // 「切替済み」とみなして黙ってreturnせず再試行する。
  if (currentTrack === track) {
    if (el.paused) el.play().catch(() => {});
    return;
  }
  if (currentTrack) getAudioEl(currentTrack).pause();
  el.currentTime = 0;
  el.play().catch(() => {});
  currentTrack = track;
}

/** 盤面BGM: mapIdに専用曲があればそれを、無ければ共通のboard-theme.mp3を鳴らす。 */
export function playMapTheme(mapId) {
  playTrack(MAP_TRACK[mapId] ?? 'board');
}
export function playBattleTheme() {
  playTrack('battle');
}
export function stopMusic() {
  // pagehide/bfcacheや演出Promiseの競合時にも古い戦闘曲を残さないよう、
  // 現在曲だけでなく生成済みの全Audio要素を停止・巻き戻す。
  for (const el of Object.values(audioEls)) {
    el.pause();
    el.currentTime = 0;
  }
  currentTrack = null;
}

window.addEventListener('pagehide', () => {
  pageExited = true;
  stopMusic();
});

// アプリ切替やbfcacheから同じページへ戻った場合は、新しい盤面で再生可能に戻す。
// 実際に盤面を破棄するかどうかはmain.js側が判断する。
window.addEventListener('pageshow', () => {
  pageExited = false;
});

let sfxContext = null;
export function playSfx(type = 'hit') {
  try {
    sfxContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = sfxContext;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    if (type === 'checkpoint' || type === 'goal' || type === 'fanfare') {
      const notes = type === 'checkpoint'
        ? [[659.25, 0, 0.11], [783.99, 0.11, 0.11], [1046.5, 0.22, 0.22]]
        : type === 'goal'
          ? [[523.25, 0, 0.12], [659.25, 0.12, 0.12], [783.99, 0.24, 0.12], [1046.5, 0.36, 0.28]]
          : [[392, 0, 0.16], [523.25, 0.16, 0.16], [659.25, 0.32, 0.16], [783.99, 0.48, 0.18], [1046.5, 0.66, 0.55]];
      for (const [frequency, offset, duration] of notes) {
        const tone = ctx.createOscillator();
        const toneGain = ctx.createGain();
        tone.type = type === 'fanfare' ? 'triangle' : 'sine';
        tone.frequency.setValueAtTime(frequency, now + offset);
        toneGain.gain.setValueAtTime(0.001, now + offset);
        toneGain.gain.linearRampToValueAtTime(muted ? 0.001 : 0.14, now + offset + 0.02);
        toneGain.gain.exponentialRampToValueAtTime(0.001, now + offset + duration);
        tone.connect(toneGain).connect(ctx.destination);
        tone.start(now + offset);
        tone.stop(now + offset + duration + 0.02);
      }
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type === 'block' ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(type === 'block' ? 180 : 120, now);
    osc.frequency.exponentialRampToValueAtTime(type === 'block' ? 70 : 45, now + 0.12);
    gain.gain.setValueAtTime(muted ? 0 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  } catch { /* AudioContext非対応環境 */ }
}
