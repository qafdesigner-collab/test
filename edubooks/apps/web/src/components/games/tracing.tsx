'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/components/ui';
import { useT } from '@/lib/i18n';
import type { EngineProps } from './engines';

export type TraceGuide = 'DOTTED' | 'FADED' | 'OUTLINE';
export type TraceFont = 'PRINT' | 'ROUND' | 'CURSIVE';
const FONTS: Record<TraceFont, string> = {
  PRINT: '"Andika", "Arial", "Noto Sans Arabic", "Noto Sans Devanagari", sans-serif',
  ROUND: '"Comic Sans MS", "Chalkboard SE", "Andika", "Arial Rounded MT Bold", "Noto Sans Arabic", sans-serif',
  CURSIVE: '"Segoe Script", "Lucida Handwriting", "Brush Script MT", "Noto Nastaliq Urdu", cursive',
};
const isRtl = (t: string) => /[֐-ࣿ]/.test(t);
const CELL = 4; // the drawing is compared on a grid of 4-pixel cells

/** Cells of a canvas that hold ink (dark or coloured pixels). */
function inkCells(c: HTMLCanvasElement, dark: (r: number, g: number, b: number, a: number) => boolean) {
  const w = Math.ceil(c.width / CELL), h = Math.ceil(c.height / CELL); const out = new Uint8Array(w * h);
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
    const i = (y * c.width + x) * 4; if (dark(d[i], d[i + 1], d[i + 2], d[i + 3])) out[Math.floor(y / CELL) * w + Math.floor(x / CELL)] = 1;
  }
  return { w, h, cells: out };
}
function dilate(m: { w: number; h: number; cells: Uint8Array }, r: number) {
  const out = new Uint8Array(m.cells.length);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.cells[y * m.w + x])
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < m.w && Y < m.h) out[Y * m.w + X] = 1; }
  return { ...m, cells: out };
}
/** How well the child's tracing follows the letters: how much of the letters is covered, how much of the drawing stays on them. */
export function scoreTrace(template: HTMLCanvasElement, ink: HTMLCanvasElement, templateIsDark = false) {
  const T = inkCells(template, templateIsDark ? (r, g, b, a) => a > 40 && r * 0.3 + g * 0.59 + b * 0.11 < 215 : (_r, _g, _b, a) => a > 40);
  const I = inkCells(ink, (_r, _g, _b, a) => a > 40);
  const Td = dilate(T, 3), Id = dilate(I, 2);
  let t = 0, tCovered = 0, i = 0, iOn = 0;
  for (let k = 0; k < T.cells.length; k++) {
    if (T.cells[k]) { t++; if (Id.cells[k]) tCovered++; }
    if (I.cells[k]) { i++; if (Td.cells[k]) iOn++; }
  }
  const coverage = t ? tCovered / t : 0, precision = i ? iOn / i : 0;
  const stars = !i ? 0 : coverage >= 0.8 && precision >= 0.85 ? 3 : coverage >= 0.65 && precision >= 0.75 ? 2 : coverage >= 0.5 && precision >= 0.65 ? 1 : 0;
  return { coverage, precision, stars };
}

/**
 * A tracing pad. Either draws the letters itself (dotted / faded / outline, on four writing lines), or shows a part of a
 * book page (`backdrop`) and checks the tracing against the letters printed on it.
 */
export function TracingPad({ text, guide = 'DOTTED', font = 'ROUND', lines = true, backdrop, fade = 0, onChecked, say, height = 260 }: {
  text?: string; guide?: TraceGuide; font?: TraceFont; lines?: boolean; backdrop?: HTMLCanvasElement | null; fade?: number;
  onChecked?: (r: { stars: number; coverage: number; precision: number }) => void; say?: (t: string) => void; height?: number;
}) {
  const { t } = useT();
  const wrap = useRef<HTMLDivElement>(null); const bg = useRef<HTMLCanvasElement>(null); const ink = useRef<HTMLCanvasElement>(null); const tpl = useRef<HTMLCanvasElement | null>(null);
  const [w, setW] = useState(0); const [result, setResult] = useState<number | null>(null); const drawing = useRef(false); const last = useRef<{ x: number; y: number } | null>(null);
  const h = backdrop ? Math.round((w || 600) * (backdrop.height / backdrop.width)) : height;
  useLayoutEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  const size = Math.round(h * 0.55); const base = Math.round(h * 0.72); const pen = Math.max(8, Math.round(size * 0.11));

  // the guide (what the child sees) and the template (what the tracing is compared with)
  useEffect(() => {
    const c = bg.current; if (!c || w < 20) return; c.width = w; c.height = h; const g = c.getContext('2d')!; g.clearRect(0, 0, w, h);
    const tc = document.createElement('canvas'); tc.width = w; tc.height = h; const tg = tc.getContext('2d')!; tpl.current = tc;
    if (backdrop) { g.drawImage(backdrop, 0, 0, w, h); tg.drawImage(backdrop, 0, 0, w, h); return; }
    if (lines) {
      const top = base - size * 0.75, mid = base - size * 0.42, low = base + size * 0.28;
      g.lineWidth = 2; g.strokeStyle = '#94a3b8'; [[top, []], [mid, [8, 6]], [base, []], [low, [3, 5]]].forEach(([y, dash]: any) => { g.setLineDash(dash); g.beginPath(); g.moveTo(8, y); g.lineTo(w - 8, y); g.stroke(); });
      g.setLineDash([]); g.strokeStyle = '#ef4444'; g.beginPath(); g.moveTo(8, base); g.lineTo(w - 8, base); g.stroke();
    }
    if (!text) return;
    const rtl = isRtl(text); const fam = FONTS[font];
    let fs = size; g.font = `${fs}px ${fam}`; const mw = g.measureText(text).width; if (mw > w - 40) fs = Math.floor(fs * (w - 40) / mw);
    for (const ctx of [g, tg]) { ctx.font = `${fs}px ${fam}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; (ctx as any).direction = rtl ? 'rtl' : 'ltr'; }
    const x = w / 2;
    // the faint letter shape the child follows, then the dotted / outline guide on top
    const alpha = Math.max(0.08, 0.28 - fade * 0.08);
    if (guide === 'FADED') { g.fillStyle = `rgba(100,116,139,${alpha + 0.12})`; g.fillText(text, x, base); }
    else {
      g.fillStyle = `rgba(148,163,184,${alpha})`; g.fillText(text, x, base);
      g.lineWidth = Math.max(2, fs * 0.035); g.strokeStyle = `rgba(51,65,85,${Math.max(0.35, 0.85 - fade * 0.15)})`;
      g.setLineDash(guide === 'DOTTED' ? [2, Math.max(6, fs * 0.06)] : []); g.lineCap = 'round'; g.strokeText(text, x, base); g.setLineDash([]);
    }
    tg.fillStyle = '#000'; tg.fillText(text, x, base);
  }, [w, h, text, guide, font, lines, backdrop, fade, size, base]);
  useEffect(() => { const c = ink.current; if (!c || w < 20) return; c.width = w; c.height = h; setResult(null); }, [w, h, text, backdrop, fade]);

  const pos = (e: React.PointerEvent) => { const r = ink.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * ink.current!.width, y: ((e.clientY - r.top) / r.height) * ink.current!.height }; };
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const g = ink.current!.getContext('2d')!; g.strokeStyle = '#2563eb'; g.lineWidth = backdrop ? Math.max(6, w * 0.014) : pen; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  };
  const clear = () => { const c = ink.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setResult(null); };
  const check = useCallback(() => {
    if (!tpl.current || !ink.current) return;
    const r = scoreTrace(tpl.current, ink.current, !!backdrop); setResult(r.stars); onChecked?.(r);
    say?.(r.stars >= 3 ? 'Excellent!' : r.stars === 2 ? 'Very good!' : r.stars === 1 ? 'Good try!' : 'Try again, follow the dots.');
  }, [backdrop, onChecked, say]);

  return (
    <div className="space-y-3">
      <div ref={wrap} className="relative w-full touch-none select-none overflow-hidden rounded-2xl bg-white shadow-inner ring-2 ring-sky-200" style={{ height: h }}>
        <canvas ref={bg} className="absolute inset-0 size-full" />
        <canvas ref={ink} className="absolute inset-0 size-full cursor-crosshair" aria-label={t('Trace here')}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); line(last.current, last.current); }}
          onPointerMove={(e) => { if (!drawing.current || !last.current) return; const p = pos(e); line(last.current, p); last.current = p; }}
          onPointerUp={() => { drawing.current = false; last.current = null; }} onPointerCancel={() => { drawing.current = false; }} />
        {result !== null && <div className="pointer-events-none absolute right-3 top-2 text-3xl drop-shadow">{result ? '⭐'.repeat(result) : '🔁'}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {text && say && <button type="button" onClick={() => say(text)} className="rounded-2xl bg-amber-100 px-4 py-2 text-lg font-bold text-amber-900">🔊 {t('Listen')}</button>}
        <button type="button" onClick={clear} className="rounded-2xl bg-slate-100 px-4 py-2 text-lg font-bold text-slate-700">↺ {t('Again')}</button>
        <button type="button" onClick={check} className="rounded-2xl bg-emerald-500 px-6 py-2 text-lg font-black text-white shadow">✅ {t('Done')}</button>
      </div>
    </div>
  );
}

/** The tracing game: each letter / word is traced a few times, from a clear guide to a lighter one. */
export function Tracing({ content, onFinish, say, onProgress }: EngineProps) {
  const { t } = useT();
  const items: string[] = content.items ?? []; const reps = Math.max(1, Number(content.repeats) || 1);
  const [k, setK] = useState(0); const [rep, setRep] = useState(0); const best = useRef<number[]>([]);
  useEffect(() => { onProgress?.(k, items.length); }, [k, items.length, onProgress]);
  useEffect(() => { if (items[k]) say(items[k]); }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = (stars: number) => {
    best.current[k] = Math.max(best.current[k] ?? 0, stars);
    setTimeout(() => {
      if (rep + 1 < reps) { setRep(rep + 1); return; }
      setRep(0);
      if (k + 1 < items.length) setK(k + 1);
      else onFinish(best.current.filter((s) => s >= 1).length);
    }, stars >= 1 ? 900 : 1400);
  };
  if (!items[k]) return <p className="text-center">{t('Nothing to trace')}</p>;
  return (
    <div className="space-y-3">
      <p className="text-center text-2xl font-extrabold text-slate-800">✍️ {t('Trace')} <span className="text-sky-700">{items[k]}</span>
        {reps > 1 && <span className="ms-2 text-base font-bold text-slate-500">({rep + 1}/{reps})</span>}</p>
      <TracingPad key={`${k}-${rep}`} text={items[k]} guide={rep === 0 ? content.guide : rep === reps - 1 && reps > 2 ? 'DOTTED' : content.guide} fade={rep}
        font={content.font} lines={content.lines !== false} say={say} onChecked={(r) => next(r.stars)} />
    </div>
  );
}

/** A printable handwriting sheet: each item as a model, then lighter and dotted copies, on four writing lines. */
export function printTracingSheet(content: { items: string[]; font?: TraceFont; lines?: boolean }, title: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const fam = FONTS[content.font ?? 'ROUND'].replace(/"/g, "'");
  const row = (txt: string) => {
    const rtl = isRtl(txt); const copies = 4;
    const cells = Array.from({ length: copies }, (_, i) => {
      const style = i === 0 ? 'fill:#1e293b' : i === 1 ? 'fill:#cbd5e1' : 'fill:none;stroke:#64748b;stroke-width:1.2;stroke-dasharray:1.5 4;stroke-linecap:round';
      return `<text x="${(i + 0.5) * 25}%" y="66" text-anchor="middle" ${rtl ? 'direction="rtl"' : ''} style="font-family:${fam};font-size:56px;${style}">${esc(txt)}</text>`;
    }).join('');
    const lines = content.lines === false ? '' : `<line x1="0" x2="100%" y1="24" y2="24" stroke="#94a3b8"/><line x1="0" x2="100%" y1="44" y2="44" stroke="#cbd5e1" stroke-dasharray="6 5"/><line x1="0" x2="100%" y1="66" y2="66" stroke="#ef4444"/><line x1="0" x2="100%" y1="82" y2="82" stroke="#cbd5e1" stroke-dasharray="2 5"/>`;
    return `<svg width="100%" height="92" style="display:block;margin:10px 0">${lines}${cells}</svg>`;
  };
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{margin:14mm}body{font-family:system-ui;margin:0}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 10px;color:#475569}</style></head>
    <body><h1>✍️ ${esc(title)}</h1><p>Name: ______________________ &nbsp; Date: ____________</p>${content.items.map(row).join('')}</body></html>`;
  const w = window.open('', '_blank'); if (!w) return; w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400);
}

/** Small helper for book pages: a part of a page as a canvas (for tracing the letters printed in that area). */
export function cropPage(pageCanvas: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }) {
  const c = document.createElement('canvas'); const sx = box.x * pageCanvas.width, sy = box.y * pageCanvas.height, sw = box.w * pageCanvas.width, sh = box.h * pageCanvas.height;
  c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
  c.getContext('2d')!.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
export function TraceStars({ n }: { n: number }) { return <span className={cn('text-xl')}>{'⭐'.repeat(n)}</span>; }
