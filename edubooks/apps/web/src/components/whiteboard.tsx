'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eraser, Highlighter, Pencil, Trash2, Type, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { loadPdf } from '@/components/reader';
import { useT } from '@/lib/i18n';

type Stroke = { id: string; c: string; w: number; t: 'pen' | 'hl' | 'er'; p: number[][] };
type Txt = { id: string; x: number; y: number; s: string; c: string; w: number };
type Op = { seq?: number; kind: 'pts' | 'undo' | 'clear' | 'bg' | 'text'; data: any };
type Bg = { componentId: string | null; page: number | null };

const COLORS = ['#1f2937', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777'];
const SIZES = [2, 4, 8, 14];
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Drawing model shared by the teacher (writer) and pupils (watchers). Coordinates are 0–1 of the board. */
function useModel() {
  const strokes = useRef(new Map<string, Stroke>()); const order = useRef<string[]>([]); const texts = useRef(new Map<string, Txt>());
  const apply = useCallback((op: Op) => {
    const d = op.data;
    if (op.kind === 'pts') {
      let s = strokes.current.get(d.id);
      if (!s) { s = { id: d.id, c: d.c, w: d.w, t: d.t, p: [] }; strokes.current.set(d.id, s); order.current.push(d.id); }
      s.p.push(...d.p);
    } else if (op.kind === 'text') { texts.current.set(d.id, d); order.current.push(d.id); }
    else if (op.kind === 'undo') { strokes.current.delete(d.id); texts.current.delete(d.id); order.current = order.current.filter((x) => x !== d.id); }
    else if (op.kind === 'clear' || op.kind === 'bg') { strokes.current.clear(); texts.current.clear(); order.current = []; }
  }, []);
  return { strokes, order, texts, apply };
}

function paint(cv: HTMLCanvasElement | null, m: ReturnType<typeof useModel>) {
  if (!cv) return;
  const ctx = cv.getContext('2d')!; const W = cv.width; const H = cv.height; const k = W / 1000;
  ctx.clearRect(0, 0, W, H);
  for (const id of m.order.current) {
    const s = m.strokes.current.get(id);
    if (s) {
      ctx.save();
      ctx.globalCompositeOperation = s.t === 'er' ? 'destination-out' : 'source-over';
      ctx.globalAlpha = s.t === 'hl' ? 0.35 : 1; ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
      ctx.lineWidth = (s.t === 'hl' ? s.w * 3 : s.t === 'er' ? s.w * 4 : s.w) * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const p = s.p.map(([x, y]) => [x * W, y * H]);
      if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
      else {
        ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2; const my = (p[i][1] + p[i + 1][1]) / 2; ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my); }
        ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]); ctx.stroke();
      }
      ctx.restore(); continue;
    }
    const t = m.texts.current.get(id);
    if (t) { ctx.save(); ctx.fillStyle = t.c; ctx.font = `600 ${t.w * k}px Inter, system-ui, sans-serif`; ctx.textBaseline = 'top'; t.s.split('\n').forEach((line, i) => ctx.fillText(line, t.x * W, t.y * H + i * t.w * k * 1.2)); ctx.restore(); }
  }
}

/** Book page (or a plain board) behind the ink; reports the page count and aspect ratio. */
function useBackground(bg: Bg, canvas: React.RefObject<HTMLCanvasElement | null>, size: { w: number; h: number }) {
  const [info, setInfo] = useState<{ pages: number; aspect: number; error?: string }>({ pages: 0, aspect: 16 / 10 });
  const doc = useRef<{ id: string; d: any } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!bg.componentId) { setInfo({ pages: 0, aspect: 16 / 10 }); return; }
      try {
        if (doc.current?.id !== bg.componentId) {
          const { url } = await api.get<{ url: string }>(`/reader/components/${bg.componentId}/pdf`);
          doc.current = { id: bg.componentId, d: await loadPdf(url) };
        }
        const d = doc.current.d; const page = await d.getPage(Math.min(Math.max(1, bg.page ?? 1), d.numPages));
        const vp1 = page.getViewport({ scale: 1 });
        if (cancelled) return;
        setInfo({ pages: d.numPages, aspect: vp1.width / vp1.height });
        const cv = canvas.current; if (!cv || !size.w) return;
        const scale = (size.w * (window.devicePixelRatio || 1)) / vp1.width;
        const vp = page.getViewport({ scale });
        cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d')!, viewport: vp }).promise;
      } catch (e: any) { if (!cancelled) setInfo({ pages: 0, aspect: 16 / 10, error: e?.message || 'The book page could not be loaded' }); }
    })();
    return () => { cancelled = true; };
  }, [bg.componentId, bg.page, size.w, canvas]);
  return info;
}

/** Fits the board into the space available, keeping its shape. */
function useFit(aspect: number, extraHeight: number) {
  const box = useRef<HTMLDivElement>(null); const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current; if (!el) return;
    const fit = () => {
      const maxW = el.clientWidth; const maxH = Math.max(240, window.innerHeight - extraHeight);
      const w = Math.min(maxW, maxH * aspect); setSize({ w: Math.floor(w), h: Math.floor(w / aspect) });
    };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [aspect, extraHeight]);
  return { box, size };
}

async function loadAll(id: string, apply: (o: Op) => void) {
  let after = 0; let meta: any = null;
  for (let i = 0; i < 50; i++) {
    const r = await api.get<any>(`/whiteboards/${id}/ops?after=${after}`); meta = r;
    for (const o of r.ops) apply(o);
    if (r.ops.length) after = r.ops[r.ops.length - 1].seq;
    if (r.ops.length < 3000) break;
  }
  return { after, meta };
}

// =====================================================================================================
/** Teacher's board: draw, write text, highlight, erase, undo, clear and turn book pages. Everything is sent live. */
export function WhiteboardWriter({ board, onEnd }: { board: any; onEnd: () => void }) {
  const toast = useToast(); const m = useModel();
  const [bg, setBg] = useState<Bg>({ componentId: board.componentId ?? null, page: board.page ?? null });
  const [tool, setTool] = useState<'pen' | 'hl' | 'er' | 'text'>('pen'); const [color, setColor] = useState(COLORS[1]); const [size, setSz] = useState(4);
  const [ready, setReady] = useState(false); const [typing, setTyping] = useState<{ x: number; y: number; s: string } | null>(null);
  const bgCanvas = useRef<HTMLCanvasElement>(null); const ink = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(16 / 10);
  const { box, size: fit } = useFit(aspect, 230);
  const info = useBackground(bg, bgCanvas, fit);
  useEffect(() => setAspect(info.aspect), [info.aspect]);
  const mine = useRef<string[]>([]); const queue = useRef<Op[]>([]); const sending = useRef(false); const drawing = useRef<Stroke | null>(null); const chunk = useRef<number[][]>([]);
  const [offline, setOffline] = useState(false);

  const redraw = useCallback(() => paint(ink.current, m), [m]);
  useEffect(() => { loadAll(board.id, m.apply).then(() => { setReady(true); redraw(); }).catch((e) => toast(e.message, 'err')); }, [board.id, m.apply, redraw, toast]);
  useEffect(() => { const cv = ink.current; if (!cv || !fit.w) return; const r = window.devicePixelRatio || 1; cv.width = fit.w * r; cv.height = fit.h * r; redraw(); }, [fit, redraw]);

  const flush = useCallback(async () => {
    if (drawing.current && chunk.current.length) { const s = drawing.current; queue.current.push({ kind: 'pts', data: { id: s.id, c: s.c, w: s.w, t: s.t, p: chunk.current } }); chunk.current = []; }
    if (sending.current || !queue.current.length) return;
    sending.current = true; const batch = queue.current.splice(0, 150);
    try { await api.post(`/whiteboards/${board.id}/ops`, { ops: batch }); setOffline(false); }
    catch (e: any) { queue.current.unshift(...batch); setOffline(true); if (/ended/i.test(e.message)) { toast(e.message, 'err'); queue.current = []; } }
    finally { sending.current = false; }
  }, [board.id, toast]);
  useEffect(() => { const t = setInterval(flush, 200); return () => clearInterval(t); }, [flush]);
  const send = (op: Op) => { queue.current.push(op); flush(); };

  const pos = (e: React.PointerEvent) => { const r = ink.current!.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  const down = (e: React.PointerEvent) => {
    if (!ready) return;
    const [x, y] = pos(e);
    if (tool === 'text') { e.preventDefault(); if (typing) commitText(); setTyping({ x, y, s: '' }); return; }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const s: Stroke = { id: rid(), c: color, w: size, t: tool, p: [] };
    drawing.current = s; mine.current.push(s.id);
    m.apply({ kind: 'pts', data: { ...s, p: [[x, y]] } }); chunk.current = [[x, y]]; redraw();
  };
  const move = (e: React.PointerEvent) => {
    const s = drawing.current; if (!s) return;
    const [x, y] = pos(e); const last = s.p[s.p.length - 1];
    if (last && Math.hypot(x - last[0], y - last[1]) < 0.0015) return;
    s.p.push([x, y]); chunk.current.push([x, y]);
    if (chunk.current.length >= 500) flush();
    redraw();
  };
  const up = () => { if (drawing.current) { flush(); drawing.current = null; } };
  const commitText = () => {
    if (!typing) return; const s = typing.s.trim(); setTyping(null); if (!s) return;
    const t = { id: rid(), x: typing.x, y: typing.y, s, c: color, w: 20 + size * 3 };
    mine.current.push(t.id); m.apply({ kind: 'text', data: t }); redraw(); send({ kind: 'text', data: t });
  };
  const undo = () => { const id = mine.current.pop(); if (!id) return; m.apply({ kind: 'undo', data: { id } }); redraw(); send({ kind: 'undo', data: { id } }); };
  const clear = () => { if (!confirm('Clear the whole board for everyone?')) return; m.apply({ kind: 'clear', data: {} }); mine.current = []; redraw(); send({ kind: 'clear', data: {} }); };
  const turn = (d: number) => {
    if (!bg.componentId) return; const page = Math.min(Math.max(1, (bg.page ?? 1) + d), info.pages || 9999); if (page === bg.page) return;
    const nb = { componentId: bg.componentId, page }; setBg(nb); m.apply({ kind: 'bg', data: nb }); mine.current = []; redraw(); send({ kind: 'bg', data: nb });
  };

  const Btn = ({ on, label, onClick, children }: { on?: boolean; label: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" title={label} aria-label={label} aria-pressed={on} onClick={onClick}
      className={cn('grid size-10 place-items-center rounded-xl transition', on ? 'bg-violet-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100')}>{children}</button>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-2 shadow-sm">
        <Btn label="Pen" on={tool === 'pen'} onClick={() => setTool('pen')}><Pencil className="size-5" /></Btn>
        <Btn label="Highlighter" on={tool === 'hl'} onClick={() => setTool('hl')}><Highlighter className="size-5" /></Btn>
        <Btn label="Text" on={tool === 'text'} onClick={() => setTool('text')}><Type className="size-5" /></Btn>
        <Btn label="Eraser" on={tool === 'er'} onClick={() => setTool('er')}><Eraser className="size-5" /></Btn>
        <span className="mx-1 h-7 w-px bg-slate-200" />
        {COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => { setColor(c); if (tool === 'er') setTool('pen'); }}
          className={cn('size-7 rounded-full ring-offset-2 transition', color === c && 'ring-2 ring-slate-800')} style={{ background: c }} />)}
        <span className="mx-1 h-7 w-px bg-slate-200" />
        {SIZES.map((s) => <button key={s} type="button" aria-label={`Size ${s}`} aria-pressed={size === s} onClick={() => setSz(s)}
          className={cn('grid size-9 place-items-center rounded-xl', size === s ? 'bg-slate-100 ring-1 ring-slate-300' : 'hover:bg-slate-50')}><span className="rounded-full bg-slate-700" style={{ width: s + 2, height: s + 2 }} /></button>)}
        <span className="mx-1 h-7 w-px bg-slate-200" />
        <Btn label="Undo" onClick={undo}><Undo2 className="size-5" /></Btn>
        <Btn label="Clear board" onClick={clear}><Trash2 className="size-5 text-red-500" /></Btn>
        {bg.componentId && <>
          <span className="mx-1 h-7 w-px bg-slate-200" />
          <Btn label="Previous page" onClick={() => turn(-1)}><ChevronLeft className="size-5" /></Btn>
          <span className="text-sm font-semibold text-slate-700">Page {bg.page}{info.pages ? ` / ${info.pages}` : ''}</span>
          <Btn label="Next page" onClick={() => turn(1)}><ChevronRight className="size-5" /></Btn>
        </>}
        <div className="ml-auto flex items-center gap-2">
          <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold', offline ? 'bg-amber-100 text-amber-800' : 'bg-red-50 text-red-600')}>
            <span className={cn('size-2 rounded-full', offline ? 'bg-amber-500' : 'bg-red-500 motion-safe:animate-pulse')} />{offline ? 'Reconnecting…' : 'LIVE'}</span>
          <button type="button" onClick={onEnd} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">End lesson</button>
        </div>
      </div>
      {info.error && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{info.error} The board continues without the page.</p>}
      <div ref={box} className="flex w-full justify-center">
        <div className="relative overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-200" style={{ width: fit.w, height: fit.h }}>
          {bg.componentId ? <canvas ref={bgCanvas} className="absolute inset-0 size-full" aria-hidden />
            : <div aria-hidden className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:22px_22px]" />}
          <canvas ref={ink} className={cn('absolute inset-0 size-full touch-none', tool === 'text' ? 'cursor-text' : 'cursor-crosshair')}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} aria-label="Whiteboard: draw here" />
          {typing && (
            <textarea ref={(el) => { if (el && document.activeElement !== el) el.focus(); }} value={typing.s} onChange={(e) => setTyping({ ...typing, s: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } if (e.key === 'Escape') setTyping(null); }} onBlur={commitText}
              placeholder="Type, then press Enter" rows={2} className="absolute w-64 resize-none rounded-lg border border-violet-400 bg-white/95 p-2 text-sm shadow outline-none"
              style={{ left: `${Math.min(typing.x, 0.75) * 100}%`, top: `${Math.min(typing.y, 0.85) * 100}%`, color }} />
          )}
          {!ready && <div className="absolute inset-0 grid place-items-center bg-white/60 text-sm text-slate-500">Loading the board…</div>}
        </div>
      </div>
      <p className="text-center text-xs text-slate-500">Students of {board.className} see everything you write, live. Turning the page starts fresh ink on the new page.</p>
    </div>
  );
}

// =====================================================================================================
/** Pupil's view: follows the teacher's board live (read-only). */
export function WhiteboardViewer({ board, playful }: { board: any; playful?: boolean }) {
  const m = useModel(); const { t } = useT();
  const [bg, setBg] = useState<Bg>({ componentId: board.componentId ?? null, page: board.page ?? null });
  const [live, setLive] = useState<boolean>(board.live);
  const bgCanvas = useRef<HTMLCanvasElement>(null); const ink = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(16 / 10);
  const { box, size: fit } = useFit(aspect, playful ? 260 : 200);
  const info = useBackground(bg, bgCanvas, fit);
  useEffect(() => setAspect(info.aspect), [info.aspect]);
  const after = useRef(0); const [ready, setReady] = useState(false);
  const redraw = useCallback(() => paint(ink.current, m), [m]);
  const take = useCallback((o: Op) => { m.apply(o); if (o.kind === 'bg') setBg({ componentId: o.data.componentId, page: o.data.page }); }, [m]);
  useEffect(() => { loadAll(board.id, take).then(({ after: a, meta }) => { after.current = a; setLive(meta?.live ?? false); setReady(true); redraw(); }).catch(() => setReady(true)); }, [board.id, take, redraw]);
  useEffect(() => { const cv = ink.current; if (!cv || !fit.w) return; const r = window.devicePixelRatio || 1; cv.width = fit.w * r; cv.height = fit.h * r; redraw(); }, [fit, redraw]);
  useEffect(() => {
    if (!ready || !live) return;
    let stop = false; let t: any;
    const tick = async () => {
      try {
        const r = await api.get<any>(`/whiteboards/${board.id}/ops?after=${after.current}`);
        for (const o of r.ops) take(o);
        if (r.ops.length) { after.current = r.ops[r.ops.length - 1].seq; redraw(); }
        if (!r.live) setLive(false);
      } catch { /* keep trying */ }
      if (!stop) t = setTimeout(tick, document.hidden ? 3000 : 700);
    };
    t = setTimeout(tick, 700);
    return () => { stop = true; clearTimeout(t); };
  }, [ready, live, board.id, take, redraw]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-semibold">
        {live ? <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-red-600"><span className="size-2 rounded-full bg-red-500 motion-safe:animate-pulse" />{t('LIVE — {name} is writing', { name: board.teacher ?? '' })}</span>
          : <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{t('This lesson has ended. You can still look at the board.')}</span>}
        {bg.componentId && <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700">📖 {board.bookTitle ?? 'Book'}{board.partTitle ? ` · ${board.partTitle}` : ''} · page {bg.page}</span>}
      </div>
      <div ref={box} className="flex w-full justify-center">
        <div className={cn('relative overflow-hidden bg-white shadow-md ring-1 ring-slate-200', playful ? 'rounded-[2rem] ring-4 ring-white' : 'rounded-2xl')} style={{ width: fit.w, height: fit.h }}
          onContextMenu={(e) => e.preventDefault()}>
          {bg.componentId ? <canvas ref={bgCanvas} className="absolute inset-0 size-full" aria-hidden />
            : <div aria-hidden className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:22px_22px]" />}
          <canvas ref={ink} className="absolute inset-0 size-full" role="img" aria-label="The teacher's whiteboard" />
          {!ready && <div className="absolute inset-0 grid place-items-center bg-white/60 text-sm text-slate-500">Opening the board…</div>}
        </div>
      </div>
    </div>
  );
}

/** Banner on the pupil home page while a teacher's whiteboard is live. */
export function LiveBoards() {
  const { t } = useT();
  const [boards, setBoards] = useState<any[]>([]);
  useEffect(() => {
    let stop = false; let t: any;
    const tick = async () => { try { const r = await api.get<any[]>('/whiteboards?live=1'); if (!stop) setBoards(r); } catch { /* ignore */ } if (!stop) t = setTimeout(tick, 15000); };
    tick(); return () => { stop = true; clearTimeout(t); };
  }, []);
  if (!boards.length) return null;
  return (
    <section className="space-y-3">
      {boards.map((b) => (
        <a key={b.id} href={`/learn/board/${b.id}`} className="kid-rise flex items-center gap-4 rounded-[2rem] bg-gradient-to-r from-[#e47aa5] to-[#8f7fe3] p-5 text-white shadow-lg transition hover:-translate-y-0.5">
          <span className="grid size-16 shrink-0 place-items-center rounded-3xl bg-white/25 text-4xl">🧑‍🏫</span>
          <span className="flex-1"><span className="flex items-center gap-2 text-sm font-black uppercase tracking-wide"><span className="size-2.5 rounded-full bg-white motion-safe:animate-pulse" />{t('Live whiteboard')}</span>
            <span className="block text-2xl font-black">{b.title}</span><span className="font-bold text-white/90">{t('{name} is writing — come and watch!', { name: b.teacher ?? '' })}</span></span>
          <span className="rounded-full bg-white px-6 py-3 text-xl font-black text-violet-700 shadow-[0_5px_0_rgba(0,0,0,.15)]">{t('Watch ▶')}</span>
        </a>
      ))}
    </section>
  );
}
