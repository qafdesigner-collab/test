'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, Maximize, Pause, Play, Search, Volume2, VolumeX, X, ZoomIn } from 'lucide-react';
import { cn } from '@/components/ui';
import { HotspotLayer } from '@/components/hotspots';
import type { FlipLayout, Shape } from '@/components/pdf-flip';

type PDFDoc = { numPages: number; getPage: (n: number) => Promise<any> };

/** A short paper "swish" made with the browser's own sound engine (no sound file needed). */
let audioCtx: AudioContext | null = null;
function flipSound() {
  try {
    audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx; const len = Math.floor(ctx.sampleRate * 0.45);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.6)), 2) * (1 - t) * 0.5; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.6;
    src.connect(f).connect(ctx.destination); src.start();
  } catch { /* no sound on this device */ }
}

/** Draws one PDF page into a canvas filling its box. */
function PageImage({ doc, n, w, h }: { doc: PDFDoc; n: number; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: any; let cancelled = false;
    (async () => {
      const p = await doc.getPage(n); if (cancelled || !ref.current) return;
      const base = p.getViewport({ scale: 1 }); const vp = p.getViewport({ scale: Math.min(w / base.width, h / base.height) });
      const ratio = Math.min(2, window.devicePixelRatio || 1); const c = ref.current;
      c.width = Math.floor(vp.width * ratio); c.height = Math.floor(vp.height * ratio);
      task = p.render({ canvasContext: c.getContext('2d')!, viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      await task.promise.catch(() => undefined);
    })();
    return () => { cancelled = true; task?.cancel?.(); };
  }, [doc, n, w, h]);
  return <canvas ref={ref} className="absolute inset-0 size-full bg-white" aria-label={`Page ${n}`} />;
}

/** Small picture of a page for the thumbnails panel. */
function Thumb({ doc, n, active, onPick }: { doc: PDFDoc; n: number; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null); const box = useRef<HTMLButtonElement>(null); const [seen, setSeen] = useState(false);
  useEffect(() => { const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true)); if (box.current) io.observe(box.current); return () => io.disconnect(); }, []);
  useEffect(() => {
    if (!seen) return; let cancelled = false;
    doc.getPage(n).then(async (p: any) => { if (cancelled || !ref.current) return; const vp = p.getViewport({ scale: 110 / p.getViewport({ scale: 1 }).width }); const c = ref.current; c.width = vp.width; c.height = vp.height; await p.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise.catch(() => undefined); });
    return () => { cancelled = true; };
  }, [seen, doc, n]);
  return (
    <button ref={box} onClick={onPick} className={cn('flex flex-col items-center gap-1 rounded-lg p-1.5 text-xs text-white/80 hover:bg-white/10', active && 'bg-white/15 text-white ring-2 ring-amber-400')}>
      <canvas ref={ref} className="w-[110px] bg-white shadow" style={{ minHeight: 60 }} /><span>{n}</span>
    </button>
  );
}

/**
 * A FlipHTML5-style flipbook from the book's PDF: pages curl from the corner as you drag or click, with a dark stage
 * and a toolbar (thumbnails, zoom, page sound, previous / next, search, auto flip, full screen).
 */
export function PdfCurlbook({ doc, page, pages, onPage, onWide, layout, shape, componentId, kid, games, onZoom }: {
  doc: PDFDoc; page: number; pages: number; onPage: (n: number) => void; onWide?: (wide: boolean) => void; layout: FlipLayout; shape: Shape;
  componentId: string; kid: boolean; games: { id: string; title: string }[]; onZoom: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null); const host = useRef<HTMLDivElement>(null); const flip = useRef<any>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = stage.current; if (!el) return; let t: any;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(measure, 150); }); ro.observe(el); measure();
    return () => { ro.disconnect(); clearTimeout(t); };
  }, []);
  const r = Math.min(Math.max(shape(1), 0.4), 1.8); const landscape = r > 1;
  const wide = box.w >= 760 && layout !== 'SINGLE' && !landscape;
  useEffect(() => { onWide?.(wide); }, [wide, onWide]);
  const ph = Math.max(150, Math.floor(Math.min(box.h - 90, (box.w - 120) / (wide ? 2 : 1) / r)));
  const pw = Math.floor(ph * r);

  // the page elements live outside React's tree (the flip library moves them); React fills them through portals
  const [els, setEls] = useState<HTMLDivElement[]>([]);
  const [current, setCurrent] = useState(page);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('flipSound') !== 'off'; } catch { return true; } });
  const soundRef = useRef(sound); soundRef.current = sound;
  const pageRef = useRef(page);
  useEffect(() => {
    if (!host.current || box.w < 50 || pw < 50) return;
    let cancelled = false; const made: HTMLDivElement[] = [];
    for (let i = 1; i <= pages; i++) {
      const d = document.createElement('div'); d.className = 'kg-page'; d.dataset.density = 'soft'; // every page curls like paper, the cover too (as in FlipHTML5 books)
      d.style.background = '#fff';
      // clicks on page elements (videos, buttons) must not turn the page
      const keep = (e: Event) => { if ((e.target as HTMLElement)?.closest?.('[data-noflip]')) e.stopPropagation(); };
      ['mousedown', 'touchstart', 'pointerdown'].forEach((ev) => d.addEventListener(ev, keep));
      made.push(d);
    }
    // the book's own box: two pages wide (one on phones, in landscape books and in "one page at a time")
    const root = document.createElement('div'); root.style.width = `${wide ? pw * 2 : pw}px`; root.style.height = `${ph}px`;
    host.current.innerHTML = ''; host.current.appendChild(root);
    import('page-flip/dist/js/page-flip.module.js').then(({ PageFlip }: any) => {
      if (cancelled) return;
      const pf = new PageFlip(root, {
        width: pw, height: ph, size: 'fixed', showCover: layout === 'COVER', usePortrait: true, drawShadow: true, maxShadowOpacity: 0.55,
        flippingTime: 900, mobileScrollSupport: false, clickEventForward: true, showPageCorners: true, disableFlipByClick: false,
        startPage: Math.min(pages, Math.max(1, pageRef.current)) - 1, autoSize: false, minWidth: pw, maxWidth: pw, minHeight: ph, maxHeight: ph,
      });
      pf.loadFromHTML(made);
      pf.on('flip', (e: any) => { const n = Number(e.data) + 1; setCurrent(n); pageRef.current = n; onPage(n); if (soundRef.current) flipSound(); });
      flip.current = pf; setEls(made); setCurrent(pageRef.current);
    });
    return () => { cancelled = true; try { flip.current?.destroy(); } catch { /* gone */ } flip.current = null; setEls([]); };
  }, [doc, pages, pw, ph, wide, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // the reader moved to another page (contents, page number box, arrows in the top bar)
  useEffect(() => {
    pageRef.current = page; const pf = flip.current; if (!pf) return;
    const now = pf.getCurrentPageIndex() + 1; if (now === page) return;
    const visible = wide ? [now, now + 1, now - 1] : [now];
    if (visible.includes(page) && wide) return;
    if (Math.abs(page - now) <= 2) pf.flip(page - 1); else pf.turnToPage(page - 1);
  }, [page, wide]);

  const go = useCallback((dir: 1 | -1) => { const pf = flip.current; if (!pf) return; dir > 0 ? pf.flipNext('bottom') : pf.flipPrev('bottom'); }, []);
  // auto flip: turns the page every few seconds until the end
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    if (!auto) return; const t = setInterval(() => { if (current >= pages - (wide ? 1 : 0)) { setAuto(false); return; } go(1); }, 4500);
    return () => clearInterval(t);
  }, [auto, current, pages, wide, go]);
  const [panel, setPanel] = useState<'thumbs' | 'search' | null>(null);
  const near = (n: number) => Math.abs(n - current) <= (wide ? 4 : 3);

  // search the book's words (read from the PDF, page by page)
  const [q, setQ] = useState(''); const [hits, setHits] = useState<{ n: number; text: string }[] | null>(null); const texts = useRef<Record<number, string>>({});
  const search = async () => {
    const term = q.trim().toLowerCase(); if (term.length < 2) return; setHits([]);
    const found: { n: number; text: string }[] = [];
    for (let n = 1; n <= pages && found.length < 50; n++) {
      texts.current[n] ??= (await (await doc.getPage(n)).getTextContent()).items.map((i: any) => i.str).join(' ');
      const t = texts.current[n]; const at = t.toLowerCase().indexOf(term);
      if (at >= 0) found.push({ n, text: `…${t.slice(Math.max(0, at - 30), at + term.length + 40)}…` });
      if (n % 10 === 0) setHits([...found]);
    }
    setHits(found);
  };
  const tool = 'grid size-8 shrink-0 place-items-center rounded-lg text-white/90 hover:bg-white/15 disabled:opacity-30 sm:size-10';
  const fullscreen = () => { const el = stage.current?.parentElement; if (!el) return; document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.(); };

  return (
    <div className="relative flex size-full flex-col bg-[radial-gradient(ellipse_at_center,#5b5b5b_0%,#3d3d3d_70%,#2f2f2f_100%)]">
      <div ref={stage} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div ref={host} className="drop-shadow-2xl" />
        {els.map((el, i) => createPortal(
          <div className="absolute inset-0">
            {near(i + 1) && <PageImage doc={doc} n={i + 1} w={pw} h={ph} />}
            {near(i + 1) && <HotspotLayer componentId={componentId} page={i + 1} editing={false} kid={kid} games={games} noFlip />}
          </div>, el, `p${i}`))}
        <button className="absolute left-3 top-1/2 grid size-14 -translate-y-1/2 place-items-center rounded-full bg-white/20 text-white backdrop-blur hover:bg-white/35 disabled:opacity-0" disabled={current <= 1} onClick={() => go(-1)} aria-label="Previous page"><ChevronLeft className="size-8" /></button>
        <button className="absolute right-3 top-1/2 grid size-14 -translate-y-1/2 place-items-center rounded-full bg-white/20 text-white backdrop-blur hover:bg-white/35 disabled:opacity-0" disabled={current >= pages} onClick={() => go(1)} aria-label="Next page"><ChevronRight className="size-8" /></button>
      </div>
      {/* the toolbar, as in FlipHTML5 books */}
      <div className="mx-auto mb-3 flex max-w-[calc(100%-1rem)] items-center gap-0 rounded-xl bg-black/55 px-1 py-1 shadow-lg backdrop-blur sm:gap-0.5 sm:px-2" role="toolbar" aria-label="Book tools">
        <button className={cn(tool, panel === 'thumbs' && 'bg-white/20')} onClick={() => setPanel(panel === 'thumbs' ? null : 'thumbs')} title="Thumbnails" aria-label="Thumbnails"><LayoutGrid className="size-5" /></button>
        <button className={tool} onClick={onZoom} title="Zoom (page view)" aria-label="Zoom"><ZoomIn className="size-5" /></button>
        <button className={tool} onClick={() => { const v = !sound; setSound(v); try { localStorage.setItem('flipSound', v ? 'on' : 'off'); } catch { /* private */ } }} title={sound ? 'Page sound on' : 'Page sound off'} aria-label={sound ? 'Sound off' : 'Sound on'}>{sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}</button>
        <button className={tool} disabled={current <= 1} onClick={() => go(-1)} title="Previous" aria-label="Previous"><ChevronLeft className="size-6" /></button>
        <span className="min-w-[3.5rem] shrink-0 text-center text-xs tabular-nums text-white/90 sm:min-w-[4.5rem] sm:text-sm">{current} / {pages}</span>
        <button className={tool} disabled={current >= pages} onClick={() => go(1)} title="Next" aria-label="Next"><ChevronRight className="size-6" /></button>
        <button className={cn(tool, panel === 'search' && 'bg-white/20')} onClick={() => setPanel(panel === 'search' ? null : 'search')} title="Search" aria-label="Search"><Search className="size-5" /></button>
        <button className={cn(tool, auto && 'bg-amber-500/80')} onClick={() => setAuto(!auto)} title={auto ? 'Stop auto flip' : 'Auto flip'} aria-label={auto ? 'Stop auto flip' : 'Auto flip'}>{auto ? <Pause className="size-5" /> : <Play className="size-5" />}</button>
        <button className={tool} onClick={fullscreen} title="Full screen" aria-label="Full screen"><Maximize className="size-5" /></button>
      </div>
      {panel && (
        <div className="absolute inset-x-0 bottom-16 z-20 mx-auto max-h-[60%] w-[min(56rem,calc(100%-2rem))] overflow-hidden rounded-2xl bg-black/80 text-white shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
            <b className="flex-1">{panel === 'thumbs' ? 'Pages' : 'Search the book'}</b>
            <button onClick={() => setPanel(null)} aria-label="Close" className="rounded p-1 hover:bg-white/10"><X className="size-5" /></button>
          </div>
          {panel === 'thumbs' ? (
            <div className="grid max-h-[50vh] grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-1 overflow-y-auto p-3">
              {Array.from({ length: pages }, (_, i) => <Thumb key={i} doc={doc} n={i + 1} active={i + 1 === current || (wide && i + 1 === current + 1)} onPick={() => { setPanel(null); onPage(i + 1); }} />)}
            </div>
          ) : (
            <div className="space-y-2 p-3">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a word…" className="h-10 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 text-white placeholder:text-white/50" />
                <button className="rounded-lg bg-amber-500 px-4 font-medium text-black">Search</button>
              </form>
              <div className="max-h-[40vh] space-y-1 overflow-y-auto">
                {hits === null ? null : hits.length === 0 ? <p className="text-sm text-white/70">Searching… (or no results)</p>
                  : hits.map((h) => <button key={h.n} onClick={() => { setPanel(null); onPage(h.n); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"><b className="text-amber-300">Page {h.n}</b> <span className="text-white/80">{h.text}</span></button>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
