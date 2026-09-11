// チヌクエスト サウンドルーム（/bgm/）のプレイヤー。
// 曲名・マップ対応は src/audio.js の SELECTABLE_BGM / MAP_TRACK、
// ステージ名は src/board.js の MAPS と一致させること（曲を足したらここも足す）。
// 音源は public/audio/ の実ファイルをそのまま鳴らす。
// dur はビルド時に測った実尺（秒）。loadedmetadata が来たら実測値で上書きする。

const TRACKS = [
  { no: '①', file: 'stage1newbgm.mp3', title: '♪はじまりの潮騒', stage: '① ヒトデの縄張り', art: 's01', dur: 259.248 },
  { no: '②', file: 'stage2-theme.mp3', title: '♪岩礁のワルツ', stage: '② マダイの岩礁', art: 's02', dur: 30.041 },
  { no: '③', file: 'stage3-theme.mp3', title: '♪決闘前夜', stage: '③ 決闘の浜辺', art: 's03', dur: 30.041 },
  { no: '④', file: 'stage4-theme.mp3', title: '♪暴走列車ブギ', stage: '④ 暴走列車Q号', art: 's04', dur: 30.041 },
  { no: '⑤', file: 'boss-theme.mp3', title: '♪暗転した世界', stage: '⑤ 暗転した世界', art: 's05', dur: 48.039 },
  { no: '⑥', file: 'stage6-theme.mp3', title: '♪彼と呼ばれた男', stage: '⑥ 創造主の世界', art: 's06', dur: 30.041 },
  { no: '⑦', file: 'stage7bgm.mp3', title: '♪創造主への異議', stage: '⑦ 支配の終焉', art: 's07', dur: 59.640 },
  { no: '⑧', file: 'stage8bgm.mp3', title: '♪花火港のカーニバル', stage: '⑧ 朕と酢の花火港', art: 's08', dur: 208.968 },
  { no: '⑨', file: 'stage9bgm.mp3', title: '♪追徴のマーチ', stage: '⑨ 暴君と税務調査', art: 's09', dur: 200.016 },
  { no: '⑩', file: 'stage10bgm.mp3', title: '♪成れの果て', stage: '⑩ 成れの果て', art: 's10', dur: 225.096 },
  { no: '⑪', file: 'stage11bgm.mp3', title: '♪ふたりの牌歌', stage: '⑪ ふたりは○○', art: 's11', dur: 240.576 },
  { no: '⑫', file: 'stage12bgm.mp3', title: '♪金融街のネオン', stage: '⑫ 海上金融街', art: 's12', dur: 150.480 },
  { no: '⑬', file: 'stage13newbgm.mp3', title: '♪船上のロンド', stage: '⑬ 豪華客船', art: 's13', dur: 276.454, gain: '×1.4' },
  { no: '⑭', file: 'stage14bgm.mp3', title: '♪王都の番人', stage: '⑭ 王都の番人？？', art: 's14', dur: 286.128 },
  { no: '⑮', file: 'stage15bgm.mp3', title: '♪路地裏のレジスタンス', stage: '⑮ 是々非々のマーモット（自称）', art: 's15', dur: 242.160, wip: true },
  { no: '⑯', file: 'stage16bgm.mp3', title: '♪玉座の重み', stage: '⑯ 魚群の王チヌ', art: 's16', dur: 263.496, wip: true },
  { no: '⑰', file: 'stage17bgm.mp3', title: '♪海底労働施設の反乱', stage: '⑰ 海底労働施設', art: 's17', dur: 119.616, wip: true },
  { no: '─', file: 'board-theme.mp3', title: '♪果てなき海図', stage: '専用曲の無いマップの既定曲', art: null, dur: 73.874, common: true },
  { no: '─', file: 'newbattle.mp3', title: '♪一触即発', stage: '全マップ共通の戦闘シーン曲', art: null, dur: 32.914, common: true },
];

const AUDIO_DIR = '../audio/';
const ART_DIR = '../images/stage/thumb/';

const LONGEST = TRACKS.reduce((m, t) => Math.max(m, t.dur), 0);

function mmss(sec) {
  const s = isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

// ── 見出しの数字は全部実データから出す（曲を足しても手で直さない） ──
const total = TRACKS.reduce((a, t) => a + t.dur, 0);
const longestTrack = TRACKS.reduce((a, t) => (t.dur > a.dur ? t : a), TRACKS[0]);
document.getElementById('statCount').textContent = String(TRACKS.length);
document.getElementById('statTime').textContent = mmss(total);
document.getElementById('statLongest').textContent = `${longestTrack.no} ${mmss(longestTrack.dur)}`;

// ── 曲リスト ──────────────────────────────────────────
const rows = [];

function buildRow(t, index) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'row';
  el.setAttribute('aria-label', `${t.title} を再生`);

  const no = document.createElement('span');
  no.className = 'row-no';
  no.textContent = t.no;

  let art;
  if (t.art) {
    art = document.createElement('img');
    art.className = 'row-art';
    art.src = `${ART_DIR}${t.art}.jpg`;
    art.alt = '';
    art.loading = 'lazy';
    art.decoding = 'async';
  } else {
    art = document.createElement('span');
    art.className = 'row-art is-blank';
  }

  const main = document.createElement('div');
  main.className = 'row-main';

  const title = document.createElement('div');
  title.className = 'row-title';
  title.textContent = t.title;
  if (t.wip) {
    const w = document.createElement('span');
    w.className = 'tag';
    w.textContent = 'WIP';
    title.appendChild(w);
  }
  if (t.gain) {
    const g = document.createElement('span');
    g.className = 'tag gain';
    g.textContent = t.gain;
    title.appendChild(g);
  }

  const sub = document.createElement('div');
  sub.className = 'row-sub';
  sub.appendChild(document.createTextNode(`${t.stage}　`));
  const code = document.createElement('code');
  code.textContent = t.file;
  sub.appendChild(code);

  const meter = document.createElement('div');
  meter.className = 'meter';
  const bar = document.createElement('i');
  bar.style.width = `${(t.dur / LONGEST * 100).toFixed(1)}%`;
  meter.appendChild(bar);

  main.appendChild(title);
  main.appendChild(sub);
  main.appendChild(meter);

  const time = document.createElement('span');
  time.className = 'row-time';
  time.textContent = mmss(t.dur);

  el.appendChild(no);
  el.appendChild(art);
  el.appendChild(main);
  el.appendChild(time);
  el.addEventListener('click', () => select(index, true));
  rows[index] = { el, no, label: t.no };
  return el;
}

const listStage = document.getElementById('listStage');
const listCommon = document.getElementById('listCommon');
TRACKS.forEach((t, i) => {
  (t.common ? listCommon : listStage).appendChild(buildRow(t, i));
});

// ── プレイヤー ────────────────────────────────────────
const au = document.getElementById('au');
const nowArt = document.getElementById('nowArt');
const nowStamp = document.getElementById('nowStamp');
const nowLabel = document.getElementById('nowLabel');
const nowTitle = document.getElementById('nowTitle');
const nowSub = document.getElementById('nowSub');
const tCur = document.getElementById('tCur');
const tDur = document.getElementById('tDur');
const seek = document.getElementById('seek');
const seekFill = document.getElementById('seekFill');
const seekHead = document.getElementById('seekHead');
const btnPlay = document.getElementById('btnPlay');
const btnRepeat = document.getElementById('btnRepeat');
const vol = document.getElementById('vol');
const volVal = document.getElementById('volVal');

let current = 0;
let repeatOne = false;

function paintNow(t) {
  if (t.art) {
    nowArt.src = `${ART_DIR}${t.art}.jpg`;
    nowArt.style.visibility = 'visible';
    nowStamp.textContent = `STAGE ${String(TRACKS.indexOf(t) + 1).padStart(2, '0')}`;
  } else {
    nowArt.removeAttribute('src');
    nowArt.style.visibility = 'hidden';
    nowStamp.textContent = 'COMMON';
  }
  nowTitle.textContent = t.title;
  nowSub.textContent = `${t.stage}　`;
  const c = document.createElement('code');
  c.textContent = t.file;
  nowSub.appendChild(c);
  tDur.textContent = mmss(t.dur);
}

function markRows() {
  rows.forEach((r, i) => {
    const playing = i === current && !au.paused;
    r.el.classList.toggle('is-playing', i === current);
    r.no.textContent = '';
    if (playing) {
      const eq = document.createElement('span');
      eq.className = 'eq';
      eq.appendChild(document.createElement('span'));
      eq.appendChild(document.createElement('span'));
      eq.appendChild(document.createElement('span'));
      r.no.appendChild(eq);
    } else {
      r.no.textContent = r.label;
    }
  });
}

function select(i, autoplay) {
  current = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
  const t = TRACKS[current];
  paintNow(t);
  au.src = AUDIO_DIR + t.file;
  seekFill.style.width = '0%';
  seekHead.style.left = '0%';
  tCur.textContent = '0:00';
  if (autoplay) {
    play();
  } else {
    nowLabel.textContent = '選択中 — 再生待機';
    markRows();
    drawIdle();
  }
}

function play() {
  ensureScope();
  const p = au.play();
  if (p && p.catch) {
    p.catch(() => { nowLabel.textContent = '再生できません — もう一度押してください'; });
  }
}

btnPlay.addEventListener('click', () => {
  if (au.paused) play();
  else au.pause();
});
document.getElementById('btnPrev').addEventListener('click', () => select(current - 1, !au.paused));
document.getElementById('btnNext').addEventListener('click', () => select(current + 1, true));
btnRepeat.addEventListener('click', () => {
  repeatOne = !repeatOne;
  au.loop = repeatOne;
  btnRepeat.setAttribute('aria-pressed', repeatOne ? 'true' : 'false');
});

au.addEventListener('play', () => {
  btnPlay.textContent = '❚❚ 停止';
  btnPlay.setAttribute('aria-label', '一時停止');
  nowLabel.textContent = '再生中';
  markRows();
});
au.addEventListener('pause', () => {
  btnPlay.textContent = '▶ 再生';
  btnPlay.setAttribute('aria-label', '再生');
  nowLabel.textContent = '一時停止';
  markRows();
});
au.addEventListener('ended', () => select(current + 1, true));
au.addEventListener('timeupdate', () => {
  const d = au.duration || TRACKS[current].dur;
  const pct = d ? (au.currentTime / d) * 100 : 0;
  seekFill.style.width = `${pct}%`;
  seekHead.style.left = `${pct}%`;
  tCur.textContent = mmss(au.currentTime);
});
au.addEventListener('loadedmetadata', () => {
  if (isFinite(au.duration)) tDur.textContent = mmss(au.duration);
});

// シーク（クリックとドラッグ、キーボードは左右5秒）
function seekTo(clientX) {
  const r = seek.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  const d = au.duration || TRACKS[current].dur;
  if (!d) return;
  au.currentTime = ratio * d;
  seekFill.style.width = `${ratio * 100}%`;
  seekHead.style.left = `${ratio * 100}%`;
  tCur.textContent = mmss(ratio * d);
}
let dragging = false;
seek.addEventListener('pointerdown', (e) => {
  dragging = true;
  seek.setPointerCapture(e.pointerId);
  seekTo(e.clientX);
});
seek.addEventListener('pointermove', (e) => { if (dragging) seekTo(e.clientX); });
seek.addEventListener('pointerup', () => { dragging = false; });
seek.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') {
    au.currentTime = Math.min(au.duration || 0, au.currentTime + 5);
    e.preventDefault();
  }
  if (e.key === 'ArrowLeft') {
    au.currentTime = Math.max(0, au.currentTime - 5);
    e.preventDefault();
  }
});

// 音量（保存できない環境でも再生は続ける）
function applyVol(v) {
  au.volume = v / 100;
  volVal.textContent = String(v);
  try {
    localStorage.setItem('cq2-bgm-vol', String(v));
  } catch (err) {
    void err;
  }
}
let savedVol = 80;
try {
  const sv = localStorage.getItem('cq2-bgm-vol');
  const parsed = parseInt(sv, 10);
  if (sv !== null && !isNaN(parsed)) savedVol = Math.min(100, Math.max(0, parsed));
} catch (err) {
  void err;
}
vol.value = String(savedVol);
applyVol(savedVol);
vol.addEventListener('input', () => applyVol(parseInt(vol.value, 10)));

document.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (au.paused) play();
    else au.pause();
  }
});

// ── ソナー波形 ────────────────────────────────────────
const scope = document.getElementById('scope');
const ctx2d = scope.getContext('2d');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let analyser = null;
let bins = null;
let audioCtx = null;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fitScope() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = scope.clientWidth || 900;
  const h = scope.clientHeight || 46;
  scope.width = Math.round(w * dpr);
  scope.height = Math.round(h * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawBars(values) {
  const w = scope.clientWidth || 900;
  const h = scope.clientHeight || 46;
  ctx2d.clearRect(0, 0, w, h);
  const step = w / values.length;
  const bw = Math.max(1.5, step - 1.5);
  const mid = h / 2;
  ctx2d.fillStyle = cssVar('--accent');
  for (let i = 0; i < values.length; i += 1) {
    const v = Math.max(0.03, values[i]);
    const bh = v * (h - 6);
    ctx2d.globalAlpha = au.paused ? 0.3 : 0.55 + v * 0.45;
    ctx2d.fillRect(i * step + (step - bw) / 2, mid - bh / 2, bw, bh);
  }
  ctx2d.globalAlpha = 1;
  ctx2d.fillStyle = cssVar('--line');
  ctx2d.fillRect(0, mid - 0.5, w, 1);
}

// 停止中は曲名から決まる静的な波形を出す（初期表示が空欄にならないように）
function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function drawIdle() {
  fitScope();
  const t = TRACKS[current];
  let s = seedOf(t.title + t.file);
  const n = 64;
  const vals = [];
  for (let i = 0; i < n; i += 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const r = (s >>> 8) / 16777216;
    const env = Math.sin((i / (n - 1)) * Math.PI);
    vals.push(0.12 + r * 0.55 * (0.35 + env * 0.65));
  }
  drawBars(vals);
}

function ensureScope() {
  if (analyser || !window.AudioContext) return;
  try {
    audioCtx = new AudioContext();
    const src = audioCtx.createMediaElementSource(au);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    src.connect(analyser);
    analyser.connect(audioCtx.destination);
    bins = new Uint8Array(analyser.frequencyBinCount);
  } catch (err) {
    analyser = null; // 解析が使えない環境でも再生自体は動かす
    void err;
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function frame() {
  if (analyser && !au.paused && !reduceMotion) {
    fitScope();
    analyser.getByteFrequencyData(bins);
    const n = 64;
    const vals = [];
    for (let i = 0; i < n; i += 1) {
      const idx = Math.floor((i / n) ** 1.35 * (bins.length - 1));
      vals.push(bins[idx] / 255);
    }
    drawBars(vals);
  }
  requestAnimationFrame(frame);
}

au.addEventListener('pause', drawIdle);
window.addEventListener('resize', () => { if (au.paused) drawIdle(); });

select(0, false);
drawIdle();
requestAnimationFrame(frame);
