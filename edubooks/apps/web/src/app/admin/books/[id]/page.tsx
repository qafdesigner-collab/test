'use client';
import Link from 'next/link';
import { BookCover, CoverUpload } from '@/components/book-cover';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowLeft, CopyPlus, Pencil, Rocket, Trash2 } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { COVER_COLORS, useGrades, useSubjects } from '@/lib/catalog';
import { CurriculumGradePicker } from '@/components/curriculum';
import { Badge, Button, Confirm, Dialog, ErrorBox, Field, Input, PageLoader, Select, StatusBadge, Tabs, Textarea, cn } from '@/components/ui';
import { EditionTree, HistoryTab, LockBanner, ResourcesTab, StructureTab, useBuilderMutation } from '@/components/builder';

type Tab = 'structure' | 'resources' | 'details' | 'history';

export default function PackageBuilder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const pkg = useQuery({ queryKey: ['package', id], queryFn: () => api.get(`/publishing/packages/${id}`) });
  const [editionId, setEditionId] = useState<string>('');
  const [tab, setTab] = useState<Tab>('structure');
  const [dialog, setDialog] = useState<'' | 'details' | 'edition' | 'publish' | 'archiveEd' | 'deleteEd' | 'archivePkg'>('');

  useEffect(() => {
    // Pick a default edition only when none is selected (initial load, or after deleting a draft).
    if (pkg.data && !editionId) {
      const draft = pkg.data.editions.find((e: any) => e.status === 'DRAFT');
      setEditionId((draft ?? pkg.data.editions[0])?.id ?? '');
    }
  }, [pkg.data, editionId]);
  const ed = useQuery<EditionTree>({ queryKey: ['edition', editionId], queryFn: () => api.get(`/publishing/editions/${editionId}`), enabled: !!editionId });

  const publish = useBuilderMutation(() => api.post(`/publishing/editions/${editionId}/publish`), 'Edition published 🎉', () => setDialog(''));
  const archiveEd = useBuilderMutation(() => api.post(`/publishing/editions/${editionId}/archive`), 'Edition archived', () => setDialog(''));
  const deleteEd = useBuilderMutation(() => api.del(`/publishing/editions/${editionId}`), 'Draft edition deleted', () => { setDialog(''); setEditionId(''); });
  const archivePkg = useBuilderMutation((archive: boolean) => api.post(`/publishing/packages/${id}/${archive ? 'archive' : 'restore'}`), undefined, () => setDialog(''));

  if (pkg.isLoading) return <PageLoader />;
  if (pkg.error) return <ErrorBox error={pkg.error} />;
  const p = pkg.data; const tree = ed.data;
  const archived = p.status === 'ARCHIVED';
  const lessons = tree?.components.reduce((n, c) => n + c.units.reduce((m, u) => m + u.lessons.length, 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <Link href="/admin/books" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Book packages</Link>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-2" style={{ background: p.coverColor }} />
        <div className="flex flex-wrap items-start gap-4 p-5">
          {archived ? <BookCover url={p.coverUrl} color={p.coverColor} title={p.title} className="aspect-[3/4] w-24 rounded-lg text-[10px]" label={!p.coverUrl} /> : <CoverUpload packageId={p.id} url={p.coverUrl} color={p.coverColor} title={p.title} />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold text-slate-900">{p.title}</h1><StatusBadge status={p.status} /></div>
            <div className="mt-1 flex flex-wrap gap-1.5"><Badge>{p.curriculumName} · {p.gradeName}</Badge><Badge tone="info">{p.subjectName}</Badge>
              <span className="text-xs text-slate-500">Updated {fmtDate(p.updatedAt)}</span></div>
            {p.description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{p.description}</p>}
          </div>
          <div className="flex gap-2">
            {!archived && <Button variant="secondary" size="sm" onClick={() => setDialog('details')}><Pencil className="size-4" />Edit details</Button>}
            <Button variant="secondary" size="sm" onClick={() => (archived ? archivePkg.mutate(false) : setDialog('archivePkg'))} loading={archivePkg.isPending}>
              {archived ? <><ArchiveRestore className="size-4" />Restore</> : <><Archive className="size-4" />Archive</>}</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">Edition
            <Select className="h-9 w-64" value={editionId} onChange={(e) => setEditionId(e.target.value)}>
              {p.editions.map((e: any) => <option key={e.id} value={e.id}>{e.label} — {e.status.toLowerCase()}</option>)}
            </Select></label>
          {tree && <span className="text-sm text-slate-500">{tree.components.length} components · {lessons} lessons · {tree.resources.length} resources</span>}
          <div className="flex-1" />
          {!archived && <Button size="sm" variant="secondary" onClick={() => setDialog('edition')}><CopyPlus className="size-4" />New edition</Button>}
          {tree?.status === 'DRAFT' && !archived && <>
            {p.editions.length > 1 && <Button size="sm" variant="ghost" onClick={() => setDialog('deleteEd')}><Trash2 className="size-4" />Delete draft</Button>}
            <Button size="sm" variant="success" onClick={() => setDialog('publish')}><Rocket className="size-4" />Publish edition</Button>
          </>}
          {tree?.status === 'PUBLISHED' && !archived && <Button size="sm" variant="ghost" onClick={() => setDialog('archiveEd')}><Archive className="size-4" />Archive edition</Button>}
        </div>
      </div>

      {ed.error ? <ErrorBox error={ed.error} /> : !tree ? <PageLoader /> : (
        <>
          <LockBanner tree={tree} />
          <Tabs<Tab> value={tab} onChange={setTab} tabs={[
            { id: 'structure', label: 'Structure', count: tree.components.length }, { id: 'resources', label: 'Resources', count: tree.resources.length },
            { id: 'details', label: 'Edition details' }, { id: 'history', label: 'History' },
          ]} />
          {tab === 'structure' && <StructureTab key={tree.id} tree={tree} />}
          {tab === 'resources' && <ResourcesTab tree={tree} />}
          {tab === 'details' && <EditionDetails key={tree.id + tree.label} tree={tree} editions={p.editions} />}
          {tab === 'history' && <HistoryTab packageId={id} editionId={tree.id} />}
        </>
      )}

      {dialog === 'details' && <DetailsDialog p={p} onClose={() => setDialog('')} />}
      {dialog === 'edition' && <NewEditionDialog packageId={id} editions={p.editions} current={editionId} onClose={(newId) => { setDialog(''); if (newId) setEditionId(newId); }} />}
      <Confirm open={dialog === 'publish'} onOpenChange={() => setDialog('')} title={`Publish ${tree?.label}?`} confirmLabel="Publish" loading={publish.isPending} onConfirm={() => publish.mutate(undefined)}
        body={<><p>Publishing makes this edition available for products and school licences.</p><p><b>The structure (parts, units, lessons, page ranges) will be locked.</b> Titles, objectives and resources can still be updated.</p></>} />
      <Confirm open={dialog === 'archiveEd'} onOpenChange={() => setDialog('')} title={`Archive ${tree?.label}?`} confirmLabel="Archive" danger loading={archiveEd.isPending} onConfirm={() => archiveEd.mutate(undefined)}
        body={<p>Archived editions become read-only and can no longer be added to new products. Existing licences are not affected.</p>} />
      <Confirm open={dialog === 'deleteEd'} onOpenChange={() => setDialog('')} title={`Delete draft ${tree?.label}?`} confirmLabel="Delete" danger loading={deleteEd.isPending} onConfirm={() => deleteEd.mutate(undefined)}
        body={<p>The draft edition and its structure are removed. Uploaded files remain available for other editions.</p>} />
      <Confirm open={dialog === 'archivePkg'} onOpenChange={() => setDialog('')} title={`Archive ${p.title}?`} confirmLabel="Archive package" danger loading={archivePkg.isPending} onConfirm={() => archivePkg.mutate(true)}
        body={<p>The whole package becomes read-only and is hidden from new sales. You can restore it later.</p>} />
    </div>
  );
}

function DetailsDialog({ p, onClose }: { p: any; onClose: () => void }) {
  const subjects = useSubjects();
  const [f, setF] = useState({ title: p.title, gradeId: p.gradeId, subjectId: p.subjectId, description: p.description, coverColor: p.coverColor });
  const m = useBuilderMutation(() => api.patch(`/publishing/packages/${p.id}`, f), 'Details saved', onClose);
  return (
    <Dialog open onOpenChange={onClose} title="Edit package details">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(undefined); }}>
        <Field label="Title"><Input required minLength={2} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
        </div>
        <CurriculumGradePicker required gradeId={f.gradeId} onChange={(gradeId) => setF({ ...f, gradeId })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject"><Select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
        <Field label="Description"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Cover colour"><div className="flex flex-wrap gap-2">{COVER_COLORS.map((c) => (
          <button type="button" key={c} onClick={() => setF({ ...f, coverColor: c })} aria-label={`Colour ${c}`} aria-pressed={f.coverColor === c}
            className={cn('focus-ring size-8 rounded-full ring-offset-2', f.coverColor === c && 'ring-2 ring-slate-900')} style={{ background: c }} />))}</div></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Save</Button></div>
      </form>
    </Dialog>
  );
}

function NewEditionDialog({ packageId, editions, current, onClose }: { packageId: string; editions: any[]; current: string; onClose: (id?: string) => void }) {
  const year = Math.max(new Date().getFullYear(), ...editions.map((e) => e.editionYear + 1));
  const [f, setF] = useState({ label: `${year} Edition`, editionYear: year, notes: '', cloneFromEditionId: current });
  const m = useBuilderMutation(() => api.post(`/publishing/packages/${packageId}/editions`, { ...f, cloneFromEditionId: f.cloneFromEditionId || undefined }), 'New edition created', (r) => onClose(r.id));
  return (
    <Dialog open onOpenChange={() => onClose()} title="Create a new edition" description="Use a new edition for a revised textbook. Earlier editions and their licences stay unchanged.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(undefined); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Label"><Input required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
          <Field label="Year"><Input required type="number" min={1990} max={2100} value={f.editionYear} onChange={(e) => setF({ ...f, editionYear: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Start from" hint="Copies parts, units, lessons and resource links. Files are shared, not duplicated.">
          <Select value={f.cloneFromEditionId} onChange={(e) => setF({ ...f, cloneFromEditionId: e.target.value })}>
            <option value="">Empty edition</option>{editions.map((e) => <option key={e.id} value={e.id}>Copy of {e.label} ({e.status.toLowerCase()})</option>)}
          </Select></Field>
        <Field label="What changed? (notes)"><Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. New phonics unit in Part 2, updated illustrations" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => onClose()}>Cancel</Button><Button loading={m.isPending}>Create edition</Button></div>
      </form>
    </Dialog>
  );
}

function EditionDetails({ tree, editions }: { tree: EditionTree; editions: any[] }) {
  const [f, setF] = useState({ label: tree.label, editionYear: tree.editionYear, notes: tree.notes });
  const m = useBuilderMutation(() => api.patch(`/publishing/editions/${tree.id}`, f), 'Edition saved');
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-5" onSubmit={(e) => { e.preventDefault(); m.mutate(undefined); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Label"><Input disabled={tree.locked.all} required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
          <Field label="Year"><Input disabled={tree.locked.all} type="number" value={f.editionYear} onChange={(e) => setF({ ...f, editionYear: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Release notes"><Textarea disabled={tree.locked.all} rows={5} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {!tree.locked.all && <div className="flex justify-end"><Button loading={m.isPending}>Save</Button></div>}
      </form>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 font-semibold">Edition history</h3>
        <ol className="relative space-y-4 border-l border-slate-200 pl-4 text-sm">
          {editions.map((e) => (
            <li key={e.id}><span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-white" style={{ background: e.status === 'PUBLISHED' ? '#10b981' : e.status === 'DRAFT' ? '#f59e0b' : '#94a3b8' }} />
              <div className="font-medium text-slate-800">{e.label} <StatusBadge status={e.status} /></div>
              <div className="text-xs text-slate-500">{e.publishedAt ? `Published ${fmtDate(e.publishedAt)}` : `Created ${fmtDate(e.createdAt)}`} · {e.componentCount} components · {e.resourceCount} resources</div>
              {e.clonedFromId && <div className="text-xs text-slate-500">Based on {editions.find((x) => x.id === e.clonedFromId)?.label ?? 'an earlier edition'}</div>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
