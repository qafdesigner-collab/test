'use client';
/*
 * Camera games: the child plays with their hands in front of the camera. Hand tracking (MediaPipe) runs fully on the
 * device from this website's own files — the camera picture is never sent anywhere or saved. Every game also works
 * with a finger on the screen or a mouse, for devices without a camera.
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

/** The camera with hand tracking. Hands come back mirrored (like a mirror), with x and y from 0 to 1 over the picture. */
export function useHands(enabled = true) {
  const video = useRef<HTMLVideoElement | null>(null);
  const hands = useRef<Hand[]>([]);
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
      let last = -1; let next = 0;
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
        raf = requestAnimationFrame(tick);
      };
      tick();
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); hands.current = []; };
  }, [enabled]);
  return { video, hands, status, ratio };
}

/** The play area: the mirrored camera picture (or a coloured board without camera) with a drawing layer on top. */
function Stage({ cam, children, className }: { cam: ReturnType<typeof useHands>; children?: React.ReactNode; className?: string }) {
  const { t } = useT();
  return (
    <div className={cn('relative mx-auto w-full max-w-3xl touch-none select-none overflow-hidden rounded-3xl bg-gradient-to-b from-sky-200 to-indigo-200 shadow-lg ring-4 ring-white', className)} style={{ aspectRatio: `${cam.ratio}` }}>
      <video ref={cam.video} muted playsInline className={cn('absolute inset-0 size-full -scale-x-100 object-cover', cam.status === 'ready' || cam.status === 'starting' ? 'opacity-90' : 'opacity-0')} />
      {children}
      {cam.status === 'starting' && <p className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-white/90 px-4 py-1.5 text-sm font-bold text-slate-700 shadow">📷 {t('Starting the camera…')}</p>}
      {(cam.status === 'nocam' || cam.status === 'error') && <p className="absolute inset-x-0 top-3 mx-auto w-fit max-w-[90%] rounded-2xl bg-white/90 px-4 py-1.5 text-center text-sm font-bold text-slate-700 shadow">
        {cam.status === 'nocam' ? `🙈 ${t('No camera — play with your finger on the screen or the mouse.')}` : `🙈 ${t('Hand tracking does not work on this device — play with your finger on the screen or the mouse.')}`}</p>}
    </div>
  );
}
function CameraNote() {
  const { t } = useT();
  return <p className="text-center text-xs text-slate-500">🔒 {t('The camera picture stays on this device. It is not recorded or sent anywhere.')}</p>;
}
const useCanvas = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  const fit = useCallback(() => { const c = ref.current; if (!c) return null; const r = c.getBoundingClientRect(); const k = window.devicePixelRatio || 1;
    if (c.width !== Math.round(r.width * k) || c.height !== Math.round(r.height * k)) { c.width = Math.round(r.width * k); c.height = Math.round(r.height * k); }
    return { c, g: c.getContext('2d')!, w: c.width, h: c.height, k }; }, []);
  return { ref, fit };
};
const fingerDot = (g: CanvasRenderingContext2D, x: number, y: number, r: number, color = '#f43f5e') => {
  g.beginPath(); g.arc(x, y, r * 1.8, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.lineWidth = r * 0.35; g.strokeStyle = '#fff'; g.stroke();
};

// ---------- Bubble pop ----------
type Bubble = { id: number; x: number; y: number; r: number; v: number; label: string; ok: boolean; hue: number; pop?: number };
/** Bubbles float up; pop only the right ones (e.g. the letter B) with a fingertip in the air — or by tapping. */
export function BubblePop({ content, onFinish, say, onProgress }: EngineProps) {
  const { t } = useT();
  const cam = useHands(true); const { ref, fit } = useCanvas();
  const targets: string[] = content.targets ?? []; const others: string[] = content.others ?? [];
  const goal = Number(content.goal) || 10; const seconds = Number(content.seconds) || 60;
  const [score, setScore] = useState(0); const [left, setLeft] = useState(seconds); const [over, setOver] = useState(false);
  const st = useRef({ bubbles: [] as Bubble[], next: 0, id: 0, score: 0, misses: 0, tap: null as { x: number; y: number } | null, over: false, ends: 0 });
  useEffect(() => { if (content.task) say(content.task); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onProgress?.(Math.min(score, goal), goal); }, [score, goal, onProgress]);
  const finish = useCallback(() => { if (st.current.over) return; st.current.over = true; setOver(true); setTimeout(() => onFinish(Math.min(st.current.score, goal)), 1200); }, [goal, onFinish]);
  useEffect(() => {
    let raf = 0; let prev = performance.now();
    const loop = (now: number) => {
      const f = fit(); if (!f) { raf = requestAnimationFrame(loop); return; }
      const { g, w, h, k } = f; const dt = Math.min(0.25, (now - prev) / 1000); prev = now; const s = st.current;
      // the time left, from the clock
      s.ends ||= now + seconds * 1000;
      const sec = Math.max(0, Math.ceil((s.ends - now) / 1000)); setLeft((x) => (x === sec ? x : sec));
      if (!s.over && sec === 0) finish();
      // new bubbles
      if (!s.over && now > s.next) {
        const ok = !others.length || Math.random() < 0.5;
        const pool = ok ? targets : others;
        const r = Math.min(w, h) * (0.075 + Math.random() * 0.025);
        s.bubbles.push({ id: s.id++, x: r + Math.random() * (w - 2 * r), y: h + r, r, v: h * (0.1 + Math.random() * 0.07), label: pool[Math.floor(Math.random() * pool.length)] ?? '', ok, hue: Math.floor(Math.random() * 360) });
        s.next = now + 900 + Math.random() * 700;
      }
      // fingertips (index finger of each hand) and taps
      const tips = cam.hands.current.map((hd) => ({ x: hd.pts[8].x * w, y: hd.pts[8].y * h }));
      if (s.tap) { tips.push({ x: s.tap.x * k, y: s.tap.y * k }); s.tap = null; }
      g.clearRect(0, 0, w, h);
      for (const b of s.bubbles) {
        if (b.pop !== undefined) { b.pop += dt; continue; }
        b.y -= b.v * dt; b.x += Math.sin((now / 700) + b.id) * 0.4 * k;
        if (!s.over && tips.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < b.r * 1.05)) {
          b.pop = 0;
          if (b.ok) { s.score++; setScore(s.score); say(b.label); if (s.score >= goal) finish(); } else { s.misses++; }
        }
      }
      s.bubbles = s.bubbles.filter((b) => b.y > -b.r * 2 && (b.pop === undefined || b.pop < 0.35));
      for (const b of s.bubbles) {
        if (b.pop !== undefined) { // burst: rings and a ✓ or ✗
          const a = 1 - b.pop / 0.35; g.globalAlpha = Math.max(0, a); g.lineWidth = 4 * k; g.strokeStyle = b.ok ? '#22c55e' : '#ef4444';
          g.beginPath(); g.arc(b.x, b.y, b.r * (1 + b.pop * 2.5), 0, Math.PI * 2); g.stroke();
          g.font = `900 ${b.r}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = b.ok ? '#16a34a' : '#dc2626'; g.fillText(b.ok ? '✓' : '✗', b.x, b.y); g.globalAlpha = 1; continue;
        }
        const grad = g.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.5, `hsla(${b.hue},90%,75%,0.55)`); grad.addColorStop(1, `hsla(${b.hue},90%,55%,0.8)`);
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fillStyle = grad; g.fill(); g.lineWidth = 3 * k; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke();
        g.font = `800 ${b.label.length > 2 ? b.r * 0.55 : b.r * 0.9}px "Andika", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1e293b'; g.fillText(b.label, b.x, b.y + b.r * 0.05);
      }
      for (const p of cam.hands.current) fingerDot(g, p.pts[8].x * w, p.pts[8].y * h, 11 * k);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <p className="text-center text-2xl font-extrabold text-slate-800">🫧 {content.task || t('Pop the right bubbles!')}</p>
      <div className="flex items-center justify-center gap-3 text-lg font-bold"><span className="rounded-full bg-emerald-100 px-4 py-1 text-emerald-800">⭐ {score} / {goal}</span>
        <span className={cn('rounded-full px-4 py-1 tabular-nums', left <= 10 ? 'bg-red-100 text-red-700' : 'bg-white text-slate-700')}>⏱ {left}s</span></div>
      <Stage cam={cam}><canvas ref={ref} className="absolute inset-0 size-full" onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); st.current.tap = { x: e.clientX - r.left, y: e.clientY - r.top }; }} />
        {over && <div className="absolute inset-0 grid place-items-center bg-white/60 text-5xl font-black text-emerald-700">{score >= goal ? '🎉' : '⏰'}</div>}</Stage>
      <p className="text-center text-sm text-slate-600">☝️ {t('Point with your finger in the air to pop a bubble — or tap it.')}</p>
      <CameraNote />
    </div>
  );
}

// ---------- Show me fingers ----------
/** “Show me 3!” — the child holds up fingers; the camera counts them (both hands, up to 10). Tap a number without a camera. */
export function ShowFingers({ content, onFinish, say, onProgress }: EngineProps) {
  const { t } = useT();
  const cam = useHands(true); const { ref, fit } = useCanvas();
  const rounds: { show: string; answer: number }[] = content.rounds ?? [];
  const [k, setK] = useState(0); const [seen, setSeen] = useState(0); const [hold, setHold] = useState(0); const [done, setDone] = useState<'' | 'ok' | 'skip'>('');
  const right = useRef(0); const since = useRef<number | null>(null);
  const r = rounds[k];
  useEffect(() => { onProgress?.(k, rounds.length); if (r) say(/^\d+$/.test(r.show) ? `Show me ${r.show}` : r.show); }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useCallback((ok: boolean) => {
    if (ok) right.current++;
    setDone(ok ? 'ok' : 'skip'); if (ok) say(['Great!', 'Well done!', 'Yes!'][Math.floor(Math.random() * 3)]);
    setTimeout(() => { setDone(''); setHold(0); since.current = null; if (k + 1 < rounds.length) setK(k + 1); else onFinish(right.current); }, 1300);
  }, [k, rounds.length, onFinish, say]);
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const f = fit();
      if (f) {
        const { g, w, h, k: px } = f; g.clearRect(0, 0, w, h);
        let n = 0;
        for (const hd of cam.hands.current) {
          n += fingersUp(hd.pts);
          // a friendly outline of the hand and dots on the fingertips
          g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 4 * px; g.lineCap = 'round';
          for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]]) {
            g.beginPath(); g.moveTo(hd.pts[a].x * w, hd.pts[a].y * h); g.lineTo(hd.pts[b].x * w, hd.pts[b].y * h); g.stroke();
          }
          for (const tip of [4, 8, 12, 16, 20]) fingerDot(g, hd.pts[tip].x * w, hd.pts[tip].y * h, 8 * px, '#f59e0b');
        }
        setSeen((x) => (x === n ? x : n));
        if (r && !done && cam.hands.current.length) {
          if (n === r.answer) { since.current ??= now; const p = Math.min(1, (now - since.current) / 900); setHold(p); if (p >= 1) next(true); }
          else { since.current = null; setHold(0); }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [r, done, next]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <p className="text-center">{t('Nothing to play')}</p>;
  return (
    <div className="space-y-3">
      <p className="text-center text-3xl font-extrabold text-slate-800">✋ {/^\d+$/.test(r.show) ? t('Show me {n}!', { n: r.show }) : r.show}</p>
      <Stage cam={cam}><canvas ref={ref} className="absolute inset-0 size-full" />
        {cam.status === 'ready' && <div className="absolute bottom-3 start-3 rounded-2xl bg-white/90 px-4 py-2 text-2xl font-black text-slate-800 shadow">👀 {seen}</div>}
        {hold > 0 && !done && <div className="absolute inset-x-6 bottom-3 h-3 overflow-hidden rounded-full bg-white/70"><div className="h-full bg-emerald-500" style={{ width: `${hold * 100}%` }} /></div>}
        {done && <div className="absolute inset-0 grid place-items-center bg-white/50 text-7xl">{done === 'ok' ? '🎉' : '➡️'}</div>}</Stage>
      <div className="flex flex-wrap justify-center gap-1.5" aria-label={t('Or tap the number')}>
        {Array.from({ length: 11 }, (_, n) => <button key={n} type="button" disabled={!!done} onClick={() => (n === r.answer ? next(true) : say('Try again'))}
          className="size-11 rounded-2xl bg-white text-xl font-black text-slate-700 shadow ring-1 ring-slate-200 hover:bg-amber-50 disabled:opacity-50">{n}</button>)}
        <button type="button" disabled={!!done} onClick={() => next(false)} className="rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-600">{t('Skip')} ⏭</button>
      </div>
      <p className="text-center text-sm text-slate-600">🖐️ {t('Hold your fingers up in front of the camera until the bar is full — or tap the number.')}</p>
      <CameraNote />
    </div>
  );
}

// ---------- Air writing ----------
/** Write a letter in the air: point with one finger to write, open your hand to lift the pen. Checked like tracing. */
export function AirWriting({ content, onFinish, say, onProgress }: EngineProps) {
  const { t } = useT();
  const cam = useHands(true);
  const items: string[] = content.items ?? [];
  const [k, setK] = useState(0); const [stars, setStars] = useState<number | null>(null); const [pen, setPen] = useState(false);
  const best = useRef<number[]>([]);
  const wrap = useRef<HTMLDivElement>(null); const guide = useRef<HTMLCanvasElement>(null); const ink = useRef<HTMLCanvasElement>(null); const tpl = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const last = useRef<{ x: number; y: number } | null>(null); const smooth = useRef<{ x: number; y: number } | null>(null); const mouse = useRef(false);
  const item = items[k];
  useEffect(() => { onProgress?.(k, items.length); if (item) say(item); }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); return () => ro.disconnect(); }, []);
  const penW = Math.max(14, size.h * 0.045);
  // the dotted letter (what the child sees) and the solid letter (what the writing is compared with)
  useEffect(() => {
    const c = guide.current; if (!c || !size.w || !item) return; c.width = size.w; c.height = size.h; const g = c.getContext('2d')!; g.clearRect(0, 0, size.w, size.h);
    const tc = document.createElement('canvas'); tc.width = size.w; tc.height = size.h; const tg = tc.getContext('2d')!; tpl.current = tc;
    let fs = size.h * 0.62; g.font = `700 ${fs}px "Comic Sans MS", "Andika", "Noto Sans Arabic", sans-serif`; const mw = g.measureText(item).width; if (mw > size.w * 0.85) fs *= (size.w * 0.85) / mw;
    for (const x of [g, tg]) { x.font = `700 ${fs}px "Comic Sans MS", "Andika", "Noto Sans Arabic", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; }
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillText(item, size.w / 2, size.h * 0.53);
    g.setLineDash([3, Math.max(8, fs * 0.05)]); g.lineCap = 'round'; g.lineWidth = Math.max(3, fs * 0.03); g.strokeStyle = 'rgba(30,41,59,0.9)'; g.strokeText(item, size.w / 2, size.h * 0.53);
    tg.fillStyle = '#000'; tg.fillText(item, size.w / 2, size.h * 0.53);
    const ic = ink.current!; ic.width = size.w; ic.height = size.h; setStars(null);
  }, [size, item]);
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const g = ink.current!.getContext('2d')!; g.strokeStyle = '#e11d48'; g.lineWidth = penW; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  };
  // writing with the finger in the air
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const hd = cam.hands.current[0];
      if (hd && size.w && stars === null) {
        const raw = { x: hd.pts[8].x * size.w, y: hd.pts[8].y * size.h };
        const s = smooth.current ? { x: smooth.current.x * 0.55 + raw.x * 0.45, y: smooth.current.y * 0.55 + raw.y * 0.45 } : raw; smooth.current = s;
        const down = pointing(hd.pts); setPen((x) => (x === down ? x : down));
        if (down) { if (last.current) line(last.current, s); last.current = s; } else last.current = null;
      } else { last.current = null; smooth.current = null; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size, stars]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = () => { const c = ink.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setStars(null); };
  const check = () => {
    if (!tpl.current || !ink.current) return;
    const r = scoreTrace(tpl.current, ink.current); setStars(r.stars);
    say(r.stars >= 3 ? 'Excellent!' : r.stars === 2 ? 'Very good!' : r.stars === 1 ? 'Good try!' : 'Try again!');
    if (r.stars >= 1) {
      best.current[k] = r.stars;
      setTimeout(() => { if (k + 1 < items.length) setK(k + 1); else onFinish(best.current.filter((x) => x >= 1).length); }, 1500);
    }
  };
  const pos = (e: React.PointerEvent) => { const r = ink.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  if (!item) return <p className="text-center">{t('Nothing to write')}</p>;
  return (
    <div className="space-y-3">
      <p className="text-center text-2xl font-extrabold text-slate-800">☝️ {t('Write')} <span className="text-rose-600">{item}</span> {t('in the air!')}</p>
      <Stage cam={cam}>
        <div ref={wrap} className="absolute inset-0">
          <canvas ref={guide} className="absolute inset-0 size-full" />
          <canvas ref={ink} className="absolute inset-0 size-full"
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); mouse.current = true; last.current = pos(e); line(last.current, last.current); }}
            onPointerMove={(e) => { if (!mouse.current || !last.current) return; const p = pos(e); line(last.current, p); last.current = p; }}
            onPointerUp={() => { mouse.current = false; last.current = null; }} />
        </div>
        {cam.status === 'ready' && <div className={cn('absolute start-3 top-3 rounded-full px-3 py-1 text-sm font-bold shadow', pen ? 'bg-rose-600 text-white' : 'bg-white/90 text-slate-700')}>{pen ? `✏️ ${t('Writing')}` : `✋ ${t('Pen up')}`}</div>}
        {stars !== null && <div className="absolute end-3 top-3 text-4xl drop-shadow">{stars ? '⭐'.repeat(stars) : '🔁'}</div>}
      </Stage>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => say(item)} className="rounded-2xl bg-amber-100 px-4 py-2 text-lg font-bold text-amber-900">🔊 {t('Listen')}</button>
        <button type="button" onClick={clear} className="rounded-2xl bg-slate-100 px-4 py-2 text-lg font-bold text-slate-700">↺ {t('Again')}</button>
        <button type="button" onClick={check} className="rounded-2xl bg-emerald-500 px-6 py-2 text-lg font-black text-white shadow">✅ {t('Done')}</button>
      </div>
      <p className="text-center text-sm text-slate-600">☝️ {t('Point with one finger to write. Open your hand to lift the pen. You can also write with your finger on the screen.')}</p>
      <CameraNote />
    </div>
  );
}
