'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import type { FileLink } from '@/lib/protected-pdf';
import { Button, Dialog, ErrorBox, Input, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { loadPdf } from '@/components/reader';

type Mark = { id: string; title: string; number: number; pageStart: number | null; pageEnd: number | null; unitId: string; unitNumber: number; unitTitle: string; firstInUnit: boolean };

function Thumb({ doc, n, onPick, marks, active }: { doc: any; n: number; onPick: () => void; marks: Mark[]; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null); const box = useRef<HTMLButtonElement>(null); const [seen, setSeen] = useState(false);
  useEffect(() => { const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '200px' }); if (box.current) io.observe(box.current); return () => io.disconnect(); }, []);
  useEffect(() => {
    if (!seen) return; let cancelled = false;
    doc.getPage(n).then(async (p: any) => { if (cancelled || !ref.current) return; const vp = p.getViewport({ scale: 120 / p.getViewport({ scale: 1 }).width }); const c = ref.current; c.width = vp.width; c.height = vp.height; await p.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise.catch(() => undefined); });
    return () => { cancelled = true; };
  }, [seen, doc, n]);
  const here = marks.filter((m) => m.pageStart === n);
  return (
    <button ref={box} type="button" onClick={onPick} className={cn('relative flex flex-col items-center gap-1 rounded-lg p-1.5 text-xs hover:bg-slate-100', active && 'bg-brand-50 ring-2 ring-brand-500')}>
      <canvas ref={ref} className="w-[120px] bg-white shadow ring-1 ring-slate-200" style={{ minHeight: 80 }} />
      <span className="text-slate-600">Page {n}</span>
      {here.map((m) => <span key={m.id} className={cn('absolute left-1 right-1 top-1 truncate rounded px-1 py-0.5 text-[10px] font-bold text-white shadow', m.firstInUnit ? 'bg-violet-600' : 'bg-emerald-600')}>
        {m.firstInUnit ? `Unit ${m.unitNumber}` : `Lesson ${m.number}`}: {m.title}</span>)}
    </button>
  );
}

/** Make the index by hand: click a page and mark where a unit or a lesson starts (or let the AI find them). */
export function IndexMaker({ componentId, title, onClose }: { componentId: string; title: string; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [doc, setDoc] = useState<any>(null); const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    let d: any; let cancelled = false;
    api.get<FileLink>(`/reader/components/${componentId}/pdf`).then((link) => loadPdf(link, () => api.get<FileLink>(`/reader/components/${componentId}/pdf`)))
      .then((x) => { d = x; if (!cancelled) setDoc(x); }).catch((e) => setErr(e));
    return () => { cancelled = true; d?.destroy?.(); };
  }, [componentId]);
  const marks = useQuery({ queryKey: ['marks', componentId], queryFn: () => api.get<Mark[]>(`/ai/contents/components/${componentId}/marks`) });
  const list = marks.data ?? [];
  const [pick, setPick] = useState<number | null>(null); const [kind, setKind] = useState<'UNIT' | 'LESSON'>('UNIT'); const [t, setT] = useState(''); const [busy, setBusy] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['marks', componentId] }); ['edition', 'package'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };
  const save = async () => {
    if (!pick || !t.trim()) return; setBusy(true);
    try { await api.post(`/ai/contents/components/${componentId}/marks`, { kind, page: pick, title: t.trim() }); toast(`${kind === 'UNIT' ? 'Unit' : 'Lesson'} starts on page ${pick}`); setPick(null); setT(''); refresh(); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const remove = async (m: Mark) => { try { await api.del(`/ai/contents/components/${componentId}/marks/${m.id}`); refresh(); } catch (e: any) { toast(e.message, 'err'); } };
  const ai = async () => { try { await api.post(`/ai/contents/components/${componentId}/find`); toast('The AI is reading the pages — the result appears under “Contents from the pages”. Close this window to see it.'); refresh(); } catch (e: any) { toast(e.message, 'err'); } };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} wide title={`📑 Index of “${title}”`} description="Click a page, then say what starts there. Each lesson ends where the next one starts.">
      <div className="flex max-h-[70vh] gap-4 max-md:flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-slate-50 p-2">
          {err ? <ErrorBox error={err} /> : !doc ? <p className="p-6 text-center text-slate-500">Opening the book…</p> : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-1">
              {Array.from({ length: doc.numPages }, (_, i) => <Thumb key={i} doc={doc} n={i + 1} marks={list} active={pick === i + 1} onPick={() => { setPick(i + 1); setT(''); }} />)}
            </div>)}
        </div>
        <div className="w-80 shrink-0 space-y-3 overflow-y-auto max-md:w-full">
          {pick ? (
            <div className="space-y-2 rounded-xl border-2 border-brand-300 bg-brand-50 p-3">
              <p className="font-bold text-slate-900">Page {pick}</p>
              <div className="grid grid-cols-2 gap-2">{([['UNIT', '📘 A unit starts here'], ['LESSON', '📗 A lesson starts here']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={cn('rounded-lg border-2 px-2 py-2 text-sm font-medium', kind === k ? 'border-brand-600 bg-white' : 'border-transparent bg-white/60')}>{l}</button>))}</div>
              <Input autoFocus placeholder={kind === 'UNIT' ? 'Unit title, e.g. My Family' : 'Lesson title, e.g. Hello!'} value={t} maxLength={120} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
              <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setPick(null)}>Cancel</Button><Button size="sm" loading={busy} disabled={!t.trim()} onClick={save}>Save</Button></div>
            </div>
          ) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">👈 Click the page where a unit or a lesson begins.</p>}
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center gap-2"><b className="flex-1 text-slate-900">The index</b><Button size="sm" variant="secondary" onClick={ai}>✨ Find with AI</Button></div>
            {!list.length ? <p className="text-sm text-slate-500">Nothing marked yet.</p> : (
              <ul className="space-y-1 text-sm">{list.map((m) => (
                <li key={m.id} className="flex items-start gap-2">
                  <button type="button" onClick={() => setPick(m.pageStart)} className="min-w-0 flex-1 text-left">
                    {m.firstInUnit && <span className="block font-bold text-violet-800">Unit {m.unitNumber}: {m.unitTitle}</span>}
                    <span className="block truncate pl-3 text-slate-700">Lesson {m.number}: {m.title} <span className="text-slate-500">· p.{m.pageStart ?? '?'}{m.pageEnd && m.pageEnd !== m.pageStart ? `–${m.pageEnd}` : ''}</span></span>
                  </button>
                  <button type="button" onClick={() => remove(m)} aria-label={`Remove ${m.title}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><X className="size-4" /></button>
                </li>))}</ul>)}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
