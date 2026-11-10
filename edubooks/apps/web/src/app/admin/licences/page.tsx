'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Download, PlayCircle, X } from 'lucide-react';
import { api, downloadCsv, fmtDate, fmtDay } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { useAction } from '@/lib/hooks';
import { Button, Card, ErrorBox, Input, PageLoader, Select, Tabs } from '@/components/ui';
import { PageHeader, Stat, Status, Table, Td } from '@/components/common';
import { PoolsTable, PublisherPoolDialog } from '@/components/pools';

function Transfers({ canDecide }: { canDecide: boolean }) {
  const [status, setStatus] = useState('PENDING');
  const q = useQuery({ queryKey: ['transfers', status], queryFn: () => api.get(`/licensing/transfers${status ? `?status=${status}` : ''}`) });
  const [note, setNote] = useState<Record<string, string>>({});
  const decide = useAction((v: { id: string; d: 'approve' | 'reject' }) => api.post(`/licensing/transfers/${v.id}/${v.d}`, { note: note[v.id] || undefined }),
    { ok: 'Decision recorded', keys: ['transfers', 'licDash', 'pools'] });
  return (
    <div className="space-y-4">
      <Select className="w-48" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option><option value="">All</option></Select>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <Table head={['Requested', 'School', 'Licence', 'From → To', 'Reason', 'Status', '']} empty={!q.data.length}>
          {q.data.map((t: any) => (
            <tr key={t.id}><Td className="whitespace-nowrap text-slate-500">{fmtDate(t.requestedAt)}<div className="text-xs">by {t.requestedBy}</div></Td>
              <Td>{t.schoolName} <span className="font-mono text-xs text-slate-400">{t.schoolCode}</span></Td><Td className="text-xs">{t.product}</Td>
              <Td><b>{t.fromUser}</b> → <b>{t.toUser}</b></Td><Td className="max-w-xs text-slate-600">{t.reason}{t.decisionNote && <div className="text-xs text-slate-400">Note: {t.decisionNote}</div>}</Td>
              <Td><Status s={t.status} /></Td>
              <Td className="min-w-64 text-right">{t.status === 'PENDING' && canDecide && (
                <div className="flex items-center gap-1"><Input className="h-8 min-w-28" placeholder="Note (optional)" aria-label="Decision note" value={note[t.id] ?? ''} onChange={(e) => setNote({ ...note, [t.id]: e.target.value })} />
                  <Button size="sm" variant="success" onClick={() => decide.mutate({ id: t.id, d: 'approve' })}><Check className="size-4" />Approve</Button>
                  <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: t.id, d: 'reject' })}><X className="size-4" /></Button></div>)}</Td></tr>
          ))}
        </Table>
      )}
    </div>
  );
}

export default function LicencesPage() {
  const { data: me } = useMe(); const isAdmin = hasRole(me, 'PUBLISHER_ADMIN');
  const [tab, setTab] = useState<'pools' | 'transfers' | 'expiring'>('pools');
  const [f, setF] = useState({ status: '', seatType: '' });
  const dash = useQuery({ queryKey: ['licDash'], queryFn: () => api.get('/licensing/dashboard') });
  const pools = useQuery({ queryKey: ['pools', 'all', f], queryFn: () => api.get(`/licensing/pools?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`) });
  const [poolId, setPoolId] = useState('');
  const expire = useAction(() => api.post('/licensing/run-expiry'), { ok: (r: any) => `${r.expiredPools} pool(s) marked expired`, keys: ['licDash', 'pools'] });
  const exportUsage = async () => downloadCsv(`licence-usage-${new Date().toISOString().slice(0, 10)}.csv`, (await api.get('/licensing/reports/usage')).map((r: any) => ({ ...r, validUntil: fmtDay(r.validUntil) })));
  const d = dash.data;
  return (
    <div className="space-y-6">
      <PageHeader title="Licences" sub="Purchased, allocated and remaining seats across all schools. Student licences expire automatically at the end of their academic year.">
        <Button variant="secondary" onClick={exportUsage}><Download className="size-4" />Usage report (CSV)</Button>
        {isAdmin && <Button variant="ghost" onClick={() => expire.mutate()} loading={expire.isPending} title="Runs automatically every hour"><PlayCircle className="size-4" />Run expiry now</Button>}
      </PageHeader>
      {!d ? <PageLoader /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Student seats bought" value={d.students.purchased} />
            <Stat label="Assigned" value={d.students.assigned} tone="green" />
            <Stat label="Available" value={d.students.available} />
            <Stat label="Suspended" value={d.students.suspended} tone={d.students.suspended ? 'red' : 'slate'} />
            <Stat label="Expired" value={d.students.expired} tone="slate" />
            <Stat label="Revoked" value={d.students.revoked} tone="slate" />
          </div>
          <Card className="flex flex-wrap gap-x-8 gap-y-2 p-4 text-sm text-slate-600">
            <span><b className="text-slate-900">Teacher seats:</b> {d.teachers.purchased} bought · {d.teachers.assigned} assigned · {d.teachers.available} available</span>
            <span><b className="text-slate-900">{d.pendingTransfers}</b> transfer request(s) awaiting approval</span>
            <span><b className="text-slate-900">{d.expiringSoon.length}</b> pool(s) expiring within 45 days</span>
          </Card>
        </>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'pools', label: 'Licence pools', count: pools.data?.length }, { id: 'transfers', label: 'Transfer requests', count: d?.pendingTransfers }, { id: 'expiring', label: 'Expiring soon', count: d?.expiringSoon.length }]} />
      {tab === 'pools' && (
        <>
          <div className="flex gap-3">
            <Select className="w-44" aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Any status</option>{['ACTIVE', 'SUSPENDED', 'EXPIRED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select>
            <Select className="w-56" aria-label="Seat type" value={f.seatType} onChange={(e) => setF({ ...f, seatType: e.target.value })}><option value="">Students & teachers</option><option value="STUDENT">Student seats</option><option value="TEACHER">Teacher seats</option></Select>
          </div>
          {pools.data ? <PoolsTable showSchool pools={pools.data} onOpen={(p) => setPoolId(p.id)} /> : <PageLoader />}
        </>
      )}
      {tab === 'transfers' && <Transfers canDecide={isAdmin} />}
      {tab === 'expiring' && d && <PoolsTable showSchool pools={d.expiringSoon} onOpen={(p) => setPoolId(p.id)} />}
      {poolId && <PublisherPoolDialog poolId={poolId} canManage={isAdmin} onClose={() => setPoolId('')} />}
    </div>
  );
}
