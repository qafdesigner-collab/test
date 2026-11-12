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
import { TutorPanel, useTutorStatus } from '@/components/tutor';
import { ContentGuard, useProtection } from '@/components/content-guard';
import { AppPanel } from '@/components/app-panel';
import { useRouter } from 'next/navigation';
import { useMe } from '@/lib/session';
import { isSaved, offlinePdf, offlineSupported, removeBook, saveBook } from '@/lib/offline';

type PDFDoc = { numPages: number; getPage: (n: number) => Promise<any>; destroy: () => void };

/** Loads pdf.js lazily (client only); the worker is served from /public. */
export async function loadPdf(src: string | ArrayBuffer): Promise<PDFDoc> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const args = typeof src === 'string' ? { url: src, withCredentials: true } : { data: new Uint8Array(src) };
  return pdfjs.getDocument(args).promise as unknown as Promise<PDFDoc>;
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
  useEffect(() => { setView(comp?.flipbook ? 'flip' : 'pdf'); }, [comp?.id, comp?.flipbook]);
  const flip = useQuery({ queryKey: ['flipbook', comp?.id], queryFn: () => api.get(`/reader/components/${comp!.id}/flipbook`), enabled: !!comp?.flipbook && view === 'flip', staleTime: 5 * 3600_000 });
  const flipMode = view === 'flip' && !!comp?.flipbook;

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
    offlinePdf(comp.id).then((saved) => saved ? loadPdf(saved) : api.get(`/reader/components/${comp.id}/pdf`).then(({ url }) => loadPdf(url))).then((d) => { loaded = d; if (!cancelled) setDoc(d); })
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
  const go = useCallback((n: number) => { window.speechSynthesis?.cancel(); setSpeaking(false); setPage(Math.min(Math.max(1, n), pages)); }, [pages]);

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
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(page + 1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(page - 1);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [go, page]);

  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : shell.current?.requestFullscreen());

  // Optional narration: reads the page's text aloud with the device's voice.
  const speak = async () => {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    if (!doc || !window.speechSynthesis) return toast('Read-aloud is not available on this device', 'err');
    const tc = await (await doc.getPage(page)).getTextContent();
    const text = tc.items.map((i: any) => i.str).join(' ').trim();
    if (!text) return toast('This page has no readable text', 'err');
    const u = new SpeechSynthesisUtterance(text); u.rate = 0.85; u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u); setSpeaking(true);
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
        {!flipMode && comp?.type !== 'MOBILE_APP' && <>
        <button className={btn} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft className="size-6" /></button>
        <label className="flex items-center gap-1 text-sm"><span className="sr-only">Page</span>
          <input type="number" min={1} max={pages} value={page} onChange={(e) => go(Number(e.target.value) || 1)} className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-center" />
          <span className="text-slate-500">/ {pages}</span></label>
        <button className={btn} onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight className="size-6" /></button>
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <button className={btn} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out"><ZoomOut className="size-5" /></button>
        <span className="w-10 text-center text-xs tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
        <button className={btn} onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in"><ZoomIn className="size-5" /></button>
        <button className={btn} onClick={toggleBookmark} aria-label={mark ? 'Remove bookmark' : 'Bookmark this page'} aria-pressed={!!mark} disabled={!doc}>{mark ? <BookmarkCheck className="size-5 text-amber-500" /> : <Bookmark className="size-5" />}</button>
        {me?.roles?.includes('TEACHER') && comp?.hasPdf && <a href={`/teacher/whiteboard?new=1&editionId=${editionId}&componentId=${comp.id}&page=${page}`} className={btn} title="Teach this page live on the whiteboard" aria-label="Teach this page on the whiteboard"><Presentation className="size-5" /></a>}
        {canEditHot && <button className={cn(btn, 'w-auto px-2 text-sm font-medium', editHot && 'bg-sky-100 text-sky-800')} onClick={() => { setEditHot(!editHot); if (!editHot) toast('Drag on the page to draw a hotspot. Click one to edit it.'); }} aria-pressed={editHot}>✏️ Hotspots</button>}
        <button className={btn} onClick={speak} aria-label={speaking ? 'Stop reading' : 'Read aloud'} disabled={!doc}>{speaking ? <VolumeX className="size-5 text-pink-600" /> : <Volume2 className="size-5" />}</button>
        </>}
        {offlineSupported() && !canEditHot && <button className={cn(btn, 'w-auto px-2 text-sm font-medium', saved && 'text-emerald-700')} onClick={toggleOffline} aria-pressed={saved}
          title={saved ? 'Saved on this device. Click to remove.' : 'Save this book to read without internet'}>{saving ? `⬇ ${saving}` : saved ? '✅ Offline' : '⬇ Save offline'}</button>}
        {kid && tutor.data?.enabled && !flipMode && comp?.hasPdf && <button className={cn(btn, 'w-auto bg-amber-100 px-3 text-base font-black text-amber-900')} onClick={() => setOwl(!owl)} aria-pressed={owl}>🦉 Ask Owl</button>}
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
              : <ContentGuard className="absolute inset-0"><iframe key={flip.data.url} src={flip.data.url} title={`${comp?.title} — flipbook`} className={cn('absolute inset-0 size-full border-0 bg-white', kid && 'rounded-2xl')}
                  sandbox="allow-scripts allow-popups allow-forms allow-modals allow-pointer-lock allow-downloads allow-presentation" allow="fullscreen; autoplay" allowFullScreen referrerPolicy="no-referrer" /></ContentGuard>)
          : !comp?.hasPdf ? <div className="m-auto max-w-sm text-center text-slate-500"><FileText className="mx-auto mb-2 size-10" />This part has resources only — see the files listed for it.</div>
            : docError ? <div className="m-auto"><ErrorBox error={new Error(docError)} /></div>
              : <>{loadingDoc && <Spinner className="absolute left-1/2 top-1/2 size-8" />}<ContentGuard className="relative"><canvas ref={canvas} className={cn('block bg-white shadow-xl', kid ? 'rounded-2xl' : 'rounded')} aria-label={`Page ${page} of ${pages}`} />{doc && comp && <HotspotLayer componentId={comp.id} page={page} editing={editHot} kid={kid} games={(b?.games ?? []).map((g: any) => ({ id: g.id, title: g.title }))} />}</ContentGuard></>}
        </main>
        {owl && comp && <TutorPanel editionId={editionId} componentId={comp.id} page={page} onGo={go} onClose={() => setOwl(false)} />}
        {!owl && (lessonResources.length > 0 || lessonWork.length > 0 || lessonGames.length > 0 || (!kid && lessonHere)) && (
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-3 text-sm xl:block">
            {!kid && lessonHere && <Link href={`/teacher/ai?editionId=${editionId}&lessonId=${lessonHere.id}`} className="mb-3 block rounded-lg bg-violet-50 px-3 py-2 font-medium text-violet-800 hover:bg-violet-100">✨ AI assistant for this lesson</Link>}
            {lessonWork.length > 0 && <><p className="pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{kid ? '📝 Homework' : 'Assigned work'}</p>
              {lessonWork.map((a: any) => <Link key={a.id} href={kid ? `/homework/${a.id}` : `/teacher/assessments/${a.id}`} className="mb-1 block rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900 hover:bg-amber-100">{a.title}</Link>)}</>}
            {lessonGames.length > 0 && <><p className="pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{kid ? '🎮 Play' : 'Games'}</p>
              {lessonGames.map((g: any) => <Link key={g.id} href={kid ? `/learn/games/${g.id}` : `/teacher/games/${g.id}`} className="mb-1 block rounded-lg bg-emerald-50 px-3 py-2 font-medium text-emerald-900 hover:bg-emerald-100">{g.title}</Link>)}</>}
            {lessonResources.length > 0 && <><p className="pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Resources</p>
              {lessonResources.map((r: any) => (
                <button key={r.id} onClick={async () => { if (protection.protect) return router.push(`/view/${r.assetId}?t=${encodeURIComponent(r.title)}&e=${r.ext}`); const w = window.open('', '_blank'); const { url } = await api.get(`/assets/${r.assetId}/link`); if (w) { w.opener = null; w.location.href = url; } }}
                  className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                  <span className="grid size-7 shrink-0 place-items-center rounded bg-slate-100 text-[9px] font-bold uppercase">{r.ext}</span><span className="flex-1 truncate">{r.title}</span><ExternalLink className="size-3 text-slate-500" /></button>
              ))}</>}
          </aside>
        )}
      </div>
    </div>
  );
}
