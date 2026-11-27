'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/components/ui';
import { useT } from '@/lib/i18n';
import type { EngineProps } from './engines';
import { pencil, sfx } from '@/lib/sfx';

export type TraceGuide = 'DOTTED' | 'FADED' | 'OUTLINE';
export type TraceFont = 'PRINT' | 'ROUND' | 'CURSIVE';
const FONTS: Record<TraceFont, string> = {
  PRINT: '"Andika", "Arial", "Noto Sans Arabic", "Noto Sans Devanagari", sans-serif',
  ROUND: '"Comic Sans MS", "Chalkboard SE", "Andika", "Arial Rounded MT Bold", "Noto Sans Arabic", sans-serif',
  CURSIVE: '"Segoe Script", "Lucida Handwriting", "Brush Script MT", "Noto Nastaliq Urdu", cursive',
};
type PenType = 'ROUND' | 'QALAM';
const PEN_COLORS = ['#2563eb', '#111827', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#db2777', '#0891b2'];
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
export function TracingPad({ text, guide = 'DOTTED', font = 'ROUND', lines = true, backdrop, paths, fade = 0, onChecked, onSend, say, height = 260 }: {
  text?: string; guide?: TraceGuide; font?: TraceFont; lines?: boolean; backdrop?: HTMLCanvasElement | null; fade?: number;
  /** a writing path drawn by the publisher (0–1 inside the pad): shown dotted, and the tracing is checked against it */
  paths?: number[][][] | null;
  onChecked?: (r: { stars: number; coverage: number; precision: number }) => void; say?: (t: string) => void; height?: number;
  /** shows “Send to teacher”: gets the picture of the page part with the child's tracing (JPEG data URL) and the stars, if checked */
  onSend?: (image: string, stars: number | null) => Promise<unknown>;
}) {
  const { t } = useT();
  const wrap = useRef<HTMLDivElement>(null); const bg = useRef<HTMLCanvasElement>(null); const ink = useRef<HTMLCanvasElement>(null); const tpl = useRef<HTMLCanvasElement | null>(null);
  const [w, setW] = useState(0); const [result, setResult] = useState<number | null>(null); const [sending, setSending] = useState<'' | 'busy' | 'sent'>(''); const drawing = useRef(false); const last = useRef<{ x: number; y: number } | null>(null);
  const h = backdrop ? Math.round((w || 600) * (backdrop.height / backdrop.width)) : height;
  useLayoutEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  const size = Math.round(h * 0.55); const base = Math.round(h * 0.72); const pen = Math.max(8, Math.round(size * 0.11));

  // the guide (what the child sees) and the template (what the tracing is compared with)
  useEffect(() => {
    const c = bg.current; if (!c || w < 20) return; c.width = w; c.height = h; const g = c.getContext('2d')!; g.clearRect(0, 0, w, h);
    const tc = document.createElement('canvas'); tc.width = w; tc.height = h; const tg = tc.getContext('2d')!; tpl.current = tc;
    if (paths?.length) {
      const along = (ctx: CanvasRenderingContext2D) => { for (const p of paths) { ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h))); ctx.stroke(); } };
      const thick = backdrop ? Math.max(6, w * 0.014) : pen;
      if (backdrop) g.drawImage(backdrop, 0, 0, w, h);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(148,163,184,0.35)'; g.lineWidth = thick * 1.6; along(g);
      g.strokeStyle = 'rgba(51,65,85,0.85)'; g.lineWidth = Math.max(2, thick * 0.3); g.setLineDash([2, Math.max(7, thick)]); along(g); g.setLineDash([]);
      // where to start: a green dot at the beginning of each line
      g.fillStyle = '#16a34a'; for (const p of paths) { g.beginPath(); g.arc(p[0][0] * w, p[0][1] * h, Math.max(5, thick * 0.6), 0, Math.PI * 2); g.fill(); }
      tg.lineCap = 'round'; tg.lineJoin = 'round'; tg.strokeStyle = '#000'; tg.lineWidth = thick; along(tg);
      return;
    }
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
  }, [w, h, text, guide, font, lines, backdrop, paths, fade, size, base, pen]);
  useEffect(() => { const c = ink.current; if (!c || w < 20) return; c.width = w; c.height = h; setResult(null); setSending(''); }, [w, h, text, backdrop, paths, fade]);

  const pos = (e: React.PointerEvent) => { const r = ink.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * ink.current!.width, y: ((e.clientY - r.top) / r.height) * ink.current!.height }; };
  // the pen: colour, size and type (a round pen, or the Arabic calligraphy qalam with its broad, slanted nib)
  const [tool, setToolState] = useState<{ color: string; size: number; type: PenType }>(() => {
    const d = { color: PEN_COLORS[0], size: 3, type: (text && isRtl(text) ? 'QALAM' : 'ROUND') as PenType };
    try { const s = JSON.parse(localStorage.getItem('kg-pen') || 'null'); if (s && PEN_COLORS.includes(s.color) && s.size >= 1 && s.size <= 6) return { ...d, color: s.color, size: s.size }; } catch { /* default */ }
    return d;
  });
  const setTool = (x: Partial<typeof tool>) => { const n = { ...tool, ...x }; setToolState(n); try { localStorage.setItem('kg-pen', JSON.stringify({ color: n.color, size: n.size })); } catch { /* not kept */ } };
  const basePen = backdrop ? Math.max(6, w * 0.014) : pen;
  const undo = useRef<ImageData[]>([]); const pressure = useRef(1);
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const g = ink.current!.getContext('2d')!; const width = basePen * (0.35 + tool.size * 0.22) * pressure.current;
    g.fillStyle = tool.color; g.strokeStyle = tool.color;
    if (tool.type === 'QALAM') {
      // the qalam: a flat nib held at about 70° — thick across, thin along the nib, like Naskh calligraphy
      const ang = (70 * Math.PI) / 180, nx = Math.cos(ang) * width * 0.75, ny = -Math.sin(ang) * width * 0.75;
      g.beginPath(); g.moveTo(a.x + nx, a.y + ny); g.lineTo(b.x + nx, b.y + ny); g.lineTo(b.x - nx, b.y - ny); g.lineTo(a.x - nx, a.y - ny); g.closePath(); g.fill();
      g.lineWidth = Math.max(1, width * 0.12); g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x + nx, a.y + ny); g.lineTo(a.x - nx, a.y - ny); g.moveTo(b.x + nx, b.y + ny); g.lineTo(b.x - nx, b.y - ny); g.stroke();
    } else {
      g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
  };
  const remember = () => { const c = ink.current; if (!c) return; undo.current.push(c.getContext('2d')!.getImageData(0, 0, c.width, c.height)); if (undo.current.length > 25) undo.current.shift(); };
  const clear = () => { const c = ink.current; if (c) { remember(); c.getContext('2d')!.clearRect(0, 0, c.width, c.height); } setResult(null); setSending(''); };
  const check = useCallback(() => {
    if (!tpl.current || !ink.current) return;
    pencil.stop(); const r = scoreTrace(tpl.current, ink.current, !!backdrop && !paths?.length); setResult(r.stars); onChecked?.(r);
    if (r.stars >= 3) sfx.levelUp(); else if (r.stars >= 1) sfx.star(); else sfx.wrong();
    say?.(r.stars >= 3 ? 'Excellent!' : r.stars === 2 ? 'Very good!' : r.stars === 1 ? 'Good try!' : 'Try again, follow the dots.');
  }, [backdrop, paths, onChecked, say]);
  const send = async () => {
    if (!onSend || !bg.current || !ink.current) return;
    const out = document.createElement('canvas'); const k = Math.min(1, 900 / bg.current.width); out.width = Math.round(bg.current.width * k); out.height = Math.round(bg.current.height * k);
    const g = out.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height); g.drawImage(bg.current, 0, 0, out.width, out.height); g.drawImage(ink.current, 0, 0, out.width, out.height);
    setSending('busy');
    try { await onSend(out.toDataURL('image/jpeg', 0.8), result); setSending('sent'); say?.('Sent to your teacher!'); } catch { setSending(''); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-slate-200" role="toolbar" aria-label={t('Pen')}>
        <div className="flex rounded-xl bg-slate-100 p-0.5" role="radiogroup" aria-label={t('Pen type')}>
          {([['ROUND', `✏️ ${t('Pen')}`], ['QALAM', `🖋️ ${t('Arabic qalam')}`]] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={tool.type === k} onClick={() => setTool({ type: k })}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-bold', tool.type === k ? 'bg-white text-slate-900 shadow' : 'text-slate-600')}>{l}</button>))}
        </div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label={t('Colour')}>
          {PEN_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={tool.color === c} aria-label={c} onClick={() => setTool({ color: c })}
            className={cn('size-7 rounded-full ring-2 ring-offset-1 transition', tool.color === c ? 'scale-110 ring-slate-800' : 'ring-transparent')} style={{ background: c }} />)}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">{t('Size')}
          <input type="range" min={1} max={6} value={tool.size} onChange={(e) => setTool({ size: Number(e.target.value) })} className="w-24 accent-sky-600" />
          <span className="grid size-8 place-items-center"><span className={cn(tool.type === 'QALAM' ? '-rotate-[20deg]' : 'rounded-full')} style={{ background: tool.color, width: tool.type === 'QALAM' ? Math.max(3, (0.35 + tool.size * 0.22) * 4) : (0.35 + tool.size * 0.22) * 12, height: (0.35 + tool.size * 0.22) * 12 }} /></span></label>
        <button type="button" onClick={() => { const u = undo.current.pop(); if (u) ink.current!.getContext('2d')!.putImageData(u, 0, 0); setResult(null); }} className="rounded-xl bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700">↶ {t('Undo')}</button>
      </div>
      <div ref={wrap} className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-2xl bg-white shadow-inner ring-2 ring-sky-200" style={{ height: h, maxWidth: backdrop ? `calc(62vh * ${backdrop.width / backdrop.height})` : undefined }}>
        <canvas ref={bg} className="absolute inset-0 size-full" />
        <canvas ref={ink} className="absolute inset-0 size-full cursor-crosshair" aria-label={t('Trace here')}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); remember(); setResult(null); drawing.current = true; pressure.current = e.pointerType === 'pen' && e.pressure > 0 ? 0.5 + e.pressure : 1; last.current = pos(e); line(last.current, last.current); }}
          onPointerMove={(e) => { if (!drawing.current || !last.current) return; if (e.pointerType === 'pen' && e.pressure > 0) pressure.current = 0.5 + e.pressure; const p = pos(e); line(last.current, p); pencil.move(Math.hypot(p.x - last.current.x, p.y - last.current.y) / Math.max(1, w) * 20); last.current = p; }}
          onPointerUp={() => { drawing.current = false; last.current = null; pencil.lift(); }} onPointerCancel={() => { drawing.current = false; pencil.lift(); }} />
        {result !== null && <div className="pointer-events-none absolute right-3 top-2 text-3xl drop-shadow">{result ? '⭐'.repeat(result) : '🔁'}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {text && say && <button type="button" onClick={() => say(text)} className="rounded-2xl bg-amber-100 px-4 py-2 text-lg font-bold text-amber-900">🔊 {t('Listen')}</button>}
        <button type="button" onClick={clear} className="rounded-2xl bg-slate-100 px-4 py-2 text-lg font-bold text-slate-700">↺ {t('Again')}</button>
        <button type="button" onClick={check} className="rounded-2xl bg-emerald-500 px-6 py-2 text-lg font-black text-white shadow">✅ {t('Done')}</button>
        {onSend && <button type="button" onClick={send} disabled={sending !== ''} className="rounded-2xl bg-violet-600 px-5 py-2 text-lg font-black text-white shadow disabled:opacity-70">
          {sending === 'sent' ? `✔ ${t('Sent')}` : sending === 'busy' ? `⏳ ${t('Sending…')}` : `📤 ${t('Send to teacher')}`}</button>}
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
