'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Boxes, Package, Plus } from 'lucide-react';
import { api, fmtMoney, qs } from '@/lib/api';
import { useGrades } from '@/lib/catalog';
import { hasRole, useMe } from '@/lib/session';
import { useAction } from '@/lib/hooks';
import { Badge, Button, Dialog, EmptyState, ErrorBox, Field, Input, PageLoader, Select, Textarea } from '@/components/ui';
import { PageHeader, Table, Td } from '@/components/common';
import { EditionPicker } from '@/components/edition-picker';

function NewProduct({ onClose }: { onClose: () => void }) {
  const grades = useGrades(); const router = useRouter();
  const [f, setF] = useState({ kind: 'BUNDLE' as 'SINGLE' | 'BUNDLE', sku: '', name: '', gradeId: '', description: '', price: '', currency: 'PKR', editionIds: [] as string[] });
  const m = useAction(() => api.post('/commerce/products', { ...f, gradeId: f.gradeId || undefined, price: undefined, priceMinor: f.price === '' ? undefined : Math.round(Number(f.price) * 100) }),
    { ok: 'Product created as a draft version', keys: ['products'], after: (r) => router.push(`/admin/products/${r.id}`) });
  return (
    <Dialog open onOpenChange={onClose} wide title="New product" description="What schools buy. Each sold seat unlocks every book in the product.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
          {(['SINGLE', 'BUNDLE'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setF({ ...f, kind: k, editionIds: [] })} className={`rounded-md py-2 ${f.kind === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
              {k === 'SINGLE' ? 'Individual book package' : 'Grade bundle (several books)'}</button>))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="SKU / product code"><Input required value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value.toUpperCase() })} placeholder="KG-BUNDLE" /></Field>
          <Field label="Name" className="sm:col-span-2"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="KG Complete Bundle" /></Field>
        </div>
        <Field label={f.kind === 'SINGLE' ? 'Book edition' : 'Books in the bundle'}><EditionPicker single={f.kind === 'SINGLE'} value={f.editionIds} onChange={(editionIds) => setF({ ...f, editionIds })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Grade"><Select value={f.gradeId} onChange={(e) => setF({ ...f, gradeId: e.target.value })}><option value="">—</option>{grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
          <Field label="Price per student seat" hint="Optional"><Input type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label="Currency"><Input maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!f.editionIds.length}>Create draft</Button></div>
      </form>
    </Dialog>
  );
}

export default function ProductsPage() {
  const { data: me } = useMe();
  const [f, setF] = useState({ search: '', kind: '', includeArchived: 'false', page: 1 });
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['products', f], queryFn: () => api.get(`/commerce/products${qs({ ...f, pageSize: 50 })}`), placeholderData: keepPreviousData });
  const canEdit = hasRole(me, 'PUBLISHER_ADMIN', 'PUBLISHER_EDITOR');
  return (
    <div className="space-y-6">
      <PageHeader title="Products & bundles" sub="Individual book packages and grade bundles. Sold versions are frozen so purchased licences never change silently.">
        {canEdit && <Button onClick={() => setOpen(true)}><Plus className="size-4" />New product</Button>}
      </PageHeader>
      <div className="flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder="Search name or SKU…" aria-label="Search" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value, page: 1 })} />
        <Select className="w-48" aria-label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">Singles & bundles</option><option value="SINGLE">Individual books</option><option value="BUNDLE">Bundles</option></Select>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={f.includeArchived === 'true'} onChange={(e) => setF({ ...f, includeArchived: String(e.target.checked) })} />Show archived</label>
      </div>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : q.data.items.length === 0 ? <EmptyState icon={<Package className="size-10" />} title="No products yet">Create a product from published book editions.</EmptyState> : (
        <Table head={['Product', 'SKU', 'Type', 'Active version', 'Price / seat', '']}>
          {q.data.items.map((p: any) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <Td><Link href={`/admin/products/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">{p.name}</Link>{p.gradeName && <span className="ml-2 text-xs text-slate-400">{p.gradeName}</span>}</Td>
              <Td className="font-mono text-xs">{p.sku}</Td>
              <Td>{p.kind === 'BUNDLE' ? <Badge tone="info"><Boxes className="size-3" />Bundle</Badge> : <Badge>Single</Badge>}</Td>
              <Td>{p.active ? <span>v{p.active.versionNo} · {p.active.items} book{p.active.items === 1 ? '' : 's'}</span> : <span className="text-amber-600">Not on sale</span>}{p.hasDraft && <Badge tone="DRAFT" className="ml-2">draft</Badge>}{p.archived && <Badge tone="ARCHIVED" className="ml-2">archived</Badge>}</Td>
              <Td className="tabular-nums">{p.active ? fmtMoney(p.active.priceMinor, p.active.currency) : '—'}</Td>
              <Td className="text-right"><Link href={`/admin/products/${p.id}`} className="text-sm text-brand-600 hover:underline">Open</Link></Td>
            </tr>
          ))}
        </Table>
      )}
      {open && <NewProduct onClose={() => setOpen(false)} />}
    </div>
  );
}
