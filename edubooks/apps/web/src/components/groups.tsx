'use client';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Select, Textarea, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/common';

type Metrics = { students: number; homeworkAverage: number | null; handedIn: number | null; examAverage: number | null; attendance: number | null; pagesRead: number | null; stars: number | null; activeWeek: number | null };
type Group = { id: string; name: string; color: string; note: string; studentIds: string[]; metrics: Metrics };
const COLORS: Record<string, string> = { violet: 'bg-violet-100 text-violet-800 ring-violet-300', sky: 'bg-sky-100 text-sky-800 ring-sky-300', emerald: 'bg-emerald-100 text-emerald-800 ring-emerald-300', amber: 'bg-amber-100 text-amber-900 ring-amber-300', rose: 'bg-rose-100 text-rose-800 ring-rose-300', slate: 'bg-slate-100 text-slate-800 ring-slate-300' };
const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${v}%`);

export function useRoster(classId?: string | null) {
  return useQuery({ queryKey: ['classRoster', classId], queryFn: () => api.get<any>(`/classes/${classId}`), enabled: !!classId }).data?.roster as { id: string; displayName: string }[] | undefined;
}
export function useGroups(classId?: string | null) {
  return useQuery({ queryKey: ['groups', classId], queryFn: () => api.get<{ groups: Group[]; class: Metrics }>(`/classes/${classId}/groups`), enabled: !!classId });
}

/** Groups of students inside a class: make them, change members, and see how each group is doing next to the class. */
export function ClassGroups({ classId }: { classId: string }) {
  const q = useGroups(classId); const roster = useRoster(classId) ?? [];
  const [edit, setEdit] = useState<Partial<Group> | null>(null);
  const name = (id: string) => roster.find((s) => s.id === id)?.displayName ?? '…';
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <Users className="size-5 text-violet-600" /><h2 className="flex-1 font-semibold text-slate-900">Groups in this class</h2>
        <Button size="sm" onClick={() => setEdit({ name: '', color: 'violet', note: '', studentIds: [] })}><Plus className="size-4" />New group</Button>
      </div>
      {q.error ? <div className="p-4"><ErrorBox error={q.error} /></div> : !q.data ? <PageLoader /> : !q.data.groups.length ? (
        <p className="p-5 text-sm text-slate-600">No groups yet. Make groups such as “Reading group A”, “Needs support” or “Fast finishers”, then set homework for a group or compare them.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
              <th className="px-4 py-2">Group</th><th className="px-2 py-2">Students</th><th className="px-2 py-2">Homework avg</th><th className="px-2 py-2">Handed in</th><th className="px-2 py-2">Exams avg</th><th className="px-2 py-2">Attendance</th><th className="px-2 py-2">Active this week</th><th />
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {q.data.groups.map((g) => (
                <tr key={g.id} className="align-top">
                  <td className="px-4 py-2"><span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ring-1', COLORS[g.color] ?? COLORS.violet)}>{g.name}</span>
                    {g.note && <p className="mt-1 text-xs text-slate-500">{g.note}</p>}
                    <p className="mt-1 text-xs text-slate-600">{g.studentIds.map(name).join(', ') || 'No students yet'}</p></td>
                  <td className="px-2 py-2">{g.metrics.students}</td><td className="px-2 py-2">{pct(g.metrics.homeworkAverage)}</td><td className="px-2 py-2">{pct(g.metrics.handedIn)}</td>
                  <td className="px-2 py-2">{pct(g.metrics.examAverage)}</td><td className="px-2 py-2">{pct(g.metrics.attendance)}</td><td className="px-2 py-2">{pct(g.metrics.activeWeek)}</td>
                  <td className="px-2 py-2"><button onClick={() => setEdit(g)} aria-label={`Edit ${g.name}`} className="rounded p-1 text-slate-500 hover:bg-slate-100"><Pencil className="size-4" /></button></td>
                </tr>))}
              <tr className="bg-slate-50 font-medium text-slate-700"><td className="px-4 py-2">Whole class</td><td className="px-2 py-2">{q.data.class.students}</td><td className="px-2 py-2">{pct(q.data.class.homeworkAverage)}</td><td className="px-2 py-2">{pct(q.data.class.handedIn)}</td>
                <td className="px-2 py-2">{pct(q.data.class.examAverage)}</td><td className="px-2 py-2">{pct(q.data.class.attendance)}</td><td className="px-2 py-2">{pct(q.data.class.activeWeek)}</td><td /></tr>
            </tbody>
          </table>
        </div>)}
      {edit && <GroupDialog classId={classId} value={edit} roster={roster} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function GroupDialog({ classId, value, roster, onClose }: { classId: string; value: Partial<Group>; roster: { id: string; displayName: string }[]; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ name: value.name ?? '', color: value.color ?? 'violet', note: value.note ?? '', studentIds: value.studentIds ?? [] });
  const [busy, setBusy] = useState(false); const [find, setFind] = useState('');
  const done = (m: string) => { qc.invalidateQueries({ queryKey: ['groups', classId] }); toast(m); onClose(); };
  const save = async () => {
    setBusy(true);
    try { value.id ? await api.patch(`/groups/${value.id}`, f) : await api.post(`/classes/${classId}/groups`, f); done('Group saved'); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const del = async () => { if (!confirm(`Delete the group “${value.name}”? The students stay in the class.`)) return; try { await api.del(`/groups/${value.id}`); done('Group deleted'); } catch (e: any) { toast(e.message, 'err'); } };
  const shown = roster.filter((s) => s.displayName.toLowerCase().includes(find.toLowerCase()));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={value.id ? 'Edit group' : 'New group'}>
      <div className="space-y-3">
        <Field label="Name"><Input autoFocus maxLength={80} value={f.name} placeholder="e.g. Reading group A" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="flex flex-wrap gap-1.5">{Object.keys(COLORS).map((c) => <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={c}
          className={cn('size-7 rounded-full ring-2', COLORS[c].split(' ')[0], f.color === c ? 'ring-slate-800' : 'ring-transparent')} />)}</div>
        <Field label="Note (optional)"><Input maxLength={500} value={f.note} placeholder="e.g. Extra phonics practice on Tuesdays" onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div>
          <div className="mb-1 flex items-center gap-2"><span className="flex-1 text-sm font-medium text-slate-700">Students ({f.studentIds.length})</span>
            <button type="button" className="text-xs text-brand-700 underline" onClick={() => setF({ ...f, studentIds: roster.map((s) => s.id) })}>All</button>
            <button type="button" className="text-xs text-brand-700 underline" onClick={() => setF({ ...f, studentIds: [] })}>None</button></div>
          {roster.length > 12 && <Input className="mb-2" placeholder="Find a student…" value={find} onChange={(e) => setFind(e.target.value)} />}
          <div className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">{shown.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={f.studentIds.includes(s.id)}
              onChange={(e) => setF({ ...f, studentIds: e.target.checked ? [...f.studentIds, s.id] : f.studentIds.filter((x) => x !== s.id) })} />{s.displayName}</label>))}</div>
        </div>
        <div className="flex gap-2">{value.id && <Button variant="ghost" onClick={del}><Trash2 className="size-4 text-red-500" />Delete</Button>}<span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!f.name.trim()} onClick={save}>Save</Button></div>
      </div>
    </Dialog>
  );
}

/** Quick buttons that pick the students of a group (e.g. when setting homework). */
export function GroupPicker({ classId, onPick }: { classId: string; onPick: (ids: string[]) => void }) {
  const q = useGroups(classId);
  if (!q.data?.groups.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs font-medium text-slate-600">Pick a group:</span>
      {q.data.groups.map((g) => <button key={g.id} type="button" onClick={() => onPick(g.studentIds)} className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold ring-1', COLORS[g.color] ?? COLORS.violet)}>{g.name} ({g.studentIds.length})</button>)}
    </div>
  );
}

export type SpecialStudent = { studentId: string; name: string; need: string; support: string };
const NEEDS = ['Needs extra help', 'Reading support', 'Language support (new to English)', 'Attention / focus', 'Gifted — needs challenge', 'Physical / seating', 'Health / medical', 'Other'];

/** The lesson plan's “special students” section: chosen students, what each needs and how the teacher will support them. */
export function SpecialStudents({ classId, value, onChange }: { classId?: string | null; value: SpecialStudent[]; onChange: (v: SpecialStudent[]) => void }) {
  const roster = useRoster(classId) ?? []; const groups = useGroups(classId).data?.groups ?? [];
  const [add, setAdd] = useState('');
  const left = roster.filter((s) => !value.some((v) => v.studentId === s.id));
  const addIds = (ids: string[]) => onChange([...value, ...ids.filter((id) => !value.some((v) => v.studentId === id)).map((id) => ({ studentId: id, name: roster.find((s) => s.id === id)?.displayName ?? '', need: NEEDS[0], support: '' }))]);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2"><span className="text-xl" aria-hidden>⭐</span><span className="flex-1 text-sm font-medium text-slate-700">Special students in this lesson</span></div>
      {!classId ? <p className="text-xs text-slate-500">Choose the class above to add students who need special attention.</p> : <>
        {value.map((v, i) => (
          <div key={v.studentId} className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2 sm:grid-cols-[10rem_12rem_1fr_32px]">
            <b className="self-center text-sm text-slate-900">{v.name || roster.find((s) => s.id === v.studentId)?.displayName}</b>
            <Select aria-label="Need" value={v.need} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, need: e.target.value } : x)))}>{NEEDS.map((n) => <option key={n}>{n}</option>)}</Select>
            <Input aria-label="How I will support" placeholder="How I will support (e.g. sit near me, picture cards, shorter task)" value={v.support} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, support: e.target.value } : x)))} />
            <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-600"><X className="size-4" /></button>
          </div>))}
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Add a student" value={add} onChange={(e) => { if (e.target.value) addIds([e.target.value]); setAdd(''); }} className="w-56"><option value="">+ Add a student…</option>{left.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}</Select>
          {groups.map((g) => <button key={g.id} type="button" onClick={() => addIds(g.studentIds)} className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold ring-1', COLORS[g.color] ?? COLORS.violet)}>+ {g.name}</button>)}
        </div>
      </>}
    </div>
  );
}

/** Compare sections (e.g. KG1 A and KG1 B) or whole grades on the same measures. */
export function ComparePage() {
  const classes = useQuery({ queryKey: ['compareClasses'], queryFn: () => api.get<any[]>('/compare/classes') });
  const [by, setBy] = useState<'section' | 'grade'>('section');
  const [picked, setPicked] = useState<string[] | null>(null);
  const all = classes.data ?? [];
  const ids = picked ?? all.filter((c) => c.mine).map((c) => c.id);
  const grades = useMemo(() => [...new Map(all.map((c) => [c.gradeId ?? 'none', c.grade ?? 'No grade'])).entries()], [all]);
  const q = useQuery({ queryKey: ['compare', by, ids.join(',')], queryFn: () => api.get<any>(`/compare?by=${by}&classIds=${ids.join(',')}`), enabled: ids.length > 0 });
  const rows: any[] = q.data?.rows ?? [];
  const MEASURES: [keyof Metrics, string, (v: any) => string][] = [['students', 'Students', (v) => String(v)], ['homeworkAverage', 'Homework average', pct], ['handedIn', 'Homework handed in', pct], ['examAverage', 'Exam average', pct], ['attendance', 'Attendance (30 days)', pct], ['activeWeek', 'Active this week', pct], ['pagesRead', 'Pages read per student', (v) => (v ?? '—') + ''], ['stars', 'Stars per student', (v) => (v ?? '—') + '']];
  const best = (k: keyof Metrics) => { const v = rows.map((r) => r.metrics[k]).filter((x: any) => x !== null && x !== undefined); return v.length > 1 ? Math.max(...v) : null; };
  return (
    <div className="space-y-6">
      <PageHeader title="Compare classes" sub="See sections side by side (e.g. KG1 A and KG1 B), or whole grades. Only class totals are shown — no student names." />
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Compare</span>
          {([['section', 'Sections'], ['grade', 'Grades']] as const).map(([v, l]) => <button key={v} onClick={() => setBy(v)} className={cn('rounded-lg px-3 py-1 text-sm font-medium', by === v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700')}>{l}</button>)}
          <span className="flex-1" />
          <button className="text-xs text-brand-700 underline" onClick={() => setPicked(all.map((c) => c.id))}>All classes</button>
          <button className="text-xs text-brand-700 underline" onClick={() => setPicked(all.filter((c) => c.mine).map((c) => c.id))}>My classes</button>
        </div>
        {classes.error ? <ErrorBox error={classes.error} /> : !classes.data ? <PageLoader /> : (
          <div className="space-y-2">{grades.map(([gid, gname]) => (
            <div key={gid} className="flex flex-wrap items-center gap-1.5"><span className="w-24 text-xs font-semibold text-slate-500">{gname}</span>
              {all.filter((c) => (c.gradeId ?? 'none') === gid).map((c) => (
                <label key={c.id} className={cn('flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1', ids.includes(c.id) ? 'bg-brand-50 ring-brand-300' : 'ring-slate-200')}>
                  <input type="checkbox" checked={ids.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))} />{c.name}{c.section ? ` ${c.section}` : ''}{c.mine && <Badge tone="info">mine</Badge>}</label>))}
            </div>))}</div>)}
      </Card>
      {!ids.length ? <p className="text-sm text-slate-600">Choose classes to compare.</p> : q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left"><tr><th className="px-4 py-2 text-xs uppercase text-slate-500">Measure</th>
              {rows.map((r) => <th key={r.key} className="px-3 py-2 font-semibold text-slate-900">{r.label}{by === 'grade' ? <span className="block text-xs font-normal text-slate-500">{r.sections} section(s)</span> : r.grade ? <span className="block text-xs font-normal text-slate-500">{r.grade}</span> : null}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{MEASURES.map(([k, label, fmt]) => (
              <tr key={k}><td className="px-4 py-2 text-slate-600">{label}</td>
                {rows.map((r) => { const v = r.metrics[k]; const top = k !== 'students' && v !== null && v === best(k);
                  return <td key={r.key} className={cn('px-3 py-2 tabular-nums', top && 'font-bold text-emerald-700')}>{fmt(v)}{top ? ' ⭐' : ''}
                    {typeof v === 'number' && k !== 'students' && k !== 'pagesRead' && k !== 'stars' && <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${Math.min(100, v)}%` }} /></div>}</td>; })}
              </tr>))}</tbody>
          </table>
          <p className="px-4 py-2 text-xs text-slate-500">⭐ the highest in each row. Homework and exam averages use marked work; attendance is the last 30 days.</p>
        </Card>)}
    </div>
  );
}
