'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/components/ui';
import { HotspotLayer } from '@/components/hotspots';

type PDFDoc = { numPages: number; getPage: (n: number) => Promise<any> };
/** COVER: page 1 alone on the right, then 2–3, 4–5 (odd pages are right-hand pages); PAIRS: 1–2, 3–4…; SINGLE: one page at a time. */
export type FlipLayout = 'COVER' | 'PAIRS' | 'SINGLE';
/** width ÷ height of a page; > 1 is landscape (or a PDF page that already holds two book pages) */
export type Shape = (n: number) => number;

/** Is page n a right-hand page in this layout? */
const isRight = (n: number, layout: FlipLayout) => (layout === 'PAIRS' ? n % 2 === 0 : n % 2 === 1);

/**
 * The pages shown together. Pairs follow the book's left/right pages (so inner margins meet in the middle);
 * a landscape page is always shown on its own; on a phone, or in SINGLE layout, one page at a time.
 */
export function spreadOf(page: number, pages: number, wide: boolean, layout: FlipLayout = 'COVER', shape: Shape = () => 0.7): number[] {
  const p = Math.min(Math.max(1, page), pages);
  if (!wide || layout === 'SINGLE' || shape(p) > 1) return [p];
  const left = isRight(p, layout) ? p - 1 : p; const right = left + 1;
  const pair = [left, right].filter((n) => n >= 1 && n <= pages && shape(n) <= 1);
  return pair.includes(p) ? pair : [p];
}
/** The first page of the next / previous spread. */
export function stepPage(page: number, pages: number, wide: boolean, dir: 1 | -1, layout: FlipLayout = 'COVER', shape: Shape = () => 0.7) {
  const s = spreadOf(page, pages, wide, layout, shape);
  return dir > 0 ? Math.min(pages, s[s.length - 1] + 1) : Math.max(1, s[0] - 1);
}

/** Learns the shape of the pages around the one being read (pages can differ: portrait and landscape in one book). */
export function usePageShapes(doc: PDFDoc | null, around: number) {
  const [shapes, setShapes] = useState<Record<number, number>>({});
  useEffect(() => { setShapes({}); }, [doc]);
  useEffect(() => {
    if (!doc) return; let cancelled = false;
    const want = [1, ...Array.from({ length: 9 }, (_, i) => around - 4 + i)].filter((n) => n >= 1 && n <= doc.numPages && shapes[n] === undefined);
    if (!want.length) return;
    Promise.all(want.map((n) => doc.getPage(n).then((p: any) => { const v = p.getViewport({ scale: 1 }); return [n, v.width / v.height] as const; }).catch(() => [n, 0.7] as const)))
      .then((r) => { if (!cancelled) setShapes((s) => ({ ...s, ...Object.fromEntries(r) })); });
    return () => { cancelled = true; };
  }, [doc, around]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = shapes[1] ?? 0.7;
  return useCallback((n: number) => shapes[n] ?? first, [shapes, first]);
}

/** One PDF page drawn at a given size, with its elements (videos, pictures, notes…) on top. */
function PageCanvas({ doc, n, w, h, overlay }: { doc: PDFDoc; n?: number; w: number; h: number; overlay?: React.ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!n || !ref.current || w < 10) return;
    let task: any; let cancelled = false;
    (async () => {
      const p = await doc.getPage(n); if (cancelled) return;
      const base = p.getViewport({ scale: 1 }); const vp = p.getViewport({ scale: Math.min(h / base.height, w / base.width) });
      const ratio = window.devicePixelRatio || 1; const c = ref.current; if (!c) return;
      c.width = Math.floor(vp.width * ratio); c.height = Math.floor(vp.height * ratio);
      task = p.render({ canvasContext: c.getContext('2d')!, viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      await task.promise.catch(() => undefined);
    })();
    return () => { cancelled = true; task?.cancel?.(); };
  }, [doc, n, w, h]);
  if (!n) return <div style={{ width: w, height: h }} />;
  return (
    <div className="relative bg-white" style={{ width: w, height: h }}>
      <canvas ref={ref} className="block" style={{ width: w, height: h }} aria-label={`Page ${n}`} />
      {overlay}
    </div>
  );
}

type Turn = { dir: 1 | -1; from: number[]; to: number[]; go: boolean };

/**
 * A page-turn flipbook made from the book's PDF: two pages side by side with a turning page on wide screens,
 * one page with swipe on phones. Elements placed on the pages (video, audio, pictures, links, games, notes) work on it.
 */
export function PdfFlipbook({ doc, page, pages, onPage, onWide, layout, shape, componentId, editing, kid, games }: {
  doc: PDFDoc; page: number; pages: number; onPage: (n: number) => void; onWide?: (wide: boolean) => void; layout: FlipLayout; shape: Shape;
  componentId: string; editing: boolean; kid: boolean; games: { id: string; title: string }[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect();
  }, []);
  const wide = box.w >= 760;
  useEffect(() => { onWide?.(wide); }, [wide, onWide]);

  const target = spreadOf(page, pages, wide, layout, shape);
  const [shown, setShown] = useState<number[]>(target);
  const [turn, setTurn] = useState<Turn | null>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // two page slots (left / right) when portrait pages are shown as a book; otherwise one page in the middle
  const slots = (s: number[]) => wide && layout !== 'SINGLE' && s.every((n) => shape(n) <= 1);
  const leftOf = (s: number[]) => s.find((n) => !isRight(n, layout));
  const rightOf = (s: number[]) => s.find((n) => isRight(n, layout));
  const portrait = Math.min(1, shape(shown[0]) <= 1 ? shape(shown[0]) : shape(1));
  const ph = Math.max(120, Math.min(box.h - 24, (box.w - 96) / 2 / portrait)); const pw = Math.round(ph * portrait);
  // a single page (phone, landscape or SINGLE): as large as fits
  const single = (n: number) => { const r = shape(n); const h = Math.max(120, Math.min(box.h - 24, (box.w - (wide ? 120 : 24)) / r)); return { w: Math.round(h * r), h }; };

  const key = target.join('-');
  useEffect(() => {
    if (key === shown.join('-')) return;
    const dir: 1 | -1 = target[0] > shown[0] ? 1 : -1;
    const next = stepPage(shown[0], pages, wide, dir, layout, shape);
    // a page turns between neighbouring two-page spreads; otherwise the pages simply change
    if (!slots(shown) || !slots(target) || reduce || spreadOf(next, pages, wide, layout, shape).join('-') !== key || turn) { setTurn(null); setShown(target); return; }
    setTurn({ dir, from: shown, to: target, go: false });
    const t = setTimeout(() => setTurn((x) => x && { ...x, go: true }), 30);
    return () => clearTimeout(t);
  }, [key, wide, layout]); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = () => { if (turn) { setShown(turn.to); setTurn(null); } };
  useEffect(() => { if (!turn?.go) return; const t = setTimeout(finish, 900); return () => clearTimeout(t); }, [turn?.go]); // eslint-disable-line react-hooks/exhaustive-deps

  const layer = (n?: number) => n ? <HotspotLayer componentId={componentId} page={n} editing={editing} kid={kid} games={games} /> : null;
  const under = turn ? (turn.dir > 0 ? [leftOf(turn.from), rightOf(turn.to)] : [leftOf(turn.to), rightOf(turn.from)]) : [leftOf(shown), rightOf(shown)];
  const sheet = turn && (turn.dir > 0 ? { front: rightOf(turn.from), back: leftOf(turn.to) } : { front: leftOf(turn.from), back: rightOf(turn.to) });

  const go = (dir: 1 | -1) => onPage(stepPage(shown[0], pages, wide, dir, layout, shape));
  const swipe = useRef<number | null>(null);
  const atStart = shown[0] <= 1; const atEnd = shown[shown.length - 1] >= pages;
  const arrow = 'focus-ring absolute top-1/2 z-10 grid -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 shadow-lg hover:bg-white disabled:opacity-0';
  const one = shown[0]; const sz = single(one);

  return (
    <div ref={root} className="relative flex size-full select-none items-center justify-center" style={{ perspective: 2400 }}
      onPointerDown={editing ? undefined : (e) => { swipe.current = e.clientX; }}
      onPointerUp={editing ? undefined : (e) => { if (swipe.current === null) return; const dx = e.clientX - swipe.current; swipe.current = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); }}>
      {box.w > 0 && (slots(shown) || turn ? (
        <div className="relative flex" style={{ width: pw * 2, height: ph }}>
          <div className={cn(under[0] && 'shadow-2xl')} style={{ width: pw, height: ph }}>{under[0] ? <PageCanvas doc={doc} n={under[0]} w={pw} h={ph} overlay={!turn && layer(under[0])} /> : null}</div>
          <div className={cn(under[1] && 'shadow-2xl')} style={{ width: pw, height: ph }}>{under[1] ? <PageCanvas doc={doc} n={under[1]} w={pw} h={ph} overlay={!turn && layer(under[1])} /> : null}</div>
          {/* the spine: a soft shadow where the inner margins meet */}
          {under[0] && under[1] && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-16 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/15 to-transparent" />}
          {sheet && (
            <div className="absolute top-0" onTransitionEnd={finish}
              style={{ left: turn!.dir > 0 ? pw : 0, width: pw, height: ph, transformStyle: 'preserve-3d', transformOrigin: turn!.dir > 0 ? 'left center' : 'right center',
                transition: 'transform 0.8s cubic-bezier(.4,.1,.2,1)', transform: `rotateY(${turn!.go ? (turn!.dir > 0 ? -180 : 180) : 0}deg)` }}>
              <div className="absolute inset-0 shadow-xl" style={{ backfaceVisibility: 'hidden' }}><PageCanvas doc={doc} n={sheet.front} w={pw} h={ph} /></div>
              <div className="absolute inset-0 shadow-xl" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}><PageCanvas doc={doc} n={sheet.back} w={pw} h={ph} /></div>
            </div>)}
        </div>
      ) : (
        <div key={one} className="shadow-2xl motion-safe:animate-[kgPageIn_.35s_ease-out]">
          <PageCanvas doc={doc} n={one} w={sz.w} h={sz.h} overlay={layer(one)} />
        </div>
      ))}
      <style>{'@keyframes kgPageIn{from{opacity:.2;transform:translateX(24px)}to{opacity:1;transform:none}}'}</style>
      <button className={cn(arrow, 'left-2', kid ? 'size-14' : 'size-11')} disabled={atStart} onClick={() => go(-1)} aria-label="Previous page"><ChevronLeft className="size-7" /></button>
      <button className={cn(arrow, 'right-2', kid ? 'size-14' : 'size-11')} disabled={atEnd} onClick={() => go(1)} aria-label="Next page"><ChevronRight className="size-7" /></button>
    </div>
  );
}
