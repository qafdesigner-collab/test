'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/components/ui';
import { useT } from '@/lib/i18n';
import type { EngineProps } from './engines';

const PALETTE = ['#ef4444', '#f97316', '#facc15', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#a16207', '#f5d0a9', '#94a3b8', '#111827', '#ffffff'];
type Tool = 'fill' | 'brush' | 'eraser';

/**
 * Colouring a line drawing: tap an area to fill it (the lines stop the colour), or use the crayon; eraser and undo.
 * The drawing's lines stay on top, so colours never cover them.
 */
export function ColoringBoard({ image, onDone, say, doneLabel }: { image: string; onDone?: (png: string) => void; say?: (t: string) => void; doneLabel?: string }) {
  const { t } = useT();
  const wrap = useRef<HTMLDivElement>(null); const color = useRef<HTMLCanvasElement>(null); const lines = useRef<HTMLCanvasElement>(null);
  const wall = useRef<Uint8Array | null>(null); const [size, setSize] = useState({ w: 0, h: 0 }); const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('fill'); const [ink, setInk] = useState(PALETTE[0]); const [brush, setBrush] = useState(14);
  const undo = useRef<ImageData[]>([]); const drawing = useRef(false); const last = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { const i = new Image(); i.onload = () => setImg(i); i.src = image; }, [image]);
  useLayoutEffect(() => {
    const el = wrap.current; if (!el || !img) return;
    const fit = () => { const w = Math.min(el.clientWidth, 1000); const h = Math.round(w * img.height / img.width); setSize({ w, h: Math.min(h, Math.round(window.innerHeight * 0.7)) }); };
    const ro = new ResizeObserver(fit); ro.observe(el); fit(); return () => ro.disconnect();
  }, [img]);
  const W = Math.round(size.h * ((img?.width ?? 1) / (img?.height ?? 1))), H = size.h;
  // the lines on top (white made see-through) and the walls the fill must not cross
  useEffect(() => {
    if (!img || !lines.current || !color.current || W < 10) return;
    for (const c of [lines.current, color.current]) { c.width = W; c.height = H; }
    const g = lines.current.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H); const walls = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = d.data[i * 4], gg = d.data[i * 4 + 1], b = d.data[i * 4 + 2]; const lum = r * 0.3 + gg * 0.59 + b * 0.11;
      if (lum < 140) { walls[i] = 1; d.data[i * 4 + 3] = 255; } else d.data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round((200 - lum) * 4)));
    }
    g.putImageData(d, 0, 0); wall.current = walls;
    const cg = color.current.getContext('2d')!; cg.fillStyle = '#fff'; cg.fillRect(0, 0, W, H); undo.current = [];
  }, [img, W, H]);

  const save = () => { const c = color.current!; undo.current.push(c.getContext('2d')!.getImageData(0, 0, c.width, c.height)); if (undo.current.length > 20) undo.current.shift(); };
  const pos = (e: React.PointerEvent) => { const r = color.current!.getBoundingClientRect(); return { x: Math.floor(((e.clientX - r.left) / r.width) * W), y: Math.floor(((e.clientY - r.top) / r.height) * H) }; };
  const fill = (x: number, y: number) => {
    const c = color.current!; const g = c.getContext('2d', { willReadFrequently: true })!; const walls = wall.current; if (!walls) return;
    const img = g.getImageData(0, 0, W, H); const d = img.data; const hex = ink.replace('#', ''); const R = parseInt(hex.slice(0, 2), 16), G = parseInt(hex.slice(2, 4), 16), B = parseInt(hex.slice(4, 6), 16);
    const start = y * W + x; if (walls[start]) return;
    const sr = d[start * 4], sg = d[start * 4 + 1], sb = d[start * 4 + 2]; if (sr === R && sg === G && sb === B) return;
    const same = (p: number) => !walls[p] && Math.abs(d[p * 4] - sr) < 40 && Math.abs(d[p * 4 + 1] - sg) < 40 && Math.abs(d[p * 4 + 2] - sb) < 40;
    save(); const stack = [start]; const seen = new Uint8Array(W * H);
    while (stack.length) {
      const p = stack.pop()!; if (seen[p] || !same(p)) continue; seen[p] = 1;
      d[p * 4] = R; d[p * 4 + 1] = G; d[p * 4 + 2] = B; d[p * 4 + 3] = 255;
      const px = p % W; if (px > 0) stack.push(p - 1); if (px < W - 1) stack.push(p + 1); if (p >= W) stack.push(p - W); if (p < W * (H - 1)) stack.push(p + W);
    }
    g.putImageData(img, 0, 0);
  };
  const stroke = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const g = color.current!.getContext('2d')!; g.strokeStyle = tool === 'eraser' ? '#ffffff' : ink; g.lineWidth = tool === 'eraser' ? brush * 1.6 : brush; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  };
  const finish = () => {
    const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d')!; g.drawImage(color.current!, 0, 0); g.drawImage(lines.current!, 0, 0);
    say?.('Beautiful colours!'); onDone?.(out.toDataURL('image/jpeg', 0.8));
  };
  const btn = (on: boolean) => cn('rounded-2xl px-3 py-2 text-base font-bold', on ? 'bg-violet-600 text-white shadow' : 'bg-slate-100 text-slate-700');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" className={btn(tool === 'fill')} onClick={() => setTool('fill')}>🪣 {t('Fill')}</button>
        <button type="button" className={btn(tool === 'brush')} onClick={() => setTool('brush')}>🖍️ {t('Crayon')}</button>
        <button type="button" className={btn(tool === 'eraser')} onClick={() => setTool('eraser')}>🧽 {t('Eraser')}</button>
        {tool !== 'fill' && <input aria-label={t('Size')} type="range" min={4} max={40} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="w-28" />}
        <button type="button" className={btn(false)} onClick={() => { const u = undo.current.pop(); if (u) color.current!.getContext('2d')!.putImageData(u, 0, 0); }}>↶ {t('Undo')}</button>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label={t('Colours')}>
        {PALETTE.map((c) => <button key={c} type="button" role="radio" aria-checked={ink === c} aria-label={c} onClick={() => { setInk(c); if (tool === 'eraser') setTool('fill'); }}
          className={cn('size-9 rounded-full ring-2 ring-offset-2 transition', ink === c ? 'scale-110 ring-slate-800' : 'ring-slate-200')} style={{ background: c }} />)}
      </div>
      <div ref={wrap} className="flex w-full justify-center">
        <div className="relative touch-none select-none rounded-xl bg-white shadow-lg ring-1 ring-slate-200" style={{ width: W, height: H }}>
          <canvas ref={color} className="absolute inset-0 size-full rounded-xl"
            onPointerDown={(e) => { const p = pos(e); if (tool === 'fill') { fill(p.x, p.y); return; } (e.target as HTMLElement).setPointerCapture(e.pointerId); save(); drawing.current = true; last.current = p; stroke(p, p); }}
            onPointerMove={(e) => { if (!drawing.current || !last.current) return; const p = pos(e); stroke(last.current, p); last.current = p; }}
            onPointerUp={() => { drawing.current = false; last.current = null; }} />
          <canvas ref={lines} className="pointer-events-none absolute inset-0 size-full rounded-xl" />
        </div>
      </div>
      {onDone && <div className="flex justify-center"><button type="button" onClick={finish} className="rounded-2xl bg-emerald-500 px-8 py-3 text-xl font-black text-white shadow">{doneLabel ?? `✅ ${t('I finished!')}`}</button></div>}
    </div>
  );
}

/** The colouring game: one picture; finishing it gives the stars. */
export function Coloring({ content, onFinish, say }: EngineProps) {
  const { t } = useT();
  useEffect(() => { if (content.task) say(content.task); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-2">
      <p className="text-center text-2xl font-extrabold text-slate-800">🎨 {content.task || t('Colour the picture')}</p>
      <ColoringBoard image={content.image} say={say} onDone={() => onFinish(1)} />
    </div>
  );
}

/**
 * Makes a picture ready for colouring: a line drawing is cleaned (lines black, the rest white); a photo is turned into
 * an outline drawing (edges). The slider gives fewer or more lines. Returns a small PNG data URL.
 */
export function LineArtMaker({ onChange }: { onChange: (png: string) => void }) {
  const [src, setSrc] = useState<HTMLImageElement | null>(null); const [photo, setPhoto] = useState(false); const [level, setLevel] = useState(50); const [out, setOut] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!src) return;
    const max = 900; const k = Math.min(1, max / Math.max(src.width, src.height)); const W = Math.round(src.width * k), H = Math.round(src.height * k);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true })!; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(src, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H); const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) gray[i] = d.data[i * 4] * 0.3 + d.data[i * 4 + 1] * 0.59 + d.data[i * 4 + 2] * 0.11;
    const outv = new Uint8Array(W * H);
    if (!photo) { const th = 60 + level * 1.6; for (let i = 0; i < W * H; i++) outv[i] = gray[i] < th ? 1 : 0; }
    else {
      // soften, then find the edges (Sobel); the slider sets how strong an edge must be
      const bl = new Float32Array(W * H);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += gray[(y + dy) * W + x + dx]; bl[y * W + x] = s / 9; }
      const th = 140 - level * 1.1;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const p = (dx: number, dy: number) => bl[(y + dy) * W + x + dx];
        const gx = -p(-1, -1) - 2 * p(-1, 0) - p(-1, 1) + p(1, -1) + 2 * p(1, 0) + p(1, 1); const gy = -p(-1, -1) - 2 * p(0, -1) - p(1, -1) + p(-1, 1) + 2 * p(0, 1) + p(1, 1);
        if (Math.hypot(gx, gy) > th) outv[y * W + x] = 1;
      }
    }
    // thicken the lines a little so colours stay inside
    for (let i = 0; i < W * H; i++) { const v = outv[i] ? 0 : 255; d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
    g.putImageData(d, 0, 0);
    const t2 = document.createElement('canvas'); t2.width = W; t2.height = H; const g2 = t2.getContext('2d')!; g2.fillStyle = '#fff'; g2.fillRect(0, 0, W, H);
    g2.globalCompositeOperation = 'darken'; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g2.drawImage(c, dx, dy);
    let png = t2.toDataURL('image/png'); if (png.length > 1_200_000) png = t2.toDataURL('image/jpeg', 0.85);
    setOut(png); onChange(png); setErr(png.length > 1_250_000 ? 'This picture is very detailed — move the slider to fewer lines.' : '');
  }, [src, photo, level]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm">
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const i = new Image(); i.onload = () => setSrc(i); i.src = URL.createObjectURL(f); }} />
      {src && <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5"><input type="radio" checked={!photo} onChange={() => setPhoto(false)} />It's a line drawing</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={photo} onChange={() => setPhoto(true)} />It's a photo (make an outline)</label>
        <label className="flex items-center gap-2">Fewer lines <input type="range" min={0} max={100} value={level} onChange={(e) => setLevel(Number(e.target.value))} /> More lines</label>
      </div>}
      {out && <img src={out} alt="Picture to colour" className="max-h-64 rounded border border-slate-200 bg-white" />}
      {err && <p className="text-amber-700">{err}</p>}
    </div>
  );
}
