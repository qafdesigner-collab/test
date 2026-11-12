'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Presentation, Trash2 } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { className, useBook, useMyBooks, useMyClasses } from '@/lib/lms';
import { Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Select } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { useToast } from '@/components/ui/toast';

export default function Page() { return <Suspense fallback={<PageLoader />}><Whiteboards /></Suspense>; }

function Whiteboards() {
  const q = useQuery({ queryKey: ['whiteboards'], queryFn: () => api.get<any[]>('/whiteboards') });
  const params = useSearchParams(); const [open, setOpen] = useState(params.get('new') === '1');
  const qc = useQueryClient(); const toast = useToast();
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const del = async (b: any) => { if (!confirm(`Delete “${b.title}”?`)) return; try { await api.del(`/whiteboards/${b.id}`); qc.invalidateQueries({ queryKey: ['whiteboards'] }); } catch (e: any) { toast(e.message, 'err'); } };
  return (
    <div className="space-y-6">
      <PageHeader title="Whiteboard" sub="Teach live: whatever you write appears on your pupils' screens straight away. Write on a blank board or on a page of your book.">
        <Button onClick={() => setOpen(true)}><Plus className="size-4" />Start a whiteboard</Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {q.data.map((b) => (
          <Card key={b.id} className="flex flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#8b7be0] to-[#6a5acb] text-white"><Presentation className="size-5" /></span>
              <div className="min-w-0 flex-1"><div className="truncate font-semibold text-slate-900">{b.title}</div>
                <div className="text-sm text-slate-500">{b.className}{b.bookTitle ? ` · ${b.bookTitle}${b.page ? ` p.${b.page}` : ''}` : ' · blank board'}</div>
                <div className="text-xs text-slate-400">{fmtDate(b.updatedAt)}</div></div>
              {b.live ? <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600"><span className="size-1.5 rounded-full bg-red-500" />LIVE</span>
                : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">ended</span>}
            </div>
            <div className="mt-4 flex gap-2">
              <Link href={`/teacher/whiteboard/${b.id}`} className="focus-ring inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">{b.live ? 'Open' : 'Open again'}</Link>
              {b.mine && <Button variant="ghost" size="sm" onClick={() => del(b)} aria-label={`Delete ${b.title}`}><Trash2 className="size-4 text-red-500" /></Button>}
            </div>
          </Card>
        ))}
      </div>
      {!q.data.length && <Card className="p-10 text-center text-slate-500"><Presentation className="mx-auto mb-2 size-10 text-violet-400" />No whiteboards yet. Start one for your class — pupils see it on their home page while it is live.</Card>}
      {open && <StartBoard onClose={() => setOpen(false)} />}
    </div>
  );
}

function StartBoard({ onClose }: { onClose: () => void }) {
  const params = useSearchParams(); const router = useRouter(); const toast = useToast();
  const classes = useMyClasses(); const books = useMyBooks();
  const [f, setF] = useState({ classId: '', title: '', editionId: params.get('editionId') ?? '', componentId: params.get('componentId') ?? '', page: Number(params.get('page')) || 1 });
  const book = useBook(f.editionId || undefined);
  const parts = (book.data?.components ?? []).filter((c: any) => c.hasPdf);
  useEffect(() => { if (!f.classId && classes.data?.length) setF((x) => ({ ...x, classId: classes.data![0].id })); }, [classes.data, f.classId]);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const b = await api.post<any>('/whiteboards', { classId: f.classId, title: f.title.trim() || 'Whiteboard', ...(f.componentId ? { componentId: f.componentId, page: f.page } : {}) });
      router.push(`/teacher/whiteboard/${b.id}`);
    } catch (e: any) { toast(e.message, 'err'); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose} title="Start a live whiteboard" description="Your pupils see it on their home page straight away, and follow every line you write.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(); }}>
        <Field label="Class"><Select required value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
          {classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Letter B — sounds and words" maxLength={120} /></Field>
        <Field label="Write on" hint="A blank board, or a page of one of your books">
          <Select value={f.editionId} onChange={(e) => setF({ ...f, editionId: e.target.value, componentId: '', page: 1 })}>
            <option value="">Blank board</option>
            {books.data?.map((b) => <option key={b.editionId} value={b.editionId}>{b.title} — {b.editionLabel}</option>)}
          </Select></Field>
        {f.editionId && (
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Book part"><Select required value={f.componentId} onChange={(e) => setF({ ...f, componentId: e.target.value })}>
              <option value="">{book.isLoading ? 'Loading…' : parts.length ? 'Choose…' : 'No pages uploaded'}</option>
              {parts.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
            <Field label="Page"><Input type="number" min={1} value={f.page} onChange={(e) => setF({ ...f, page: Math.max(1, Number(e.target.value) || 1) })} /></Field>
          </div>
        )}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!f.classId || (!!f.editionId && !f.componentId)}><Presentation className="size-4" />Start live</Button></div>
      </form>
    </Dialog>
  );
}
