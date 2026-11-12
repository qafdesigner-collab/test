'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { api, fmtDay, qs } from '@/lib/api';
import { Money, useMoney } from '@/lib/company';
import { useAction } from '@/lib/hooks';
import { Button, Dialog, EmptyState, ErrorBox, Field, Input, PageLoader, Pagination, Select, Textarea } from '@/components/ui';
import { PageHeader, Status, Table, Td } from '@/components/common';

function NewOrder({ schoolId: initialSchool, onClose }: { schoolId?: string; onClose: () => void }) {
  const router = useRouter(); const money = useMoney();
  const schools = useQuery({ queryKey: ['schools', 'pick'], queryFn: () => api.get('/schools?pageSize=100&status=ACTIVE') });
  const products = useQuery({ queryKey: ['products', 'active'], queryFn: () => api.get('/commerce/products?pageSize=100') });
  const [f, setF] = useState({ schoolId: initialSchool ?? '', academicYearId: '', type: 'NEW', notes: '' });
  const school = useQuery({ queryKey: ['school', f.schoolId], queryFn: () => api.get(`/schools/${f.schoolId}`), enabled: !!f.schoolId });
  useEffect(() => { if (school.data && !school.data.academicYears.some((y: any) => y.id === f.academicYearId)) setF((x) => ({ ...x, academicYearId: school.data.academicYears[0]?.id ?? '' })); }, [school.data, f.academicYearId]);
  const [lines, setLines] = useState([{ productVersionId: '', studentQty: 30, teacherQty: 2 }]);
  const sellable = (products.data?.items ?? []).filter((p: any) => p.active);
  const price = (vid: string) => sellable.find((p: any) => p.active.id === vid)?.active;
  const total = lines.reduce((n, l) => n + (price(l.productVersionId)?.priceMinor ?? 0) * l.studentQty, 0);
  const m = useAction(() => api.post('/commerce/orders', { ...f, lines: lines.filter((l) => l.productVersionId) }), { ok: (r) => `Order ${r.orderNo} created`, keys: ['orders'], after: (r) => router.push(`/admin/orders/${r.id}`) });
  return (
    <Dialog open onOpenChange={onClose} wide title="New order" description="Record a sale. Licences are issued when the order is confirmed and fulfilled.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="School"><Select required value={f.schoolId} onChange={(e) => setF({ ...f, schoolId: e.target.value, academicYearId: '' })}><option value="">Select…</option>
            {schools.data?.items.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}</Select></Field>
          <Field label="Academic year" hint={school.data && !school.data.academicYears.length ? 'Add an academic year on the school page first' : 'Licences are valid for this year'}>
            <Select required value={f.academicYearId} onChange={(e) => setF({ ...f, academicYearId: e.target.value })}>{school.data?.academicYears.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
          <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="NEW">New</option><option value="RENEWAL">Renewal</option><option value="ADDITIONAL">Additional purchase</option></Select></Field>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_110px_110px_32px] gap-2 text-xs font-medium uppercase text-slate-500"><span>Product</span><span>Student seats</span><span>Teacher seats</span><span /></div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_110px_32px] items-center gap-2">
              <Select aria-label="Product" required value={l.productVersionId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, productVersionId: e.target.value } : x)))}>
                <option value="">Select product…</option>{sellable.map((p: any) => <option key={p.id} value={p.active.id} disabled={lines.some((x, j) => j !== i && x.productVersionId === p.active.id)}>{p.name} · v{p.active.versionNo} · {money.main(p.active.priceMinor)}</option>)}</Select>
              <Input aria-label="Student seats" type="number" min={0} value={l.studentQty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, studentQty: Number(e.target.value) } : x)))} />
              <Input aria-label="Teacher seats" type="number" min={0} value={l.teacherQty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, teacherQty: Number(e.target.value) } : x)))} />
              <button type="button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded p-1.5 text-slate-500 hover:text-red-600 disabled:opacity-30"><Trash2 className="size-4" /></button>
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setLines([...lines, { productVersionId: '', studentQty: 0, teacherQty: 0 }])}><Plus className="size-4" />Add product</Button>
        </div>
        <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Invoice no., payment terms…" /></Field>
        <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Estimated value (student seats): <b><Money v={total} inline /></b></span>
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Create draft order</Button></div></div>
      </form>
    </Dialog>
  );
}

function OrdersPage() {
  const params = useSearchParams(); const router = useRouter();
  const [f, setF] = useState({ status: '', page: 1 });
  const q = useQuery({ queryKey: ['orders', f], queryFn: () => api.get(`/commerce/orders${qs({ ...f, pageSize: 25 })}`), placeholderData: keepPreviousData });
  const open = params.get('new') === '1';
  const close = () => router.replace('/admin/orders');
  return (
    <div className="space-y-6">
      <PageHeader title="Orders" sub="Book sales to schools. Fulfilling an order issues its student and teacher seats."><Button onClick={() => router.push('/admin/orders?new=1')}><Plus className="size-4" />New order</Button></PageHeader>
      <Select className="w-48" aria-label="Status" value={f.status} onChange={(e) => setF({ status: e.target.value, page: 1 })}>
        <option value="">All statuses</option>{['DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : !q.data.items.length ? <EmptyState icon={<Receipt className="size-10" />} title="No orders" /> : (
        <>
          <Table head={['Order', 'School', 'Type', 'Year', 'Seats', 'Value', 'Created', 'Status']}>
            {q.data.items.map((o: any) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td><Link className="font-mono font-medium text-brand-700 hover:underline" href={`/admin/orders/${o.id}`}>{o.orderNo}</Link></Td>
                <Td>{o.school.name} <span className="font-mono text-xs text-slate-500">{o.school.code}</span></Td><Td>{o.type.toLowerCase()}</Td><Td>{o.academicYear}</Td>
                <Td className="whitespace-nowrap">{o.students} / {o.teachers}</Td><Td className="tabular-nums"><Money v={o.totalMinor} /></Td><Td className="text-slate-500">{fmtDay(o.createdAt)}</Td><Td><Status s={o.status} /></Td>
              </tr>
            ))}
          </Table>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
      {open && <NewOrder schoolId={params.get('school') ?? undefined} onClose={close} />}
    </div>
  );
}
export default function Page() { return <Suspense><OrdersPage /></Suspense>; }
