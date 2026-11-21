'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CopyPlus, Lock, Pencil, Rocket, Trash2 } from 'lucide-react';
import { api, fmtDay } from '@/lib/api';
import { Money, useMoney } from '@/lib/company';
import { hasRole, useMe } from '@/lib/session';
import { useAction } from '@/lib/hooks';
import { Badge, Button, Card, Confirm, Dialog, ErrorBox, Field, Input, PageLoader, Textarea } from '@/components/ui';
import { Status } from '@/components/common';
import { EditionPicker } from '@/components/edition-picker';
import { CurriculumGradePicker } from '@/components/curriculum';

function DraftEditor({ p, v, live }: { p: any; v: any; live?: boolean }) {
  const [ids, setIds] = useState<string[]>(v.items.map((i: any) => i.editionId));
  const [price, setPrice] = useState(v.priceMinor === null ? '' : String(v.priceMinor / 100));
  const money = useMoney(); const currency = money.finance.currency;
  const [confirm, setConfirm] = useState<'' | 'activate' | 'delete'>('');
  const keys = ['product', 'products'];
  const save = useAction(() => api.patch(`/commerce/versions/${v.id}`, { editionIds: ids, priceMinor: price === '' ? null : Math.round(Number(price) * 100), currency }), { ok: live ? 'Product updated' : 'Draft saved', keys });
  const activate = useAction(async () => { await save.mutateAsync(); return api.post(`/commerce/versions/${v.id}/activate`); }, { ok: `v${v.versionNo} is now on sale`, keys, after: () => setConfirm('') });
  const del = useAction(() => api.del(`/commerce/versions/${v.id}`), { ok: 'Draft deleted', keys, after: () => setConfirm('') });
  return (
    <div className="space-y-4">
      <Field label={p.kind === 'SINGLE' ? 'Book edition' : 'Books in this version'}><EditionPicker single={p.kind === 'SINGLE'} value={ids} onChange={setIds} /></Field>
      <div className="grid max-w-md grid-cols-2 gap-3">
        <Field label={`Price per student seat (${currency})`}><Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      </div>
      {live ? <div className="flex flex-wrap items-center justify-end gap-3"><span className="text-xs text-slate-500">On sale and not sold yet, so you can change it directly. Once a school orders it, it is frozen.</span>
        <Button loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button></div> : (
      <div className="flex flex-wrap justify-end gap-2">
        {p.versions.length > 1 && <Button variant="ghost" onClick={() => setConfirm('delete')}><Trash2 className="size-4" />Delete draft</Button>}
        <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>Save draft</Button>
        <Button variant="success" onClick={() => setConfirm('activate')}><Rocket className="size-4" />Activate v{v.versionNo}</Button>
      </div>)}
      <Confirm open={confirm === 'activate'} onOpenChange={() => setConfirm('')} title={`Put v${v.versionNo} on sale?`} confirmLabel="Activate" loading={activate.isPending} onConfirm={() => activate.mutate()}
        body={<><p>The books and price of v{v.versionNo} will be <b>frozen permanently</b> — the database rejects any later change.</p>
          {p.versions.some((x: any) => x.status === 'ACTIVE') && <p>The current active version becomes <b>retired</b>: existing licences keep exactly what they bought; new orders use v{v.versionNo}.</p>}</>} />
      <Confirm open={confirm === 'delete'} onOpenChange={() => setConfirm('')} title="Delete this draft?" danger confirmLabel="Delete" loading={del.isPending} onConfirm={() => del.mutate()} body="Nothing was sold from it." />
    </div>
  );
}

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: me } = useMe(); const canEdit = hasRole(me, 'PUBLISHER_ADMIN', 'PUBLISHER_EDITOR');
  const q = useQuery({ queryKey: ['product', id], queryFn: () => api.get(`/commerce/products/${id}`) });
  const newVersion = useAction(() => api.post(`/commerce/products/${id}/versions`, {}), { ok: 'New draft version created', keys: ['product', 'products'] });
  const retire = useAction((vid: string) => api.post(`/commerce/versions/${vid}/retire`), { ok: 'Version retired', keys: ['product', 'products'] });
  const router = useRouter(); const [askDelete, setAskDelete] = useState(false); const [editDetails, setEditDetails] = useState(false);
  const remove = useAction(() => api.del(`/commerce/products/${id}`), { ok: 'Product deleted', keys: ['products'], after: () => { setAskDelete(false); router.push('/admin/products'); } });
  const archive = useAction((archived: boolean) => api.patch(`/commerce/products/${id}`, { archived }), { ok: 'Saved', keys: ['product', 'products'] });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const p = q.data;
  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Products</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-semibold text-slate-900">{p.name}</h1><Badge tone={p.kind === 'BUNDLE' ? 'info' : 'neutral'}>{p.kind === 'BUNDLE' ? 'Bundle' : 'Single'}</Badge>{p.archived && <Badge tone="ARCHIVED">Archived</Badge>}</div>
          <p className="font-mono text-sm text-slate-500">{p.sku}</p>{p.description && <p className="mt-1 text-sm text-slate-600">{p.description}</p>}</div>
        {canEdit && <div className="flex gap-2">
          {!p.versions.some((v: any) => v.status === 'DRAFT') && <Button variant="secondary" loading={newVersion.isPending} onClick={() => newVersion.mutate()}><CopyPlus className="size-4" />{p.versions.some((v: any) => v.status === 'ACTIVE' && v.sold) ? 'Change books or price' : 'New version'}</Button>}
          <Button variant="secondary" onClick={() => setEditDetails(true)}><Pencil className="size-4" />Edit details</Button>
          <Button variant="ghost" onClick={() => archive.mutate(!p.archived)}>{p.archived ? 'Unarchive' : 'Archive'}</Button>
          <Button variant="danger" onClick={() => setAskDelete(true)}><Trash2 className="size-4" />Delete</Button></div>}
      {editDetails && <DetailsDialog p={p} onClose={() => setEditDetails(false)} />}
      <Confirm open={askDelete} onOpenChange={() => setAskDelete(false)} title={`Delete ${p.name}?`} danger confirmLabel="Delete product for ever" loading={remove.isPending} onConfirm={() => remove.mutate()}
        body={<div className="space-y-2"><p>The product and all its versions are <b>removed for ever</b>. The books themselves are not deleted.</p>
          <p className="text-sm text-slate-600">A product that was ordered or licensed to a school cannot be deleted (those records must stay) — use <b>Archive</b> or <b>Stop selling</b> instead.</p></div>} />
      </div>
      <div className="space-y-4">
        {p.versions.map((v: any) => (
          <Card key={v.id} className={v.status === 'ACTIVE' ? 'ring-2 ring-emerald-500/40' : ''}>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold">Version {v.versionNo}</h2><Status s={v.status} />
              {v.status !== 'DRAFT' && v.sold && <span className="flex items-center gap-1 text-xs text-slate-500"><Lock className="size-3" />sold — frozen{v.activatedAt && ` since ${fmtDay(v.activatedAt)}`}</span>}
              <span className="text-sm text-slate-500"><Money v={v.priceMinor} inline /> / student seat · sold on {v.orderLines} order line{v.orderLines === 1 ? '' : 's'}</span>
              <div className="flex-1" />
              {canEdit && v.status === 'ACTIVE' && <Button size="sm" variant="ghost" onClick={() => retire.mutate(v.id)}>Stop selling</Button>}
            </div>
            <div className="p-5">
              {v.status === 'DRAFT' && canEdit ? <DraftEditor p={p} v={v} /> : v.status === 'ACTIVE' && !v.sold && canEdit ? <DraftEditor p={p} v={v} live /> : (
                <div className="flex flex-wrap gap-2">{v.items.map((i: any) => (
                  <span key={i.editionId} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                    <span className="size-3 rounded-sm" style={{ background: i.coverColor }} />{i.packageTitle}<span className="text-xs text-slate-500">{i.editionLabel}</span></span>))}</div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Name, product code, grade and description. Changing them does not change what schools bought. */
function DetailsDialog({ p, onClose }: { p: any; onClose: () => void }) {
  const [f, setF] = useState({ name: p.name, sku: p.sku, gradeId: p.gradeId ?? '', description: p.description ?? '' });
  const m = useAction(() => api.patch(`/commerce/products/${p.id}`, { name: f.name.trim(), sku: f.sku.trim(), gradeId: f.gradeId || null, description: f.description }), { ok: 'Product details saved', keys: ['product', 'products'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title="Edit product details" description="Name, code, grade and description. Books and price are changed in the version below.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Name"><Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Product code (SKU)"><Input required pattern="[A-Za-z0-9._-]{2,40}" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} /></Field>
        </div>
        <CurriculumGradePicker allowEmpty gradeId={f.gradeId} onChange={(gradeId) => setF({ ...f, gradeId })} />
        <Field label="Description"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Save</Button></div>
      </form>
    </Dialog>
  );
}
