'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/components/ui';
import { HotspotLayer } from '@/components/hotspots';

type PDFDoc = { numPages: number; getPage: (n: number) => Promise<any> };

/** The pages shown together: a book opens with the cover alone on the right, then 2–3, 4–5… On a phone, one page. */
export function spreadOf(page: number, pages: number, wide: boolean): number[] {
  const p = Math.min(Math.max(1, page), pages);
  if (!wide) return [p];
  if (p === 1) return [1];
  const left = p % 2 === 0 ? p : p - 1;
  return left + 1 <= pages ? [left, left + 1] : [left];
}
/** The first page of the next / previous spread. */
export function stepPage(page: number, pages: number, wide: boolean, dir: 1 | -1) {
  const s = spreadOf(page, pages, wide);
  return dir > 0 ? Math.min(pages, s[s.length - 1] + 1) : Math.max(1, s[0] - 1);
}

/** One PDF page drawn at a given size, with its elements (videos, pictures, notes…) on top. */
function PageCanvas({ doc, n, w, h, overlay }: { doc: PDFDoc; n?: number; w: number; h: number; overlay?: React.ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!n || !ref.current || w < 10) return;
    let task: any; let cancelled = false;
    (async () => {
      const p = await doc.getPage(n); if (cancelled) return;
      const base = p.getViewport({ scale: 1 }); const vp = p.getViewport({ scale: h / base.height });
      const ratio = window.devicePixelRatio || 1; const c = ref.current!; if (!c) return;
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
export function PdfFlipbook({ doc, page, pages, onPage, onWide, componentId, editing, kid, games }: {
  doc: PDFDoc; page: number; pages: number; onPage: (n: number) => void; onWide?: (wide: boolean) => void;
  componentId: string; editing: boolean; kid: boolean; games: { id: string; title: string }[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 }); const [ratio, setRatio] = useState(0.72);
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect();
  }, []);
  useEffect(() => { doc.getPage(1).then((p: any) => { const v = p.getViewport({ scale: 1 }); setRatio(v.width / v.height); }).catch(() => undefined); }, [doc]);
  const wide = box.w >= 760;
  useEffect(() => { onWide?.(wide); }, [wide, onWide]);
  // page size: as tall as possible, two pages (or one) must fit across
  const across = wide ? 2 : 1;
  const ph = Math.max(120, Math.min(box.h - 24, (box.w - (wide ? 96 : 24)) / across / ratio));
  const pw = Math.round(ph * ratio);

  const target = spreadOf(page, pages, wide);
  const [shown, setShown] = useState<number[]>(target);
  const [turn, setTurn] = useState<Turn | null>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const key = target.join('-');
  useEffect(() => {
    if (key === shown.join('-')) return;
    const dir: 1 | -1 = target[0] > shown[0] ? 1 : -1;
    // a page turns when moving to the next or previous spread on a wide screen; otherwise the pages simply change
    const next = stepPage(shown[0], pages, wide, dir);
    if (!wide || reduce || spreadOf(next, pages, wide).join('-') !== key || turn) { setTurn(null); setShown(target); return; }
    setTurn({ dir, from: shown, to: target, go: false });
    const t = setTimeout(() => setTurn((x) => x && { ...x, go: true }), 30);
    return () => clearTimeout(t);
  }, [key, wide]); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = () => { if (turn) { setShown(turn.to); setTurn(null); } };
  useEffect(() => { if (!turn?.go) return; const t = setTimeout(finish, 900); return () => clearTimeout(t); }, [turn?.go]); // eslint-disable-line react-hooks/exhaustive-deps

  const leftOf = (s: number[]) => (s.length === 2 || (s[0] !== 1 && wide) ? s[0] : undefined);
  const rightOf = (s: number[]) => (s.length === 2 ? s[1] : s[0] === 1 || !wide ? s[0] : undefined);
  const layer = (n?: number) => n ? <HotspotLayer componentId={componentId} page={n} editing={editing} kid={kid} games={games} /> : null;
  const face = (n?: number) => <PageCanvas doc={doc} n={n} w={pw} h={ph} />;

  // what lies underneath while a page turns
  const under = turn ? (turn.dir > 0 ? [leftOf(turn.from), rightOf(turn.to)] : [leftOf(turn.to), rightOf(turn.from)]) : [leftOf(shown), rightOf(shown)];
  const sheet = turn && (turn.dir > 0 ? { front: rightOf(turn.from), back: leftOf(turn.to) } : { front: leftOf(turn.from), back: rightOf(turn.to) });

  const go = (dir: 1 | -1) => onPage(stepPage(shown[0], pages, wide, dir));
  const swipe = useRef<number | null>(null);
  const atStart = shown[0] <= 1; const atEnd = shown[shown.length - 1] >= pages;
  const arrow = 'focus-ring absolute top-1/2 z-10 grid -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 shadow-lg hover:bg-white disabled:opacity-0';

  return (
    <div ref={root} className="relative flex size-full select-none items-center justify-center" style={{ perspective: 2400 }}
      onPointerDown={editing ? undefined : (e) => { swipe.current = e.clientX; }}
      onPointerUp={editing ? undefined : (e) => { if (swipe.current === null) return; const dx = e.clientX - swipe.current; swipe.current = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); }}>
      {box.w > 0 && (wide ? (
        <div className="relative flex shadow-2xl" style={{ width: pw * 2, height: ph }}>
          <div style={{ width: pw, height: ph }}>{under[0] ? <PageCanvas doc={doc} n={under[0]} w={pw} h={ph} overlay={!turn && layer(under[0])} /> : null}</div>
          <div style={{ width: pw, height: ph }}>{under[1] ? <PageCanvas doc={doc} n={under[1]} w={pw} h={ph} overlay={!turn && layer(under[1])} /> : null}</div>
          {/* the spine: a soft shadow down the middle */}
          {(under[0] || leftOf(shown)) && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-16 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/15 to-transparent" />}
          {sheet && (
            <div className="absolute top-0" onTransitionEnd={finish}
              style={{ left: turn!.dir > 0 ? pw : 0, width: pw, height: ph, transformStyle: 'preserve-3d', transformOrigin: turn!.dir > 0 ? 'left center' : 'right center',
                transition: 'transform 0.8s cubic-bezier(.4,.1,.2,1)', transform: `rotateY(${turn!.go ? (turn!.dir > 0 ? -180 : 180) : 0}deg)` }}>
              <div className="absolute inset-0 shadow-xl" style={{ backfaceVisibility: 'hidden' }}>{face(sheet.front)}</div>
              <div className="absolute inset-0 shadow-xl" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>{face(sheet.back)}</div>
            </div>)}
        </div>
      ) : (
        <div key={shown[0]} className="shadow-2xl motion-safe:animate-[kgPageIn_.35s_ease-out]">
          <PageCanvas doc={doc} n={shown[0]} w={pw} h={ph} overlay={layer(shown[0])} />
        </div>
      ))}
      <style>{'@keyframes kgPageIn{from{opacity:.2;transform:translateX(24px)}to{opacity:1;transform:none}}'}</style>
      <button className={cn(arrow, 'left-2', kid ? 'size-14' : 'size-11')} disabled={atStart} onClick={() => go(-1)} aria-label="Previous page"><ChevronLeft className="size-7" /></button>
      <button className={cn(arrow, 'right-2', kid ? 'size-14' : 'size-11')} disabled={atEnd} onClick={() => go(1)} aria-label="Next page"><ChevronRight className="size-7" /></button>
    </div>
  );
}
