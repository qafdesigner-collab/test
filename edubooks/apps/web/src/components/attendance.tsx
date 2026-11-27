'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Download } from 'lucide-react';
import { api, downloadCsv, fmtDay } from '@/lib/api';
import { Button, Card, ErrorBox, Input, PageLoader, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

export const STATUS = {
  PRESENT: { short: 'P', label: 'Present', on: 'bg-emerald-600 text-white border-emerald-600', chip: 'bg-emerald-100 text-emerald-800' },
  ABSENT: { short: 'A', label: 'Absent', on: 'bg-red-600 text-white border-red-600', chip: 'bg-red-100 text-red-800' },
  LATE: { short: 'L', label: 'Late', on: 'bg-amber-500 text-slate-900 border-amber-500', chip: 'bg-amber-100 text-amber-900' },
  EXCUSED: { short: 'E', label: 'Excused', on: 'bg-sky-600 text-white border-sky-600', chip: 'bg-sky-100 text-sky-800' },
} as const;
type St = keyof typeof STATUS;
const today = () => new Date().toISOString().slice(0, 10);

/** Mark one class for one day. Unmarked students are left out of the save. */
export function AttendanceRegister({ classId }: { classId: string }) {
  const [day, setDay] = useState(today());
  const q = useQuery({ queryKey: ['attendance', classId, day], queryFn: () => api.get<any>(`/attendance/classes/${classId}?day=${day}`) });
  const [marks, setMarks] = useState<Record<string, { status?: St; note: string }>>({});
  const [notify, setNotify] = useState(true); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (q.data) setMarks(Object.fromEntries(q.data.roster.map((r: any) => [r.id, { status: r.status ?? undefined, note: r.note ?? '' }]))); }, [q.data]);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const roster = q.data.roster as any[];
  const set = (id: string, status: St) => setMarks({ ...marks, [id]: { ...marks[id], status } });
  const count = (s: St) => roster.filter((r) => marks[r.id]?.status === s).length;
  const unmarked = roster.filter((r) => !marks[r.id]?.status).length;
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const records = roster.filter((r) => marks[r.id]?.status).map((r) => ({ studentId: r.id, status: marks[r.id].status, note: marks[r.id].note }));
      const res = await api.put<any>(`/attendance/classes/${classId}`, { day, records, notifyParents: notify });
      toast(`Saved ${res.saved} student(s)${res.notified ? ` · ${res.notified} parent(s) told about an absence` : ''}`);
      qc.invalidateQueries({ queryKey: ['attendance'] });
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-3">
        <label className="text-sm text-slate-700">Day<Input type="date" max={today()} className="mt-1 h-9" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
        <Button size="sm" variant="secondary" onClick={() => setMarks(Object.fromEntries(roster.map((r) => [r.id, { note: marks[r.id]?.note ?? '', status: (marks[r.id]?.status ?? 'PRESENT') as St }])))}>
          <CheckCheck className="size-4" />Mark the rest present</Button>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">{(Object.keys(STATUS) as St[]).map((s) => <span key={s} className={cn('rounded-full px-2.5 py-1 font-medium', STATUS[s].chip)}>{STATUS[s].label} {count(s)}</span>)}
          {unmarked > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">Not marked {unmarked}</span>}</div>
      </div>
      {!roster.length ? <p className="p-6 text-center text-sm text-slate-600">No students in this class.</p> : (
        <ul className="divide-y divide-slate-100">{roster.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-2">
            <span className="min-w-40 flex-1 text-sm font-medium text-slate-900">{r.displayName}</span>
            <div role="radiogroup" aria-label={`Attendance for ${r.displayName}`} className="flex gap-1">{(Object.keys(STATUS) as St[]).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={marks[r.id]?.status === s} aria-label={STATUS[s].label} title={STATUS[s].label} onClick={() => set(r.id, s)}
                className={cn('focus-ring size-9 rounded-lg border text-sm font-bold', marks[r.id]?.status === s ? STATUS[s].on : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')}>{STATUS[s].short}</button>))}</div>
            <Input aria-label={`Note for ${r.displayName}`} placeholder="Note" maxLength={200} className="h-9 w-40" value={marks[r.id]?.note ?? ''} onChange={(e) => setMarks({ ...marks, [r.id]: { ...marks[r.id], note: e.target.value } })} />
          </li>))}</ul>)}
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3">
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Tell parents when a child is absent today</label>
        {err ? <div className="w-full"><ErrorBox error={err} /></div> : null}
        <Button className="ml-auto" loading={busy} disabled={!roster.length} onClick={save}>Save register</Button>
      </div>
    </Card>
  );
}

/** Month-style grid of a class's attendance with totals and CSV. */
export function AttendanceReport({ classId }: { classId: string }) {
  const end = today(); const [range, setRange] = useState({ from: end.slice(0, 8) + '01', to: end });
  const q = useQuery({ queryKey: ['attendance', 'report', classId, range], queryFn: () => api.get<any>(`/attendance/classes/${classId}/report?from=${range.from}&to=${range.to}`) });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const r = q.data;
  const csv = () => downloadCsv(`attendance-${r.from}-to-${r.to}.csv`, r.students.map((s: any) => ({ student: s.displayName, ...Object.fromEntries(r.days.map((d: string) => [d, s.days[d] ? STATUS[s.days[d] as St].short : ''])),
    present: s.present, late: s.late, absent: s.absent, excused: s.excused, rate: s.rate === null ? '' : `${s.rate}%` })));
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-3">
        <label className="text-sm text-slate-700">From<Input type="date" className="mt-1 h-9" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></label>
        <label className="text-sm text-slate-700">To<Input type="date" className="mt-1 h-9" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></label>
        <span className="text-xs text-slate-600">P present · L late · A absent · E excused. The rate counts late as attended.</span>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={csv}><Download className="size-4" />CSV</Button>
      </div>
      {!r.days.length ? <p className="p-6 text-center text-sm text-slate-600">No attendance marked between {fmtDay(r.from)} and {fmtDay(r.to)}.</p> : (
        <div className="overflow-x-auto"><table className="text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="sticky left-0 bg-slate-50 px-4 py-2 text-left">Student</th>
            {r.days.map((d: string) => <th key={d} className="px-1 py-2 font-medium" title={fmtDay(d)}>{Number(d.slice(8))}</th>)}
            <th className="px-3 py-2">P</th><th className="px-3 py-2">L</th><th className="px-3 py-2">A</th><th className="px-3 py-2">E</th><th className="px-3 py-2">Rate</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{r.students.map((s: any) => (
            <tr key={s.id}><td className="sticky left-0 whitespace-nowrap bg-white px-4 py-1.5 font-medium">{s.displayName}</td>
              {r.days.map((d: string) => { const v = s.days[d] as St | undefined; return <td key={d} className="px-0.5 py-1 text-center">{v ? <span className={cn('inline-block w-6 rounded text-xs font-bold leading-6', STATUS[v].chip)}>{STATUS[v].short}</span> : <span className="text-slate-400">·</span>}</td>; })}
              <td className="px-3 text-center">{s.present}</td><td className="px-3 text-center">{s.late}</td><td className="px-3 text-center">{s.absent}</td><td className="px-3 text-center">{s.excused}</td>
              <td className={cn('px-3 text-center font-semibold', s.rate === null ? 'text-slate-500' : s.rate >= 90 ? 'text-emerald-700' : s.rate >= 75 ? 'text-amber-700' : 'text-red-600')}>{s.rate === null ? '—' : `${s.rate}%`}</td></tr>))}</tbody>
        </table></div>)}
    </Card>
  );
}

/** Class picker + Register / Report tabs. */
export function AttendanceWorkspace({ classes, initial }: { classes: { id: string; label: string }[]; initial?: string }) {
  const [cls, setCls] = useState(initial ?? classes[0]?.id ?? ''); const [tab, setTab] = useState<'reg' | 'rep'>('reg');
  useEffect(() => { if (!cls && classes[0]) setCls(classes[0].id); }, [classes, cls]);
  if (!classes.length) return <Card className="p-8 text-center text-sm text-slate-600">You have no classes yet.</Card>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-700">Class <select className="focus-ring ml-1 h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={cls} onChange={(e) => setCls(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <div role="tablist" className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {([['reg', 'Register'], ['rep', 'Report']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn('rounded-md px-3 py-1.5 font-medium', tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>{l}</button>)}</div>
      </div>
      {cls && (tab === 'reg' ? <AttendanceRegister key={cls} classId={cls} /> : <AttendanceReport key={cls} classId={cls} />)}
    </div>
  );
}
