'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Bookmark, BookmarkCheck, Presentation, ChevronLeft, ChevronRight, ExternalLink, FileText, Maximize, Minimize, PanelLeft, Volume2, VolumeX, ZoomIn, ZoomOut,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, ErrorBox, PageLoader, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { HotspotLayer } from '@/components/hotspots';
import { PdfFlipbook, spreadOf, stepPage, usePageShapes, type FlipLayout } from '@/components/pdf-flip';
import { PdfCurlbook } from '@/components/pdf-curl';
import { TutorPanel, useTutorStatus } from '@/components/tutor';
import { ContentGuard, useProtection } from '@/components/content-guard';
import { AppPanel } from '@/components/app-panel';
import { useRouter } from 'next/navigation';
import { useMe } from '@/lib/session';
import { speakPage, stopVoice } from '@/lib/voice';
import { openPdf, type FileLink } from '@/lib/protected-pdf';
import { isSaved, offlinePdf, offlineSupported, removeBook, saveBook } from '@/lib/offline';

type PDFDoc = { numPages: number; getPage: (n: number) => Promise<any>; destroy: () => void };

/** Loads pdf.js lazily (client only); the worker is served from /public. */
export async function loadPdf(src: FileLink | ArrayBuffer, refresh?: () => Promise<FileLink>): Promise<PDFDoc> {
  // Saved (offline) books are in memory already; online books are fetched part by part (protected parts decrypted in memory).
  if (src instanceof ArrayBuffer) {
    const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return pdfjs.getDocument({ data: new Uint8Array(src), isEvalSupported: false }).promise as unknown as Promise<PDFDoc>;
  }
  return openPdf(src, refresh);
}

export function Reader({ editionId, backHref, initial }: { editionId: string; backHref: string; initial?: { componentId?: string; page?: number } }) {
  const toast = useToast(); const qc = useQueryClient();
  const book = useQuery({ queryKey: ['reader', editionId], queryFn: () => api.get(`/reader/editions/${editionId}`) });
  const [compId, setCompId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [doc, setDoc] = useState<PDFDoc | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [toc, setToc] = useState(true);
  useEffect(() => { if (window.innerWidth < 1024) setToc(false); }, []); // phones: show the page first, contents on demand
  const [full, setFull] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [editHot, setEditHot] = useState(false);
  const [owl, setOwl] = useState(false); const protection = useProtection(); const router = useRouter();
  const [saved, setSaved] = useState(false); const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => { isSaved(editionId).then(setSaved).catch(() => undefined); }, [editionId]);
  const toggleOffline = async () => {
    if (saving) return;
    try {
      if (saved) { await removeBook(editionId); setSaved(false); toast('Removed from this device'); return; }
      setSaving('0%'); const n = await saveBook(editionId, (d, t) => setSaving(t ? `${Math.round((d / t) * 100)}%` : '…'));
      setSaved(true); toast(n ? 'Saved — this book now opens without internet' : 'This book has no pages to save yet');
    } catch (e: any) { toast(e.message || 'Could not save the book', 'err'); } finally { setSaving(null); }
  };
  const me = useMe().data as any; const canEditHot = !!me?.roles?.some((r: string) => ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR'].includes(r));
  const canvas = useRef<HTMLCanvasElement>(null); const wrap = useRef<HTMLDivElement>(null); const shell = useRef<HTMLDivElement>(null);
  const b = book.data;
  const kid = !!b?.student;
  const comps: any[] = b?.components ?? [];
  const comp = comps.find((c) => c.id === compId);
  const tutor = useTutorStatus(kid);
  // Flipbook (HTML / Flash) or PDF view of the selected part.
  const [view, setView] = useState<'flip' | 'pdf'>('pdf');
  // a link to a page number (e.g. from homework) opens the page view; otherwise a flipbook is shown first
  useEffect(() => { setView(comp?.flipbook && !(initial?.page && comp?.hasPdf && comp?.id === (initial?.componentId ?? comp?.id)) ? 'flip' : 'pdf'); }, [comp?.id, comp?.flipbook]); // eslint-disable-line react-hooks/exhaustive-deps
  const [flipUnit, setFlipUnit] = useState<string>('');
  useEffect(() => setFlipUnit(''), [comp?.id]);
  const flip = useQuery({ queryKey: ['flipbook', comp?.id, flipUnit], queryFn: () => api.get(`/reader/components/${comp!.id}/flipbook${flipUnit ? `?unit=${flipUnit}` : ''}`), enabled: !!comp?.flipbook && view === 'flip', staleTime: 5 * 3600_000 , placeholderData: (prev: any) => (prev && flipUnit ? prev : undefined) });
  const flipUnits: { id: string; title: string | null }[] = (flip.data as any)?.units ?? [];
  const flipMode = view === 'flip' && !!comp?.flipbook;
  // a PDF the publisher chose to show as a flipbook: page-turn view (a reader can switch to plain pages, e.g. to zoom)
  const [asBook, setAsBook] = useState(true);
  useEffect(() => { setAsBook(true); }, [comp?.id]);
  const pdfFlip = !flipMode && !!comp?.hasPdf && comp?.displayMode === 'FLIP' && asBook;
  const [wide, setWide] = useState(false);
  // the flipbook frame reports which page(s) are open (see FLIP_PAGE_REPORTER on the server), so Ask Owl uses exactly that page
  const flipRef = useRef<HTMLIFrameElement>(null); const [flipPages, setFlipPages] = useState<number[]>([]);
  useEffect(() => { setFlipPages([]); }, [comp?.id, flipMode]);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.source && e.source === flipRef.current?.contentWindow && Array.isArray(e.data?.kgFlipPages)) setFlipPages(e.data.kgFlipPages.map(Number).filter((n: number) => n > 0).slice(0, 2)); };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }, []);

  // Default part: the first one with pages; resume at last page read.
  useEffect(() => {
    if (!b || compId) return;
    const wanted = initial?.componentId && comps.find((x) => x.id === initial.componentId);
    const c = wanted || comps.find((x) => x.hasPdf || x.flipbook) || comps[0];
    if (c) { setCompId(c.id); setPage(wanted && initial?.page ? initial.page : c.progress?.lastPage ?? 1); }
  }, [b, compId, comps]);

  // Load the PDF of the selected part (short-lived signed URL).
  useEffect(() => {
    let cancelled = false; let loaded: PDFDoc | null = null;
    setDoc(null); setDocError(null);
    if (!comp?.hasPdf) return;
    setLoadingDoc(true);
    offlinePdf(comp.id).then((saved) => saved ? loadPdf(saved) : api.get<FileLink>(`/reader/components/${comp.id}/pdf`).then((link) => loadPdf(link, () => api.get<FileLink>(`/reader/components/${comp.id}/pdf`)))).then((d) => { loaded = d; if (!cancelled) setDoc(d); })
      .catch((e) => !cancelled && setDocError(e.message || 'Could not open the book')).finally(() => !cancelled && setLoadingDoc(false));
    return () => { cancelled = true; loaded?.destroy(); };
  }, [comp?.id, comp?.hasPdf]);

  // Render the current page, fitted to the available width × zoom.
  useEffect(() => {
    if (!doc || !canvas.current || !wrap.current) return;
    let task: any; let cancelled = false;
    (async () => {
      const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
      const base = p.getViewport({ scale: 1 });
      const fit = Math.min((wrap.current!.clientWidth - 32) / base.width, ((wrap.current!.clientHeight || 800) - 32) / base.height);
      const vp = p.getViewport({ scale: Math.max(0.3, fit * zoom) });
      const ratio = window.devicePixelRatio || 1;
      const c = canvas.current!; const ctx = c.getContext('2d')!;
      c.width = Math.floor(vp.width * ratio); c.height = Math.floor(vp.height * ratio);
      c.style.width = `${Math.floor(vp.width)}px`; c.style.height = `${Math.floor(vp.height)}px`;
      if (cancelled) return;
      task = p.render({ canvasContext: ctx, viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      await task.promise.catch(() => undefined);
    })();
    return () => { cancelled = true; task?.cancel?.(); };
  }, [doc, page, zoom, full, toc]);

  const pages = doc?.numPages ?? comp?.pageCount ?? 1;
  const go = useCallback((n: number) => { readRun.current++; stopVoice(); setSpeaking(false); setPage(Math.min(Math.max(1, n), pages)); }, [pages]);
  // next / previous: a whole spread in the flipbook view
  const layout: FlipLayout = comp?.flipLayout ?? 'COVER';
  const shape = usePageShapes(pdfFlip ? doc : null, page);
  const step = useCallback((dir: 1 | -1) => go(pdfFlip ? stepPage(page, pages, wide, dir, layout, shape) : page + dir), [go, pdfFlip, page, pages, wide, layout, shape]);
  const spread = pdfFlip ? spreadOf(page, pages, wide, layout, shape) : [page];

  // Save progress (debounced).
  useEffect(() => {
    if (!comp || !doc) return;
    const t = setTimeout(() => api.put('/reader/progress', { componentId: comp.id, page }).catch(() => undefined), 800);
    return () => clearTimeout(t);
  }, [comp, doc, page]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') step(1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') step(-1);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : shell.current?.requestFullscreen());

  // Narration: the page read aloud with the natural voice (the platform's own, or the device's best one).
  const readRun = useRef(0);
  const speak = async () => {
    if (speaking) { readRun.current++; stopVoice(); setSpeaking(false); return; }
    if (!doc || !comp) return;
    const my = ++readRun.current; setSpeaking(true);
    try {
      for (const n of spread) {
        if (readRun.current !== my) break;
        await speakPage(comp.id, n, async () => (await (await doc.getPage(n)).getTextContent()).items.map((i: any) => i.str).join(' ').trim());
      }
    } catch (e: any) { toast(e.message || 'Read-aloud is not available on this device', 'err'); }
    finally { if (readRun.current === my) setSpeaking(false); }
  };

  const mark = comp?.bookmarks?.find((x: any) => x.page === page);
  const toggleBookmark = async () => {
    if (!comp) return;
    if (mark) await api.del(`/reader/bookmarks/${mark.id}`); else await api.post('/reader/bookmarks', { componentId: comp.id, page });
    qc.invalidateQueries({ queryKey: ['reader', editionId] });
    toast(mark ? 'Bookmark removed' : `Page ${page} bookmarked`);
  };

  const lessonHere = useMemo(() => comp?.units.flatMap((u: any) => u.lessons.map((l: any) => ({ ...l, unit: u })))
    .find((l: any) => l.pageStart && page >= l.pageStart && page <= (l.pageEnd ?? l.pageStart)), [comp, page]);
  const lessonResources = (b?.resources ?? []).filter((r: any) => (lessonHere && r.lessonId === lessonHere.id) || (!r.componentId) || (r.componentId === comp?.id && !r.unitId));
  const lessonGames = (b?.games ?? []).filter((g: any) => lessonHere && g.lessonId === lessonHere.id);
  const lessonWork = (b?.assessments ?? []).filter((a: any) => lessonHere && (a.lessonId === lessonHere.id || (!a.lessonId && a.unitId === lessonHere.unit.id)));

  if (book.isLoading) return <PageLoader />;
  if (book.error) return <div className="p-6"><ErrorBox error={book.error} /></div>;
  const btn = cn('focus-ring grid place-items-center rounded-xl text-slate-700 hover:bg-white disabled:opacity-30', kid ? 'size-12' : 'size-9');

  return (
    <div ref={shell} className={cn('flex h-screen flex-col', kid ? 'bg-amber-50' : 'bg-slate-100')}>
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/90 px-3 py-2 backdrop-blur">
        <Link href={backHref} className={btn} aria-label="Back"><ArrowLeft className="size-5" /></Link>
        <button className={btn} onClick={() => setToc(!toc)} aria-label="Contents" aria-pressed={toc}><PanelLeft className="size-5" /></button>
        <div className="min-w-0 flex-1"><div className={cn('truncate font-semibold', kid && 'text-lg')}>{b.title}</div><div className="truncate text-xs text-slate-600">{comp?.title}{lessonHere && ` · Unit ${lessonHere.unit.number} · Lesson ${lessonHere.number}: ${lessonHere.title}`}</div></div>
        {comp?.flipbook && (
          <div role="tablist" aria-label="View" className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
            <button role="tab" aria-selected={view === 'flip'} onClick={() => setView('flip')} className={cn('rounded-lg px-3 py-1', view === 'flip' ? 'bg-white shadow-sm' : 'text-slate-700')}>📖 Flipbook</button>
            <button role="tab" aria-selected={view === 'pdf'} disabled={!comp.hasPdf} onClick={() => setView('pdf')} className={cn('rounded-lg px-3 py-1 disabled:opacity-40', view === 'pdf' ? 'bg-white shadow-sm' : 'text-slate-700')}>📄 Pages</button>
          </div>)}
        {!comp?.flipbook && comp?.hasPdf && comp?.displayMode === 'FLIP' && (
          <div role="tablist" aria-label="View" className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
            <button role="tab" aria-selected={asBook} onClick={() => setAsBook(true)} className={cn('rounded-lg px-3 py-1', asBook ? 'bg-white shadow-sm' : 'text-slate-700')}>📖 Book</button>
            <button role="tab" aria-selected={!asBook} onClick={() => setAsBook(false)} className={cn('rounded-lg px-3 py-1', !asBook ? 'bg-white shadow-sm' : 'text-slate-700')}>📄 Pages</button>
          </div>)}
        {flipMode && flipUnits.length > 1 && (
          <select aria-label="Choose the unit" value={(flip.data as any)?.id ?? ''} onChange={(e) => setFlipUnit(e.target.value)}
            className={cn('h-9 max-w-[14rem] rounded-xl border border-slate-300 bg-white px-2 text-sm font-medium text-slate-800', kid && 'h-11 text-base font-bold')}>
            {flipUnits.map((u, i) => <option key={u.id} value={u.id}>{u.title ?? (comp?.type === 'CD' ? 'Main CD' : 'Main flipbook')}{u.title ? '' : ` (${i + 1})`}</option>)}
          </select>)}
        {!flipMode && comp?.type !== 'MOBILE_APP' && <>
        <button className={btn} onClick={() => step(-1)} disabled={spread[0] <= 1} aria-label="Previous page"><ChevronLeft className="size-6" /></button>
        <label className="flex items-center gap-1 text-sm"><span className="sr-only">Page</span>
          <input type="number" min={1} max={pages} value={page} onChange={(e) => go(Number(e.target.value) || 1)} className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-center" />
          <span className="text-slate-500">/ {pages}</span></label>
        <button className={btn} onClick={() => step(1)} disabled={spread[spread.length - 1] >= pages} aria-label="Next page"><ChevronRight className="size-6" /></button>
        <span className="mx-1 h-6 w-px bg-slate-200" />
        {!pdfFlip && <>
        <button className={btn} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out"><ZoomOut className="size-5" /></button>
        <span className="w-10 text-center text-xs tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
        <button className={btn} onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in"><ZoomIn className="size-5" /></button></>}
        <button className={btn} onClick={toggleBookmark} aria-label={mark ? 'Remove bookmark' : 'Bookmark this page'} aria-pressed={!!mark} disabled={!doc}>{mark ? <BookmarkCheck className="size-5 text-amber-500" /> : <Bookmark className="size-5" />}</button>
        {me?.roles?.includes('TEACHER') && comp?.hasPdf && <a href={`/teacher/whiteboard?new=1&editionId=${editionId}&componentId=${comp.id}&page=${page}`} className={btn} title="Teach this page live on the whiteboard" aria-label="Teach this page on the whiteboard"><Presentation className="size-5" /></a>}
        {canEditHot && <button className={cn(btn, 'w-auto px-2 text-sm font-medium', editHot && 'bg-sky-100 text-sky-800')} onClick={() => { setEditHot(!editHot); if (!editHot) toast('Drag on the page to draw a hotspot. Click one to edit it.'); }} aria-pressed={editHot}>✏️ Hotspots</button>}
        <button className={btn} onClick={speak} aria-label={speaking ? 'Stop reading' : 'Read aloud'} disabled={!doc}>{speaking ? <VolumeX className="size-5 text-pink-600" /> : <Volume2 className="size-5" />}</button>
        </>}
        {offlineSupported() && !canEditHot && <button className={cn(btn, 'w-auto px-2 text-sm font-medium', saved && 'text-emerald-700')} onClick={toggleOffline} aria-pressed={saved}
          title={saved ? 'Saved on this device. Click to remove.' : 'Save this book to read without internet'}>{saving ? `⬇ ${saving}` : saved ? '✅ Offline' : '⬇ Save offline'}</button>}
        {kid && tutor.data?.enabled && (flipMode || comp?.hasPdf) && <button className={cn(btn, 'w-auto bg-amber-100 px-3 text-base font-black text-amber-900')} onClick={() => setOwl(!owl)} aria-pressed={owl}>🦉 Ask Owl</button>}
        <button className={btn} onClick={toggleFull} aria-label={full ? 'Exit full screen' : 'Full screen'}>{full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}</button>
      </header>
      <div className="flex min-h-0 flex-1">
        {toc && (
          <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3 text-sm max-md:absolute max-md:inset-y-14 max-md:left-0 max-md:z-20 max-md:shadow-xl">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contents</p>
            {comps.map((c) => (
              <div key={c.id} className="mb-2">
                <button onClick={() => { setCompId(c.id); setPage(c.progress?.lastPage ?? 1); }}
                  className={cn('flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left font-medium', c.id === compId ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50')}>
                  <span className="truncate">{c.title}</span>{c.progress && c.pageCount ? <span className="text-xs text-slate-600">{Math.round((c.progress.maxPage / c.pageCount) * 100)}%</span> : c.type === 'MOBILE_APP' ? <span className="text-xs" title="Mobile app">📱</span> : c.flipbook ? <span className="text-xs" title={c.type === 'CD' ? 'CD' : 'Flipbook'}>{c.type === 'CD' ? '💿' : '📖'}</span> : !c.hasPdf ? <span className="text-xs" title="Resources only">📎</span> : null}
                </button>
                {c.id === compId && c.units.map((u: any) => (
                  <div key={u.id} className="ml-2 mt-1">
                    <p className="px-2 py-1 text-xs font-semibold text-slate-500">Unit {u.number}: {u.title}</p>
                    {u.lessons.map((l: any) => (
                      <button key={l.id} disabled={!l.pageStart} onClick={() => l.pageStart && go(l.pageStart)}
                        className={cn('flex w-full justify-between rounded-md px-2 py-1 text-left', lessonHere?.id === l.id ? 'bg-amber-50 font-medium text-amber-900' : 'hover:bg-slate-50')}>
                        <span className="truncate">{l.number}. {l.title}</span>{l.pageStart && <span className="text-xs text-slate-600">p.{l.pageStart}</span>}</button>
                    ))}
                  </div>
                ))}
                {c.id === compId && c.bookmarks?.length > 0 && (
                  <div className="ml-2 mt-2"><p className="px-2 text-xs font-semibold text-slate-500">Bookmarks</p>
                    {c.bookmarks.map((m: any) => <button key={m.id} onClick={() => go(m.page)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-slate-50"><Bookmark className="size-3 text-amber-500" />Page {m.page}{m.note && <span className="truncate text-xs text-slate-600">{m.note}</span>}</button>)}</div>
                )}
              </div>
            ))}
          </aside>
        )}
        <main ref={wrap} className="relative flex min-w-0 flex-1 items-start justify-center overflow-auto p-4">
          {comp?.type === 'MOBILE_APP' ? <AppPanel componentId={comp.id} title={comp.title} />
          : flipMode ? (flip.error ? <div className="m-auto"><ErrorBox error={flip.error} /></div>
            : !flip.data ? <Spinner className="m-auto size-8" />
              : <ContentGuard className="absolute inset-0"><iframe ref={flipRef} key={flip.data.url} src={flip.data.url} title={`${comp?.title} — flipbook`} className={cn('absolute inset-0 size-full border-0 bg-white', kid && 'rounded-2xl')}
                  sandbox="allow-scripts allow-popups allow-forms allow-modals allow-pointer-lock allow-downloads allow-presentation" allow="fullscreen; autoplay" allowFullScreen referrerPolicy="no-referrer" /></ContentGuard>)
          : !comp?.hasPdf ? <div className="m-auto max-w-sm text-center text-slate-500"><FileText className="mx-auto mb-2 size-10" />This part has resources only — see the files listed for it.</div>
            : docError ? <div className="m-auto"><ErrorBox error={new Error(docError)} /></div>
              : pdfFlip && doc && !editHot && (shape(page) > 1) === (shape(1) > 1) ? <ContentGuard className="absolute inset-0"><PdfCurlbook doc={doc} page={page} pages={pages} onPage={go} onWide={setWide} layout={layout} shape={shape}
                  componentId={comp.id} kid={kid} games={(b?.games ?? []).map((g: any) => ({ id: g.id, title: g.title }))} onZoom={() => setAsBook(false)} /></ContentGuard>
              : pdfFlip ? (!doc ? <Spinner className="m-auto size-8" /> : <ContentGuard className="absolute inset-0"><PdfFlipbook doc={doc} page={page} pages={pages} onPage={go} onWide={setWide} layout={layout} shape={shape} componentId={comp.id}
                  editing={editHot} kid={kid} games={(b?.games ?? []).map((g: any) => ({ id: g.id, title: g.title }))} /></ContentGuard>)
              : <>{loadingDoc && <Spinner className="absolute left-1/2 top-1/2 size-8" />}<ContentGuard className="relative"><canvas ref={canvas} className={cn('block bg-white shadow-xl', kid ? 'rounded-2xl' : 'rounded')} aria-label={`Page ${page} of ${pages}`} />{doc && comp && <HotspotLayer componentId={comp.id} page={page} editing={editHot} kid={kid} games={(b?.games ?? []).map((g: any) => ({ id: g.id, title: g.title }))} />}</ContentGuard></>}
        </main>
        {owl && comp && <TutorPanel key={`${comp.id}-${flipMode}`} editionId={editionId} componentId={comp.id} page={flipMode ? flipPages[0] ?? 0 : spread[0]} toPage={flipMode ? flipPages[1] : spread[1]} flip={flipMode} onGo={go} onClose={() => setOwl(false)} />}
        {!owl && (lessonResources.length > 0 || lessonWork.length > 0 || lessonGames.length > 0 || (!kid && lessonHere)) && (
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-3 text-sm xl:block">
            {!kid && lessonHere && <Link href={`/teacher/ai?editionId=${editionId}&lessonId=${lessonHere.id}`} className="mb-3 block rounded-lg bg-violet-50 px-3 py-2 font-medium text-violet-800 hover:bg-violet-100">✨ AI assistant for this lesson</Link>}
            {lessonWork.length > 0 && <><p className="pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{kid ? '📝 Homework' : 'Assigned work'}</p>
              {lessonWork.map((a: any) => <Link key={a.id} href={kid ? `/homework/${a.id}` : `/teacher/assessments/${a.id}`} className="mb-1 block rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900 hover:bg-amber-100">{a.title}</Link>)}</>}
            {lessonGames.length > 0 && <><p className="pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{kid ? '🎮 Play' : 'Games'}</p>
              {lessonGames.map((g: any) => <Link key={g.id} href={kid ? `/learn/games/${g.id}` : `/teacher/games/${g.id}`} className="mb-1 block rounded-lg bg-emerald-50 px-3 py-2 font-medium text-emerald-900 hover:bg-emerald-100">{g.title}</Link>)}</>}
            {lessonResources.length > 0 && <><p className="pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Resources</p>
              {lessonResources.map((r: any) => (
                <button key={r.id} onClick={() => router.push(`/view/${r.assetId}?t=${encodeURIComponent(r.title)}&e=${r.ext}`)}
                  className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                  <span className="grid size-7 shrink-0 place-items-center rounded bg-slate-100 text-[9px] font-bold uppercase">{r.ext}</span><span className="flex-1 truncate">{r.title}</span><ExternalLink className="size-3 text-slate-500" /></button>
              ))}</>}
          </aside>
        )}
      </div>
    </div>
  );
}
