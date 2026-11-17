'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RefreshCw, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { loadPdf } from '@/components/reader';
import type { FileLink } from '@/lib/protected-pdf';
import { Button, Field, Input, Select, Spinner, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { QTYPE_LABEL } from '@/lib/lms';
import type { Item } from '@/components/item-editor';

const TYPES: [string, string][] = [['FILL_BLANK', 'Fill in the blank'], ['MCQ', 'Multiple choice'], ['TRUE_FALSE', 'True / false'], ['SHORT', 'Short answer']];

/** Shows one page of the book (from the platform's own protected copy). */
function PagePreview({ componentId, page, onPages }: { componentId: string; page: number; onPages: (n: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null); const doc = useRef<{ id: string; d: any } | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none' | 'error'>('loading');
  useEffect(() => {
    let cancelled = false; setState('loading');
    (async () => {
      try {
        if (doc.current?.id !== componentId) {
          const link = await api.get<FileLink>(`/reader/components/${componentId}/pdf`);
          doc.current = { id: componentId, d: await loadPdf(link, () => api.get<FileLink>(`/reader/components/${componentId}/pdf`)) }; onPages(doc.current.d.numPages);
        }
        const d = doc.current.d; if (page < 1 || page > d.numPages) { if (!cancelled) setState('none'); return; }
        const pg = await d.getPage(page); const base = pg.getViewport({ scale: 1 }); const r = window.devicePixelRatio || 1;
        const vp = pg.getViewport({ scale: (300 * r) / base.width }); const c = canvas.current; if (!c || cancelled) return;
        c.width = vp.width; c.height = vp.height; c.style.width = '300px'; c.style.height = `${(300 * base.height) / base.width}px`;
        await pg.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise; if (!cancelled) setState('ok');
      } catch { if (!cancelled) setState('error'); }
    })();
    return () => { cancelled = true; };
  }, [componentId, page]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative grid min-h-[200px] w-[300px] place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvas} className={cn('select-none', state !== 'ok' && 'hidden')} aria-label={`Book page ${page}`} />
      {state === 'loading' && <Spinner className="size-6" />}
      {state === 'none' && <p className="p-4 text-center text-sm text-slate-500">This part has no page {page}.</p>}
      {state === 'error' && <p className="p-4 text-center text-sm text-slate-500">The page could not be shown (no book pages uploaded for this part?).</p>}
    </div>
  );
}

/**
 * Teacher picks a page of the book, sees it, and gets questions made from the text on that page by the built-in
 * question maker (free, unlimited, nothing leaves the platform). The page can be linked to the assignment.
 */
export function PageQuestionsPanel({ editionId, initial, onAdd }: { editionId: string; initial?: { componentId?: string | null; page?: number | null }; onAdd: (items: Item[], ref: { componentId: string; page: number } | null) => void }) {
  const toast = useToast();
  const book = useQuery({ queryKey: ['reader', editionId], queryFn: () => api.get<any>(`/reader/editions/${editionId}`) });
  const parts: any[] = (book.data?.components ?? []).filter((c: any) => c.hasPdf);
  const [comp, setComp] = useState(initial?.componentId ?? ''); const [page, setPage] = useState(initial?.page ?? 1); const [pages, setPages] = useState(0);
  const [count, setCount] = useState(5); const [types, setTypes] = useState<string[]>(['FILL_BLANK', 'MCQ', 'TRUE_FALSE']);
  const [res, setRes] = useState<any>(null); const [pick, setPick] = useState<number[]>([]); const [busy, setBusy] = useState(false); const [seed, setSeed] = useState(0); const [link, setLink] = useState(true);
  useEffect(() => { if (!comp && parts[0]) setComp(parts[0].id); }, [parts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const make = async (s = seed) => {
    setBusy(true);
    try { const r = await api.post<any>('/ai/page-questions', { editionId, componentId: comp, page, count, types, seed: s }); setRes(r); setPick(r.items.map((_: any, i: number) => i)); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const toItem = (q: any): Item => ({ type: q.type, prompt: q.prompt, options: q.type === 'MCQ' ? q.options : [], answer: q.answer, points: q.points ?? 1 });
  if (book.isLoading) return <Spinner className="m-6 size-6" />;
  if (!parts.length) return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This book has no pages uploaded yet, so there is nothing to make questions from.</p>;
  const items: any[] = res?.items ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="space-y-2">
          <PagePreview componentId={comp || parts[0].id} page={page} onPages={setPages} />
          <div className="flex items-center justify-center gap-2 text-sm">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => { setPage(page - 1); setRes(null); }} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
            <span className="font-medium">Page {page}{pages ? ` / ${pages}` : ''}</span>
            <Button size="sm" variant="ghost" disabled={!!pages && page >= pages} onClick={() => { setPage(page + 1); setRes(null); }} aria-label="Next page"><ChevronRight className="size-4" /></Button>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {parts.length > 1 && <Field label="Book part" className="sm:col-span-3"><Select value={comp} onChange={(e) => { setComp(e.target.value); setPage(1); setRes(null); }}>{parts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>}
            <Field label="Page number"><Input type="number" min={1} max={pages || 5000} value={page} onChange={(e) => { setPage(Math.max(1, Number(e.target.value) || 1)); setRes(null); }} /></Field>
            <Field label="How many questions"><Input type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} /></Field>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kinds of question">
            {TYPES.map(([k, l]) => <button key={k} type="button" aria-pressed={types.includes(k)} onClick={() => setTypes(types.includes(k) ? types.filter((x) => x !== k) : [...types, k])}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold ring-1', types.includes(k) ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-700 ring-slate-200')}>{l}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => make()} loading={busy} disabled={!types.length}><Wand2 className="size-4" />Make questions from page {page}</Button>
            {res && <Button variant="secondary" onClick={() => { const s = seed + 1; setSeed(s); make(s); }} disabled={busy}><RefreshCw className="size-4" />Make new questions</Button>}
          </div>
          <p className="text-xs text-slate-500">Made by the platform’s built-in question maker from the words on this page — free and unlimited. Check each question before you use it.</p>
        </div>
      </div>
      {res && (
        <div className="space-y-2">
          {(res.warnings ?? []).map((w: string) => <p key={w} className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{w}</p>)}
          {items.length > 0 && <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {items.map((it, i) => (
              <li key={i}><label className="flex items-start gap-3 p-3 text-sm"><input type="checkbox" className="mt-1" checked={pick.includes(i)} onChange={(e) => setPick(e.target.checked ? [...pick, i] : pick.filter((x) => x !== i))} />
                <span className="min-w-0"><span className="font-medium text-slate-900">{i + 1}. {it.prompt}</span>
                  <span className="block text-xs text-slate-500">{QTYPE_LABEL[it.type] ?? it.type}{it.type === 'MCQ' ? ` · ${it.options.map((x: string, k: number) => (it.answer?.[0] === k ? `✔ ${x}` : x)).join(' · ')}` : it.type === 'TRUE_FALSE' ? ` · answer: ${it.answer?.[0] ? 'True' : 'False'}` : it.answer?.length ? ` · answer: ${it.answer.join(' / ')}` : ''}</span></span></label></li>))}
          </ul>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />📖 Link page {page} to this assignment (students get an “Open page {page}” button)</label>
          <div className="flex justify-end"><Button disabled={!pick.length} onClick={() => onAdd(pick.sort((a, b) => a - b).map((i) => toItem(items[i])), link ? { componentId: comp, page } : null)}>Add {pick.length || ''} question{pick.length === 1 ? '' : 's'} to the sheet</Button></div>
        </div>
      )}
    </div>
  );
}
