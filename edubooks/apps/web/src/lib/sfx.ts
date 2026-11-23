'use client';
/*
 * Game sounds. Recorded CC0 effects from /sfx (see /sfx/LICENSE.txt) and natural sounds made live with Web Audio:
 * a real-sounding bubble pop, applause, chalk and crayon on paper. Everything goes through a soft room echo.
 * Sound is quiet by default and can be switched off by the game's 🔊 button (setGameSound).
 */
type FileSound = 'success' | 'error' | 'level-up' | 'streak' | 'achievement' | 'select' | 'reward' | 'badge' | 'complete' | 'coin' | 'gem';

let ctx: AudioContext | null = null; let out: GainNode | null = null; let wet: GainNode | null = null;
let enabled = true;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

export function setGameSound(on: boolean) { enabled = on; if (!on) chalk.stop(); }
function ac() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      out = ctx.createGain(); out.gain.value = 0.8;
      // a small room: a short, soft echo makes every sound less "electronic"
      const verb = ctx.createConvolver(); const len = Math.floor(ctx.sampleRate * 1.1); const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      verb.buffer = ir; wet = ctx.createGain(); wet.gain.value = 0.16;
      out.connect(ctx.destination); out.connect(verb); verb.connect(wet); wet.connect(ctx.destination);
    } catch { ctx = null; }
  }
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}
function load(name: string) {
  const c = ac(); if (!c) return Promise.resolve(null);
  if (!buffers.has(name)) buffers.set(name, fetch(`/sfx/${name}.mp3`).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).catch(() => null));
  return buffers.get(name)!;
}
/** Load the recorded sounds early (at the start of a game) so the first one plays at once. */
export function preloadGameSounds() { (['success', 'error', 'level-up', 'streak', 'coin', 'gem', 'achievement', 'select'] as FileSound[]).forEach((n) => void load(n)); }

async function file(name: FileSound, volume = 0.7, rate = 1) {
  if (!enabled) return; const c = ac(); const b = await load(name); if (!c || !b || !out) return;
  const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate; const g = c.createGain(); g.gain.value = volume; s.connect(g).connect(out); s.start();
}
function noise(c: AudioContext, seconds: number) {
  const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = b; return s;
}

/** A real soap/water bubble pop: a tiny wet click and a quick rising "plop" (pitch depends on the bubble size). */
function bubblePop(size = 1) {
  if (!enabled) return; const c = ac(); if (!c || !out) return; const t = c.currentTime;
  const f0 = 380 / Math.max(0.5, size) + Math.random() * 120;
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 3.2, t + 0.07);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.14);
  const n = noise(c, 0.03); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.2;
  const ng = c.createGain(); ng.gain.setValueAtTime(0.25, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  n.connect(bp).connect(ng).connect(out); n.start(t);
}
/** Applause: many single claps (short noise bursts) from a happy little crowd, swelling and fading. */
function applause(seconds = 2.4) {
  if (!enabled) return; const c = ac(); if (!c || !out) return; const t0 = c.currentTime;
  const claps = Math.floor(seconds * 38);
  for (let i = 0; i < claps; i++) {
    const at = t0 + Math.random() * seconds; const env = Math.sin(Math.PI * Math.min(1, (at - t0) / seconds)) ** 0.6;
    const n = noise(c, 0.05); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 1800; bp.Q.value = 0.9;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.22 * env + 0.01, at + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04 + Math.random() * 0.03);
    const p = c.createStereoPanner?.(); if (p) p.pan.value = Math.random() * 1.6 - 0.8;
    n.connect(bp).connect(g); (p ? g.connect(p).connect(out) : g.connect(out)); n.start(at); n.stop(at + 0.08);
  }
}
/** A soft whoosh (start of a round, a card turning). */
function whoosh() {
  if (!enabled) return; const c = ac(); if (!c || !out) return; const t = c.currentTime;
  const n = noise(c, 0.45); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  n.connect(f).connect(g).connect(out); n.start(t);
}

/**
 * Chalk (or pencil / crayon) on a board while writing: a rough scratch that follows the speed of the hand.
 * Call move(speed) while writing (speed in screen widths per second) and stop() when the pen is lifted.
 */
function makeScratch(kind: 'chalk' | 'pencil' | 'crayon') {
  let src: AudioBufferSourceNode | null = null; let g: GainNode | null = null; let f: BiquadFilterNode | null = null; let idle: ReturnType<typeof setTimeout> | null = null;
  const start = () => {
    const c = ac(); if (!c || !out || src) return;
    src = noise(c, 2); src.loop = true;
    f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'chalk' ? 2400 : kind === 'pencil' ? 4200 : 1500; f.Q.value = kind === 'crayon' ? 0.7 : 1.4;
    const grit = c.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.sign(x) * Math.pow(Math.abs(x), 0.6); } grit.curve = curve;
    g = c.createGain(); g.gain.value = 0; src.connect(f).connect(grit).connect(g).connect(out); src.start();
  };
  return {
    move(speed: number) {
      if (!enabled) return; start(); const c = ctx; if (!c || !g || !f) return;
      const v = Math.min(1, Math.max(0, speed / 1.2)); const t = c.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime((kind === 'crayon' ? 0.1 : 0.13) * (0.25 + v) * (0.8 + Math.random() * 0.4), t, 0.02);
      f.frequency.setTargetAtTime((kind === 'chalk' ? 1800 : kind === 'pencil' ? 3600 : 1200) + v * 1600, t, 0.05);
      if (idle) clearTimeout(idle); idle = setTimeout(() => this.lift(), 120);
    },
    lift() { const c = ctx; if (c && g) g.gain.setTargetAtTime(0, c.currentTime, 0.03); },
    stop() { this.lift(); const s = src; src = null; g = null; f = null; if (s) setTimeout(() => { try { s.stop(); } catch { /* stopped */ } }, 200); },
  };
}
export const chalk = makeScratch('chalk');
export const pencil = makeScratch('pencil');
export const crayon = makeScratch('crayon');

/** The sounds the games use. */
export const sfx = {
  pop: (size?: number) => bubblePop(size),
  correct: () => { void file('success', 0.6); },
  wrong: () => { void file('error', 0.45); },
  star: () => { void file('coin', 0.5); },
  gem: () => { void file('gem', 0.55); },
  streak: () => { void file('streak', 0.6); },
  select: () => { void file('select', 0.35); },
  levelUp: () => { void file('level-up', 0.7); },
  win: () => { void file('achievement', 0.7); setTimeout(() => applause(2.6), 250); },
  finish: (stars: number) => {
    if (stars >= 3) { void file('level-up', 0.7); setTimeout(() => applause(3), 300); }
    else if (stars >= 1) { void file('complete', 0.65); setTimeout(() => applause(1.6), 300); }
    else void file('reward', 0.5);
  },
  whoosh,
  applause,
};
