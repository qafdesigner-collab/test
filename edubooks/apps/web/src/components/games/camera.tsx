'use client';
/*
 * Camera games: the child plays with their hands in front of the camera.
 * - Privacy: the camera picture is NEVER shown, recorded or sent. It is only used, on the device, to find the hands
 *   (MediaPipe, served from this website). On screen there is a game scene with a cartoon hand that moves like the child's.
 * - A camera check comes first: "show your hand", with tips (closer, further, more light) until the hand is found.
 * - Every game also works with a finger on the screen or a mouse, for devices without a camera.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/components/ui';
import { useT } from '@/lib/i18n';
import type { EngineProps } from './engines';
import { scoreTrace } from './tracing';

type Pt = { x: number; y: number; z?: number };
export type Hand = { pts: Pt[]; side: string };
let landmarker: Promise<any> | null = null;
function loadLandmarker() {
  landmarker ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    const opts = (delegate: 'GPU' | 'CPU') => ({ baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate }, runningMode: 'VIDEO' as const, numHands: 2 });
    try { return await HandLandmarker.createFromOptions(files, opts('GPU')); } catch { return HandLandmarker.createFromOptions(files, opts('CPU')); }
  })().catch((e) => { landmarker = null; throw e; });
  return landmarker;
}

const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
/** How many fingers a hand holds up (thumb included). */
export function fingersUp(p: Pt[]) {
  if (!p || p.length < 21) return 0;
  const palm = d(p[0], p[9]) || 0.1;
  let n = 0;
  // a finger is up when its tip is clearly farther from the wrist than its middle joint
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (d(p[tip], p[0]) > d(p[pip], p[0]) + palm * 0.12) n++;
  // the thumb is up when its tip is far from the side of the hand (the base of the little finger) and from the index base
  if (d(p[4], p[17]) > d(p[2], p[17]) * 1.15 && d(p[4], p[5]) > palm * 0.45) n++;
  return n;
}
/** Only the index finger up: the "pen" for writing in the air. */
export const pointing = (p: Pt[]) => {
  if (!p || p.length < 21) return false;
  const palm = d(p[0], p[9]) || 0.1;
  const up = (tip: number, pip: number) => d(p[tip], p[0]) > d(p[pip], p[0]) + palm * 0.12;
  return up(8, 6) && !up(12, 10) && !up(16, 14) && !up(20, 18);
};

// ---------- sounds (made on the device, no files) ----------
let audio: AudioContext | null = null;
function tone(freq: number, ms: number, type: OscillatorType = 'sine', gain = 0.12, slide = 0) {
  try {
    audio ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = audio.createOscillator(); const g = audio.createGain(); const t = audio.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + ms / 1000);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
  } catch { /* no sound on this device */ }
}
export const sfx = {
  pop: () => { tone(520, 90, 'sine', 0.16, 500); setTimeout(() => tone(900, 70, 'triangle', 0.08), 40); },
  good: () => { tone(660, 120, 'triangle'); setTimeout(() => tone(880, 160, 'triangle'), 110); },
  bad: () => tone(180, 220, 'sawtooth', 0.06, -60),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 180, 'triangle', 0.12), i * 120)),
  tick: () => tone(1200, 30, 'square', 0.03),
};

/** The camera with hand tracking. Hands come back mirrored (like a mirror), with x and y from 0 to 1. The picture itself is never shown. */
export function useHands(enabled = true) {
  const video = useRef<HTMLVideoElement | null>(null);
  const hands = useRef<Hand[]>([]);
  const light = useRef(128);
  const [status, setStatus] = useState<'off' | 'starting' | 'ready' | 'nocam' | 'error'>(enabled ? 'starting' : 'off');
  const [ratio, setRatio] = useState(4 / 3);
  useEffect(() => {
    if (!enabled) { setStatus('off'); return; }
    let stop = false; let raf = 0; let stream: MediaStream | null = null;
    (async () => {
      setStatus('starting');
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); }
      catch { if (!stop) setStatus('nocam'); return; }
      if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
      const v = video.current!; v.srcObject = stream; v.muted = true; v.playsInline = true;
      await v.play().catch(() => undefined);
      setRatio((v.videoWidth || 640) / (v.videoHeight || 480));
      let lm: any;
      try { lm = await loadLandmarker(); } catch { if (!stop) setStatus('error'); return; }
      if (stop) return;
      setStatus('ready');
      const probe = document.createElement('canvas'); probe.width = 32; probe.height = 24; const pg = probe.getContext('2d', { willReadFrequently: true })!;
      let last = -1; let next = 0; let nextLight = 0;
      const tick = () => {
        if (stop) return;
        const t0 = performance.now();
        // at most ~20 times a second, and less on a slow device, so the game itself always stays smooth
        if (t0 >= next && v.readyState >= 2 && v.currentTime !== last) {
          last = v.currentTime;
          try {
            const r = lm.detectForVideo(v, t0);
            hands.current = (r.landmarks ?? []).map((pts: Pt[], i: number) => ({ pts: pts.map((q) => ({ x: 1 - q.x, y: q.y, z: q.z })), side: r.handedness?.[i]?.[0]?.categoryName ?? '' }));
          } catch { /* skip this frame */ }
          next = t0 + Math.max(50, (performance.now() - t0) * 3);
        }
        // how bright the room is (for the "turn on a light" tip) — a tiny 32×24 sample, never kept
        if (t0 >= nextLight && v.readyState >= 2) {
          nextLight = t0 + 1500;
          try { pg.drawImage(v, 0, 0, 32, 24); const px = pg.getImageData(0, 0, 32, 24).data; let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; light.current = s / (px.length / 4); pg.clearRect(0, 0, 32, 24); } catch { /* ignore */ }
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); hands.current = []; };
  }, [enabled]);
  return { video, hands, status, ratio, light };
}
type Cam = ReturnType<typeof useHands>;

// ---------- drawing: scenes and the cartoon hand ----------
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12], [13, 14], [14, 15], [15, 16], [17, 18], [18, 19], [19, 20]];
const GLOVES = [{ fill: '#fbbf24', edge: '#b45309' }, { fill: '#a78bfa', edge: '#6d28d9' }];
/** A friendly cartoon hand (like a glove) drawn from the tracked points — instead of the camera picture. */
export function drawHand(g: CanvasRenderingContext2D, pts: Pt[], w: number, h: number, i = 0, alpha = 1) {
  const P = pts.map((p) => ({ x: p.x * w, y: p.y * h }));
  const size = Math.hypot(P[0].x - P[9].x, P[0].y - P[9].y) || 40;
  const c = GLOVES[i % GLOVES.length]; const fw = size * 0.36;
  g.save(); g.globalAlpha = alpha; g.lineCap = 'round'; g.lineJoin = 'round';
  const palm = [0, 1, 5, 9, 13, 17].map((k) => P[k]);
  const path = () => { g.beginPath(); palm.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
  const bones = () => { g.beginPath(); for (const [a, b] of BONES) { g.moveTo(P[a].x, P[a].y); g.lineTo(P[b].x, P[b].y); } };
  // outline, then fill, then a soft shine
  g.strokeStyle = c.edge; g.lineWidth = fw + size * 0.1; bones(); g.stroke(); path(); g.lineWidth = size * 0.45; g.stroke(); g.fillStyle = c.edge; g.fill();
  g.strokeStyle = c.fill; g.lineWidth = fw; bones(); g.stroke(); path(); g.lineWidth = size * 0.35; g.stroke(); g.fillStyle = c.fill; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = fw * 0.3; g.beginPath(); for (const [a, b] of [[5, 6], [9, 10], [13, 14], [17, 18]]) { g.moveTo(P[a].x - fw * 0.15, P[a].y); g.lineTo(P[b].x - fw * 0.15, P[b].y); } g.stroke();
  // a happy face on the palm
  const cx = (P[0].x + P[9].x) / 2, cy = (P[0].y + P[9].y) / 2, r = size * 0.12;
  g.fillStyle = '#1e293b'; g.beginPath(); g.arc(cx - r, cy - r * 0.3, r * 0.28, 0, Math.PI * 2); g.arc(cx + r, cy - r * 0.3, r * 0.28, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1e293b'; g.lineWidth = r * 0.3; g.beginPath(); g.arc(cx, cy + r * 0.1, r * 0.7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.restore();
}
type Scene = 'sky' | 'sea' | 'board' | 'party';
function drawScene(g: CanvasRenderingContext2D, w: number, h: number, scene: Scene, t: number) {
  if (scene === 'board') {
    g.fillStyle = '#14532d'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.03)'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % w, (i * 53) % h, w * 0.2, 2);
    g.strokeStyle = '#78350f'; g.lineWidth = Math.max(10, w * 0.015); g.strokeRect(0, 0, w, h); return;
  }
  const grad = g.createLinearGradient(0, 0, 0, h);
  const cols = { sky: ['#7dd3fc', '#e0f2fe'], sea: ['#0e7490', '#67e8f9'], party: ['#fde68a', '#fbcfe8'] }[scene];
  grad.addColorStop(0, cols[0]); grad.addColorStop(1, cols[1]); g.fillStyle = grad; g.fillRect(0, 0, w, h);
  if (scene === 'sky') { // drifting clouds and a sun
    g.fillStyle = '#fde047'; g.beginPath(); g.arc(w * 0.88, h * 0.14, h * 0.07, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 4; i++) { const x = ((t * 0.01 * (i + 1) + i * w * 0.3) % (w * 1.3)) - w * 0.15, y = h * (0.12 + i * 0.13), s = h * 0.05;
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.arc(x + s, y - s * 0.4, s * 1.2, 0, Math.PI * 2); g.arc(x + s * 2.1, y, s, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#86efac'; g.beginPath(); g.ellipse(w * 0.3, h * 1.05, w * 0.5, h * 0.12, 0, 0, Math.PI * 2); g.ellipse(w * 0.85, h * 1.07, w * 0.4, h * 0.12, 0, 0, Math.PI * 2); g.fill();
  } else if (scene === 'party') {
    for (let i = 0; i < 18; i++) { g.fillStyle = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24'][i % 4]; g.globalAlpha = 0.35; g.beginPath(); g.arc((i * 137) % w, (i * 89 + t * 0.02 * (1 + (i % 3))) % h, 5 + (i % 4) * 2, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  } else {
    g.fillStyle = 'rgba(255,255,255,0.15)'; for (let i = 0; i < 6; i++) { const x = (i * 173) % w; g.beginPath(); g.ellipse(x, h * 0.9, 40, 10, 0, 0, Math.PI * 2); g.fill(); }
  }
}

type Fx = { x: number; y: number; vx: number; vy: number; life: number; color: string; text?: string; size: number };
function stepFx(g: CanvasRenderingContext2D, fx: Fx[], dt: number, k: number) {
  for (const p of fx) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * k * dt * (p.text ? 0 : 1); }
  for (const p of fx) {
    if (p.life <= 0) continue; g.globalAlpha = Math.min(1, p.life * 2);
    if (p.text) { g.font = `900 ${p.size}px system-ui`; g.textAlign = 'center'; g.fillStyle = p.color; g.strokeStyle = '#fff'; g.lineWidth = p.size * 0.15; g.strokeText(p.text, p.x, p.y); g.fillText(p.text, p.x, p.y); }
    else { g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill(); }
  }
  g.globalAlpha = 1;
  return fx.filter((p) => p.life > 0);
}
const burst = (fx: Fx[], x: number, y: number, k: number, colors: string[], n = 14) => {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = (120 + Math.random() * 260) * k; fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120 * k, life: 0.6 + Math.random() * 0.4, color: colors[i % colors.length], size: (3 + Math.random() * 4) * k }); }
};
const floatText = (fx: Fx[], x: number, y: number, text: string, color: string, k: number) => fx.push({ x, y, vx: 0, vy: -90 * k, life: 1, color, text, size: 34 * k });

const useCanvas = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  const fit = useCallback(() => { const c = ref.current; if (!c) return null; const r = c.getBoundingClientRect(); const k = window.devicePixelRatio || 1;
    if (c.width !== Math.round(r.width * k) || c.height !== Math.round(r.height * k)) { c.width = Math.round(r.width * k); c.height = Math.round(r.height * k); }
    return { c, g: c.getContext('2d')!, w: c.width, h: c.height, k }; }, []);
  return { ref, fit };
};

/**
 * The play area: a game scene (never the camera picture). The camera check runs first — until a hand is seen —
 * then `ready` turns true. Without a camera the game starts at once and is played by touch or mouse.
 */
function Stage({ cam, ready, setReady, children }: { cam: Cam; ready: boolean; setReady: (v: boolean) => void; children?: React.ReactNode }) {
  const { t } = useT();
  const [tip, setTip] = useState<string>('');
  const [seen, setSeen] = useState(0);
  useEffect(() => { if (cam.status === 'nocam' || cam.status === 'error') setReady(true); }, [cam.status, setReady]);
  // the camera check: a hand of a good size, seen for a moment
  useEffect(() => {
    if (ready || cam.status !== 'ready') return;
    let since: number | null = null;
    const k = setInterval(() => {
      const hd = cam.hands.current[0];
      if (!hd) { since = null; setSeen(0); setTip(cam.light.current < 45 ? 'It is too dark — turn on a light or face a window.' : 'Show your hand to the camera.'); return; }
      const size = d(hd.pts[0], hd.pts[9]);
      if (size < 0.09) { since = null; setSeen(0); setTip('Come a little closer.'); return; }
      if (size > 0.38) { since = null; setSeen(0); setTip('Move back a little.'); return; }
      since ??= Date.now(); const p = Math.min(1, (Date.now() - since) / 900); setSeen(p); setTip('Great — keep your hand there!');
      if (p >= 1) { sfx.good(); setReady(true); }
    }, 120);
    return () => clearInterval(k);
  }, [ready, cam.status, cam.hands, cam.light, setReady]);
  return (
    <div className="relative mx-auto w-full max-w-3xl touch-none select-none overflow-hidden rounded-3xl shadow-lg ring-4 ring-white" style={{ aspectRatio: `${cam.ratio}` }}>
      {/* the camera picture is only read for tracking — it is never shown */}
      <video ref={cam.video} muted playsInline aria-hidden className="pointer-events-none absolute left-0 top-0 size-px opacity-0" />
      {children}
      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-indigo-500/90 to-sky-500/90 p-4 text-center text-white">
          <div className="space-y-3">
            <div className={cn('text-7xl', cam.status === 'ready' && seen === 0 && 'motion-safe:animate-bounce')}>{seen > 0 ? '👍' : '🖐️'}</div>
            <p className="text-2xl font-black">{cam.status === 'ready' ? t('Camera check') : `📷 ${t('Starting the camera…')}`}</p>
            {cam.status === 'ready' && <p className="text-lg font-bold">{t(tip || 'Show your hand to the camera.')}</p>}
            {cam.status === 'ready' && <div className="mx-auto h-3 w-56 overflow-hidden rounded-full bg-white/30"><div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${seen * 100}%` }} /></div>}
            <p className="text-xs text-white/80">🔒 {t('Only your hand is used. Your picture is not shown, recorded or sent anywhere.')}</p>
            <button type="button" onClick={() => setReady(true)} className="rounded-xl bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30">{t('Play with touch instead')}</button>
          </div>
        </div>)}
      {ready && (cam.status === 'nocam' || cam.status === 'error') && <p className="absolute inset-x-0 top-3 mx-auto w-fit max-w-[90%] rounded-2xl bg-white/90 px-4 py-1.5 text-center text-sm font-bold text-slate-700 shadow">
        {cam.status === 'nocam' ? `🙈 ${t('No camera — play with your finger on the screen or the mouse.')}` : `🙈 ${t('Hand tracking does not work on this device — play with your finger on the screen or the mouse.')}`}</p>}
    </div>
  );
}
function CameraNote() {
  const { t } = useT();
  return <p className="text-center text-xs text-slate-500">🔒 {t('The camera only finds your hand. Your picture is not shown, recorded or sent anywhere.')}</p>;
}

// ---------- Bubble pop ----------
type Bubble = { id: number; x: number; y: number; r: number; v: number; label: string; ok: boolean; hue: number; wob: number };
/** Bubbles float up; pop only the right ones (e.g. the letter B) with a fingertip in the air — or by tapping. They get faster. */
export function BubblePop({ content, onFinish, say, onProgress }: EngineProps) {
  const { t } = useT();
  const cam = useHands(true); const { ref, fit } = useCanvas(); const [ready, setReady] = useState(false);
  const targets: string[] = content.targets ?? []; const others: string[] = content.others ?? [];
  const goal = Number(content.goal) || 10; const seconds = Number(content.seconds) || 60;
  const [score, setScore] = useState(0); const [left, setLeft] = useState(seconds); const [over, setOver] = useState(false); const [streak, setStreak] = useState(0);
  const st = useRef({ bubbles: [] as Bubble[], fx: [] as Fx[], next: 0, id: 0, score: 0, streak: 0, tap: null as { x: number; y: number } | null, over: false, ends: 0, started: 0, shake: 0 });
  const readyRef = useRef(false); readyRef.current = ready;
  useEffect(() => { if (content.task) say(content.task); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onProgress?.(Math.min(score, goal), goal); }, [score, goal, onProgress]);
  const finish = useCallback((won: boolean) => { if (st.current.over) return; st.current.over = true; setOver(true); if (won) sfx.win(); setTimeout(() => onFinish(Math.min(st.current.score, goal)), 1600); }, [goal, onFinish]);
  useEffect(() => {
    let raf = 0; let prev = performance.now();
    const loop = (now: number) => {
      const f = fit(); if (!f) { raf = requestAnimationFrame(loop); return; }
      const { g, w, h, k } = f; const dt = Math.min(0.25, (now - prev) / 1000); prev = now; const s = st.current;
      drawScene(g, w, h, 'sky', now);
      if (readyRef.current) {
        s.started ||= now; s.ends ||= now + seconds * 1000;
        const sec = Math.max(0, Math.ceil((s.ends - now) / 1000)); setLeft((x) => (x === sec ? x : sec));
        if (!s.over && sec === 0) finish(false);
        // new bubbles, a little faster and more often as time goes on
        const pace = Math.min(1.8, 1 + (now - s.started) / 60000);
        if (!s.over && now > s.next) {
          const ok = !others.length || Math.random() < 0.5; const pool = ok ? targets : others;
          const r = Math.min(w, h) * (0.075 + Math.random() * 0.025);
          s.bubbles.push({ id: s.id++, x: r + Math.random() * (w - 2 * r), y: h + r, r, v: h * (0.1 + Math.random() * 0.07) * pace, label: pool[Math.floor(Math.random() * pool.length)] ?? '', ok, hue: Math.floor(Math.random() * 360), wob: Math.random() * 6 });
          s.next = now + (900 + Math.random() * 700) / pace;
        }
      }
      // fingertips (index finger of each hand) and taps
      const tips = cam.hands.current.map((hd) => ({ x: hd.pts[8].x * w, y: hd.pts[8].y * h }));
      if (s.tap) { tips.push({ x: s.tap.x * k, y: s.tap.y * k }); s.tap = null; }
      const shakeX = s.shake > 0 ? Math.sin(now / 20) * 6 * k * s.shake : 0; s.shake = Math.max(0, s.shake - dt * 3);
      g.save(); g.translate(shakeX, 0);
      for (const b of s.bubbles) {
        b.y -= b.v * dt; b.x += Math.sin(now / 600 + b.wob) * 0.5 * k;
        if (!s.over && readyRef.current && tips.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < b.r * 1.15)) {
          const by = b.y; b.y = -9999; // popped
          if (b.ok) {
            s.score++; s.streak++; setScore(s.score); setStreak(s.streak); sfx.pop(); say(b.label);
            burst(s.fx, b.x, by, k, [`hsl(${b.hue},90%,60%)`, '#fff', '#fde047']);
            floatText(s.fx, b.x, by, s.streak >= 3 ? `🔥 ${s.streak}` : '+1', '#16a34a', k);
            if (s.score >= goal) finish(true);
          } else { s.streak = 0; setStreak(0); sfx.bad(); s.shake = 1; floatText(s.fx, b.x, by, '✗', '#dc2626', k); }
        }
      }
      s.bubbles = s.bubbles.filter((b) => b.y > -b.r * 2);
      for (const b of s.bubbles) {
        const grad = g.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.5, `hsla(${b.hue},90%,75%,0.6)`); grad.addColorStop(1, `hsla(${b.hue},90%,55%,0.85)`);
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fillStyle = grad; g.fill(); g.lineWidth = 3 * k; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.stroke();
        g.font = `800 ${b.label.length > 2 ? b.r * 0.55 : b.r * 0.9}px "Andika", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1e293b'; g.fillText(b.label, b.x, b.y + b.r * 0.05);
      }
      g.restore();
      s.fx = stepFx(g, s.fx, dt, k);
      cam.hands.current.forEach((hd, i) => drawHand(g, hd.pts, w, h, i, 0.95));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <p className="text-center text-2xl font-extrabold text-slate-800">🫧 {content.task || t('Pop the right bubbles!')}</p>
      <div className="flex items-center justify-center gap-3 text-lg font-bold"><span className="rounded-full bg-emerald-100 px-4 py-1 text-emerald-800">⭐ {score} / {goal}</span>
        {streak >= 3 && <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700">🔥 {t('{n} in a row!', { n: streak })}</span>}
        <span className={cn('rounded-full px-4 py-1 tabular-nums', left <= 10 ? 'bg-red-100 text-red-700' : 'bg-white text-slate-700')}>⏱ {left}s</span></div>
      <Stage cam={cam} ready={ready} setReady={setReady}>
        <canvas ref={ref} className="absolute inset-0 size-full" onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); st.current.tap = { x: e.clientX - r.left, y: e.clientY - r.top }; }} />
        {over && <div className="absolute inset-0 grid place-items-center bg-white/50 text-center"><div><div className="text-7xl">{score >= goal ? '🏆' : '⏰'}</div>
          <p className="text-3xl font-black text-emerald-700">{score >= goal ? t('You did it!') : t('Time is up!')}</p></div></div>}
      </Stage>
      <p className="text-center text-sm text-slate-600">☝️ {t('Point with your finger in the air to pop a bubble — or tap it.')}</p>
      <CameraNote />
    </div>
  );
}

// ---------- Show me fingers ----------
/** “Show me 3!” — the child holds up fingers; the camera counts them (both hands, up to 10). Tap a number without a camera. */
export function ShowFingers({ content, onFinish, say, onProgress }: EngineProps) {
  const { t } = useT();
  const cam = useHands(true); const { ref, fit } = useCanvas(); const [ready, setReady] = useState(false);
  const rounds: { show: string; answer: number }[] = content.rounds ?? [];
  const [k, setK] = useState(0); const [seen, setSeen] = useState(0); const [hold, setHold] = useState(0); const [done, setDone] = useState<'' | 'ok' | 'skip'>('');
  const right = useRef(0); const since = useRef<number | null>(null); const fx = useRef<Fx[]>([]);
  const r = rounds[k];
  useEffect(() => { if (!ready) return; onProgress?.(k, rounds.length); if (r) say(/^\d+$/.test(r.show) ? `Show me ${r.show}` : r.show); }, [k, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useCallback((ok: boolean) => {
    if (ok) { right.current++; sfx.good(); const f = fit(); if (f) for (let i = 0; i < 4; i++) burst(fx.current, f.w * (0.2 + i * 0.2), f.h * 0.3, f.k, ['#f472b6', '#60a5fa', '#34d399', '#fbbf24'], 18); }
    setDone(ok ? 'ok' : 'skip'); if (ok) say(['Great!', 'Well done!', 'Yes!'][Math.floor(Math.random() * 3)]);
    setTimeout(() => { setDone(''); setHold(0); since.current = null; if (k + 1 < rounds.length) setK(k + 1); else { sfx.win(); onFinish(right.current); } }, 1400);
  }, [k, rounds.length, onFinish, say, fit]);
  useEffect(() => {
    let raf = 0; let prev = performance.now();
    const loop = (now: number) => {
      const f = fit();
      if (f) {
        const { g, w, h, k: px } = f; const dt = Math.min(0.25, (now - prev) / 1000); prev = now;
        drawScene(g, w, h, 'party', now);
        let n = 0;
        cam.hands.current.forEach((hd, i) => { n += fingersUp(hd.pts); drawHand(g, hd.pts, w, h, i); });
        fx.current = stepFx(g, fx.current, dt, px);
        setSeen((x) => (x === n ? x : n));
        if (r && ready && !done && cam.hands.current.length) {
          if (n === r.answer) { since.current ??= now; const p = Math.min(1, (now - since.current) / 900); setHold(p); if (p >= 1) next(true); }
          else { since.current = null; setHold(0); }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [r, done, next, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <p className="text-center">{t('Nothing to play')}</p>;
  return (
    <div className="space-y-3">
      <p className="text-center text-3xl font-extrabold text-slate-800">✋ {/^\d+$/.test(r.show) ? t('Show me {n}!', { n: r.show }) : r.show}</p>
      <Stage cam={cam} ready={ready} setReady={setReady}><canvas ref={ref} className="absolute inset-0 size-full" />
        {ready && cam.status === 'ready' && <div className="absolute bottom-3 start-3 flex items-center gap-2 rounded-2xl bg-white/90 px-4 py-2 shadow">
          <span className="text-3xl font-black tabular-nums text-slate-800">{seen}</span><span className="text-xl">{'☝️'.repeat(Math.min(seen, 5))}{seen > 5 ? '…' : ''}</span></div>}
        {hold > 0 && !done && <div className="absolute inset-x-6 top-3 h-4 overflow-hidden rounded-full bg-white/70 ring-2 ring-white"><div className="h-full bg-emerald-500" style={{ width: `${hold * 100}%` }} /></div>}
        {done && <div className="absolute inset-0 grid place-items-center text-8xl drop-shadow">{done === 'ok' ? '🎉' : '➡️'}</div>}</Stage>
      <div className="flex flex-wrap justify-center gap-1.5" aria-label={t('Or tap the number')}>
        {Array.from({ length: 11 }, (_, n) => <button key={n} type="button" disabled={!!done} onClick={() => (n === r.answer ? next(true) : (sfx.bad(), say('Try again')))}
          className="size-11 rounded-2xl bg-white text-xl font-black text-slate-700 shadow ring-1 ring-slate-200 hover:bg-amber-50 disabled:opacity-50">{n}</button>)}
        <button type="button" disabled={!!done} onClick={() => next(false)} className="rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-600">{t('Skip')} ⏭</button>
      </div>
      <p className="text-center text-sm text-slate-600">🖐️ {t('Hold your fingers up in front of the camera until the bar is full — or tap the number.')}</p>
      <CameraNote />
    </div>
  );
}

// ---------- Air writing ----------
/** Write a letter in the air on a chalkboard: point with one finger to write, open your hand to lift the chalk. Checked like tracing. */
export function AirWriting({ content, onFinish, say, onProgress }: EngineProps) {
  const { t } = useT();
  const cam = useHands(true); const [ready, setReady] = useState(false);
  const items: string[] = content.items ?? [];
  const [k, setK] = useState(0); const [stars, setStars] = useState<number | null>(null); const [pen, setPen] = useState(false);
  const best = useRef<number[]>([]);
  const wrap = useRef<HTMLDivElement>(null); const board = useRef<HTMLCanvasElement>(null); const guide = useRef<HTMLCanvasElement>(null);
  const ink = useRef<HTMLCanvasElement>(null); const top = useRef<HTMLCanvasElement>(null); const tpl = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const last = useRef<{ x: number; y: number } | null>(null); const smooth = useRef<{ x: number; y: number } | null>(null); const mouse = useRef(false);
  const item = items[k];
  useEffect(() => { if (!ready) return; onProgress?.(k, items.length); if (item) say(item); }, [k, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); return () => ro.disconnect(); }, []);
  const penW = Math.max(14, size.h * 0.045);
  // the chalkboard, the dotted letter (what the child sees) and the solid letter (what the writing is compared with)
  useEffect(() => {
    const b = board.current, c = guide.current; if (!b || !c || !size.w || !item) return;
    for (const x of [b, c]) { x.width = size.w; x.height = size.h; }
    drawScene(b.getContext('2d')!, size.w, size.h, 'board', 0);
    const g = c.getContext('2d')!;
    const tc = document.createElement('canvas'); tc.width = size.w; tc.height = size.h; const tg = tc.getContext('2d')!; tpl.current = tc;
    let fs = size.h * 0.62; g.font = `700 ${fs}px "Comic Sans MS", "Andika", "Noto Sans Arabic", sans-serif`; const mw = g.measureText(item).width; if (mw > size.w * 0.85) fs *= (size.w * 0.85) / mw;
    for (const x of [g, tg]) { x.font = `700 ${fs}px "Comic Sans MS", "Andika", "Noto Sans Arabic", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; }
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillText(item, size.w / 2, size.h * 0.53);
    g.setLineDash([3, Math.max(8, fs * 0.05)]); g.lineCap = 'round'; g.lineWidth = Math.max(3, fs * 0.03); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.strokeText(item, size.w / 2, size.h * 0.53);
    tg.fillStyle = '#000'; tg.fillText(item, size.w / 2, size.h * 0.53);
    for (const x of [ink.current!, top.current!]) { x.width = size.w; x.height = size.h; }
    setStars(null);
  }, [size, item]);
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const g = ink.current!.getContext('2d')!; g.strokeStyle = '#fde047'; g.shadowColor = 'rgba(253,224,71,0.6)'; g.shadowBlur = penW * 0.6;
    g.lineWidth = penW; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  };
  // writing with the finger in the air; the cartoon hand and the chalk tip are drawn on a top layer
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const tg = top.current?.getContext('2d'); const hd = cam.hands.current[0];
      if (tg && size.w) tg.clearRect(0, 0, size.w, size.h);
      if (hd && size.w && ready && stars === null) {
        const raw = { x: hd.pts[8].x * size.w, y: hd.pts[8].y * size.h };
        const s = smooth.current ? { x: smooth.current.x * 0.55 + raw.x * 0.45, y: smooth.current.y * 0.55 + raw.y * 0.45 } : raw; smooth.current = s;
        const down = pointing(hd.pts); setPen((x) => (x === down ? x : down));
        if (down) { if (last.current) line(last.current, s); last.current = s; } else last.current = null;
        if (tg) {
          drawHand(tg, hd.pts, size.w, size.h, 0, 0.45);
          tg.beginPath(); tg.arc(s.x, s.y, penW * 0.7, 0, Math.PI * 2); tg.fillStyle = down ? '#fde047' : 'rgba(255,255,255,0.5)'; tg.fill();
          tg.lineWidth = 3; tg.strokeStyle = down ? '#ca8a04' : '#fff'; tg.stroke();
        }
      } else { last.current = null; smooth.current = null; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size, stars, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = () => { const c = ink.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setStars(null); };
  const check = () => {
    if (!tpl.current || !ink.current) return;
    const r = scoreTrace(tpl.current, ink.current); setStars(r.stars);
    say(r.stars >= 3 ? 'Excellent!' : r.stars === 2 ? 'Very good!' : r.stars === 1 ? 'Good try!' : 'Try again!');
    if (r.stars >= 1) {
      sfx.good(); best.current[k] = r.stars;
      setTimeout(() => { if (k + 1 < items.length) setK(k + 1); else { sfx.win(); onFinish(best.current.filter((x) => x >= 1).length); } }, 1500);
    } else sfx.bad();
  };
  const pos = (e: React.PointerEvent) => { const r = ink.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  if (!item) return <p className="text-center">{t('Nothing to write')}</p>;
  return (
    <div className="space-y-3">
      <p className="text-center text-2xl font-extrabold text-slate-800">☝️ {t('Write')} <span className="text-rose-600">{item}</span> {t('in the air!')}</p>
      <Stage cam={cam} ready={ready} setReady={setReady}>
        <div ref={wrap} className="absolute inset-0">
          <canvas ref={board} className="absolute inset-0 size-full" />
          <canvas ref={guide} className="absolute inset-0 size-full" />
          <canvas ref={ink} className="absolute inset-0 size-full" />
          <canvas ref={top} className="absolute inset-0 size-full"
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); mouse.current = true; last.current = pos(e); line(last.current, last.current); }}
            onPointerMove={(e) => { if (!mouse.current || !last.current) return; const p = pos(e); line(last.current, p); last.current = p; }}
            onPointerUp={() => { mouse.current = false; last.current = null; }} />
        </div>
        {ready && cam.status === 'ready' && <div className={cn('absolute start-3 top-3 rounded-full px-3 py-1 text-sm font-bold shadow', pen ? 'bg-yellow-300 text-yellow-900' : 'bg-white/90 text-slate-700')}>{pen ? `✏️ ${t('Writing')}` : `✋ ${t('Pen up')}`}</div>}
        {stars !== null && <div className="absolute end-3 top-3 text-4xl drop-shadow">{stars ? '⭐'.repeat(stars) : '🔁'}</div>}
      </Stage>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => say(item)} className="rounded-2xl bg-amber-100 px-4 py-2 text-lg font-bold text-amber-900">🔊 {t('Listen')}</button>
        <button type="button" onClick={clear} className="rounded-2xl bg-slate-100 px-4 py-2 text-lg font-bold text-slate-700">↺ {t('Again')}</button>
        <button type="button" onClick={check} className="rounded-2xl bg-emerald-500 px-6 py-2 text-lg font-black text-white shadow">✅ {t('Done')}</button>
      </div>
      <p className="text-center text-sm text-slate-600">☝️ {t('Point with one finger to write. Open your hand to lift the chalk. You can also write with your finger on the screen.')}</p>
      <CameraNote />
    </div>
  );
}
