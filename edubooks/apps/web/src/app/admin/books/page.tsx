'use client';
import Link from 'next/link';
import { BookCover } from '@/components/book-cover';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Library, Plus, Search } from 'lucide-react';
import { api, fmtDate, qs } from '@/lib/api';
import { COVER_COLORS, useGrades, useSubjects } from '@/lib/catalog';
import { CurriculumGradePicker, CurriculumSelect, GradeOptions } from '@/components/curriculum';
import { Badge, Button, Card, Dialog, EmptyState, ErrorBox, Field, Input, Pagination, Select, Spinner, StatusBadge, Textarea, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

function NewPackageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const subjects = useSubjects(); const router = useRouter(); const toast = useToast(); const qc = useQueryClient();
  const year = new Date().getFullYear();
  const [f, setF] = useState({ title: '', gradeId: '', subjectId: '', description: '', coverColor: COVER_COLORS[0], editionLabel: `${year} Edition`, editionYear: year, standardStructure: true, parts: 3 });
  const m = useMutation({
    mutationFn: () => api.post('/publishing/packages', f),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['packages'] }); qc.invalidateQueries({ queryKey: ['stats'] }); toast(`“${r.title}” created`); router.push(`/admin/books/${r.id}`); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New book package" description="A package groups everything sold for one book: student book parts, homework book and resources.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Title"><Input required minLength={2} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="KG English" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
        </div>
        <CurriculumGradePicker required gradeId={f.gradeId} onChange={(gradeId) => setF({ ...f, gradeId })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject"><Select required value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}><option value="">Select…</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Cover colour">
          <div className="flex flex-wrap gap-2">{COVER_COLORS.map((c) => (
            <button type="button" key={c} onClick={() => setF({ ...f, coverColor: c })} aria-label={`Colour ${c}`} aria-pressed={f.coverColor === c}
              className={cn('focus-ring size-8 rounded-full ring-offset-2', f.coverColor === c && 'ring-2 ring-slate-900')} style={{ background: c }} />))}</div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First edition"><Input required value={f.editionLabel} onChange={(e) => setF({ ...f, editionLabel: e.target.value })} /></Field>
          <Field label="Edition year"><Input required type="number" min={1990} max={2100} value={f.editionYear} onChange={(e) => setF({ ...f, editionYear: Number(e.target.value) })} /></Field>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" checked={f.standardStructure} onChange={(e) => setF({ ...f, standardStructure: e.target.checked })} />
          <span><span className="font-medium text-slate-800">Start with the standard structure</span><br />
            <span className="text-slate-500">Student Book Parts, Homework Book, Teacher Guide, Flashcards, Teacher Cards, Danglers</span>
            {f.standardStructure && <span className="mt-2 flex items-center gap-2">Parts: <Input type="number" min={1} max={6} value={f.parts} onChange={(e) => setF({ ...f, parts: Number(e.target.value) })} className="h-8 w-20" /></span>}
          </span>
        </label>
        {m.error && <ErrorBox error={m.error} />}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={m.isPending}>Create package</Button></div>
      </form>
    </Dialog>
  );
}

function BooksPage() {
  const params = useSearchParams(); const router = useRouter();
  const grades = useGrades(); const subjects = useSubjects();
  const [filters, setFilters] = useState({ search: '', curriculumId: '', gradeId: '', subjectId: '', status: '', page: 1 });
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(params.get('new') === '1');
  useEffect(() => { const t = setTimeout(() => setFilters((f) => ({ ...f, search, page: 1 })), 300); return () => clearTimeout(t); }, [search]);
  const q = useQuery({ queryKey: ['packages', filters], queryFn: () => api.get(`/publishing/packages${qs({ ...filters, pageSize: 12 })}`), placeholderData: keepPreviousData });
  const setF = (k: string) => (e: React.ChangeEvent<HTMLSelectElement>) => setFilters({ ...filters, [k]: e.target.value, page: 1 });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-slate-900">Book packages</h1><p className="text-sm text-slate-500">Create books, arrange parts, units and lessons, and attach teaching resources.</p></div>
        <Button onClick={() => setNewOpen(true)}><Plus className="size-4" />New book package</Button>
      </div>
      <Card className="flex flex-wrap gap-3 p-4">
        <div className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-500" />
          <Input aria-label="Search" placeholder="Search title or description…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <CurriculumSelect className="w-52" value={filters.curriculumId} onChange={(v) => setFilters({ ...filters, curriculumId: v, gradeId: '', page: 1 })} />
        <Select aria-label="Grade" className="w-40" value={filters.gradeId} onChange={setF('gradeId')} disabled={!filters.curriculumId}><option value="">{filters.curriculumId ? 'All grades' : 'Grade: pick a curriculum'}</option>
          <GradeOptions grades={(grades.data ?? []).filter((g) => g.curriculumId === filters.curriculumId)} /></Select>
        <Select aria-label="Subject" className="w-48" value={filters.subjectId} onChange={setF('subjectId')}><option value="">All subjects</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Select aria-label="Status" className="w-40" value={filters.status} onChange={setF('status')}><option value="">Any status</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></Select>
        {q.isFetching && <Spinner className="self-center" />}
      </Card>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <div className="h-40" /> : q.data.items.length === 0 ? (
        <EmptyState icon={<Library className="size-10" />} title="No book packages found">Try different filters, or create a new package.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {q.data.items.map((p: any) => (
              <Link key={p.id} href={`/admin/books/${p.id}`} className="focus-ring group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
                <div className="flex gap-4 border-b border-slate-100 p-4">
                  <BookCover url={p.coverUrl} color={p.coverColor} title={p.title} className="aspect-[3/4] w-16 shrink-0 rounded-md text-[9px] shadow" label={!p.coverUrl} />
                  <div className="min-w-0 flex-1"><span className="block text-lg font-semibold text-slate-900">{p.title}</span><StatusBadge status={p.status} /></div>
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap gap-1.5"><Badge>{p.curriculum} · {p.grade.name}</Badge><Badge tone="info">{p.subject.name}</Badge></div>
                  <p className="line-clamp-2 min-h-10 text-sm text-slate-500">{p.description || 'No description'}</p>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{p.latestEdition} · {p.editionCount} edition{p.editionCount === 1 ? '' : 's'} · {p.resourceCount} resources</span><span>{fmtDate(p.updatedAt).split(',')[0]}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setFilters({ ...filters, page })} />
        </>
      )}
      {newOpen && <NewPackageDialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o && params.get('new')) router.replace('/admin/books'); }} />}
    </div>
  );
}
export default function Page() { return <Suspense><BooksPage /></Suspense>; }
