// BGM再生。以前はWeb Audio APIによるプロシージャル生成（音声ファイル無し）
// だったが、ユーザー提供の実音源（MP3、public/audio/）に差し替えた。
//   board-theme.mp3: 盤面用（元ファイル名 chinuquest2_boss_bgm.mp3）
//   battle-theme.mp3: バトル用（元ファイル名 chinuquest2_battle_loop_30s.mp3、30秒ループ想定）
// ブラウザの自動再生ポリシー上、最初のユーザー操作（クリック等）が起きる
// までplay()が失敗しうる - 失敗は無視する（次にテーマ切り替えが呼ばれた
// 時に再度play()される想定なので、実害はゲーム開始後の最初の一瞬だけ）。

const TRACK_SRC = {
  board: '/audio/board-theme.mp3',
  battle: '/audio/battle-theme.mp3',
};

const VOLUME = 0.5;

let muted = false;
let currentTrack = null; // 'board' | 'battle' | null
const audioEls = {}; // track -> HTMLAudioElement（遅延生成、以後使い回す）

function getAudioEl(track) {
  if (!audioEls[track]) {
    const el = new Audio(TRACK_SRC[track]);
    el.loop = true;
    el.volume = muted ? 0 : VOLUME;
    audioEls[track] = el;
  }
  return audioEls[track];
}

export function setMuted(value) {
  muted = value;
  for (const el of Object.values(audioEls)) el.volume = muted ? 0 : VOLUME;
}
export function isMuted() {
  return muted;
}
export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

function playTrack(track) {
  if (currentTrack === track) return;
  if (currentTrack) getAudioEl(currentTrack).pause();
  const el = getAudioEl(track);
  el.currentTime = 0;
  el.play().catch(() => {});
  currentTrack = track;
}

export function playBoardTheme() {
  playTrack('board');
}
export function playBattleTheme() {
  playTrack('battle');
}
export function stopMusic() {
  if (currentTrack) getAudioEl(currentTrack).pause();
  currentTrack = null;
}
