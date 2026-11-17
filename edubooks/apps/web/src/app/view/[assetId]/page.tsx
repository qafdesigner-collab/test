'use client';
import { Suspense, use, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { ErrorBox, PageLoader, Spinner } from '@/components/ui';
import { ContentGuard } from '@/components/content-guard';
import { fetchPdf, type FileLink } from '@/lib/protected-pdf';
import { renderDocx, renderPptx } from '@/lib/office-view';
import { useMe } from '@/lib/session';
import { Download } from 'lucide-react';

/** View-only viewer: resources are shown inside the platform, never handed over as a file. */
function Viewer({ assetId }: { assetId: string }) {
  const p = useSearchParams(); const title = p.get('t') ?? 'Resource'; const ext = (p.get('e') ?? '').toLowerCase();
  const me = useMe().data as any; const staff = !!me?.roles?.some((x: string) => x.startsWith('PUBLISHER_'));
  const [link, setLink] = useState<FileLink | null>(null); const [err, setErr] = useState<unknown>(null); const url = link?.url ?? null;
  useEffect(() => { api.get<FileLink>(`/assets/${assetId}/link`).then(setLink).catch(setErr); }, [assetId]);
  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <button onClick={() => history.back()} className="focus-ring rounded-lg p-2 hover:bg-slate-100" aria-label="Back"><ArrowLeft className="size-5" /></button>
        <h1 className="min-w-0 flex-1 truncate font-semibold text-slate-900">{title}</h1>
        {staff && <button onClick={async () => { try { const r = await api.get<FileLink>(`/assets/${assetId}/link?download=1`); location.href = r.url; } catch (e) { setErr(e); } }}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"><Download className="size-4" />Download</button>}
      </header>
      <main className="relative min-h-0 flex-1 overflow-auto">
        {err ? <div className="p-6"><ErrorBox error={err} /></div> : !url ? <PageLoader /> : (
          <ContentGuard className="min-h-full" fixed>
            {ext === 'pdf' ? <PdfPages link={link!} />
              : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? <div className="grid min-h-full place-items-center p-4"><img src={url!} alt={title} draggable={false} className="max-h-[85vh] max-w-full rounded shadow-lg" /></div>
              : ['mp3', 'wav', 'm4a', 'ogg'].includes(ext) ? <div className="grid min-h-full place-items-center p-6"><audio src={url} controls controlsList="nodownload noplaybackrate" className="w-full max-w-xl" /></div>
              : ['mp4', 'webm', 'mov'].includes(ext) ? <div className="grid min-h-full place-items-center p-4"><video src={url} controls controlsList="nodownload" disablePictureInPicture className="max-h-[85vh] max-w-full rounded bg-black" /></div>
              : ext === 'swf' ? <SwfPlayer url={url!} />
              : ['pptx', 'ppsx', 'docx'].includes(ext) ? <OfficeDoc url={url!} kind={ext === 'docx' ? 'docx' : 'pptx'} />
              : ['ppt', 'pps', 'doc', 'xls', 'xlsx'].includes(ext) ? <p className="m-auto max-w-md p-8 text-center text-slate-700">This is an older Office file (.{ext}) that cannot be shown in a web browser. Please ask the publisher to upload it as {ext.startsWith('x') ? 'PDF' : ext.startsWith('d') ? 'DOCX or PDF' : 'PPTX or PDF'}.</p>
              : ['html', 'htm'].includes(ext) ? <iframe src={url} title={title} sandbox="allow-scripts allow-forms" className="absolute inset-0 size-full border-0 bg-white" />
              : <p className="m-auto max-w-md p-8 text-center text-slate-700">This kind of file (.{ext || '?'}) cannot be shown inside the platform. Please ask the publisher for a PDF version.</p>}
          </ContentGuard>)}
      </main>
    </div>
  );
}

/**
 * PDF resources: every page has its place, but only the pages near the screen are drawn and pages far away are
 * cleared again. Phones and tablets (iPad/iPhone in particular) allow a web page only limited drawing memory —
 * drawing all pages at once left every page after the first blank there.
 */
function PdfPages({ link }: { link: FileLink }) {
  const host = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null); const [sizes, setSizes] = useState<{ w: number; h: number }[] | null>(null);
  const [width, setWidth] = useState(800); const [current, setCurrent] = useState(1);
  const doc = useRef<any>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const d = await pdfjs.getDocument({ data: new Uint8Array(await fetchPdf(link)), isEvalSupported: false }).promise;
      if (cancelled) { d.destroy(); return; }
      doc.current = d;
      const out: { w: number; h: number }[] = [];
      for (let i = 1; i <= d.numPages; i++) { const vp = (await d.getPage(i)).getViewport({ scale: 1 }); out.push({ w: vp.width, h: vp.height }); }
      if (!cancelled) setSizes(out);
    })().catch((e) => { if (!cancelled) setErr(e?.message ?? 'Could not open the file'); });
    return () => { cancelled = true; doc.current?.destroy(); doc.current = null; };
  }, [link]);
  useEffect(() => {
    const fit = () => setWidth(Math.min((host.current?.clientWidth ?? 900) - 32, 1000));
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit);
  }, []);
  // draw pages as they come near the screen; clear pages that are far away
  useEffect(() => {
    if (!sizes || !host.current) return;
    const root = host.current.closest('main');
    const tasks = new Map<number, any>();
    const draw = async (el: HTMLDivElement, n: number) => {
      if (el.querySelector('canvas') || tasks.has(n) || !doc.current) return;
      const page = await doc.current.getPage(n); const base = page.getViewport({ scale: 1 });
      const scale = width / base.width; const css = page.getViewport({ scale });
      const r = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4_000_000 / (css.width * css.height))); // keep each page under ~4 million pixels
      const vp = page.getViewport({ scale: scale * r });
      const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.width = '100%'; c.style.height = '100%'; c.style.display = 'block';
      el.appendChild(c);
      const task = page.render({ canvasContext: c.getContext('2d')!, viewport: vp }); tasks.set(n, task);
      try { await task.promise; } catch { /* cleared while drawing */ } finally { tasks.delete(n); }
    };
    const clear = (el: HTMLDivElement, n: number) => { tasks.get(n)?.cancel?.(); const c = el.querySelector('canvas'); if (c) { c.width = 0; c.height = 0; c.remove(); } };
    const near = new IntersectionObserver((entries) => {
      for (const e of entries) { const el = e.target as HTMLDivElement; const n = Number(el.dataset.page); if (e.isIntersecting) draw(el, n); else clear(el, n); }
    }, { root, rootMargin: '1200px 0px' });
    const seen = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.page));
      if (vis.length) setCurrent(Math.min(...vis));
    }, { root, threshold: 0.5 });
    const els = Array.from(host.current.querySelectorAll<HTMLDivElement>('[data-page]'));
    els.forEach((el) => { near.observe(el); seen.observe(el); });
    return () => { near.disconnect(); seen.disconnect(); els.forEach((el, i) => clear(el, i + 1)); };
  }, [sizes, width]);
  if (err) return <div className="p-4"><ErrorBox error={new Error(err)} /></div>;
  return (
    <div ref={host} className="p-4">
      {!sizes ? <Spinner className="mx-auto my-10 size-8" /> : sizes.map((sz, i) => (
        <div key={i} data-page={i + 1} aria-label={`Page ${i + 1}`} className="mx-auto mb-4 bg-white shadow" style={{ width, height: Math.round((width * sz.h) / sz.w) }} />
      ))}
      {sizes && sizes.length > 1 && <div className="pointer-events-none sticky bottom-3 z-30 flex justify-center"><span className="rounded-full bg-slate-900/80 px-3 py-1 text-sm font-semibold text-white shadow">Page {current} / {sizes.length}</span></div>}
    </div>
  );
}

/** Flash (SWF) resources play with the built-in Flash player (Ruffle) — nothing to install, nothing to download. */
function SwfPlayer({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let player: any; let cancelled = false;
    const start = () => {
      if (cancelled || !host.current) return;
      const R = (window as any).RufflePlayer; if (!R?.newest) { setErr('The Flash player could not start'); return; }
      player = R.newest().createPlayer(); player.style.width = '100%'; player.style.height = '100%';
      host.current.appendChild(player); player.load({ url, autoplay: 'on', unmuteOverlay: 'hidden', splashScreen: false, contextMenu: 'off', letterbox: 'on', allowScriptAccess: false, openUrlMode: 'deny' }).catch(() => setErr('This Flash file could not be played'));
    };
    const w = window as any; w.RufflePlayer = w.RufflePlayer || {}; w.RufflePlayer.config = { publicPath: '/api/ruffle/', polyfills: false, autoplay: 'on', warnOnUnsupportedContent: false };
    if (w.RufflePlayer.newest) start();
    else { const sc = document.createElement('script'); sc.src = '/api/ruffle/ruffle.js'; sc.onload = start; sc.onerror = () => setErr('The Flash player could not be loaded'); document.head.appendChild(sc); }
    return () => { cancelled = true; try { player?.remove(); } catch { /* ignore */ } };
  }, [url]);
  return <div className="absolute inset-0 bg-black">{err ? <p className="m-6 rounded-lg bg-white p-4 text-sm text-slate-700">{err}</p> : <div ref={host} className="size-full" />}</div>;
}

/** PowerPoint (.pptx) slides and Word (.docx) documents, drawn inside the platform. */
function OfficeDoc({ url, kind }: { url: string; kind: 'pptx' | 'docx' }) {
  const [res, setRes] = useState<{ html: string; count?: number } | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let urls: string[] = []; let cancelled = false;
    (async () => {
      const r = await fetch(url, { credentials: 'include' }); if (!r.ok) throw new Error('The file could not be opened');
      const out = kind === 'pptx' ? await renderPptx(await r.arrayBuffer()) : await renderDocx(await r.arrayBuffer());
      urls = out.urls; if (!cancelled) setRes(out);
    })().catch((e) => !cancelled && setErr(e?.message ?? 'The file could not be shown'));
    return () => { cancelled = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [url, kind]);
  if (err) return <p className="m-6 rounded-lg bg-white p-4 text-sm text-slate-700">{err}</p>;
  if (!res) return <Spinner className="mx-auto my-10 size-8" />;
  return (
    <div className="mx-auto max-w-5xl p-4">
      {kind === 'pptx' && <p className="mb-3 text-center text-xs text-slate-500">{res.count} slide{res.count === 1 ? '' : 's'} · simplified preview (animations and charts are not shown)</p>}
      <div dangerouslySetInnerHTML={{ __html: res.html }} />
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = use(params);
  return <Suspense fallback={<PageLoader />}><Viewer assetId={assetId} /></Suspense>;
}
