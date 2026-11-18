'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { loadPdf } from '@/components/reader';
import type { FileLink } from '@/lib/protected-pdf';
import { Spinner, cn } from '@/components/ui';

/** "1-5, 10-15, 20" ⇄ page numbers. */
export function parsePageList(t: string): number[] {
  const out = new Set<number>();
  for (const part of t.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d{1,4})(?:-|–)?(\d{1,4})?$/.exec(part); if (!m) continue;
    const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a;
    for (let p = a; p <= b && p - a < 200; p++) if (p > 0) out.add(p);
  }
  return [...out].sort((x, y) => x - y);
}
export function pageListText(n: number[]) {
  const s = [...new Set(n)].sort((x, y) => x - y); const r: string[] = [];
  for (let i = 0; i < s.length; i++) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++; r.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`); i = j; }
  return r.join(', ');
}

async function draw(d: any, n: number, canvas: HTMLCanvasElement, width: number) {
  const page = await d.getPage(n); const base = page.getViewport({ scale: 1 }); const r = Math.min(window.devicePixelRatio || 1, 2);
  const vp = page.getViewport({ scale: (width * r) / base.width });
  canvas.width = vp.width; canvas.height = vp.height; canvas.style.width = `${width}px`; canvas.style.height = `${(width * base.height) / base.width}px`;
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
}

function Thumb({ d, n, on, focus, onClick }: { d: any; n: number; on: boolean; focus: boolean; onClick: (e: React.MouseEvent) => void }) {
  const ref = useRef<HTMLButtonElement>(null); const cv = useRef<HTMLCanvasElement>(null); const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !drawn && cv.current) { setDrawn(true); draw(d, n, cv.current, 84).catch(() => undefined); } }, { rootMargin: '300px' });
    io.observe(el); return () => io.disconnect();
  }, [d, n, drawn]);
  return (
    <button ref={ref} type="button" onClick={onClick} aria-pressed={on} aria-label={`Page ${n}${on ? ', chosen' : ''}`}
      className={cn('relative shrink-0 rounded-lg border-2 bg-white p-1 transition', on ? 'border-brand-600 ring-2 ring-brand-200' : focus ? 'border-slate-400' : 'border-transparent hover:border-slate-300')}>
      <canvas ref={cv} className="block min-h-[100px] w-[84px] rounded bg-slate-100" />
      <span className={cn('mt-1 block text-center text-xs font-semibold', on ? 'text-brand-700' : 'text-slate-600')}>{on ? '✓ ' : ''}{n}</span>
    </button>
  );
}

/**
 * Pages of a book part: a large preview of the page in focus, and a strip of all pages from page 1.
 * Click a page to choose it (or remove it); Shift+click chooses every page between. Typing “1-5, 10-15” works too.
 */
export function PagePicker({ componentId, value, onChange }: { componentId: string; value: string; onChange: (v: string) => void }) {
  const [doc, setDoc] = useState<any>(null); const [err, setErr] = useState(''); const [focus, setFocus] = useState(1); const last = useRef<number | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let off = false; setDoc(null); setErr('');
    const get = () => api.get<FileLink>(`/reader/components/${componentId}/pdf`);
    get().then((l) => loadPdf(l, get)).then((d) => { if (!off) { setDoc(d); setFocus(parsePageList(value)[0] ?? 1); } }).catch((e) => !off && setErr(e?.message ?? 'The pages could not be opened'));
    return () => { off = true; };
  }, [componentId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (doc && preview.current && focus >= 1 && focus <= doc.numPages) draw(doc, focus, preview.current, 300).catch(() => undefined); }, [doc, focus]);
  const chosen = parsePageList(value).filter((p) => !doc || p <= doc.numPages);
  const click = (n: number, e: React.MouseEvent) => {
    setFocus(n);
    let next: number[];
    if (e.shiftKey && last.current) { const [a, b] = [Math.min(last.current, n), Math.max(last.current, n)]; next = [...chosen, ...Array.from({ length: b - a + 1 }, (_, k) => a + k)]; }
    else next = chosen.includes(n) ? chosen.filter((p) => p !== n) : [...chosen, n];
    last.current = n; onChange(pageListText(next.slice(0, 200)));
  };
  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!doc) return <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><Spinner className="size-4" />Opening the book pages…</div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2"><canvas ref={preview} className="block rounded bg-white shadow-sm" aria-label={`Preview of page ${focus}`} /></div>
        <div className="min-w-48 flex-1 space-y-2 text-sm">
          <p className="text-lg font-semibold text-slate-900">Page {focus} <span className="text-sm font-normal text-slate-500">of {doc.numPages}</span></p>
          <div className="flex gap-2">
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40" disabled={focus <= 1} onClick={() => setFocus(focus - 1)}>← Previous</button>
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40" disabled={focus >= doc.numPages} onClick={() => setFocus(focus + 1)}>Next →</button>
            <button type="button" className={cn('rounded-lg px-3 py-1.5 font-semibold', chosen.includes(focus) ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700')} onClick={(e) => click(focus, e)}>{chosen.includes(focus) ? '✓ Chosen' : '+ Choose this page'}</button>
          </div>
          <p className="text-slate-600">Chosen: <b>{chosen.length ? pageListText(chosen) : 'none yet'}</b>{chosen.length ? ` (${chosen.length} page${chosen.length === 1 ? '' : 's'})` : ''}</p>
          <p className="text-xs text-slate-500">Click pages below to choose them. Hold <b>Shift</b> and click to choose all pages in between (e.g. 1 then Shift+5 = pages 1–5). Up to 30 pages.</p>
          {chosen.length > 0 && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => onChange('')}>Clear all</button>}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto rounded-xl bg-slate-50 p-2" role="group" aria-label="Book pages">
        {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => <Thumb key={n} d={doc} n={n} on={chosen.includes(n)} focus={focus === n} onClick={(e) => click(n, e)} />)}
      </div>
    </div>
  );
}
