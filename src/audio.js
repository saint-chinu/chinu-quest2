// BGM再生。以前はWeb Audio APIによるプロシージャル生成（音声ファイル無し）
// だったが、ユーザー提供の実音源（MP3、public/audio/）に差し替えた。
// 盤面BGMはマップごとに専用曲がある（playMapTheme(mapId)、無いマップは
// 共通のboard-theme.mp3にフォールバック）。バトルシーン自体は全マップ
// 共通の1曲（専用のマップ別戦闘曲は無いため）。戦闘は数秒〜十数秒で
// 終わるので、頭から全開の短いループを使う。
// ブラウザの自動再生ポリシー上、最初のユーザー操作（クリック等）が起きる
// までplay()が失敗しうる - 失敗は無視する（次にテーマ切り替えが呼ばれた
// 時に再度play()される想定なので、実害はゲーム開始後の最初の一瞬だけ）。

import { assetUrl } from './assetUrl.js';

const TRACK_SRC = {
  board: assetUrl('/audio/board-theme.mp3'), // 専用曲の無いマップの既定
  hitode: assetUrl('/audio/stage1newbgm.mp3'), // ①ヒトデの縄張り
  battle: assetUrl('/audio/newbattle.mp3'), // 全マップ共通の戦闘シーン曲
  madai: assetUrl('/audio/stage2-theme.mp3'), // ②マダイの岩礁
  budou: assetUrl('/audio/stage3-theme.mp3'), // ③決闘の浜辺
  qTrain: assetUrl('/audio/stage4-theme.mp3'), // ④暴走列車Q号
  boss: assetUrl('/audio/boss-theme.mp3'), // ⑤暗転した世界
  kare: assetUrl('/audio/stage6-theme.mp3'), // ⑥創造主の世界
  finalAlliance: assetUrl('/audio/stage7bgm.mp3'), // ⑦支配の終焉「創造主への異議」
  chinHarbor: assetUrl('/audio/stage8bgm.mp3'), // ⑧朕と酢の花火港
  taxAudit: assetUrl('/audio/stage9bgm.mp3'), // ⑨暴君と税務調査
  hitodemaso: assetUrl('/audio/stage10bgm.mp3'), // ⑩成れの果て
  mahjongDuo: assetUrl('/audio/stage11bgm.mp3'), // ⑪ふたりは○○
  ofudaField: assetUrl('/audio/stage12bgm.mp3'), // ⑫海上金融街のフィクサー
  kessan: assetUrl('/audio/stage13newbgm.mp3'), // ⑬船上のロンド（初戦・再戦共通）
  royalGuard: assetUrl('/audio/stage14bgm.mp3'), // ⑭王都の番人？？（仮公開）
};

// mapId(board.jsのMAPS)→専用トラック。無いキーはplayMapTheme側でboardに
// フォールバックする。
const MAP_TRACK = {
  tutorial: 'finalAlliance',
  // ①は初戦だけ別マップ(hitode-first)で始まる（main.jsのstartStoryBattle参照）。
  // 両方を同じ曲に繋がないと、全プレイヤーが最初に聴く初戦だけ共通曲のままになる。
  hitode: 'hitode',
  'hitode-first': 'hitode',
  madai: 'madai',
  budou: 'budou',
  'q-train': 'qTrain',
  danball: 'boss',
  kare: 'kare',
  'final-alliance': 'finalAlliance',
  'chin-harbor': 'chinHarbor',
  'tax-audit': 'taxAudit',
  hitodemaso: 'hitodemaso',
  'mahjong-duo': 'mahjongDuo',
  'ofuda-field': 'ofudaField',
  kessan: 'kessan',
  'royal-guard': 'royalGuard',
};

const VOLUME = 0.5;

// 曲ごとの音量補正。音源のマスタリング音圧はまちまちで、しかも各曲とも
// ピークが0dBFSまで来ているため、ファイル側でゲインを足すとクリップする。
// 再生側で補正すれば劣化なしに揃えられる（VOLUMEが0.5なので上げる余地がある）。
// 値はライブラリ全体のRMS平均(約-18.5dBFS)に対する比。指定の無い曲は1.0。
const TRACK_GAIN = {
  kessan: 1.4, // ⑬船上のロンド: 素の音圧が-21.9dBFSと他より約3dB低い
};
function volumeFor(track) {
  return Math.min(1, VOLUME * (TRACK_GAIN[track] || 1));
}

let muted = false;
let currentTrack = null; // TRACK_SRCのキー | null
const audioEls = {}; // track -> HTMLAudioElement（遅延生成、以後使い回す）
let unlockAttempted = false;
let pageExited = false;
// BGMは盤面内だけ許可する。ログイン／メニューへ戻った後に古い戦闘演出の
// setTimeoutが完了してplayMapThemeを呼んでも再生を復活させないための門番。
let musicPlaybackAllowed = false;

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
    el.volume = muted ? 0 : volumeFor(track);
    audioEls[track] = el;
  }
  return audioEls[track];
}

/**
 * Safari/iOSでは、盤面BGMとは別のAudio要素をCPU戦開始時に初めてplayすると、
 * 直前のユーザー操作から時間が空いているため自動再生として拒否されることが
 * ある。最初のタップ時に全BGM要素へ一度だけ触れて、後から任意の曲へ
 * 切り替えられる状態にしておく。
 *
 * 重要: play()の解決を待ってからpause()してはいけない。解決までの数百ms、
 * 全13曲が同時に再生状態になり、iOS Safariではmuted/volume=0の反映が
 * 間に合わずタイトル画面で全曲が一斉に鳴る（実測: 同時再生13曲）。
 * iOSのアンロックは「ユーザー操作の中でplay()を呼んだ」時点で成立するので
 * 解決を待つ必要はなく、同じ同期タスク内で即座にpause()すれば
 * 音声出力は一切始まらない。
 */
function unlockAudioElements() {
  if (unlockAttempted) return;
  unlockAttempted = true;
  startSilentAnchor();
  for (const track of Object.keys(TRACK_SRC)) {
    const el = getAudioEl(track);
    // 既に鳴らすべき曲が決まっている場合、その曲だけは止めない。
    if (currentTrack === track && !muted) continue;
    el.muted = true;
    el.volume = 0;
    const started = el.play();
    // 同期的にpauseするとplay()のPromiseはAbortErrorでrejectする（想定内）。
    if (started && typeof started.catch === 'function') started.catch(() => {});
    el.pause();
    el.currentTime = 0;
    el.muted = muted;
    el.volume = muted ? 0 : volumeFor(track);
  }
}

window.addEventListener('pointerdown', unlockAudioElements, { once: true, capture: true, passive: true });
window.addEventListener('touchstart', unlockAudioElements, { once: true, capture: true, passive: true });
window.addEventListener('keydown', unlockAudioElements, { once: true, capture: true });

export function setMuted(value) {
  muted = value;
  for (const [track, el] of Object.entries(audioEls)) {
    el.muted = muted;
    el.volume = muted ? 0 : volumeFor(track);
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

/**
 * 盤面(#app)が実際に表示されているか。BGMを鳴らしてよい唯一の状況がこれ。
 *
 * 以前はmusicPlaybackAllowedフラグだけで守っていたが、盤面を閉じる処理は
 * 「stopMusic() → #appを隠す → （報酬保存やストーリー会話をawait） →
 * showScreen()」という順序で、最後のshowScreen()までフラグがtrueのまま
 * 残る。その隙に戦闘演出の遅延コールバック（BATTLE_MESSAGE_HOLD_MS +
 * BATTLE_FADE_OUT_MS後にplayMapThemeを呼ぶ）が発火すると、タイトル画面に
 * 戻っているのに直前のステージのBGMが鳴り出す。呼び出し順に依存しない
 * よう、DOMの実状態そのものを最終的な判定に使う。
 */
function boardIsVisible() {
  const app = typeof document !== 'undefined' ? document.getElementById('app') : null;
  return !!app && !app.classList.contains('hidden');
}

function playTrack(track) {
  // pagehide後に古い戦闘演出Promiseが完了してplayMapThemeを呼んでも再生しない。
  if (pageExited || !musicPlaybackAllowed || !boardIsVisible()) return;
  if (muted) {
    if (currentTrack && currentTrack !== track) getAudioEl(currentTrack).pause();
    currentTrack = track;
    return;
  }
  const el = getAudioEl(track);
  el.muted = false;
  el.volume = volumeFor(track);
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

/** 盤面へ入る直前にだけBGM再生を許可する。 */
export function allowMusicPlayback() {
  musicPlaybackAllowed = true;
}

/** ログイン・メニュー画面用。停止後の遅延コールバックによる再開も遮断する。 */
export function blockMusicPlayback() {
  musicPlaybackAllowed = false;
  stopMusic();
}

window.addEventListener('pagehide', () => {
  pageExited = true;
  stopMusic();
});

// 盤面(#app)が隠された瞬間に必ずBGMを止める安全網。盤面を閉じる経路は
// ストーリー/フリー対戦/対人戦/チュートリアルと複数あり、どれか一つでも
// blockMusicPlaybackを呼び忘れると、遅れて届いた演出コールバックが
// タイトル画面でBGMを鳴らしてしまう。呼び出し側の作法に頼らず、
// DOMの変化そのものを監視して止める。
if (typeof document !== 'undefined') {
  const watchBoardVisibility = () => {
    const app = document.getElementById('app');
    if (!app) return;
    let wasVisible = !app.classList.contains('hidden');
    new MutationObserver(() => {
      const visible = !app.classList.contains('hidden');
      if (wasVisible && !visible) blockMusicPlayback();
      wasVisible = visible;
    }).observe(app, { attributes: true, attributeFilter: ['class'] });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchBoardVisibility, { once: true });
  } else {
    watchBoardVisibility();
  }
}

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
    if (type === 'checkpoint' || type === 'goal' || type === 'fanfare' || type === 'coin') {
      const notes = type === 'checkpoint'
        ? [[659.25, 0, 0.11], [783.99, 0.11, 0.11], [1046.5, 0.22, 0.22]]
        // 土地売却の換金音。祝う場面ではないので短い2音だけにする。
        : type === 'coin'
          ? [[987.77, 0, 0.07], [1318.51, 0.07, 0.14]]
        : type === 'goal'
          ? [[523.25, 0, 0.12], [659.25, 0.12, 0.12], [783.99, 0.24, 0.12], [1046.5, 0.36, 0.28]]
          : [[392, 0, 0.16], [523.25, 0.16, 0.16], [659.25, 0.32, 0.16], [783.99, 0.48, 0.18], [1046.5, 0.66, 0.55]];
      for (const [frequency, offset, duration] of notes) {
        const tone = ctx.createOscillator();
        const toneGain = ctx.createGain();
        tone.type = type === 'fanfare' ? 'triangle' : type === 'coin' ? 'triangle' : 'sine';
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

