'use client';
import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowLeftRight, GraduationCap, Pencil, Search, UserPlus } from 'lucide-react';
import { api, fmtDate, fmtDay } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Select, Textarea } from '@/components/ui';
import { SeatBar, Status } from '@/components/common';
import { poolLive } from '@/components/pools';

export default function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pool = useQuery({ queryKey: ['schoolPool', id], queryFn: () => api.get(`/school/pools/${id}`) });
  const eligible = useQuery({ queryKey: ['eligible', id], queryFn: () => api.get(`/school/pools/${id}/eligible`) });
  const grades = useQuery({ queryKey: ['poolGrades', id], queryFn: () => api.get<any>(`/school/pools/${id}/grades`) });
  const [scope, setScope] = useState<'grade' | 'all' | null>(null); const [editGrades, setEditGrades] = useState(false);
  const [picked, setPicked] = useState<string[]>([]); const [search, setSearch] = useState(''); const [showEnded, setShowEnded] = useState(false);
  const [transfer, setTransfer] = useState<any>(null); const [release, setRelease] = useState<any>(null);
  const keys = ['schoolPool', 'eligible', 'schoolPools', 'schoolOverview', 'people', 'transfers'];
  const assign = useAction(() => api.post(`/school/pools/${id}/assign`, { userIds: picked }), { ok: (r) => `${r.assigned.length} seat(s) assigned 🎉`, keys, after: () => setPicked([]) });
  const matching = (eligible.data ?? []).filter((u: any) => u.match).length;
  const gradeNames = [...(grades.data?.book ?? []), ...(grades.data?.extra ?? [])].map((g: any) => g.name);
  const view = scope ?? (matching ? 'grade' : 'all');
  const filtered = useMemo(() => (eligible.data ?? []).filter((u: any) => (view === 'all' || u.match) && (!search || `${u.displayName} ${u.username} ${u.className ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [eligible.data, search, view]);
  if (pool.isLoading) return <PageLoader />;
  if (pool.error) return <ErrorBox error={pool.error} />;
  const p = pool.data; const live = poolLive(p); const isStudent = p.seatType === 'STUDENT';
  const free = p.available; const holders = p.assignments.filter((a: any) => ['ACTIVE', 'SUSPENDED'].includes(a.status));
  const history = p.assignments.filter((a: any) => !['ACTIVE', 'SUSPENDED'].includes(a.status));
  return (
    <div className="space-y-6">
      <Link href="/school/licences" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Book licences</Link>
      <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">{p.productName}</h1><Badge tone={isStudent ? 'neutral' : 'info'}>{isStudent ? 'Student seats' : 'Teacher seats'}</Badge><Status s={live ? p.status : p.status === 'ACTIVE' ? 'EXPIRED' : p.status} /></div>
        <p className="text-sm text-slate-500">{p.books?.join(' · ')} — {p.academicYear}, valid until {fmtDay(p.validUntil)}</p></div>
      <Card className="flex flex-wrap items-center gap-2 p-4">
        <GraduationCap className="size-5 text-violet-600" /><span className="text-sm font-medium text-slate-700">This book is for</span>
        {(grades.data?.book ?? []).map((g: any) => <span key={g.id} className="rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-800">{g.name}</span>)}
        {(grades.data?.extra ?? []).map((g: any) => <span key={g.id} className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800" title="Added by your school">+ {g.name}</span>)}
        {grades.data && !grades.data.book.length && !grades.data.extra.length && <span className="text-sm text-slate-500">no grade set</span>}
        <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setEditGrades(true)}><Pencil className="size-4" />Use for other grades</Button>
      </Card>
      <Card className="p-5"><SeatBar assigned={p.assigned + p.suspended} total={p.quantity - p.revoked} /><p className="mt-2 text-sm text-slate-600">{free} of {p.quantity - p.revoked} seats free</p></Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="border-b border-slate-100 px-5 py-3"><h2 className="font-semibold">Give seats</h2>
            <p className="text-xs text-slate-500">{isStudent ? 'Students' : 'Teachers'} without a seat in this licence. Select up to {free}.</p></div>
          {!live ? <p className="p-5 text-sm text-slate-500">This licence is not active, so no seats can be assigned. A renewal order is needed.</p> : (
            <div className="space-y-3 p-5">
              <div className="flex flex-wrap gap-1.5" role="tablist">
                <button role="tab" aria-selected={view === 'grade'} onClick={() => { setScope('grade'); setPicked([]); }} className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${view === 'grade' ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'}`}>
                  {gradeNames.length ? `${gradeNames.join(' + ')} ${isStudent ? 'students' : 'teachers'}` : 'Book grade'} ({matching})</button>
                <button role="tab" aria-selected={view === 'all'} onClick={() => { setScope('all'); setPicked([]); }} className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${view === 'all' ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'}`}>
                  All {isStudent ? 'students' : 'teachers'} ({eligible.data?.length ?? 0})</button>
              </div>
              {view === 'all' && matching > 0 && <p className="text-xs text-amber-700">Showing everyone — people outside {gradeNames.join(' + ') || 'the book grade'} are included.</p>}
              {view === 'grade' && !matching && <p className="text-xs text-slate-500">No {isStudent ? 'students' : 'teachers'} in {gradeNames.join(' + ') || 'this grade'} without a seat. Use “Use for other grades” to give this book to another grade, or show all.</p>}
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-500" /><Input className="pl-9" placeholder="Search…" aria-label="Search people" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <div className="flex justify-between text-xs"><button className="text-emerald-700 hover:underline" onClick={() => setPicked(filtered.slice(0, free).map((u: any) => u.id))}>Select first {Math.min(free, filtered.length)}</button>
                <span className={picked.length > free ? 'font-medium text-red-600' : 'text-slate-500'}>{picked.length} selected · {free} free</span></div>
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {filtered.map((u: any) => (
                  <li key={u.id}><label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" className="size-4" checked={picked.includes(u.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, u.id] : picked.filter((x) => x !== u.id))} />
                    <span className="min-w-0 flex-1">{u.displayName}{u.className && <span className="block truncate text-xs text-slate-500">{u.className}{u.gradeName ? ` · ${u.gradeName}` : ''}</span>}</span>
                    {!u.className && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">no class</span>}
                    {view === 'all' && u.match && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">book grade</span>}
                    <span className="font-mono text-xs text-slate-500">{u.username}</span></label></li>
                ))}
                {!filtered.length && <li className="px-3 py-6 text-center text-sm text-slate-500">Everyone already has a seat — or add {isStudent ? 'students' : 'teachers'} first.</li>}
              </ul>
              <Button className="w-full" disabled={!picked.length || picked.length > free} loading={assign.isPending} onClick={() => assign.mutate()}><UserPlus className="size-4" />Assign {picked.length || ''} seat{picked.length === 1 ? '' : 's'}</Button>
            </div>
          )}
        </Card>
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="font-semibold">Seat holders ({holders.length})</h2>
            <label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />history</label></div>
          {isStudent && <p className="border-b border-slate-100 bg-amber-50 px-5 py-2 text-xs text-amber-800">Student seats can be moved to another student only with the publisher&apos;s approval — use “Transfer”.</p>}
          <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
            {[...holders, ...(showEnded ? history : [])].map((a: any) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-10 text-xs tabular-nums text-slate-500">#{a.seatNo}</span>
                <span className="flex-1"><span className="font-medium">{a.displayName}</span> <span className="font-mono text-xs text-slate-500">{a.username}</span>
                  {a.endReason && <span className="block text-xs text-slate-500">{a.endReason}{a.endedAt && ` · ${fmtDate(a.endedAt)}`}</span>}</span>
                <Status s={a.status} />{a.pendingTransfer && <Badge tone="DRAFT">transfer pending</Badge>}
                {a.status === 'ACTIVE' && live && (isStudent
                  ? !a.pendingTransfer && <Button size="sm" variant="ghost" onClick={() => setTransfer(a)}><ArrowLeftRight className="size-4" />Transfer</Button>
                  : <Button size="sm" variant="ghost" onClick={() => setRelease(a)}>Release</Button>)}
              </li>
            ))}
            {!holders.length && !showEnded && <li className="px-5 py-8 text-center text-sm text-slate-500">No seats assigned yet.</li>}
          </ul>
        </Card>
      </div>
      {transfer && <TransferDialog a={transfer} candidates={eligible.data ?? []} onClose={() => setTransfer(null)} />}
      {release && <ReleaseDialog a={release} onClose={() => setRelease(null)} />}
      {editGrades && grades.data && <GradesDialog poolId={id} data={grades.data} onClose={() => setEditGrades(false)} />}
    </div>
  );
}

function TransferDialog({ a, candidates, onClose }: { a: any; candidates: any[]; onClose: () => void }) {
  const [toUserId, setTo] = useState(''); const [reason, setReason] = useState('');
  const m = useAction(() => api.post('/school/transfers', { assignmentId: a.id, toUserId, reason }), { ok: 'Request sent to the publisher', keys: ['schoolPool', 'transfers', 'schoolOverview'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title={`Transfer ${a.displayName}'s seat`} description="The publisher reviews every student seat transfer. Until it is approved, the current student keeps access.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Give the seat to"><Select required value={toUserId} onChange={(e) => setTo(e.target.value)}><option value="">Select student…</option>{candidates.map((u) => <option key={u.id} value={u.id}>{u.displayName} ({u.username})</option>)}</Select></Field>
        <Field label="Reason"><Textarea required minLength={3} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Ali left the school in October; Sara joined KG-B" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Send request</Button></div>
      </form>
    </Dialog>
  );
}
function ReleaseDialog({ a, onClose }: { a: any; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const m = useAction(() => api.post(`/school/assignments/${a.id}/release`, { reason }), { ok: 'Seat released', keys: ['schoolPool', 'eligible', 'schoolPools', 'schoolOverview'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title={`Release ${a.displayName}'s teacher seat?`} description="The teacher loses access to these books and the seat becomes free for another teacher.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Reason (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Teaching another class now" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" loading={m.isPending}>Release seat</Button></div>
      </form>
    </Dialog>
  );
}

function GradesDialog({ poolId, data, onClose }: { poolId: string; data: any; onClose: () => void }) {
  const [sel, setSel] = useState<string[]>(data.extra.map((g: any) => g.id));
  const book = new Set(data.book.map((g: any) => g.id));
  const m = useAction(() => api.put(`/school/pools/${poolId}/grades`, { gradeIds: sel }), { ok: 'Grades saved', keys: ['poolGrades', 'eligible'], after: onClose });
  const [all, setAll] = useState(false);
  const opts = data.options.filter((g: any) => all || g.inSchool || book.has(g.id) || sel.includes(g.id));
  return (
    <Dialog open onOpenChange={onClose} title="Which grades use this book?" description="The publisher made this book for the grade shown in purple. If your school also uses it in other grades (e.g. a KG book in KG2), tick them — their students then show first when you give seats.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="grid max-h-80 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {opts.map((g: any) => {
            const isBook = book.has(g.id);
            return (
              <label key={g.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isBook ? 'border-violet-200 bg-violet-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="checkbox" disabled={isBook} checked={isBook || sel.includes(g.id)} onChange={(e) => setSel(e.target.checked ? [...sel, g.id] : sel.filter((x) => x !== g.id))} />
                <span className="min-w-0 flex-1"><b className="font-medium">{g.name}</b>{all && g.curriculum && <span className="block truncate text-[11px] text-slate-500">{g.curriculum}</span>}</span>
                {isBook ? <span className="text-[11px] text-violet-700">book grade</span> : g.inSchool && <span className="text-[11px] text-emerald-700">has classes</span>}
              </label>);
          })}
        </div>
        <button type="button" className="text-sm font-medium text-brand-700 hover:underline" onClick={() => setAll(!all)}>{all ? 'Show only grades with classes in my school' : 'Show all grades'}</button>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Save</Button></div>
      </form>
    </Dialog>
  );
}
