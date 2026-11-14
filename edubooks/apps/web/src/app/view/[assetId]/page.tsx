'use client';
import { Suspense, use, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { ErrorBox, PageLoader, Spinner } from '@/components/ui';
import { ContentGuard } from '@/components/content-guard';
import { fetchPdf, type FileLink } from '@/lib/protected-pdf';

/** View-only viewer: resources are shown inside the platform, never handed over as a file. */
function Viewer({ assetId }: { assetId: string }) {
  const p = useSearchParams(); const title = p.get('t') ?? 'Resource'; const ext = (p.get('e') ?? '').toLowerCase();
  const [link, setLink] = useState<FileLink | null>(null); const [err, setErr] = useState<unknown>(null); const url = link?.url ?? null;
  useEffect(() => { api.get<FileLink>(`/assets/${assetId}/link`).then(setLink).catch(setErr); }, [assetId]);
  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <button onClick={() => history.back()} className="focus-ring rounded-lg p-2 hover:bg-slate-100" aria-label="Back"><ArrowLeft className="size-5" /></button>
        <h1 className="min-w-0 flex-1 truncate font-semibold text-slate-900">{title}</h1>
      </header>
      <main className="relative min-h-0 flex-1 overflow-auto">
        {err ? <div className="p-6"><ErrorBox error={err} /></div> : !url ? <PageLoader /> : (
          <ContentGuard className="min-h-full" fixed>
            {ext === 'pdf' ? <PdfPages link={link!} />
              : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? <div className="grid min-h-full place-items-center p-4"><img src={url!} alt={title} draggable={false} className="max-h-[85vh] max-w-full rounded shadow-lg" /></div>
              : ['mp3', 'wav', 'm4a', 'ogg'].includes(ext) ? <div className="grid min-h-full place-items-center p-6"><audio src={url} controls controlsList="nodownload noplaybackrate" className="w-full max-w-xl" /></div>
              : ['mp4', 'webm', 'mov'].includes(ext) ? <div className="grid min-h-full place-items-center p-4"><video src={url} controls controlsList="nodownload" disablePictureInPicture className="max-h-[85vh] max-w-full rounded bg-black" /></div>
              : ['html', 'htm'].includes(ext) ? <iframe src={url} title={title} sandbox="allow-scripts allow-forms" className="absolute inset-0 size-full border-0 bg-white" />
              : <p className="m-auto max-w-md p-8 text-center text-slate-700">This kind of file (.{ext || '?'}) cannot be shown inside the platform. Please ask the publisher for a PDF version.</p>}
          </ContentGuard>)}
      </main>
    </div>
  );
}

function PdfPages({ link }: { link: FileLink }) {
  const host = useRef<HTMLDivElement>(null); const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    let doc: any; let cancelled = false;
    (async () => {
      const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      doc = await pdfjs.getDocument({ data: new Uint8Array(await fetchPdf(link)), isEvalSupported: false }).promise;
      const width = Math.min((host.current?.clientWidth ?? 900) - 32, 1000);
      for (let i = 1; i <= doc.numPages && !cancelled; i++) {
        const page = await doc.getPage(i); const base = page.getViewport({ scale: 1 }); const vp = page.getViewport({ scale: width / base.width });
        const c = document.createElement('canvas'); const r = window.devicePixelRatio || 1;
        c.width = vp.width * r; c.height = vp.height * r; c.style.width = `${vp.width}px`; c.style.height = `${vp.height}px`; c.className = 'mx-auto mb-4 block bg-white shadow';
        host.current?.appendChild(c);
        await page.render({ canvasContext: c.getContext('2d')!, viewport: vp, transform: r !== 1 ? [r, 0, 0, r, 0, 0] : undefined }).promise;
        if (i === 1) setLoading(false);
      }
      setLoading(false);
    })().catch((e) => { if (!cancelled) { setErr(e?.message ?? 'Could not open the file'); setLoading(false); } });
    return () => { cancelled = true; doc?.destroy(); };
  }, [link]);
  return <div ref={host} className="p-4">{loading && <Spinner className="mx-auto my-10 size-8" />}{err && <ErrorBox error={new Error(err)} />}</div>;
}

export default function Page({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = use(params);
  return <Suspense fallback={<PageLoader />}><Viewer assetId={assetId} /></Suspense>;
}
