'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, KeyRound, XCircle } from 'lucide-react';
import { api, fmtDate, fmtDay, fmtMoney } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { useAction } from '@/lib/hooks';
import { Button, Card, Confirm, ErrorBox, PageLoader } from '@/components/ui';
import { Status, Table, Td } from '@/components/common';

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api.get(`/commerce/orders/${id}`) });
  const [dlg, setDlg] = useState<'' | 'fulfil' | 'cancel'>('');
  const keys = ['order', 'orders', 'pools', 'school', 'schools'];
  const act = useAction((a: string) => api.post(`/commerce/orders/${id}/${a}`), { ok: (r: any) => (r?.seatsIssued ? `${r.seatsIssued} seats issued 🎉` : 'Done'), keys, after: () => setDlg('') });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const o = q.data;
  const total = o.lines.reduce((n: number, l: any) => n + (l.unitPriceMinor ?? 0) * l.studentQty, 0);
  const steps = [['Created', o.createdAt], ['Confirmed', o.confirmedAt], ['Licences issued', o.fulfilledAt]] as const;
  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Orders</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="font-mono text-2xl font-semibold text-slate-900">{o.orderNo}</h1><Status s={o.status} /></div>
          <p className="text-sm text-slate-500"><Link className="text-brand-700 hover:underline" href={`/admin/schools/${o.school.id}`}>{o.school.name}</Link> · {o.type.toLowerCase()} order · academic year {o.academicYear.name} ({fmtDay(o.academicYear.startsOn)} – {fmtDay(o.academicYear.endsOn)})</p>
          {o.notes && <p className="mt-1 text-sm text-slate-600">{o.notes}</p>}</div>
        <div className="flex gap-2">
          {o.status === 'DRAFT' && <Button onClick={() => act.mutate('confirm')} loading={act.isPending}><BadgeCheck className="size-4" />Confirm order</Button>}
          {o.status === 'CONFIRMED' && hasRole(me, 'PUBLISHER_ADMIN') && <Button variant="success" onClick={() => setDlg('fulfil')}><KeyRound className="size-4" />Issue licences</Button>}
          {o.status === 'CONFIRMED' && !hasRole(me, 'PUBLISHER_ADMIN') && <span className="text-sm text-slate-500">Waiting for a publisher admin to issue licences.</span>}
          {['DRAFT', 'CONFIRMED'].includes(o.status) && <Button variant="ghost" onClick={() => setDlg('cancel')}><XCircle className="size-4" />Cancel</Button>}
        </div>
      </div>
      <Card className="flex flex-wrap gap-6 p-5 text-sm">{steps.map(([label, at]) => (
        <div key={label} className="flex items-center gap-2"><span className={`size-3 rounded-full ${at ? 'bg-emerald-500' : 'bg-slate-200'}`} /><span className={at ? 'font-medium' : 'text-slate-400'}>{label}</span>{at && <span className="text-xs text-slate-400">{fmtDate(at)}</span>}</div>))}
        {o.cancelledAt && <div className="flex items-center gap-2 text-red-600"><span className="size-3 rounded-full bg-red-500" />Cancelled {fmtDate(o.cancelledAt)}</div>}</Card>
      <Table head={['Product', 'Books', 'Student seats', 'Teacher seats', 'Unit price', 'Line value', 'Issued pools']}>
        {o.lines.map((l: any) => (
          <tr key={l.id}><Td><div className="font-medium">{l.productName}</div><div className="font-mono text-xs text-slate-400">{l.sku} · v{l.versionNo}</div></Td>
            <Td className="max-w-xs text-xs text-slate-600">{l.books?.join(', ')}</Td><Td className="tabular-nums">{l.studentQty}</Td><Td className="tabular-nums">{l.teacherQty}</Td>
            <Td className="tabular-nums">{fmtMoney(l.unitPriceMinor, l.currency)}</Td><Td className="tabular-nums">{fmtMoney((l.unitPriceMinor ?? 0) * l.studentQty, l.currency)}</Td>
            <Td className="text-xs">{l.pools.length ? l.pools.map((p: any) => <div key={p.id}>{p.quantity} {p.seatType.toLowerCase()} · until {fmtDay(p.validUntil)} · <Status s={p.status} /></div>) : <span className="text-slate-400">—</span>}</Td></tr>
        ))}
      </Table>
      <p className="text-right text-sm text-slate-600">Order value (student seats): <b className="text-slate-900">{fmtMoney(total)}</b></p>
      <Confirm open={dlg === 'fulfil'} onOpenChange={() => setDlg('')} title="Issue licences for this order?" confirmLabel="Issue licences" loading={act.isPending} onConfirm={() => act.mutate('fulfil')}
        body={<p>Creates {o.lines.reduce((n: number, l: any) => n + l.studentQty, 0)} student and {o.lines.reduce((n: number, l: any) => n + l.teacherQty, 0)} teacher seats for <b>{o.school.name}</b>, valid until <b>{fmtDay(o.academicYear.endsOn)}</b>. The school can then assign them. This cannot be undone (seats can be revoked later).</p>} />
      <Confirm open={dlg === 'cancel'} onOpenChange={() => setDlg('')} title="Cancel this order?" danger confirmLabel="Cancel order" loading={act.isPending} onConfirm={() => act.mutate('cancel')} body="No licences have been issued for it." />
    </div>
  );
}
