// BGM再生。以前はWeb Audio APIによるプロシージャル生成（音声ファイル無し）
// だったが、ユーザー提供の実音源（MP3、public/audio/）に差し替えた。
// 盤面BGMはマップごとに専用曲がある（playMapTheme(mapId)、無いマップは
// 共通のboard-theme.mp3にフォールバック）。バトルシーン自体は全マップ
// 共通のbattle-theme.mp3のまま（専用のマップ別戦闘曲は無いため）。
// ブラウザの自動再生ポリシー上、最初のユーザー操作（クリック等）が起きる
// までplay()が失敗しうる - 失敗は無視する（次にテーマ切り替えが呼ばれた
// 時に再度play()される想定なので、実害はゲーム開始後の最初の一瞬だけ）。

const TRACK_SRC = {
  board: '/audio/board-theme.mp3', // ①ヒトデの縄張り・専用曲の無いマップの既定
  battle: '/audio/battle-theme.mp3',
  madai: '/audio/stage2-theme.mp3', // ②マダイの岩礁
  budou: '/audio/stage3-theme.mp3', // ③決闘の浜辺
  boss: '/audio/boss-theme.mp3', // ④暗転した世界（ラスボス）
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

/** 盤面BGM: mapIdに専用曲があればそれを、無ければ共通のboard-theme.mp3を鳴らす。 */
export function playMapTheme(mapId) {
  playTrack(MAP_TRACK[mapId] ?? 'board');
}
export function playBattleTheme() {
  playTrack('battle');
}
export function stopMusic() {
  if (currentTrack) getAudioEl(currentTrack).pause();
  currentTrack = null;
}
