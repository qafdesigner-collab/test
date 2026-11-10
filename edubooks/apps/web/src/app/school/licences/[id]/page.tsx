'use client';
import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowLeftRight, Search, UserPlus } from 'lucide-react';
import { api, fmtDate, fmtDay } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Select, Textarea } from '@/components/ui';
import { SeatBar, Status } from '@/components/common';
import { poolLive } from '@/components/pools';

export default function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pool = useQuery({ queryKey: ['schoolPool', id], queryFn: () => api.get(`/school/pools/${id}`) });
  const eligible = useQuery({ queryKey: ['eligible', id], queryFn: () => api.get(`/school/pools/${id}/eligible`) });
  const [picked, setPicked] = useState<string[]>([]); const [search, setSearch] = useState(''); const [showEnded, setShowEnded] = useState(false);
  const [transfer, setTransfer] = useState<any>(null); const [release, setRelease] = useState<any>(null);
  const keys = ['schoolPool', 'eligible', 'schoolPools', 'schoolOverview', 'people', 'transfers'];
  const assign = useAction(() => api.post(`/school/pools/${id}/assign`, { userIds: picked }), { ok: (r) => `${r.assigned.length} seat(s) assigned 🎉`, keys, after: () => setPicked([]) });
  const filtered = useMemo(() => (eligible.data ?? []).filter((u: any) => !search || `${u.displayName} ${u.username}`.toLowerCase().includes(search.toLowerCase())), [eligible.data, search]);
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
      <Card className="p-5"><SeatBar assigned={p.assigned + p.suspended} total={p.quantity - p.revoked} /><p className="mt-2 text-sm text-slate-600">{free} of {p.quantity - p.revoked} seats free</p></Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="border-b border-slate-100 px-5 py-3"><h2 className="font-semibold">Give seats</h2>
            <p className="text-xs text-slate-500">{isStudent ? 'Students' : 'Teachers'} without a seat in this licence. Select up to {free}.</p></div>
          {!live ? <p className="p-5 text-sm text-slate-500">This licence is not active, so no seats can be assigned. A renewal order is needed.</p> : (
            <div className="space-y-3 p-5">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><Input className="pl-9" placeholder="Search…" aria-label="Search people" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <div className="flex justify-between text-xs"><button className="text-emerald-700 hover:underline" onClick={() => setPicked(filtered.slice(0, free).map((u: any) => u.id))}>Select first {Math.min(free, filtered.length)}</button>
                <span className={picked.length > free ? 'font-medium text-red-600' : 'text-slate-500'}>{picked.length} selected · {free} free</span></div>
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {filtered.map((u: any) => (
                  <li key={u.id}><label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" className="size-4" checked={picked.includes(u.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, u.id] : picked.filter((x) => x !== u.id))} />
                    <span className="flex-1">{u.displayName}</span><span className="font-mono text-xs text-slate-400">{u.username}</span></label></li>
                ))}
                {!filtered.length && <li className="px-3 py-6 text-center text-sm text-slate-400">Everyone already has a seat — or add {isStudent ? 'students' : 'teachers'} first.</li>}
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
                <span className="w-10 text-xs tabular-nums text-slate-400">#{a.seatNo}</span>
                <span className="flex-1"><span className="font-medium">{a.displayName}</span> <span className="font-mono text-xs text-slate-400">{a.username}</span>
                  {a.endReason && <span className="block text-xs text-slate-400">{a.endReason}{a.endedAt && ` · ${fmtDate(a.endedAt)}`}</span>}</span>
                <Status s={a.status} />{a.pendingTransfer && <Badge tone="DRAFT">transfer pending</Badge>}
                {a.status === 'ACTIVE' && live && (isStudent
                  ? !a.pendingTransfer && <Button size="sm" variant="ghost" onClick={() => setTransfer(a)}><ArrowLeftRight className="size-4" />Transfer</Button>
                  : <Button size="sm" variant="ghost" onClick={() => setRelease(a)}>Release</Button>)}
              </li>
            ))}
            {!holders.length && !showEnded && <li className="px-5 py-8 text-center text-sm text-slate-400">No seats assigned yet.</li>}
          </ul>
        </Card>
      </div>
      {transfer && <TransferDialog a={transfer} candidates={eligible.data ?? []} onClose={() => setTransfer(null)} />}
      {release && <ReleaseDialog a={release} onClose={() => setRelease(null)} />}
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
