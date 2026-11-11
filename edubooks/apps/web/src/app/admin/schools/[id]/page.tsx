'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, Gift, KeyRound, Pause, Play, Receipt } from 'lucide-react';
import { api, daysLeft, fmtDay, fmtMoney } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { useAction } from '@/lib/hooks';
import { Badge, Button, Card, Confirm, Dialog, ErrorBox, Field, Input, PageLoader, Select, Tabs } from '@/components/ui';
import { CredentialsDialog, Stat, Status, Table, Td } from '@/components/common';
import { PoolsTable, PublisherPoolDialog } from '@/components/pools';

function YearDialog({ schoolId, onClose }: { schoolId: string; onClose: () => void }) {
  const y = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [f, setF] = useState({ name: `${y + 1}–${String(y + 2).slice(2)}`, startsOn: `${y + 1}-08-01`, endsOn: `${y + 2}-07-31` });
  const m = useAction(() => api.post(`/schools/${schoolId}/academic-years`, { ...f, endsOn: `${f.endsOn}T23:59:59Z` }), { ok: 'Academic year added', keys: ['school'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title="Add academic year" description="Student licences are valid for one academic year and expire automatically at its end.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Starts"><Input type="date" required value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} /></Field>
          <Field label="Ends"><Input type="date" required value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} /></Field></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Add year</Button></div>
      </form>
    </Dialog>
  );
}

function AdjustmentDialog({ school, onClose }: { school: any; onClose: () => void }) {
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: () => api.get('/commerce/products?pageSize=100') });
  const [f, setF] = useState({ academicYearId: school.academicYears[0]?.id ?? '', productVersionId: '', seatType: 'TEACHER', quantity: 1, kind: 'COMPLIMENTARY', reason: '' });
  const m = useAction(() => api.post('/licensing/adjustments', { ...f, schoolId: school.id }), { ok: 'Seats issued', keys: ['school', 'pools'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title="Issue seats by adjustment" description="For seats not covered by an order (complimentary teacher copies, corrections, trials). Every adjustment is recorded with its reason.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Academic year"><Select required value={f.academicYearId} onChange={(e) => setF({ ...f, academicYearId: e.target.value })}>{school.academicYears.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
          <Field label="Product"><Select required value={f.productVersionId} onChange={(e) => setF({ ...f, productVersionId: e.target.value })}><option value="">Select…</option>
            {products.data?.items.filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.active.id}>{p.name} (v{p.active.versionNo})</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Seat type"><Select value={f.seatType} onChange={(e) => setF({ ...f, seatType: e.target.value })}><option value="TEACHER">Teacher</option><option value="STUDENT">Student</option></Select></Field>
          <Field label="Seats"><Input type="number" min={1} required value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} /></Field>
          <Field label="Kind"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="COMPLIMENTARY">Complimentary</option><option value="CORRECTION">Correction</option><option value="TRIAL">Trial</option></Select></Field>
        </div>
        <Field label="Reason"><Input required minLength={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. 2 free teacher copies with the order" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Issue seats</Button></div>
      </form>
    </Dialog>
  );
}

export default function SchoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: me } = useMe(); const isAdmin = hasRole(me, 'PUBLISHER_ADMIN');
  const q = useQuery({ queryKey: ['school', id], queryFn: () => api.get(`/schools/${id}`) });
  const pools = useQuery({ queryKey: ['pools', id], queryFn: () => api.get(`/licensing/pools?schoolId=${id}`) });
  const orders = useQuery({ queryKey: ['orders', 'school', id], queryFn: () => api.get(`/commerce/orders?schoolId=${id}&pageSize=50`) });
  const [tab, setTab] = useState<'licences' | 'orders' | 'years' | 'admins'>('licences');
  const [dlg, setDlg] = useState<'' | 'year' | 'adjust' | 'suspend' | 'convert'>('');
  const [poolId, setPoolId] = useState(''); const [creds, setCreds] = useState<any>(null);
  const keys = ['school', 'schools'];
  const status = useAction((s: 'suspend' | 'reactivate') => api.post(`/schools/${id}/${s}`, {}), { ok: 'Saved', keys, after: () => setDlg('') });
  const convert = useAction(() => api.post(`/schools/${id}/convert-demo`), { ok: 'Now a customer school', keys, after: () => setDlg('') });
  const extend = useAction(() => api.post(`/schools/${id}/extend-demo`, { days: 7 }), { ok: 'Demo extended by 7 days', keys });
  const reset = useAction((userId: string) => api.post(`/schools/${id}/admins/${userId}/reset-password`), { after: (r) => setCreds([{ displayName: 'School admin', ...r }]) });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data; const L = s.licences;
  return (
    <div className="space-y-6">
      <Link href="/admin/schools" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Schools</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold text-slate-900">{s.name}</h1><Status s={s.status} />
            {s.isDemo && <Badge tone="info">Demo · {daysLeft(s.demoExpiresAt) < 0 ? 'expired' : `ends ${fmtDay(s.demoExpiresAt)}`}</Badge>}</div>
          <p className="text-sm text-slate-500">Code <b className="font-mono text-slate-700">{s.code}</b>{s.city && ` · ${s.city}`}{s.phone && ` · ${s.phone}`}</p>
          <p className="text-sm text-slate-500">{s.counts.TEACHER ?? 0} teachers · {s.counts.STUDENT ?? 0} students · {s.counts.SCHOOL_ADMIN ?? 0} admins</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/orders?new=1&school=${s.id}`} className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"><Receipt className="size-4" />New order</Link>
          {isAdmin && <Button variant="secondary" onClick={() => setDlg('adjust')} disabled={!s.academicYears.length}><Gift className="size-4" />Adjustment</Button>}
          {s.isDemo && <Button variant="secondary" onClick={() => extend.mutate()}>+7 days</Button>}
          {s.isDemo && isAdmin && <Button variant="success" onClick={() => setDlg('convert')}>Convert to customer</Button>}
          {isAdmin && (s.status === 'ACTIVE' ? <Button variant="ghost" onClick={() => setDlg('suspend')}><Pause className="size-4" />Suspend</Button>
            : <Button variant="secondary" onClick={() => status.mutate('reactivate')}><Play className="size-4" />Reactivate</Button>)}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Student seats" value={`${L.students.assigned} / ${L.students.purchased - L.students.expired - L.students.revoked}`} sub={`${L.students.available} available · ${L.students.expired} expired`} />
        <Stat label="Teacher seats" value={`${L.teachers.assigned} / ${L.teachers.purchased - L.teachers.expired - L.teachers.revoked}`} sub={`${L.teachers.available} available`} />
        <Stat label="Expiring ≤ 45 days" value={L.expiringSoon.length} tone={L.expiringSoon.length ? 'amber' : 'slate'} sub="licence pools" />
        <Stat label="Transfer requests" value={L.pendingTransfers} tone={L.pendingTransfers ? 'amber' : 'slate'} sub="awaiting approval" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'licences', label: 'Licences', count: pools.data?.length }, { id: 'orders', label: 'Orders', count: orders.data?.total },
        { id: 'years', label: 'Academic years', count: s.academicYears.length }, { id: 'admins', label: 'School admins', count: s.admins.length }]} />
      {tab === 'licences' && (pools.data ? <PoolsTable pools={pools.data} onOpen={(p) => setPoolId(p.id)} /> : <PageLoader />)}
      {tab === 'orders' && (
        <Table head={['Order', 'Type', 'Year', 'Seats', 'Value', 'Status']} empty={!orders.data?.items.length}>
          {orders.data?.items.map((o: any) => (
            <tr key={o.id} className="hover:bg-slate-50"><Td><Link className="font-mono font-medium text-brand-700 hover:underline" href={`/admin/orders/${o.id}`}>{o.orderNo}</Link></Td>
              <Td>{o.type.toLowerCase()}</Td><Td>{o.academicYear}</Td><Td>{o.students} students · {o.teachers} teachers</Td><Td className="tabular-nums">{fmtMoney(o.totalMinor)}</Td><Td><Status s={o.status} /></Td></tr>))}
        </Table>
      )}
      {tab === 'years' && (
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><span className="font-semibold">Academic years</span>
            <Button size="sm" onClick={() => setDlg('year')}><CalendarPlus className="size-4" />Add year</Button></div>
          <ul className="divide-y divide-slate-100 text-sm">{s.academicYears.map((y: any) => {
            const now = Date.now(); const cur = new Date(y.startsOn).getTime() <= now && new Date(y.endsOn).getTime() > now;
            return <li key={y.id} className="flex justify-between px-5 py-3"><span className="font-medium">{y.name} {cur && <Badge tone="PUBLISHED">current</Badge>}</span><span className="text-slate-500">{fmtDay(y.startsOn)} – {fmtDay(y.endsOn)}</span></li>;
          })}{!s.academicYears.length && <li className="px-5 py-6 text-center text-slate-500">Add an academic year before creating orders.</li>}</ul>
        </Card>
      )}
      {tab === 'admins' && (
        <Table head={['Name', 'Username', 'Last sign-in', 'Status', '']}>
          {s.admins.map((a: any) => <tr key={a.id}><Td>{a.displayName}</Td><Td className="font-mono">{a.username}</Td><Td className="text-slate-500">{a.lastLoginAt ? fmtDay(a.lastLoginAt) : 'never'}</Td><Td><Status s={a.status} /></Td>
            <Td className="text-right">{isAdmin && <Button size="sm" variant="ghost" onClick={() => reset.mutate(a.id)}><KeyRound className="size-4" />Reset password</Button>}</Td></tr>)}
        </Table>
      )}
      {dlg === 'year' && <YearDialog schoolId={s.id} onClose={() => setDlg('')} />}
      {dlg === 'adjust' && <AdjustmentDialog school={s} onClose={() => setDlg('')} />}
      {poolId && <PublisherPoolDialog poolId={poolId} canManage={isAdmin} onClose={() => setPoolId('')} />}
      {creds && <CredentialsDialog title="New school admin password" schoolCode={s.code} creds={creds} onClose={() => setCreds(null)} />}
      <Confirm open={dlg === 'suspend'} onOpenChange={() => setDlg('')} title={`Suspend ${s.name}?`} danger confirmLabel="Suspend school" loading={status.isPending} onConfirm={() => status.mutate('suspend')}
        body={<p>Everyone at this school is signed out immediately and cannot sign in until you reactivate it. Licences and data are kept.</p>} />
      <Confirm open={dlg === 'convert'} onOpenChange={() => setDlg('')} title="Convert demo into a customer?" confirmLabel="Convert" loading={convert.isPending} onConfirm={() => convert.mutate()}
        body={<p>The school keeps its code and accounts and no longer expires. Trial seats still end on their own date — record the real order next.</p>} />
    </div>
  );
}
