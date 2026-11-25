'use client';
import { FeedbackEditor } from '@/components/classroom';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, Dialog, EmptyState, ErrorBox, PageLoader, Select, Textarea, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/common';
import { VoicePlayer } from '@/components/voice';

type Work = { id: string; kind: 'TRACE' | 'DRAW' | 'READ'; page: number; stars: number | null; comment: string; verdict: 'OK' | 'REDO' | null; audioId: string | null; hasImage: boolean; seenAt: string | null; createdAt: string; student: string; part: string | null; book: string | null; element: string | null };

/** Tracing and drawing that students sent from book pages, with a comment and stars from the teacher. */
export function BookWorkPage() {
  const classes = useQuery({ queryKey: ['compareClasses'], queryFn: () => api.get<any[]>('/compare/classes') });
  const [classId, setClassId] = useState('');
  const q = useQuery({ queryKey: ['book-work', classId], queryFn: () => api.get<Work[]>(`/reader/work${classId ? `?classId=${classId}` : ''}`) });
  const [open, setOpen] = useState<Work | null>(null);
  const mine = (classes.data ?? []).filter((c) => c.mine);
  return (
    <div className="space-y-6">
      <PageHeader title="Book work" sub="Tracing, drawings and read-aloud recordings your students sent from the pages of their books. Open one to look or listen, give stars, answer “well done” or “do it again” and write a comment — the student sees it." />
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="text-sm font-medium text-slate-700">Class</span>
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-60"><option value="">All my classes</option>{mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <span className="text-sm text-slate-500">{q.data ? `${q.data.length} sent · ${q.data.filter((w) => !w.seenAt).length} new` : ''}</span>
      </Card>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : !q.data.length ? <EmptyState icon="🖍️" title="Nothing sent yet">When students trace or draw on a book page and press “Send to teacher”, it shows here.</EmptyState> : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">{q.data.map((w) => (
          <button key={w.id} onClick={() => setOpen(w)} className={cn('focus-ring overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-slate-200 transition hover:shadow-md', !w.seenAt && 'ring-2 ring-violet-400')}>
            {w.kind === 'READ' ? <div className="grid h-36 w-full place-items-center bg-gradient-to-br from-amber-50 to-rose-50 text-5xl">🎤</div>
              : <img src={`/api/reader/work/${w.id}/image`} alt={`${w.student}'s ${w.kind === 'DRAW' ? 'drawing' : 'tracing'}`} loading="lazy" className="h-36 w-full bg-slate-50 object-contain" />}
            <div className="space-y-1 p-3 text-sm">
              <div className="flex items-center gap-2"><b className="flex-1 truncate text-slate-900">{w.student}</b>{!w.seenAt && <Badge tone="info">New</Badge>}
                {w.verdict === 'OK' && <Badge tone="PUBLISHED">✅ Good</Badge>}{w.verdict === 'REDO' && <Badge tone="DRAFT">🔁 Again</Badge>}</div>
              <p className="truncate text-slate-600">{w.kind === 'DRAW' ? '🖍️' : w.kind === 'READ' ? '🎤' : '✍️'} {w.element || (w.kind === 'DRAW' ? 'Drawing' : w.kind === 'READ' ? 'Read aloud' : 'Tracing')} · {w.book ?? ''} p.{w.page}</p>
              <p className="text-xs text-slate-500">{new Date(w.createdAt).toLocaleString()}{w.stars !== null ? ` · ${'⭐'.repeat(w.stars) || '0 ⭐'}` : ''}{w.comment ? ' · 💬' : ''}</p>
            </div>
          </button>))}</div>)}
      {open && <WorkDialog w={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function WorkDialog({ w, onClose }: { w: Work; onClose: () => void }) {
  const [comment, setComment] = useState(w.comment); const [stars, setStars] = useState<number | null>(w.stars); const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<'OK' | 'REDO' | null>(w.verdict);
  const qc = useQueryClient(); const toast = useToast();
  const save = async () => {
    setBusy(true);
    try { await api.patch(`/reader/work/${w.id}`, { comment, ...(stars !== null ? { stars } : {}), ...(verdict ? { verdict } : {}) }); toast('Saved — the student can see your comment'); qc.invalidateQueries({ queryKey: ['book-work'] }); onClose(); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose} wide title={`${w.student} — ${w.element || (w.kind === 'DRAW' ? 'Drawing' : 'Tracing')}`} description={`${w.book ?? ''}${w.part ? ` · ${w.part}` : ''} · page ${w.page} · sent ${new Date(w.createdAt).toLocaleString()}`}>
      <div className="space-y-4">
        {w.kind === 'READ' ? (w.audioId ? <div className="rounded-2xl bg-amber-50 p-6"><p className="mb-2 text-sm font-medium text-slate-700">🎤 Listen to the reading</p><VoicePlayer id={w.audioId} big /></div>
            : <p className="text-slate-500">The recording was removed.</p>)
          : <img src={`/api/reader/work/${w.id}/image`} alt="Student's work" className="mx-auto max-h-[55vh] rounded-xl bg-slate-50 object-contain ring-1 ring-slate-200" />}
        <FeedbackEditor kind="page-work" targetId={w.id} />
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-slate-700">Your answer</span>
          <button type="button" onClick={() => setVerdict('OK')} className={cn('rounded-lg px-3 py-1.5 text-sm font-bold', verdict === 'OK' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800')}>✅ Well done</button>
          <button type="button" onClick={() => setVerdict('REDO')} className={cn('rounded-lg px-3 py-1.5 text-sm font-bold', verdict === 'REDO' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-900')}>🔁 Do it again</button></div>
        <div className="flex items-center gap-2"><span className="text-sm font-medium text-slate-700">Stars</span>
          {[0, 1, 2, 3].map((n) => <button key={n} type="button" onClick={() => setStars(n)} className={cn('rounded-lg px-2.5 py-1 text-sm', stars === n ? 'bg-amber-100 font-bold ring-2 ring-amber-400' : 'bg-slate-100')}>{n ? '⭐'.repeat(n) : '0'}</button>)}</div>
        <Textarea rows={3} maxLength={500} placeholder="Well done! Next time start from the top…" value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} onClick={save}>Save comment</Button></div>
      </div>
    </Dialog>
  );
}
