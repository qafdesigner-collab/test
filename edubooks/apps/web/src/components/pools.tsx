'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, daysLeft, fmtDate, fmtDay } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Badge, Button, Dialog, Field, Input, PageLoader } from '@/components/ui';
import { SeatBar, Status, Table, Td } from '@/components/common';

export interface PoolRow {
  id: string; seatType: 'STUDENT' | 'TEACHER'; quantity: number; status: string; validUntil: string; productName: string; sku: string; versionNo: number;
  schoolName: string; schoolCode: string; academicYear: string; assigned: number; suspended: number; available: number; revoked: number; books: string[];
  source: 'ORDER' | 'ADJUSTMENT'; orderNo: string | null; adjustment: { kind: string; reason: string } | null;
}
export const poolLive = (p: PoolRow) => p.status === 'ACTIVE' && new Date(p.validUntil) > new Date();

export function PoolsTable({ pools, showSchool, onOpen, action }: { pools: PoolRow[]; showSchool?: boolean; onOpen?: (p: PoolRow) => void; action?: (p: PoolRow) => React.ReactNode }) {
  return (
    <Table head={[...(showSchool ? ['School'] : []), 'Product', 'Seats', 'Usage', 'Valid until', 'Source', 'Status', '']} empty={!pools.length}>
      {pools.map((p) => {
        const d = daysLeft(p.validUntil); const live = poolLive(p);
        return (
          <tr key={p.id} className="hover:bg-slate-50">
            {showSchool && <Td><div className="font-medium">{p.schoolName}</div><div className="font-mono text-xs text-slate-500">{p.schoolCode}</div></Td>}
            <Td><button onClick={() => onOpen?.(p)} className="text-left font-medium text-slate-900 hover:text-brand-700">{p.productName} <span className="text-xs text-slate-500">v{p.versionNo}</span></button>
              <div className="max-w-xs truncate text-xs text-slate-500" title={p.books?.join(', ')}>{p.books?.join(' · ')}</div></Td>
            <Td><Badge tone={p.seatType === 'TEACHER' ? 'info' : 'neutral'}>{p.seatType === 'TEACHER' ? 'Teacher' : 'Student'}</Badge></Td>
            <Td className="min-w-40"><SeatBar assigned={p.assigned + p.suspended} total={p.quantity - p.revoked} /></Td>
            <Td><div className="whitespace-nowrap">{fmtDay(p.validUntil)}</div><div className={`text-xs ${!live ? 'text-slate-500' : d <= 45 ? 'text-amber-600' : 'text-slate-500'}`}>{p.academicYear}{live && d <= 45 ? ` · ${d} days left` : ''}</div></Td>
            <Td className="text-xs">{p.source === 'ORDER' ? <span className="font-mono">{p.orderNo}</span> : <span title={p.adjustment?.reason}>{p.adjustment?.kind.toLowerCase()} adjustment</span>}</Td>
            <Td><Status s={p.status === 'ACTIVE' && !live ? 'EXPIRED' : p.status} /></Td>
            <Td className="text-right">{action?.(p)}</Td>
          </tr>
        );
      })}
    </Table>
  );
}

/** Publisher view of one pool: who holds which seat, with suspend / revoke actions (admins). */
export function PublisherPoolDialog({ poolId, onClose, canManage }: { poolId: string; onClose: () => void; canManage: boolean }) {
  const q = useQuery({ queryKey: ['pool', poolId], queryFn: () => api.get(`/licensing/pools/${poolId}`) });
  const keys = ['pool', 'pools', 'licDash', 'school'];
  const [revoke, setRevoke] = useState<any>(null); const [reason, setReason] = useState('');
  const act = useAction((v: { path: string; body?: any }) => api.post(v.path, v.body ?? {}), { ok: 'Done', keys });
  const doRevoke = useAction(() => api.post(`/licensing/assignments/${revoke.id}/revoke`, { reason }), { ok: 'Seat revoked', keys, after: () => { setRevoke(null); setReason(''); } });
  const p = q.data;
  return (
    <Dialog open onOpenChange={onClose} wide title={p ? `${p.productName} v${p.versionNo} — ${p.seatType.toLowerCase()} seats` : 'Licence pool'} description={p ? `${p.schoolName} · ${p.academicYear} · valid until ${fmtDay(p.validUntil)}` : undefined}>
      {!p ? <PageLoader /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm"><Status s={p.status} /><span>{p.quantity} purchased · {p.assigned} assigned · {p.available} free · {p.revoked} revoked</span>
            <div className="flex-1" />
            {canManage && p.status === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: `/licensing/pools/${p.id}/suspend`, body: { reason: 'Suspended by publisher' } })}>Suspend pool</Button>}
            {canManage && p.status === 'SUSPENDED' && <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: `/licensing/pools/${p.id}/reactivate` })}>Reactivate pool</Button>}
          </div>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Seat</th><th className="px-3 py-2">Holder</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Since</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {p.assignments.map((a: any) => (
                  <tr key={a.id}><td className="px-3 py-2 tabular-nums">#{a.seatNo}</td><td className="px-3 py-2">{a.displayName} <span className="font-mono text-xs text-slate-500">{a.username}</span></td>
                    <td className="px-3 py-2"><Status s={a.status} />{a.pendingTransfer && <Badge tone="DRAFT" className="ml-1">transfer pending</Badge>}{a.endReason && <div className="text-xs text-slate-500">{a.endReason}</div>}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(a.assignedAt)}</td>
                    <td className="px-3 py-2 text-right">{canManage && a.status === 'ACTIVE' && <>
                      <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `/licensing/assignments/${a.id}/suspend` })}>Suspend</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRevoke(a)}>Revoke</Button></>}
                      {canManage && a.status === 'SUSPENDED' && <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `/licensing/assignments/${a.id}/reactivate` })}>Reactivate</Button>}</td></tr>
                ))}
                {!p.assignments.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No seats assigned yet.</td></tr>}
              </tbody></table>
          </div>
          {revoke && (
            <form className="flex flex-wrap items-end gap-2 rounded-lg bg-red-50 p-3" onSubmit={(e) => { e.preventDefault(); doRevoke.mutate(); }}>
              <Field label={`Revoke ${revoke.displayName}'s seat — reason`} className="flex-1"><Input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <Button type="button" variant="secondary" onClick={() => setRevoke(null)}>Cancel</Button><Button variant="danger" loading={doRevoke.isPending}>Revoke</Button>
            </form>
          )}
        </div>
      )}
    </Dialog>
  );
}
