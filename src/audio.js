// オリジナルBGM（Web Audio APIによるプロシージャル生成 - 音声ファイルは
// 一切使わない。既存曲のメロディは再現せず、あくまで「雰囲気」を参考に
// 作曲したオリジナル曲）。
//   盤面: のどかな冒険曲（クロノトリガー「歌う丘」のような、牧歌的で
//         ゆったりした雰囲気をイメージしたオリジナルメロディ）
//   バトル: 高揚感のあるアップテンポ曲（ミリオンゴッド凱旋のAT中演出の
//           ような、駆け抜けるボーナスステージ感をイメージしたオリジナル
//           曲）
// ブラウザの自動再生ポリシー上、AudioContextは最初のユーザー操作
// （クリック等）が起きるまで実際には鳴らない - ensureContext()はその
// 制約に従い、初回呼び出し時にresume()する。

let audioCtx = null;
let masterGain = null;
let currentLoop = null;
let currentTrack = null; // 'board' | 'battle' | null
let muted = false;

function ensureContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 0.35;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function setMuted(value) {
  muted = value;
  if (masterGain) masterGain.gain.value = muted ? 0 : 0.35;
}
export function isMuted() {
  return muted;
}
export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function noteFreq(note, octave) {
  const midi = (octave + 1) * 12 + NOTE_INDEX[note];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Plays one tone with a short attack/release envelope so it doesn't click. */
function playTone(ctx, { wave, gain }, freq, startTime, duration) {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  const peak = gain;
  const release = Math.min(0.08, duration * 0.3);
  g.gain.setValueAtTime(0, startTime);
  g.gain.linearRampToValueAtTime(peak, startTime + 0.02);
  g.gain.setValueAtTime(peak, startTime + Math.max(duration - release, 0.02));
  g.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

/** Short filtered-noise burst - stands in for a hi-hat/shaker tick. */
function playHat(ctx, startTime, peak = 0.09) {
  const duration = 0.045;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  noise.connect(filter);
  filter.connect(g);
  g.connect(masterGain);
  noise.start(startTime);
  noise.stop(startTime + duration);
}

/** Quick descending sine thump - stands in for a kick drum. */
function playKick(ctx, startTime, peak = 0.4) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(150, startTime);
  osc.frequency.exponentialRampToValueAtTime(45, startTime + 0.12);
  g.gain.setValueAtTime(peak, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(startTime);
  osc.stop(startTime + 0.16);
}

/**
 * Schedules `voices` (melodic note patterns) + optional `percussion` hits
 * repeatedly, `totalBeats` long, using a look-ahead scheduler so the loop
 * stays gap/glitch-free (each call queues exactly one iteration, then
 * arranges the next call shortly before that iteration ends).
 */
function scheduleLoop({ bpm, totalBeats, voices, percussion = [] }) {
  const ctx = ensureContext();
  const beatDur = 60 / bpm;
  let stopped = false;
  let loopStartTime = ctx.currentTime + 0.05;

  function scheduleIteration(startTime) {
    for (const voice of voices) {
      let t = startTime;
      for (const note of voice.pattern) {
        const dur = note.beats * beatDur;
        if (note.note) {
          playTone(ctx, voice, noteFreq(note.note, note.octave), t, dur * (note.gate ?? 0.85));
        }
        t += dur;
      }
    }
    for (const hit of percussion) {
      const t = startTime + hit.beat * beatDur;
      if (hit.type === 'hat') playHat(ctx, t);
      else if (hit.type === 'kick') playKick(ctx, t);
    }
  }

  function tick() {
    if (stopped) return;
    scheduleIteration(loopStartTime);
    loopStartTime += totalBeats * beatDur;
    const delay = (loopStartTime - ctx.currentTime - 0.5) * 1000;
    setTimeout(tick, Math.max(delay, 50));
  }
  tick();

  return {
    stop() {
      stopped = true;
    },
  };
}

// ---- 盤面テーマ: 96bpm, ニ長調, 牧歌的な旋律 + 静かな持続音のパッド ----
const BOARD_THEME = {
  bpm: 96,
  totalBeats: 24,
  voices: [
    {
      wave: 'triangle',
      gain: 0.16,
      pattern: [
        { note: 'D', octave: 4, beats: 1 }, { note: 'E', octave: 4, beats: 1 }, { note: 'F#', octave: 4, beats: 1 }, { note: 'A', octave: 4, beats: 1 },
        { note: 'B', octave: 4, beats: 2 }, { note: 'A', octave: 4, beats: 1 }, { note: 'F#', octave: 4, beats: 1 },
        { note: 'E', octave: 4, beats: 1 }, { note: 'D', octave: 4, beats: 1 }, { note: 'E', octave: 4, beats: 2 },
        { note: 'F#', octave: 4, beats: 1 }, { note: 'A', octave: 4, beats: 1 }, { note: 'B', octave: 4, beats: 1 }, { note: 'D', octave: 5, beats: 1 },
        { note: 'C#', octave: 5, beats: 2 }, { note: 'B', octave: 4, beats: 1 }, { note: 'A', octave: 4, beats: 1 },
        { note: 'F#', octave: 4, beats: 1 }, { note: 'E', octave: 4, beats: 1 }, { note: 'D', octave: 4, beats: 2 },
      ],
    },
    {
      // pad root
      wave: 'sine',
      gain: 0.05,
      pattern: [
        { note: 'D', octave: 3, beats: 4 }, { note: 'G', octave: 3, beats: 4 }, { note: 'E', octave: 3, beats: 4 },
        { note: 'A', octave: 3, beats: 4 }, { note: 'F#', octave: 3, beats: 4 }, { note: 'D', octave: 3, beats: 4 },
      ],
    },
    {
      // pad fifth
      wave: 'sine',
      gain: 0.035,
      pattern: [
        { note: 'A', octave: 3, beats: 4 }, { note: 'D', octave: 4, beats: 4 }, { note: 'B', octave: 3, beats: 4 },
        { note: 'E', octave: 4, beats: 4 }, { note: 'C#', octave: 4, beats: 4 }, { note: 'A', octave: 3, beats: 4 },
      ],
    },
  ],
};

// ---- バトルテーマ: 152bpm, イ長調, 疾走感のあるベース+リフ+ハット ----
const BATTLE_THEME = {
  bpm: 152,
  totalBeats: 16,
  voices: [
    {
      wave: 'square',
      gain: 0.13,
      pattern: [
        { note: 'A', octave: 2, beats: 0.5 }, { note: 'A', octave: 2, beats: 0.5 }, { note: 'E', octave: 3, beats: 0.5 }, { note: 'A', octave: 2, beats: 0.5 },
        { note: 'A', octave: 2, beats: 0.5 }, { note: 'A', octave: 2, beats: 0.5 }, { note: 'E', octave: 3, beats: 0.5 }, { note: 'A', octave: 2, beats: 0.5 },
        { note: 'F#', octave: 2, beats: 0.5 }, { note: 'F#', octave: 2, beats: 0.5 }, { note: 'C#', octave: 3, beats: 0.5 }, { note: 'F#', octave: 2, beats: 0.5 },
        { note: 'E', octave: 2, beats: 0.5 }, { note: 'E', octave: 2, beats: 0.5 }, { note: 'B', octave: 2, beats: 0.5 }, { note: 'E', octave: 2, beats: 0.5 },
      ],
    },
    {
      wave: 'sawtooth',
      gain: 0.1,
      pattern: [
        { note: 'E', octave: 5, beats: 1 }, { note: 'C#', octave: 5, beats: 1 }, { note: 'A', octave: 4, beats: 1 }, { note: 'E', octave: 5, beats: 1 },
        { note: 'F#', octave: 5, beats: 1 }, { note: 'E', octave: 5, beats: 1 }, { note: 'C#', octave: 5, beats: 1 }, { note: 'B', octave: 4, beats: 1 },
        { note: 'A', octave: 4, beats: 1 }, { note: 'C#', octave: 5, beats: 1 }, { note: 'E', octave: 5, beats: 1 }, { note: 'F#', octave: 5, beats: 1 },
        { note: 'A', octave: 5, beats: 2 }, { note: 'E', octave: 5, beats: 2 },
      ],
    },
  ],
  percussion: (() => {
    const hits = [];
    for (let beat = 0; beat < 16; beat += 0.5) hits.push({ type: 'hat', beat });
    for (let beat = 0; beat < 16; beat += 2) hits.push({ type: 'kick', beat });
    return hits;
  })(),
};

function playLoop(theme, trackName) {
  if (currentTrack === trackName) return;
  if (currentLoop) currentLoop.stop();
  currentLoop = scheduleLoop(theme);
  currentTrack = trackName;
}

export function playBoardTheme() {
  playLoop(BOARD_THEME, 'board');
}
export function playBattleTheme() {
  playLoop(BATTLE_THEME, 'battle');
}
export function stopMusic() {
  if (currentLoop) currentLoop.stop();
  currentLoop = null;
  currentTrack = null;
}
