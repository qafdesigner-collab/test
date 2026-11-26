'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, Confirm, Dialog, PageLoader, cn } from '@/components/ui';

export const CB_KEYS = ['classBooks', 'schoolPools', 'schoolPool', 'eligible', 'schoolOverview', 'people', 'bookClasses'];

/** Pick classes (grouped by grade) and assign the chosen books: students and class teachers get seats now and later. */
export function AssignToClassDialog({ books, onClose }: { books: { name: string; poolIds: string[] }[]; onClose: () => void }) {
  const classes = useQuery({ queryKey: ['bookClasses'], queryFn: () => api.get<any[]>('/school/class-books/classes') });
  const [picked, setPicked] = useState<string[]>([]);
  const poolIds = books.flatMap((b) => b.poolIds);
  const byGrade = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const c of classes.data ?? []) { if (!m.has(c.grade)) m.set(c.grade, []); m.get(c.grade)!.push(c); }
    return [...m.entries()];
  }, [classes.data]);
  const preview = useQuery({ queryKey: ['classBooksPreview', poolIds, picked], enabled: picked.length > 0,
    queryFn: () => api.post<any>('/school/class-books', { poolIds, classIds: picked, dryRun: true }) });
  const assign = useAction(() => api.post<any>('/school/class-books', { poolIds, classIds: picked }), { ok: (r) => `Books assigned — ${r.given} seat(s) given 🎉`, keys: CB_KEYS, after: onClose });
  const toggle = (ids: string[]) => setPicked((p) => ids.every((i) => p.includes(i)) ? p.filter((x) => !ids.includes(x)) : [...new Set([...p, ...ids])]);
  const total = (preview.data?.plan ?? []).reduce((n: number, x: any) => n + (x.willGet ?? 0), 0);
  return (
    <Dialog open onOpenChange={onClose} wide title={`Assign ${books.length} book${books.length === 1 ? '' : 's'} to class`}
      description={books.map((b) => b.name).join(' · ')}>
      {!classes.data ? <PageLoader /> : !classes.data.length ? <p className="text-sm text-slate-500">No classes yet. Make classes first.</p> : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Every student of the class gets a student seat and the class teachers get a teacher seat. Students and teachers who join the class later get the book by themselves.</p>
          <div className="max-h-72 space-y-3 overflow-y-auto">
            {byGrade.map(([grade, list]) => (
              <div key={grade}>
                <button className="mb-1 text-xs font-bold uppercase text-violet-700 hover:underline" onClick={() => toggle(list.map((c) => c.id))}>{grade} — tick all</button>
                <div className="grid gap-2 sm:grid-cols-2">
                  {list.map((c) => (
                    <label key={c.id} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm', picked.includes(c.id) ? 'border-violet-400 bg-violet-50' : 'border-slate-200')}>
                      <input type="checkbox" className="size-4 accent-violet-600" checked={picked.includes(c.id)} onChange={() => toggle([c.id])} />
                      <span className="font-medium">{c.name}</span><span className="ms-auto text-xs text-slate-500">{c.students} students · {c.teachers} teachers</span>
                    </label>))}
                </div>
              </div>))}
          </div>
          {picked.length > 0 && (preview.isLoading ? <PageLoader /> : preview.data && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Book</th><th>Already have</th><th>Will get it</th><th>No seat</th><th>Seats left after</th></tr></thead>
                <tbody>{preview.data.plan.map((x: any) => (
                  <tr key={x.poolId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{x.product} <span className="text-xs font-normal text-slate-500">({x.seatType === 'STUDENT' ? 'students' : 'teachers'})</span></td>
                    {x.problem ? <td colSpan={4} className="text-amber-700">{x.problem}</td> : <>
                      <td>{x.already}</td><td className="font-semibold text-emerald-700">{x.willGet}</td>
                      <td>{x.short ? <span className="text-red-600" title={x.shortNames.join(', ')}><AlertTriangle className="me-1 inline size-4" />{x.short} — buy more seats</span> : '0'}</td>
                      <td className={x.left ? 'font-semibold' : 'font-semibold text-red-600'}>{x.left}</td></>}
                  </tr>))}</tbody>
              </table>
            </div>))}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => assign.mutate()} loading={assign.isPending} disabled={!picked.length}>Assign to {picked.length || ''} class{picked.length === 1 ? '' : 'es'}{total ? ` (${total} seats)` : ''}</Button>
          </div>
        </div>)}
    </Dialog>
  );
}

/** The classes a book is assigned to, each with × to take the book off the class. */
export function ClassChips({ classes, poolIds, book }: { classes: { classId: string; name: string }[]; poolIds: string[]; book: string }) {
  const [off, setOff] = useState<{ classId: string; name: string } | null>(null); const [takeBack, setTakeBack] = useState(true);
  const remove = useAction(async () => {
    let released = 0; let kept = 0;
    for (const poolId of poolIds) { const r = await api.post<any>('/school/class-books/remove', { poolId, classId: off!.classId, takeBack }); released += r.released; kept += r.kept; }
    return { released, kept };
  }, { ok: (r) => `Removed from the class${r.released ? ` — ${r.released} seat(s) back` : ''}${r.kept ? ` · ${r.kept} older student seat(s) kept (use Transfer)` : ''}`, keys: CB_KEYS, after: () => setOff(null) });
  if (!classes.length) return <span className="text-xs text-slate-400">no class yet</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {classes.map((c) => (
        <span key={c.classId} className="inline-flex items-center gap-1 rounded-full bg-violet-100 py-0.5 pe-1 ps-2.5 text-xs font-semibold text-violet-800">{c.name}
          <button aria-label={`Remove ${c.name}`} onClick={() => setOff(c)} className="rounded-full p-0.5 hover:bg-violet-200"><X className="size-3" /></button></span>))}
      <Confirm open={!!off} onOpenChange={() => setOff(null)} title={`Take “${book}” off ${off?.name}?`} confirmLabel="Remove" danger loading={remove.isPending} onConfirm={() => remove.mutate()}
        body={<><p>New students of this class will no longer get the book by themselves.</p>
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-red-600" checked={takeBack} onChange={(e) => setTakeBack(e.target.checked)} />Also take back the seats of this class (students and teachers)</label></>} />
    </div>
  );
}
