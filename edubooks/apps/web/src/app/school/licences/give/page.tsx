'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, CheckCircle2, AlertTriangle, Zap } from 'lucide-react';
import { api, fmtDay } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Badge, Button, Card, EmptyState, ErrorBox, PageLoader, cn } from '@/components/ui';
import { PageHeader } from '@/components/common';

/** Give books by class: pick a grade → its sections and its books appear → one click gives seats to every student and teacher. */
export default function GiveBooks() {
  const board = useQuery({ queryKey: ['bookBoard'], queryFn: () => api.get<any>('/school/book-board') });
  const [grade, setGrade] = useState<string | null>(null);
  const [secs, setSecs] = useState<string[]>([]);
  const [books, setBooks] = useState<string[]>([]);
  const [allBooks, setAllBooks] = useState(false);
  const [result, setResult] = useState<any>(null);
  const classes: any[] = board.data?.classes ?? []; const pools: any[] = board.data?.pools ?? [];
  const grades = useMemo(() => {
    const m = new Map<string, { id: string; name: string; classes: any[] }>();
    for (const c of classes) { const k = c.gradeId ?? 'none'; if (!m.has(k)) m.set(k, { id: k, name: c.grade, classes: [] }); m.get(k)!.classes.push(c); }
    return [...m.values()];
  }, [classes]);
  const g = grades.find((x) => x.id === grade) ?? grades[0];
  const forGrade = pools.filter((p) => g && p.gradeIds.includes(g.id));
  const shown = allBooks ? pools : forGrade;
  // A new grade: tick every section and every book for that grade.
  useEffect(() => { if (g) { setSecs(g.classes.map((c) => c.id)); setBooks(forGrade.filter((p) => p.free > 0).map((p) => p.id)); setResult(null); } }, [g?.id, board.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const body = { poolIds: books, classIds: secs };
  const preview = useQuery({ queryKey: ['bookPreview', body], enabled: books.length > 0 && secs.length > 0,
    queryFn: () => api.post<any>('/school/pools/bulk-assign', { ...body, dryRun: true }) });
  const keys = ['bookBoard', 'bookPreview', 'schoolPools', 'schoolPool', 'eligible', 'schoolOverview', 'people'];
  const give = useAction(() => api.post<any>('/school/pools/bulk-assign', body), { ok: (r) => `${r.given} book seat(s) given 🎉`, keys, after: setResult });
  const auto = useAction((v: { id: string; on: boolean }) => api.put<any>(`/school/pools/${v.id}/auto`, { on: v.on }),
    { ok: (r) => r.auto ? `Automatic giving on — ${r.given} seat(s) given now` : 'Automatic giving off', keys });
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const total = (preview.data?.plan ?? []).reduce((n: number, x: any) => n + (x.willGet ?? 0), 0);

  if (board.error) return <ErrorBox error={board.error} />;
  if (!board.data) return <PageLoader />;
  return (
    <div className="space-y-6">
      <Link href="/school/licences" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Book licences</Link>
      <PageHeader title="Give books by class" sub="Choose a grade. Its sections and its books appear. One click gives every student (and the class teachers, for teacher licences) a seat. People who already have the book are skipped." />
      {!grades.length ? <EmptyState title="No classes yet">Make classes first, then give books here.</EmptyState> : <>
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">1. Grade</p>
          <div className="flex flex-wrap gap-2">
            {grades.map((x) => <button key={x.id} onClick={() => setGrade(x.id)} className={cn('rounded-full px-4 py-2 text-sm font-semibold ring-1 transition', g?.id === x.id ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-violet-50')}>
              {x.name} <span className="opacity-70">· {x.classes.length} section{x.classes.length === 1 ? '' : 's'}</span></button>)}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">2. Sections</p>
              <button className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => setSecs(secs.length === g!.classes.length ? [] : g!.classes.map((c) => c.id))}>{secs.length === g!.classes.length ? 'None' : 'All sections'}</button></div>
            <div className="space-y-2">
              {g!.classes.map((c) => (
                <label key={c.id} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3', secs.includes(c.id) ? 'border-violet-300 bg-violet-50' : 'border-slate-200')}>
                  <input type="checkbox" className="size-4 accent-violet-600" checked={secs.includes(c.id)} onChange={() => toggle(secs, setSecs, c.id)} />
                  <span className="font-medium">{c.name}{c.section ? ` – ${c.section}` : ''}</span>
                  <span className="ms-auto text-xs text-slate-500">{c.students} students · {c.teachers} teachers</span>
                </label>))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">3. Books</p>
              <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" className="accent-violet-600" checked={allBooks} onChange={(e) => setAllBooks(e.target.checked)} />Show books of other grades too</label></div>
            {!shown.length ? <p className="py-6 text-center text-sm text-slate-500">No active licence is for {g!.name}. Open a licence and use “Use for other grades”, or tick “Show books of other grades too”.</p> : (
              <div className="space-y-2">
                {shown.map((p) => {
                  const have = secs.reduce((n, id) => n + (p.held[id] ?? 0), 0);
                  const people = secs.reduce((n, id) => n + (g!.classes.find((c) => c.id === id)?.[p.seatType === 'STUDENT' ? 'students' : 'teachers'] ?? 0), 0);
                  return (
                    <div key={p.id} className={cn('rounded-lg border p-3', books.includes(p.id) ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200')}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" aria-label={`Give ${p.product}`} className="mt-1 size-4 accent-emerald-600" checked={books.includes(p.id)} onChange={() => toggle(books, setBooks, p.id)} />
                        <BookOpen className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{p.product}</span>
                            <Badge tone={p.seatType === 'STUDENT' ? 'neutral' : 'info'}>{p.seatType === 'STUDENT' ? 'Students' : 'Teachers'}</Badge>
                            {!p.gradeIds.includes(g!.id) && <Badge tone="DRAFT">other grade</Badge>}</div>
                          <p className="truncate text-xs text-slate-500">{p.books?.join(' · ')} · until {fmtDay(p.validUntil)}</p>
                          <p className="mt-1 text-sm"><b className={p.free ? 'text-emerald-700' : 'text-red-600'}>{p.free}</b> of {p.quantity} seats free · <b>{have}</b> of {people} in these sections have it</p>
                        </div>
                        <button onClick={() => auto.mutate({ id: p.id, on: !p.auto })} disabled={auto.isPending} title="New students and teachers of this book's grade get it by themselves"
                          className={cn('flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1', p.auto ? 'bg-amber-400 text-amber-950 ring-amber-400' : 'bg-white text-slate-600 ring-slate-200 hover:bg-amber-50')}>
                          <Zap className="size-3.5" />{p.auto ? 'Automatic: on' : 'Automatic'}</button>
                      </div>
                    </div>);
                })}
              </div>)}
          </Card>
        </div>

        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">4. Check and give</p>
          {!books.length || !secs.length ? <p className="text-sm text-slate-500">Tick at least one section and one book.</p>
            : preview.isLoading ? <PageLoader /> : preview.error ? <ErrorBox error={preview.error} /> : (
              <Plan plan={result?.plan ?? preview.data.plan} done={!!result} />)}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => give.mutate()} loading={give.isPending} disabled={!total || !!result}>Give books now ({total} seat{total === 1 ? '' : 's'})</Button>
            {result && <Button variant="secondary" onClick={() => setResult(null)}>Give more</Button>}
          </div>
        </Card>
      </>}
    </div>
  );
}

function Plan({ plan, done }: { plan: any[]; done: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2">Book</th><th>Already have</th><th>{done ? 'Given now' : 'Will get it'}</th><th>No seat</th><th>Seats left after</th></tr></thead>
        <tbody>{plan.map((x) => (
          <tr key={x.poolId} className="border-t border-slate-100 align-top">
            <td className="py-2 font-medium">{x.product}<div className="text-xs font-normal text-slate-500">{x.seatType === 'STUDENT' ? 'students' : 'teachers'}</div></td>
            {x.problem ? <td colSpan={4} className="py-2 text-amber-700">{x.problem}</td> : <>
              <td className="py-2">{x.already}</td>
              <td className="py-2 font-semibold text-emerald-700">{done && <CheckCircle2 className="me-1 inline size-4" />}{x.willGet}</td>
              <td className="py-2">{x.short ? <span className="text-red-600" title={x.shortNames.join(', ')}><AlertTriangle className="me-1 inline size-4" />{x.short}<div className="max-w-60 text-xs">{x.shortNames.slice(0, 5).join(', ')}{x.short > 5 ? '…' : ''} — buy more seats</div></span> : '0'}</td>
              <td className="py-2"><b className={x.left ? '' : 'text-red-600'}>{x.left}</b></td></>}
          </tr>))}</tbody>
      </table>
    </div>
  );
}
