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
  boss: assetUrl('/audio/boss-theme.mp3'), // ④暗転した世界（ラスボス）
};

// mapId(board.jsのMAPS)→専用トラック。無いキーはplayMapTheme側でboardに
// フォールバックする。
const MAP_TRACK = {
  madai: 'madai',
  budou: 'budou',
  danball: 'boss',
};

const VOLUME = 0.5;

let muted = false;
let currentTrack = null; // TRACK_SRCのキー | null
const audioEls = {}; // track -> HTMLAudioElement（遅延生成、以後使い回す）
let unlockAttempted = false;
let pageExited = false;

function getAudioEl(track) {
  if (!audioEls[track]) {
    const el = new Audio(TRACK_SRC[track]);
    el.loop = true;
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
  for (const track of Object.keys(TRACK_SRC)) {
    const el = getAudioEl(track);
    el.volume = 0;
    el.play()
      .then(() => {
        if (muted || currentTrack !== track) {
          el.pause();
          if (currentTrack !== track) el.currentTime = 0;
        }
        el.volume = muted ? 0 : VOLUME;
      })
      .catch(() => {
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

let sfxContext = null;
export function playSfx(type = 'hit') {
  try {
    sfxContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = sfxContext;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
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
