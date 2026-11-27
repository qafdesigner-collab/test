'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, School } from 'lucide-react';
import { api, fmtDay } from '@/lib/api';
import { Button, Card, EmptyState, ErrorBox, PageLoader, cn } from '@/components/ui';
import { PageHeader, SeatBar } from '@/components/common';
import { poolLive } from '@/components/pools';
import { AssignToClassDialog, ClassChips } from '@/components/class-books';

/** Book licences: tick books → "Assign to class". Each book shows its student and teacher seats and the classes that have it. */
export default function SchoolLicences() {
  const q = useQuery({ queryKey: ['schoolPools'], queryFn: () => api.get<any[]>('/school/pools') });
  const links = useQuery({ queryKey: ['classBooks'], queryFn: () => api.get<any[]>('/school/class-books') });
  const [picked, setPicked] = useState<string[]>([]); const [open, setOpen] = useState(false);
  const books = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of q.data ?? []) {
      const k = `${p.productVersionId}|${p.academicYear}`;
      if (!m.has(k)) m.set(k, { key: k, name: p.productName, version: p.versionNo, books: p.books, year: p.academicYear, validUntil: p.validUntil, student: null, teacher: null });
      m.get(k)[p.seatType === 'STUDENT' ? 'student' : 'teacher'] = p;
    }
    return [...m.values()].map((b) => {
      const pools = [b.student, b.teacher].filter(Boolean);
      const live = pools.filter((p: any) => poolLive(p));
      const ids = pools.map((p: any) => p.id);
      const cls = new Map<string, any>();
      for (const l of links.data ?? []) if (ids.includes(l.poolId)) cls.set(l.classId, l);
      return { ...b, live: live.length > 0, poolIds: live.map((p: any) => p.id), allIds: ids, classes: [...cls.values()] };
    });
  }, [q.data, links.data]);
  const chosen = books.filter((b) => picked.includes(b.key));
  const toggle = (k: string) => setPicked((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k]);
  const liveKeys = books.filter((b) => b.live).map((b) => b.key);
  return (
    <div className="space-y-5">
      <PageHeader title="Book licences" sub="Tick the books, then “Assign to class”: every student of the class gets a student seat and the class teacher gets a teacher seat — new students later too. Use Manage to add or remove single people." />
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : !books.length ? <EmptyState title="No book licences yet">Your publisher adds them when your order is ready.</EmptyState> : <>
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/95 px-4 py-3 backdrop-blur">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-violet-600" checked={liveKeys.length > 0 && liveKeys.every((k) => picked.includes(k))}
            onChange={(e) => setPicked(e.target.checked ? liveKeys : [])} />Select all</label>
          <span className="text-sm text-slate-600">{picked.length} book{picked.length === 1 ? '' : 's'} selected</span>
          <Button className="ms-auto" disabled={!chosen.length} onClick={() => setOpen(true)}><School className="size-4" />Assign to class</Button>
        </div>
        <div className="space-y-3">
          {books.map((b) => (
            <Card key={b.key} className={cn('p-4 transition', picked.includes(b.key) && 'ring-2 ring-violet-400')}>
              <div className="flex flex-wrap items-start gap-3">
                <input type="checkbox" aria-label={`Select ${b.name}`} disabled={!b.live} className="mt-1.5 size-5 accent-violet-600" checked={picked.includes(b.key)} onChange={() => toggle(b.key)} />
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><BookOpen className="size-6" /></span>
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-semibold">{b.name} <span className="text-xs font-normal text-slate-500">v{b.version}</span>{!b.live && <span className="ms-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">not active — renewal needed</span>}</p>
                  <p className="text-xs text-slate-500">{b.books?.join(' · ')}</p>
                  <p className="text-xs text-slate-500">{b.year} · valid until {fmtDay(b.validUntil)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="text-xs font-medium text-slate-600">Classes:</span><ClassChips classes={b.classes} poolIds={b.allIds} book={b.name} /></div>
                </div>
                <div className="w-full space-y-2 sm:w-64">
                  {([['student', 'Students'], ['teacher', 'Teachers']] as const).map(([k, label]) => { const p = b[k]; return p ? (
                    <div key={k} className="rounded-lg bg-slate-50 p-2">
                      <div className="mb-1 flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">{label}: {p.assigned + p.suspended}/{p.quantity - p.revoked} · {p.available} free</span>
                        <Link href={`/school/licences/${p.id}`} className="font-semibold text-emerald-700 hover:underline">Manage</Link></div>
                      <SeatBar assigned={p.assigned + p.suspended} total={p.quantity - p.revoked} />
                    </div>) : null; })}
                </div>
              </div>
            </Card>))}
        </div>
      </>}
      {open && <AssignToClassDialog books={chosen.map((b) => ({ name: b.name, poolIds: b.poolIds }))} onClose={() => { setOpen(false); setPicked([]); }} />}
    </div>
  );
}
