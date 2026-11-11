'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, ErrorBox, Input, PageLoader, Select, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

export const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export interface Period { number: number; label: string; startsAt: string; endsAt: string; isBreak: boolean }
export interface Slot { weekday: number; period: number; subjectId?: string | null; subject?: string | null; color?: string | null; teacherId?: string | null; teacher?: string | null; room?: string; className?: string; section?: string }

/** Days to show: Monday–Friday plus any other day that has lessons. */
const daysFor = (slots: Slot[], extra: number[] = []) => [...new Set([1, 2, 3, 4, 5, ...extra, ...slots.map((s) => s.weekday)])].sort();
const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const todayNo = () => ((new Date().getDay() + 6) % 7) + 1;

/** Read-only weekly grid. `who` picks the second line: the teacher (class view) or the class (teacher view). */
export function TimetableGrid({ periods, slots, who = 'teacher' }: { periods: Period[]; slots: Slot[]; who?: 'teacher' | 'class' }) {
  const days = daysFor(slots);
  const rows = periods.length ? periods : [...new Set(slots.map((s) => s.period))].sort((a, b) => a - b).map((n) => ({ number: n, label: '', startsAt: '', endsAt: '', isBreak: false }));
  if (!rows.length) return <p className="p-6 text-center text-sm text-slate-600">No timetable yet.</p>;
  const t = todayNo();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-1 text-sm">
        <thead><tr><th className="w-24" />{days.map((d) => <th key={d} className={cn('rounded-lg px-2 py-2 text-xs font-semibold', d === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700')}>{DAYS[d]}</th>)}</tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.number}>
            <th className="px-2 text-left align-middle text-xs font-medium text-slate-600"><span className="block text-slate-900">{p.label || `Period ${p.number}`}</span>{p.startsAt && `${p.startsAt}–${p.endsAt}`}</th>
            {p.isBreak ? <td colSpan={days.length} className="rounded-lg bg-slate-50 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-600">{p.label || 'Break'}</td>
              : days.map((d) => {
                const s = slots.find((x) => x.weekday === d && x.period === p.number);
                return <td key={d} className="h-14 rounded-lg border border-slate-200 px-2 py-1 align-top" style={s?.color ? { borderLeft: `4px solid ${s.color}` } : undefined}>
                  {s && <><span className="block font-medium text-slate-900">{s.subject ?? '—'}</span>
                    <span className="block text-xs text-slate-600">{[who === 'teacher' ? s.teacher : [s.className, s.section].filter(Boolean).join(' '), s.room].filter(Boolean).join(' · ')}</span></>}</td>;
              })}
          </tr>))}</tbody>
      </table>
    </div>
  );
}

/** The signed-in teacher's or student's week. */
export function MyTimetable({ path = '/timetable/me', title = 'My timetable' }: { path?: string; title?: string }) {
  const q = useQuery({ queryKey: ['timetable', path], queryFn: () => api.get<any>(path) });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="font-semibold text-slate-900">{title}</h2>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline print:hidden"><Printer className="size-4" />Print</button></div>
      <div className="p-3"><TimetableGrid periods={q.data.periods} slots={q.data.slots} who={q.data.view === 'teacher' ? 'class' : 'teacher'} /></div>
    </Card>
  );
}

// ------------------------------------------------------------------ school admin editors

export function BellTimesEditor() {
  const q = useQuery({ queryKey: ['periods'], queryFn: () => api.get<Period[]>('/timetable/periods') });
  const [rows, setRows] = useState<Period[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (q.data) setRows(q.data.length ? q.data : [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, label: '', startsAt: hm(480 + (n - 1) * 40), endsAt: hm(480 + n * 40), isBreak: false }))); }, [q.data]);
  if (!q.data) return <PageLoader />;
  const upd = (i: number, p: Partial<Period>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const add = () => { const last = rows[rows.length - 1]; const [h, m] = (last?.endsAt ?? '08:00').split(':').map(Number); 
    setRows([...rows, { number: (last?.number ?? 0) + 1, label: '', startsAt: last?.endsAt ?? '08:00', endsAt: hm(h * 60 + m + 40), isBreak: false }]); };
  const save = async () => {
    setBusy(true); setErr(null);
    try { qc.setQueryData(['periods'], await api.put('/timetable/periods', { periods: rows.map((r, i) => ({ ...r, number: i + 1 })) })); qc.invalidateQueries({ queryKey: ['timetable'] }); toast('Bell times saved'); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3"><h2 className="font-semibold text-slate-900">Bell times</h2><p className="text-xs text-slate-600">The same periods are used for every class. Mark breaks so no lessons are put in them.</p></div>
      <ul className="divide-y divide-slate-100">{rows.map((r, i) => (
        <li key={i} className="flex flex-wrap items-center gap-2 px-5 py-2 text-sm">
          <span className="w-6 font-semibold text-slate-600">{i + 1}</span>
          <Input aria-label={`Name of period ${i + 1}`} placeholder={r.isBreak ? 'Break' : `Period ${i + 1}`} className="h-9 w-36" maxLength={40} value={r.label} onChange={(e) => upd(i, { label: e.target.value })} />
          <Input aria-label={`Start of period ${i + 1}`} type="time" className="h-9 w-28" value={r.startsAt} onChange={(e) => upd(i, { startsAt: e.target.value })} />
          <span className="text-slate-500">to</span>
          <Input aria-label={`End of period ${i + 1}`} type="time" className="h-9 w-28" value={r.endsAt} onChange={(e) => upd(i, { endsAt: e.target.value })} />
          <label className="flex items-center gap-1.5 text-slate-700"><input type="checkbox" checked={r.isBreak} onChange={(e) => upd(i, { isBreak: e.target.checked })} />Break</label>
          <button aria-label={`Remove period ${i + 1}`} className="ml-auto text-slate-500 hover:text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
        </li>))}</ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
        <Button size="sm" variant="secondary" onClick={add} disabled={rows.length >= 20}><Plus className="size-4" />Add period</Button>
        {err ? <div className="w-full"><ErrorBox error={err} /></div> : null}
        <Button className="ml-auto" loading={busy} onClick={save}>Save bell times</Button>
      </div>
    </Card>
  );
}

export function ClassTimetableEditor({ classId }: { classId: string }) {
  const q = useQuery({ queryKey: ['timetable', 'class', classId], queryFn: () => api.get<any>(`/timetable/classes/${classId}`) });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api.get<any[]>('/catalog/subjects') });
  const teachers = useQuery({ queryKey: ['school-teachers'], queryFn: () => api.get<any>('/school/users?role=TEACHER&pageSize=100') });
  const [slots, setSlots] = useState<Slot[]>([]); const [extra, setExtra] = useState<number[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (q.data) setSlots(q.data.slots); }, [q.data]);
  const days = useMemo(() => daysFor(slots, extra), [slots, extra]);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data || !subjects.data || !teachers.data) return <PageLoader />;
  const periods: Period[] = q.data.periods;
  if (!periods.length) return <Card className="p-6 text-sm text-slate-600">Set the bell times first (above), then plan each class.</Card>;
  const get = (d: number, p: number) => slots.find((s) => s.weekday === d && s.period === p);
  const put = (d: number, p: number, patch: Partial<Slot>) => {
    const cur = get(d, p) ?? { weekday: d, period: p };
    setSlots([...slots.filter((s) => !(s.weekday === d && s.period === p)), { ...cur, ...patch }]);
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.put<any>(`/timetable/classes/${classId}`, { slots: slots.filter((s) => s.subjectId || s.teacherId || s.room).map((s) => ({ weekday: s.weekday, period: s.period, subjectId: s.subjectId || null, teacherId: s.teacherId || null, room: s.room ?? '' })) });
      qc.setQueryData(['timetable', 'class', classId], r); qc.invalidateQueries({ queryKey: ['timetable', '/timetable/me'] }); toast('Timetable saved');
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const tList = teachers.data.items as any[];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 text-sm">
        <span className="text-slate-700">Also show:</span>
        {[6, 7].map((d) => <label key={d} className="flex items-center gap-1.5"><input type="checkbox" checked={days.includes(d)} disabled={slots.some((s) => s.weekday === d && (s.subjectId || s.teacherId))}
          onChange={(e) => setExtra(e.target.checked ? [...extra, d] : extra.filter((x) => x !== d))} />{DAYS[d]}</label>)}
        <span className="ml-auto text-xs text-slate-600">A teacher cannot be put in two classes in the same period.</span>
      </div>
      <div className="overflow-x-auto p-3">
        <table className="w-full min-w-[820px] table-fixed border-separate border-spacing-1 text-xs">
          <thead><tr><th className="w-24" />{days.map((d) => <th key={d} className="rounded-lg bg-slate-100 px-2 py-2 font-semibold text-slate-700">{DAYS[d]}</th>)}</tr></thead>
          <tbody>{periods.map((p) => (
            <tr key={p.number}>
              <th className="px-2 text-left font-medium text-slate-600"><span className="block text-slate-900">{p.label || `Period ${p.number}`}</span>{p.startsAt}–{p.endsAt}</th>
              {p.isBreak ? <td colSpan={days.length} className="rounded-lg bg-slate-50 py-2 text-center font-medium uppercase tracking-wide text-slate-600">{p.label || 'Break'}</td>
                : days.map((d) => { const s = get(d, p.number); const lbl = `${DAYS[d]} ${p.label || `period ${p.number}`}`; return (
                  <td key={d} className="rounded-lg border border-slate-200 p-1 align-top">
                    <Select aria-label={`Subject, ${lbl}`} className="h-8 text-xs" value={s?.subjectId ?? ''} onChange={(e) => put(d, p.number, { subjectId: e.target.value || null })}>
                      <option value="">—</option>{subjects.data!.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
                    <Select aria-label={`Teacher, ${lbl}`} className="mt-1 h-8 text-xs" value={s?.teacherId ?? ''} onChange={(e) => put(d, p.number, { teacherId: e.target.value || null })}>
                      <option value="">No teacher</option>{tList.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}</Select>
                    <Input aria-label={`Room, ${lbl}`} placeholder="Room" maxLength={40} className="mt-1 h-8 text-xs" value={s?.room ?? ''} onChange={(e) => put(d, p.number, { room: e.target.value })} />
                  </td>); })}
            </tr>))}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
        {err ? <div className="w-full"><ErrorBox error={err} /></div> : null}
        <Button className="ml-auto" loading={busy} onClick={save}>Save timetable</Button>
      </div>
    </Card>
  );
}
