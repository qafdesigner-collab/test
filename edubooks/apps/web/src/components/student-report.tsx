'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Star, Trash2 } from 'lucide-react';
import { api, fmtDay } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { KIND_LABEL } from '@/lib/lms';
import { Button, Dialog, Field, Input, PageLoader, Select } from '@/components/ui';
import { Status } from '@/components/common';
import { ReportCardsDialog } from '@/components/print-dialogs';

const SKILLS = ['Listening', 'Speaking', 'Reading', 'Writing', 'Numbers', 'Creativity', 'Participation', 'Behaviour'];
export const Stars = ({ n }: { n: number }) => <span className="inline-flex" aria-label={`${n} of 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`size-4 ${i <= n ? 'fill-amber-400 text-amber-400' : 'text-slate-500'}`} />)}</span>;

/** Report card for one student + add skill evaluations (teachers / admins). */
export function StudentReportDialog({ studentId, classId, onClose }: { studentId: string; classId?: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['report', studentId], queryFn: () => api.get(`/teacher/students/${studentId}/report`) });
  const [f, setF] = useState({ skill: SKILLS[0], rating: 4, term: 'Term 1', remarks: '' });
  const add = useAction(() => api.post('/teacher/evaluations', { ...f, studentId, classId }), { ok: 'Evaluation saved', keys: ['report'] });
  const del = useAction((id: string) => api.del(`/teacher/evaluations/${id}`), { ok: 'Removed', keys: ['report'] });
  const r = q.data;
  const [printing, setPrinting] = useState(false);
  return (
    <Dialog open onOpenChange={onClose} wide title={r ? `Report — ${r.student.displayName}` : 'Report'}>
      {!r ? <PageLoader /> : (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap gap-2">{r.bySubject.map((b: any) => <span key={b.subject} className="rounded-lg bg-slate-100 px-3 py-1.5"><b>{b.subject}</b> {b.percent}%</span>)}
            {!r.bySubject.length && <span className="text-slate-500">No marked work yet.</span>}<span className="flex-1" /><Button size="sm" variant="secondary" onClick={() => setPrinting(true)}><Printer className="size-4" />Print report card</Button></div>
          <div><h3 className="mb-2 font-semibold">Skill evaluations</h3>
            <ul className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200">{r.evaluations.map((v: any) => (
              <li key={v.id} className="flex items-center gap-3 px-3 py-2"><span className="w-28 font-medium">{v.skill}</span><Stars n={v.rating} /><span className="text-xs text-slate-500">{v.term}</span>
                <span className="flex-1 truncate text-slate-600">{v.remarks}</span><span className="text-xs text-slate-500">{v.teacher}</span>
                {v.mine && <button aria-label="Remove evaluation" onClick={() => del.mutate(v.id)} className="text-slate-500 hover:text-red-500"><Trash2 className="size-4" /></button>}</li>))}
              {!r.evaluations.length && <li className="px-3 py-3 text-slate-500">No evaluations yet.</li>}</ul>
            <form className="grid gap-2 sm:grid-cols-[140px_120px_110px_1fr_auto]" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
              <Select aria-label="Skill" value={f.skill} onChange={(e) => setF({ ...f, skill: e.target.value })}>{SKILLS.map((s) => <option key={s}>{s}</option>)}</Select>
              <Select aria-label="Rating" value={f.rating} onChange={(e) => setF({ ...f, rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</Select>
              <Input aria-label="Term" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} />
              <Input aria-label="Remarks" placeholder="Remarks" value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
              <Button loading={add.isPending}>Add</Button>
            </form></div>
          <div><h3 className="mb-2 font-semibold">Homework & tests</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{r.work.map((x: any) => (
              <li key={x.id} className="flex items-center gap-3 px-3 py-2"><span className="flex-1"><b>{x.title}</b><span className="block text-xs text-slate-500">{KIND_LABEL[x.kind]}{x.lesson && ` · Unit ${x.unitNumber} · Lesson ${x.lessonNumber}: ${x.lesson}`}{x.dueAt && ` · due ${fmtDay(x.dueAt)}`}</span></span>
                {x.status ? <Status s={x.status} /> : <span className="text-xs text-red-500">missing</span>}<span className="w-16 text-right tabular-nums">{x.score ?? '—'}{x.maxScore ? ` / ${x.maxScore}` : ''}</span></li>))}</ul></div>
        </div>
      )}
      {printing && <ReportCardsDialog studentIds={[studentId]} onClose={() => setPrinting(false)} />}
    </Dialog>
  );
}
