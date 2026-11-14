'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Circle, Eraser, Eye, FilePlus2, Highlighter, Maximize2, Minimize2, Minus, Pencil, Redo2, Square, Trash2, Type, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { loadPdf } from '@/components/reader';
import type { FileLink } from '@/lib/protected-pdf';
import { useT } from '@/lib/i18n';

type Stroke = { id: string; c: string; w: number; t: 'pen' | 'hl' | 'er'; p: number[][] };
type Txt = { id: string; x: number; y: number; s: string; c: string; w: number };
type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse';
type Shape = { id: string; s: ShapeKind; a: number[]; b: number[]; c: string; w: number; f?: boolean };
type Op = { seq?: number; kind: 'pts' | 'undo' | 'clear' | 'bg' | 'text' | 'shape'; data: any };
type Paper = 'plain' | 'dots' | 'grid' | 'lines' | 'kg';
type Bg = { componentId: string | null; page: number | null; paper?: Paper };
type Page = { order: string[]; strokes: Map<string, Stroke>; texts: Map<string, Txt>; shapes: Map<string, Shape>; paper: Paper };
type Tool = 'pen' | 'hl' | 'er' | 'text' | ShapeKind;

const COLORS = ['#1f2937', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2'];
const SIZES: [number, string][] = [[2, 'Thin'], [4, 'Medium'], [8, 'Thick'], [14, 'Huge']];
const PAPERS: [Paper, string][] = [['dots', 'Dots'], ['grid', 'Squares'], ['lines', 'Lines'], ['kg', 'Handwriting'], ['plain', 'Plain']];
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const keyOf = (bg: Bg) => (bg.componentId ? `${bg.componentId}:${bg.page ?? 1}` : `blank:${bg.page ?? 1}`);
const newPage = (paper: Paper = 'dots'): Page => ({ order: [], strokes: new Map(), texts: new Map(), shapes: new Map(), paper });

/**
 * Drawing model shared by the teacher (writer) and students (watchers). Coordinates are 0–1 of the board.
 * Each page (book page or blank page) keeps its own ink, so turning back shows what was written there.
 */
function useModel() {
  const pages = useRef(new Map<string, Page>()); const cur = useRef('start'); const last = useRef<Bg | null>(null); const blankMax = useRef(0);
  const page = useCallback((k = cur.current) => { let p = pages.current.get(k); if (!p) { p = newPage(); pages.current.set(k, p); } return p; }, []);
  const apply = useCallback((op: Op) => {
    const d = op.data;
    if (op.kind === 'bg') {
      cur.current = keyOf(d); last.current = { componentId: d.componentId ?? null, page: d.page ?? 1 };
      if (!d.componentId) blankMax.current = Math.max(blankMax.current, d.page ?? 1);
      const p = page(); if (d.paper) p.paper = d.paper; return;
    }
    const p = page();
    if (op.kind === 'pts') {
      let s = p.strokes.get(d.id);
      if (!s) { s = { id: d.id, c: d.c, w: d.w, t: d.t, p: [] }; p.strokes.set(d.id, s); p.order.push(d.id); }
      s.p.push(...d.p);
    } else if (op.kind === 'text') { p.texts.set(d.id, d); p.order.push(d.id); }
    else if (op.kind === 'shape') { p.shapes.set(d.id, d); p.order.push(d.id); }
    else if (op.kind === 'undo') { p.strokes.delete(d.id); p.texts.delete(d.id); p.shapes.delete(d.id); p.order = p.order.filter((x) => x !== d.id); }
    else if (op.kind === 'clear') { p.strokes.clear(); p.texts.clear(); p.shapes.clear(); p.order = []; }
  }, [page]);
  /** The operations that re-create one item (used by redo). */
  const opsFor = useCallback((id: string): Op[] => {
    const p = page(); const s = p.strokes.get(id);
    if (s) { const out: Op[] = []; for (let i = 0; i < s.p.length; i += 500) out.push({ kind: 'pts', data: { id, c: s.c, w: s.w, t: s.t, p: s.p.slice(i, i + 500) } }); return out; }
    const t = p.texts.get(id); if (t) return [{ kind: 'text', data: { ...t } }];
    const sh = p.shapes.get(id); if (sh) return [{ kind: 'shape', data: { ...sh } }];
    return [];
  }, [page]);
  // one stable object, so effects that depend on the model do not re-run on every render
  return useMemo(() => ({ pages, cur, last, blankMax, page, apply, opsFor }), [page, apply, opsFor]);
}
type Model = ReturnType<typeof useModel>;

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, W: number, H: number, k: number) {
  const [x1, y1, x2, y2] = [s.a[0] * W, s.a[1] * H, s.b[0] * W, s.b[1] * H];
  ctx.save(); ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (s.s === 'rect') ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  else if (s.s === 'ellipse') ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
  else { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  if (s.f && (s.s === 'rect' || s.s === 'ellipse')) { ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
  ctx.stroke();
  if (s.s === 'arrow') {
    const ang = Math.atan2(y2 - y1, x2 - x1); const len = Math.max(12 * k, s.w * k * 3.5);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - len * Math.cos(ang - 0.45), y2 - len * Math.sin(ang - 0.45)); ctx.lineTo(x2 - len * Math.cos(ang + 0.45), y2 - len * Math.sin(ang + 0.45));
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function paint(cv: HTMLCanvasElement | null, m: Model, preview?: Shape | null) {
  if (!cv) return;
  const ctx = cv.getContext('2d')!; const W = cv.width; const H = cv.height; const k = W / 1000;
  ctx.clearRect(0, 0, W, H);
  const pg = m.page();
  for (const id of pg.order) {
    const s = pg.strokes.get(id);
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
    const sh = pg.shapes.get(id); if (sh) { drawShape(ctx, sh, W, H, k); continue; }
    const t = pg.texts.get(id);
    if (t) { ctx.save(); ctx.fillStyle = t.c; ctx.font = `600 ${t.w * k}px Inter, system-ui, sans-serif`; ctx.textBaseline = 'top'; t.s.split('\n').forEach((line, i) => ctx.fillText(line, t.x * W, t.y * H + i * t.w * k * 1.2)); ctx.restore(); }
  }
  if (preview) { ctx.save(); ctx.setLineDash([6 * k, 5 * k]); drawShape(ctx, preview, W, H, k); ctx.restore(); }
}

/** Blank-page paper, drawn in board units so it lines up the same on every screen. */
function drawPaper(cv: HTMLCanvasElement, paper: Paper) {
  const ctx = cv.getContext('2d')!; const W = cv.width; const H = cv.height; const k = W / 1000;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  if (paper === 'dots') { ctx.fillStyle = '#cbd5e1'; for (let x = 25 * k; x < W; x += 25 * k) for (let y = 25 * k; y < H; y += 25 * k) { ctx.beginPath(); ctx.arc(x, y, 1.3 * k, 0, Math.PI * 2); ctx.fill(); } }
  if (paper === 'grid') { ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = Math.max(1, k); for (let x = 0; x < W; x += 40 * k) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = 0; y < H; y += 40 * k) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
  if (paper === 'lines') { ctx.strokeStyle = '#bfdbfe'; ctx.lineWidth = Math.max(1, 1.5 * k); for (let y = 60 * k; y < H; y += 45 * k) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } ctx.strokeStyle = '#fca5a5'; ctx.beginPath(); ctx.moveTo(70 * k, 0); ctx.lineTo(70 * k, H); ctx.stroke(); }
  if (paper === 'kg') {
    // four-line handwriting rows: top, dashed middle, red base line, bottom
    for (let y = 40 * k; y + 66 * k < H; y += 110 * k) {
      const line = (yy: number, c: string, dash: number[] = [], w = 1.5) => { ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, w * k); ctx.setLineDash(dash.map((d) => d * k)); ctx.beginPath(); ctx.moveTo(20 * k, yy); ctx.lineTo(W - 20 * k, yy); ctx.stroke(); ctx.restore(); };
      line(y, '#94a3b8'); line(y + 22 * k, '#cbd5e1', [8, 6]); line(y + 44 * k, '#ef4444', [], 2); line(y + 66 * k, '#94a3b8');
    }
  }
}

/** Book page (or blank paper) behind the ink; reports the page count and shape. */
function useBackground(bg: Bg, paper: Paper, canvas: React.RefObject<HTMLCanvasElement | null>, size: { w: number; h: number }) {
  const [info, setInfo] = useState<{ pages: number; aspect: number; error?: string }>({ pages: 0, aspect: 16 / 10 });
  const doc = useRef<{ id: string; d: any } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cv = canvas.current;
      if (!bg.componentId) {
        setInfo((i) => (i.pages === 0 && i.aspect === 16 / 10 && !i.error ? i : { pages: 0, aspect: 16 / 10 }));
        if (cv && size.w) { const r = window.devicePixelRatio || 1; cv.width = size.w * r; cv.height = size.h * r; drawPaper(cv, paper); }
        return;
      }
      try {
        if (doc.current?.id !== bg.componentId) {
          const link = await api.get<FileLink>(`/reader/components/${bg.componentId}/pdf`);
          doc.current = { id: bg.componentId, d: await loadPdf(link) };
        }
        const d = doc.current.d; const page = await d.getPage(Math.min(Math.max(1, bg.page ?? 1), d.numPages));
        const vp1 = page.getViewport({ scale: 1 });
        if (cancelled) return;
        setInfo({ pages: d.numPages, aspect: vp1.width / vp1.height });
        if (!cv || !size.w) return;
        const scale = (size.w * (window.devicePixelRatio || 1)) / vp1.width;
        const vp = page.getViewport({ scale });
        cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d')!, viewport: vp }).promise;
      } catch (e: any) { if (!cancelled) setInfo({ pages: 0, aspect: 16 / 10, error: e?.message || 'The book page could not be loaded' }); }
    })();
    return () => { cancelled = true; };
  }, [bg.componentId, bg.page, paper, size.w, size.h, canvas]);
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

/** Full screen for the board area (projector / smart board). */
function useFullscreen() {
  const ref = useRef<HTMLDivElement>(null); const [on, setOn] = useState(false);
  useEffect(() => { const f = () => setOn(document.fullscreenElement === ref.current); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const toggle = useCallback(() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined); else ref.current?.requestFullscreen?.().catch(() => undefined); }, []);
  return { ref, on, toggle };
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

const TOOLS: [Tool, string, any, string][] = [
  ['pen', 'Pen', Pencil, 'P'], ['hl', 'Marker', Highlighter, 'M'], ['line', 'Line', Minus, 'L'], ['arrow', 'Arrow', ArrowUpRight, 'A'],
  ['rect', 'Box', Square, 'B'], ['ellipse', 'Circle', Circle, 'C'], ['text', 'Text', Type, 'T'], ['er', 'Eraser', Eraser, 'E'],
];
const SHAPES: Tool[] = ['line', 'arrow', 'rect', 'ellipse'];

function BigBtn({ on, label, hint, onClick, disabled, children, className }: { on?: boolean; label: string; hint?: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" title={hint ? `${label} (${hint})` : label} aria-label={label} aria-pressed={on} onClick={onClick} disabled={disabled}
      className={cn('flex min-w-[3.6rem] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-35', on ? 'bg-violet-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100', className)}>
      {children}<span>{label}</span>
    </button>
  );
}

// =====================================================================================================
/** Teacher's board: draw, shapes, text, highlight, erase, undo/redo, pages (book or blank). Everything is sent live. */
export function WhiteboardWriter({ board, onEnd }: { board: any; onEnd: () => void }) {
  const toast = useToast(); const m = useModel();
  const book: string | null = board.componentId ?? null;
  const [bg, setBg] = useState<Bg>({ componentId: book, page: book ? board.page ?? 1 : 1 });
  const [paper, setPaperState] = useState<Paper>('dots');
  const [tool, setTool] = useState<Tool>('pen'); const [color, setColor] = useState(COLORS[1]); const [size, setSz] = useState(4); const [fill, setFill] = useState(false);
  const [ready, setReady] = useState(false); const [typing, setTyping] = useState<{ x: number; y: number; s: string } | null>(null);
  const [, setVer] = useState(0); const bump = () => setVer((v) => v + 1);
  const bgCanvas = useRef<HTMLCanvasElement>(null); const ink = useRef<HTMLCanvasElement>(null);
  const fs = useFullscreen();
  const [aspect, setAspect] = useState(16 / 10);
  const { box, size: fit } = useFit(aspect, fs.on ? 150 : 270);
  const info = useBackground(bg, paper, bgCanvas, fit);
  useEffect(() => setAspect(info.aspect), [info.aspect]);
  const queue = useRef<Op[]>([]); const sending = useRef(false); const drawing = useRef<Stroke | null>(null); const chunk = useRef<number[][]>([]);
  const shape = useRef<Shape | null>(null); const redo = useRef(new Map<string, Op[][]>()); const lastBook = useRef(book ? board.page ?? 1 : 1);
  const [offline, setOffline] = useState(false);
  const [watch, setWatch] = useState<{ watching: number; classSize: number; names: string[] } | null>(null);

  const redraw = useCallback((preview?: Shape | null) => paint(ink.current, m, preview), [m]);

  const flush = useCallback(async () => {
    if (drawing.current && chunk.current.length) { const s = drawing.current; queue.current.push({ kind: 'pts', data: { id: s.id, c: s.c, w: s.w, t: s.t, p: chunk.current } }); chunk.current = []; }
    if (sending.current || !queue.current.length) return;
    sending.current = true; const batch = queue.current.splice(0, 150);
    try { await api.post(`/whiteboards/${board.id}/ops`, { ops: batch }); setOffline(false); }
    catch (e: any) { queue.current.unshift(...batch); setOffline(true); if (/ended/i.test(e.message)) { toast(e.message, 'err'); queue.current = []; } }
    finally { sending.current = false; }
  }, [board.id, toast]);
  useEffect(() => { const t = setInterval(flush, 200); return () => clearInterval(t); }, [flush]);
  const send = useCallback((op: Op) => { queue.current.push(op); flush(); }, [flush]);

  useEffect(() => {
    loadAll(board.id, m.apply).then(() => {
      const l = m.last.current;
      if (l) { setBg(l); if (l.componentId) lastBook.current = l.page ?? 1; setPaperState(m.page().paper); }
      else if (!Number(board.seq)) { const first: Bg = { componentId: book, page: book ? board.page ?? 1 : 1, paper: 'dots' }; m.apply({ kind: 'bg', data: first }); send({ kind: 'bg', data: first }); }
      setReady(true); redraw();
    }).catch((e) => toast(e.message, 'err'));
  }, [board.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const cv = ink.current; if (!cv || !fit.w) return; const r = window.devicePixelRatio || 1; cv.width = fit.w * r; cv.height = fit.h * r; redraw(); }, [fit, redraw]);
  useEffect(() => {
    let stop = false;
    const tick = async () => { try { const r = await api.get<any>(`/whiteboards/${board.id}/watchers`); if (!stop) setWatch(r); } catch { /* ignore */ } };
    tick(); const t = setInterval(tick, 8000); return () => { stop = true; clearInterval(t); };
  }, [board.id]);

  // ---- pages
  const go = (nb: Bg) => {
    if (typing) commitText();
    const target = m.pages.current.get(keyOf(nb));
    const data: Bg = { componentId: nb.componentId, page: nb.page, ...(nb.componentId ? {} : { paper: nb.paper ?? target?.paper ?? paper }) };
    m.apply({ kind: 'bg', data }); send({ kind: 'bg', data });
    if (nb.componentId) lastBook.current = nb.page ?? 1;
    setBg({ componentId: nb.componentId, page: nb.page }); setPaperState(m.page().paper); redraw(); bump();
  };
  const blankMax = Math.max(1, m.blankMax.current);
  const turn = (d: number) => {
    if (bg.componentId) { const page = Math.min(Math.max(1, (bg.page ?? 1) + d), info.pages || 9999); if (page !== bg.page) go({ componentId: bg.componentId, page }); }
    else { const page = Math.min(Math.max(1, (bg.page ?? 1) + d), blankMax); if (page !== bg.page) go({ componentId: null, page }); }
  };
  const newBlank = () => go({ componentId: null, page: m.blankMax.current + 1, paper: paper === 'plain' ? 'plain' : paper });
  const setPaper = (p: Paper) => { if (bg.componentId) return; go({ componentId: null, page: bg.page, paper: p }); };

  // ---- drawing
  const key = () => m.cur.current;
  const freshWork = () => { redo.current.delete(key()); bump(); };
  const pos = (e: React.PointerEvent) => { const r = ink.current!.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  const down = (e: React.PointerEvent) => {
    if (!ready) return;
    const [x, y] = pos(e);
    if (tool === 'text') { e.preventDefault(); if (typing) commitText(); setTyping({ x, y, s: '' }); return; }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (SHAPES.includes(tool)) { shape.current = { id: rid(), s: tool as ShapeKind, a: [x, y], b: [x, y], c: color, w: size, f: fill && (tool === 'rect' || tool === 'ellipse') }; return; }
    const s: Stroke = { id: rid(), c: color, w: size, t: tool as Stroke['t'], p: [] };
    drawing.current = s;
    m.apply({ kind: 'pts', data: { ...s, p: [[x, y]] } }); drawing.current = m.page().strokes.get(s.id)!; chunk.current = [[x, y]]; redraw(); freshWork();
  };
  const move = (e: React.PointerEvent) => {
    if (shape.current) { shape.current.b = pos(e); redraw(shape.current); return; }
    const s = drawing.current; if (!s) return;
    const [x, y] = pos(e); const last = s.p[s.p.length - 1];
    if (last && Math.hypot(x - last[0], y - last[1]) < 0.0015) return;
    s.p.push([x, y]); chunk.current.push([x, y]);
    if (chunk.current.length >= 500) flush();
    redraw();
  };
  const up = () => {
    const sh = shape.current;
    if (sh) {
      shape.current = null;
      if (Math.hypot(sh.b[0] - sh.a[0], sh.b[1] - sh.a[1]) > 0.004) { m.apply({ kind: 'shape', data: sh }); send({ kind: 'shape', data: sh }); freshWork(); }
      redraw(); return;
    }
    if (drawing.current) { flush(); drawing.current = null; }
  };
  const commitText = () => {
    if (!typing) return; const s = typing.s.trim(); setTyping(null); if (!s) return;
    const t = { id: rid(), x: typing.x, y: typing.y, s, c: color, w: 20 + size * 3 };
    m.apply({ kind: 'text', data: t }); redraw(); send({ kind: 'text', data: t }); freshWork();
  };
  const canUndo = m.page().order.length > 0; const canRedo = (redo.current.get(m.cur.current)?.length ?? 0) > 0;
  const undo = () => {
    const pg = m.page(); const id = pg.order[pg.order.length - 1]; if (!id) return;
    const ops = m.opsFor(id); const st = redo.current.get(key()) ?? []; st.push(ops); redo.current.set(key(), st);
    m.apply({ kind: 'undo', data: { id } }); redraw(); send({ kind: 'undo', data: { id } }); bump();
  };
  const redoOne = () => {
    const ops = redo.current.get(key())?.pop(); if (!ops) return;
    for (const o of ops) { m.apply(o); send(o); } redraw(); bump();
  };
  const clear = () => { if (!m.page().order.length || !confirm('Clear this page for everyone?')) return; m.apply({ kind: 'clear', data: {} }); redo.current.delete(key()); redraw(); send({ kind: 'clear', data: {} }); bump(); };

  // ---- keyboard shortcuts
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (typing || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redoOne(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redoOne(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = TOOLS.find((x) => x[3].toLowerCase() === k); if (t) { setTool(t[0]); return; }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') turn(1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') turn(-1);
    else if (k === 'f') fs.toggle();
    else if (k === 'n' && !bg.componentId) newBlank();
    else if (/^[1-8]$/.test(k)) setColor(COLORS[Number(k) - 1]);
  };
  useEffect(() => { const h = (e: KeyboardEvent) => keys.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  const sep = <span className="mx-0.5 h-10 w-px bg-slate-200" />;
  const pageLabel = bg.componentId ? `Book page ${bg.page}${info.pages ? ` / ${info.pages}` : ''}` : `Blank page ${bg.page ?? 1} / ${blankMax}`;
  return (
    <div ref={fs.ref} className={cn('space-y-2', fs.on && 'overflow-auto bg-slate-100 p-3')}>
      <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-white p-1.5 shadow-sm">
        {TOOLS.map(([k, label, Icon, hint]) => <BigBtn key={k} label={label} hint={hint} on={tool === k} onClick={() => setTool(k)}><Icon className="size-5" /></BigBtn>)}
        {sep}
        <BigBtn label="Undo" hint="Ctrl+Z" onClick={undo} disabled={!canUndo}><Undo2 className="size-5" /></BigBtn>
        <BigBtn label="Redo" hint="Ctrl+Y" onClick={redoOne} disabled={!canRedo}><Redo2 className="size-5" /></BigBtn>
        <BigBtn label="Clear" onClick={clear} disabled={!canUndo} className="text-red-600"><Trash2 className="size-5" /></BigBtn>
        <span className="ms-auto" />
        <BigBtn label={fs.on ? 'Exit full' : 'Full screen'} hint="F" onClick={fs.toggle}>{fs.on ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}</BigBtn>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1.5" role="group" aria-label="Colour">
          {COLORS.map((c, i) => <button key={c} type="button" title={`Colour (${i + 1})`} aria-label={`Colour ${i + 1}`} aria-pressed={color === c} onClick={() => { setColor(c); if (tool === 'er') setTool('pen'); }}
            className={cn('size-7 rounded-full ring-offset-2 transition hover:scale-110', color === c && 'ring-2 ring-slate-800')} style={{ background: c }} />)}
        </div>
        <span className="h-7 w-px bg-slate-200" />
        <div className="flex items-center gap-1" role="group" aria-label="Thickness">
          {SIZES.map(([s, label]) => <button key={s} type="button" title={label} aria-label={label} aria-pressed={size === s} onClick={() => setSz(s)}
            className={cn('flex h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-medium', size === s ? 'bg-slate-100 text-slate-900 ring-1 ring-slate-300' : 'text-slate-600 hover:bg-slate-50')}>
            <span className="rounded-full bg-slate-700" style={{ width: s + 3, height: s + 3 }} /><span className="hidden lg:inline">{label}</span></button>)}
        </div>
        {(tool === 'rect' || tool === 'ellipse') && <label className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700"><input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} />Fill</label>}
        {!bg.componentId && <>
          <span className="h-7 w-px bg-slate-200" />
          <select aria-label="Paper" value={paper} onChange={(e) => setPaper(e.target.value as Paper)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700">
            {PAPERS.map(([k, l]) => <option key={k} value={k}>{l} paper</option>)}</select>
        </>}
        <span className="h-7 w-px bg-slate-200" />
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" title="Previous page (←)" onClick={() => turn(-1)} className="grid size-9 place-items-center rounded-xl text-slate-600 hover:bg-slate-100"><ChevronLeft className="size-5" /></button>
          <span className="min-w-[7.5rem] text-center text-xs font-semibold text-slate-700">{pageLabel}</span>
          <button type="button" aria-label="Next page" title="Next page (→)" onClick={() => turn(1)} className="grid size-9 place-items-center rounded-xl text-slate-600 hover:bg-slate-100"><ChevronRight className="size-5" /></button>
          {!bg.componentId && <button type="button" onClick={newBlank} title="New blank page (N)" className="inline-flex h-9 items-center gap-1 rounded-xl bg-violet-50 px-2.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"><FilePlus2 className="size-4" />New page</button>}
          {book && (bg.componentId
            ? <button type="button" onClick={() => go({ componentId: null, page: Math.max(1, m.blankMax.current) })} className="inline-flex h-9 items-center gap-1 rounded-xl bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">⬜ Blank page</button>
            : <button type="button" onClick={() => go({ componentId: book, page: lastBook.current })} className="inline-flex h-9 items-center gap-1 rounded-xl bg-violet-50 px-2.5 text-xs font-semibold text-violet-700 hover:bg-violet-100">📖 Back to the book</button>)}
        </div>
        <div className="ms-auto flex items-center gap-2">
          {watch && <span title={watch.names.join(', ') || 'Nobody is watching yet'} className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800"><Eye className="size-3.5" />{watch.watching}{watch.classSize ? ` / ${watch.classSize}` : ''} watching</span>}
          <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold', offline ? 'bg-amber-100 text-amber-800' : 'bg-red-50 text-red-600')}>
            <span className={cn('size-2 rounded-full', offline ? 'bg-amber-500' : 'bg-red-500 motion-safe:animate-pulse')} />{offline ? 'Reconnecting…' : 'LIVE'}</span>
          <button type="button" onClick={onEnd} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">End lesson</button>
        </div>
      </div>
      {info.error && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{info.error} The board continues without the page.</p>}
      <div ref={box} className="flex w-full justify-center">
        <div className="relative overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-200" style={{ width: fit.w, height: fit.h }}>
          <canvas ref={bgCanvas} className="absolute inset-0 size-full" aria-hidden />
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
      <p className="text-center text-xs text-slate-500">Students of {board.className} see everything live. Each page keeps its own writing. <span className="hidden md:inline">Shortcuts: P pen · M marker · L line · A arrow · B box · C circle · T text · E eraser · 1–8 colours · Ctrl+Z undo · ← → pages · N new page · F full screen</span></p>
    </div>
  );
}

// =====================================================================================================
/** Student's view: follows the teacher's board live (read-only). */
export function WhiteboardViewer({ board, playful }: { board: any; playful?: boolean }) {
  const m = useModel(); const { t } = useT();
  const [bg, setBg] = useState<Bg>({ componentId: board.componentId ?? null, page: board.page ?? 1 });
  const [paper, setPaper] = useState<Paper>('dots');
  const [live, setLive] = useState<boolean>(board.live);
  const bgCanvas = useRef<HTMLCanvasElement>(null); const ink = useRef<HTMLCanvasElement>(null);
  const fs = useFullscreen();
  const [aspect, setAspect] = useState(16 / 10);
  const { box, size: fit } = useFit(aspect, fs.on ? 90 : playful ? 260 : 200);
  const info = useBackground(bg, paper, bgCanvas, fit);
  useEffect(() => setAspect(info.aspect), [info.aspect]);
  const after = useRef(0); const [ready, setReady] = useState(false);
  const redraw = useCallback(() => paint(ink.current, m), [m]);
  const take = useCallback((o: Op) => { m.apply(o); if (o.kind === 'bg') { setBg({ componentId: o.data.componentId, page: o.data.page }); setPaper(m.page().paper); } }, [m]);
  useEffect(() => { loadAll(board.id, take).then(({ after: a, meta }) => { after.current = a; setLive(meta?.live ?? false); setReady(true); redraw(); }).catch(() => setReady(true)); }, [board.id, take, redraw]);
  useEffect(() => { const cv = ink.current; if (!cv || !fit.w) return; const r = window.devicePixelRatio || 1; cv.width = fit.w * r; cv.height = fit.h * r; redraw(); }, [fit, redraw]);
  useEffect(() => {
    if (!ready || !live) return;
    let stop = false; let tm: any;
    const tick = async () => {
      try {
        const r = await api.get<any>(`/whiteboards/${board.id}/ops?after=${after.current}`);
        for (const o of r.ops) take(o);
        if (r.ops.length) { after.current = r.ops[r.ops.length - 1].seq; redraw(); }
        if (!r.live) setLive(false);
      } catch { /* keep trying */ }
      if (!stop) tm = setTimeout(tick, document.hidden ? 3000 : 700);
    };
    tm = setTimeout(tick, 700);
    return () => { stop = true; clearTimeout(tm); };
  }, [ready, live, board.id, take, redraw]);
  return (
    <div ref={fs.ref} className={cn('space-y-3', fs.on && 'overflow-auto bg-slate-100 p-3')}>
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-semibold">
        {live ? <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-red-600"><span className="size-2 rounded-full bg-red-500 motion-safe:animate-pulse" />{t('LIVE — {name} is writing', { name: board.teacher ?? '' })}</span>
          : <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{t('This lesson has ended. You can still look at the board.')}</span>}
        {bg.componentId ? <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700">📖 {board.bookTitle ?? 'Book'}{board.partTitle ? ` · ${board.partTitle}` : ''} · {t('page')} {bg.page}</span>
          : <span className="rounded-full bg-slate-50 px-3 py-1 text-slate-600">⬜ {t('page')} {bg.page ?? 1}</span>}
        <button type="button" onClick={fs.toggle} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm hover:bg-slate-50">{fs.on ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}{fs.on ? t('Exit full screen') : t('Full screen')}</button>
      </div>
      <div ref={box} className="flex w-full justify-center">
        <div className={cn('relative overflow-hidden bg-white shadow-md ring-1 ring-slate-200', playful ? 'rounded-[2rem] ring-4 ring-white' : 'rounded-2xl')} style={{ width: fit.w, height: fit.h }}
          onContextMenu={(e) => e.preventDefault()}>
          <canvas ref={bgCanvas} className="absolute inset-0 size-full" aria-hidden />
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
