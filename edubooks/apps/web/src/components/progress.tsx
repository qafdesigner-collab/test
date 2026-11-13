'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Dialog, Field, Input, PageLoader, Textarea, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const LINE = '#6857cf';   // one series: the term score
const GRID = '#e2e8f0';
const INK2 = '#475569';

/** A student's score and class position per term (Term 1 → 2 → 3 → Final), built automatically; the teacher can adjust it. */
export function ProgressPanel({ classId, studentId }: { classId: string; studentId: string }) {
  const q = useQuery({ queryKey: ['progress', classId, studentId], queryFn: () => api.get<any>(`/teacher/classes/${classId}/students/${studentId}/progress`) });
  const [edit, setEdit] = useState<any>(null); const [hover, setHover] = useState<number | null>(null);
  if (q.error) return null;
  if (!q.data) return <PageLoader />;
  const d = q.data; const rows: any[] = d.rows;
  // chart geometry
  const W = 560, H = 210, L = 36, R = 16, T = 24, B = 34;
  const x = (i: number) => L + (i * (W - L - R)) / (rows.length - 1);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const pts = rows.map((r, i) => (r.score === null ? null : { i, x: x(i), y: y(r.score), r }));
  const path = pts.filter(Boolean).map((p, k) => `${k ? 'L' : 'M'}${p!.x},${p!.y}`).join(' ');
  const trend = d.trend;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-900">Progress through the year</h3>
        {trend !== null && <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', trend >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')}>
          {trend >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}{trend >= 0 ? 'Improving' : 'Going down'} ({trend > 0 ? '+' : ''}{trend} points)</span>}
        <span className="ms-auto text-xs text-slate-500">Automatic: exams 60% + homework & tests 40%. Edit a term to adjust.</span>
      </div>
      <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label={`Term scores: ${rows.map((r) => `${r.label} ${r.score ?? 'no data'}`).join(', ')}`}>
          {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={INK2}>{v}</text></g>)}
          <line x1={L} x2={W - R} y1={y(40)} y2={y(40)} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} /><text x={W - R} y={y(40) - 4} textAnchor="end" fontSize={10} fill={INK2}>pass 40%</text>
          {rows.map((r, i) => <text key={r.key} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fontWeight={600} fill="#334155">{r.label}</text>)}
          {path && <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {pts.map((p) => p && (
            <g key={p.i} onMouseEnter={() => setHover(p.i)} onMouseLeave={() => setHover(null)}>
              <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
              <circle cx={p.x} cy={p.y} r={hover === p.i ? 6 : 5} fill={LINE} stroke="#fff" strokeWidth={2} />
              <text x={p.x} y={p.y - 11} textAnchor={p.i === 0 ? 'start' : p.i === rows.length - 1 ? 'end' : 'middle'} fontSize={11} fontWeight={700} fill="#1e293b">{p.r.score}%{p.r.position ? ` · #${p.r.position}` : ''}</text>
            </g>))}
        </svg>
        {hover !== null && rows[hover] && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow">
            <b>{rows[hover].label}</b>: {rows[hover].score}%{rows[hover].position ? ` · position ${rows[hover].position} of ${rows[hover].of}` : ''}
            <div className="text-white/80">Exams {rows[hover].exam ?? '—'}% · Homework {rows[hover].homework ?? '—'}%</div></div>)}
        {!pts.some(Boolean) && <p className="pb-2 text-center text-sm text-slate-500">No marks yet — the graph fills in as exams and homework are marked.</p>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-3 py-2">Term</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Position</th><th className="px-3 py-2">Exams</th><th className="px-3 py-2">Homework & tests</th><th className="px-3 py-2">Reading days</th><th className="px-3 py-2">Attendance</th><th className="px-3 py-2">Teacher's note</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r) => (
            <tr key={r.key} className={r.key === 'FINAL' ? 'bg-violet-50/50 font-medium' : ''}>
              <td className="whitespace-nowrap px-2 py-2 font-semibold"><button onClick={() => setEdit(r)} aria-label={`Edit ${r.label}`} className="me-1 rounded p-1 text-violet-600 hover:bg-violet-50"><Pencil className="size-3.5" /></button>{r.label}</td>
              <td className="px-3 py-2 tabular-nums">{r.score === null ? '—' : `${r.score}%`}{r.override !== null && <span className="ms-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800" title={`Automatic: ${r.auto ?? '—'}%`}>edited</span>}</td>
              <td className="px-3 py-2 tabular-nums">{r.position ? `${r.position} of ${r.of}` : '—'}</td>
              <td className="px-3 py-2 tabular-nums">{r.exam === null ? '—' : `${r.exam}%`}<span className="text-xs text-slate-400"> ({r.exams})</span></td>
              <td className="px-3 py-2 tabular-nums">{r.homework === null ? '—' : `${r.homework}%`}<span className="text-xs text-slate-400"> ({r.homeworks})</span></td>
              <td className="px-3 py-2 tabular-nums">{r.readingDays}</td>
              <td className="px-3 py-2 tabular-nums">{r.attendance === null ? '—' : `${r.attendance}%`}</td>
              <td className="min-w-[10rem] px-3 py-2 text-xs text-slate-600">{r.comment}</td></tr>))}</tbody></table>
      </div>
      {edit && <EditTerm classId={classId} studentId={studentId} row={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function EditTerm({ classId, studentId, row, onClose }: { classId: string; studentId: string; row: any; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [score, setScore] = useState(row.override === null ? '' : String(row.override)); const [comment, setComment] = useState(row.comment ?? ''); const [busy, setBusy] = useState(false);
  const save = async (reset = false) => {
    setBusy(true);
    try {
      const data = await api.put(`/teacher/classes/${classId}/students/${studentId}/progress`, reset ? { period: row.key, score: null, comment: '' } : { period: row.key, score: score === '' ? null : Math.min(100, Math.max(0, Number(score))), comment });
      qc.setQueryData(['progress', classId, studentId], data); toast(reset ? 'Back to the automatic score' : 'Saved'); onClose();
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose} title={`Edit ${row.label}`} description={`Automatic score: ${row.auto === null ? 'no marks yet' : `${row.auto}%`} (exams ${row.exam ?? '—'}%, homework & tests ${row.homework ?? '—'}%).`}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Score (%)" hint="Leave empty to keep the automatic score"><Input type="number" min={0} max={100} step={0.5} value={score} onChange={(e) => setScore(e.target.value)} placeholder={row.auto === null ? '' : String(row.auto)} /></Field>
        <Field label="Teacher's note" hint="Shown on this page, e.g. what improved or what to practise"><Textarea rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        <div className="flex justify-between gap-2">
          {(row.override !== null || row.comment) ? <Button type="button" variant="ghost" onClick={() => save(true)} disabled={busy}>Reset to automatic</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>Save</Button></div>
        </div>
      </form>
    </Dialog>
  );
}
