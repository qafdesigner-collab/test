'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { byStage, Curriculum, Grade, useCurricula, useGrades, useSubjects } from '@/lib/catalog';
import { Badge, Button, Card, Confirm, Dialog, ErrorBox, Field, Input, PageLoader, Select, Textarea, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const refresh = (qc: ReturnType<typeof useQueryClient>) => ['curricula', 'grades', 'subjects'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

export default function CatalogPage() {
  const cur = useCurricula(); const grades = useGrades();
  const [sel, setSel] = useState('');
  useEffect(() => { if (!sel && cur.data?.length) setSel(cur.data[0].id); }, [cur.data, sel]);
  if (!cur.data || !grades.data) return <PageLoader />;
  const current = cur.data.find((c) => c.id === sel);
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold text-slate-900">Curricula, grades & subjects</h1>
        <p className="text-sm text-slate-600">Each curriculum has its own grades. When you create a book, choose the curriculum first, then the grade.</p></div>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <CurriculaList list={cur.data} sel={sel} onSelect={setSel} />
        {current ? <GradesCard c={current} grades={grades.data.filter((g) => g.curriculumId === current.id)} curricula={cur.data} /> : <Card className="p-6 text-slate-600">Choose a curriculum.</Card>}
      </div>
      <Subjects />
    </div>
  );
}

function CurriculaList({ list, sel, onSelect }: { list: Curriculum[]; sel: string; onSelect: (id: string) => void }) {
  const [edit, setEdit] = useState<Partial<Curriculum> | null>(null); const [del, setDel] = useState<Curriculum | null>(null);
  const qc = useQueryClient(); const toast = useToast();
  const save = useMutation({
    mutationFn: (v: Partial<Curriculum>) => {
      const body = { name: v.name, code: v.code, description: v.description ?? '', color: v.color, sort: Number(v.sort) || 0 };
      return v.id ? api.patch(`/catalog/curricula/${v.id}`, body) : api.post('/catalog/curricula', body);
    },
    onSuccess: (r: any) => { refresh(qc); setEdit(null); onSelect(r.id); toast('Saved'); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/catalog/curricula/${id}`),
    onSuccess: () => { refresh(qc); setDel(null); onSelect(''); toast('Deleted'); },
    onError: (e: any) => { setDel(null); toast(e.message, 'err'); },
  });
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="font-semibold">Curricula</h2>
        <Button size="sm" variant="ghost" onClick={() => setEdit({ name: '', code: '', description: '', color: '#6366f1', sort: 80 })}><Plus className="size-4" />Add</Button>
      </div>
      <ul className="divide-y divide-slate-100">
        {list.map((c) => (
          <li key={c.id}>
            <button onClick={() => onSelect(c.id)} aria-pressed={sel === c.id}
              className={cn('focus-ring flex w-full items-start gap-3 px-4 py-3 text-left', sel === c.id ? 'bg-brand-50' : 'hover:bg-slate-50')}>
              <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
              <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{c.name}</span>
                <span className="block text-xs text-slate-600">{c.gradeCount} grades · {c.packageCount} books · {c.schoolCount} schools</span></span>
            </button>
          </li>))}
      </ul>
      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : 'New curriculum'}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
            <Field label="Name"><Input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Indian CBSE" autoFocus /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Short code"><Input required pattern="[A-Za-z0-9_\-]{2,20}" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder="CBSE" /></Field>
              <Field label="Order"><Input type="number" min={0} value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></Field>
              <Field label="Colour"><Input type="color" className="h-10 p-1" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} /></Field>
            </div>
            <Field label="Description"><Textarea rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            {save.error ? <ErrorBox error={save.error} /> : null}
            <div className="flex justify-between gap-2">
              {edit.id && String(edit.code).toUpperCase() !== 'OTHER' ? <Button type="button" variant="ghost" onClick={() => { setDel(edit as Curriculum); setEdit(null); }}><Trash2 className="size-4" />Delete</Button> : <span />}
              <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.isPending}>Save</Button></div>
            </div>
          </form>
        </Dialog>
      )}
      <Confirm open={!!del} onOpenChange={() => setDel(null)} title={`Delete ${del?.name}?`} body="Only possible when it has no grades." danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(del!.id)} />
      {list.find((c) => c.id === sel) && <div className="border-t border-slate-100 p-3"><Button size="sm" variant="ghost" className="w-full" onClick={() => setEdit(list.find((c) => c.id === sel)!)}><Pencil className="size-4" />Edit selected curriculum</Button></div>}
    </Card>
  );
}

function GradesCard({ c, grades, curricula }: { c: Curriculum; grades: Grade[]; curricula: Curriculum[] }) {
  const qc = useQueryClient(); const toast = useToast();
  const [edit, setEdit] = useState<any | null>(null); const [del, setDel] = useState<Grade | null>(null);
  const stages = Array.from(new Set(grades.map((g) => g.stage).filter(Boolean)));
  const save = useMutation({
    mutationFn: (v: any) => {
      const body = { name: v.name, stage: v.stage ?? '', sort: Number(v.sort) || 0, curriculumId: v.curriculumId };
      return v.id ? api.patch(`/catalog/grades/${v.id}`, body) : api.post('/catalog/grades', body);
    },
    onSuccess: () => { refresh(qc); setEdit(null); toast('Saved'); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/catalog/grades/${id}`),
    onSuccess: () => { refresh(qc); setDel(null); toast('Deleted'); },
    onError: (e: any) => { setDel(null); toast(e.status === 409 ? 'Still used by books, products or classes. It cannot be deleted.' : e.message, 'err'); },
  });
  const nextSort = (grades.at(-1)?.sort ?? 0) + 10;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl text-white" style={{ background: c.color }}><GraduationCap className="size-5" /></span>
          <div><h2 className="font-semibold text-slate-900">{c.name}</h2><p className="text-xs text-slate-600">{c.description}</p></div></div>
        <Button size="sm" onClick={() => setEdit({ name: '', stage: stages.at(-1) ?? '', sort: nextSort, curriculumId: c.id })}><Plus className="size-4" />Add grade</Button>
      </div>
      {!grades.length ? <p className="p-6 text-sm text-slate-600">No grades yet. Add the grades this curriculum uses.</p> : (
        <div className="divide-y divide-slate-100">
          {byStage(grades).map((s, i) => (
            <div key={i} className="px-5 py-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{s.stage || 'Grades'}</div>
              <div className="flex flex-wrap gap-2">
                {s.items.map((g) => (
                  <span key={g.id} className="group inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white py-1 pl-3 pr-1 text-sm">
                    <span className="font-medium text-slate-800">{g.name}</span>
                    {g.packageCount > 0 && <Badge>{g.packageCount} book{g.packageCount > 1 ? 's' : ''}</Badge>}
                    <button className="focus-ring rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${g.name}`} onClick={() => setEdit({ ...g })}><Pencil className="size-3.5" /></button>
                    <button className="focus-ring rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label={`Delete ${g.name}`} disabled={g.packageCount > 0} onClick={() => setDel(g)}><Trash2 className="size-3.5" /></button>
                  </span>))}
              </div>
            </div>))}
        </div>)}
      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : `New grade in ${c.name}`}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
            <Field label="Grade name"><Input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Grade 1" autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stage"><Input list="stages" value={edit.stage} onChange={(e) => setEdit({ ...edit, stage: e.target.value })} placeholder="Primary" /><datalist id="stages">{stages.map((s) => <option key={s} value={s} />)}</datalist></Field>
              <Field label="Order"><Input type="number" min={0} value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: e.target.value })} /></Field>
            </div>
            {edit.id && <Field label="Curriculum"><Select value={edit.curriculumId} onChange={(e) => setEdit({ ...edit, curriculumId: e.target.value })}>{curricula.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>}
            {save.error ? <ErrorBox error={save.error} /> : null}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.isPending}>Save</Button></div>
          </form>
        </Dialog>
      )}
      <Confirm open={!!del} onOpenChange={() => setDel(null)} title={`Delete ${del?.name}?`} body="This cannot be undone." danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(del!.id)} />
    </Card>
  );
}

function Subjects() {
  const q = useSubjects(); const qc = useQueryClient(); const toast = useToast();
  const [edit, setEdit] = useState<any | null>(null); const [del, setDel] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: (v: any) => { const body = { name: v.name, sort: Number(v.sort) || 0, color: v.color }; return v.id ? api.patch(`/catalog/subjects/${v.id}`, body) : api.post('/catalog/subjects', body); },
    onSuccess: () => { refresh(qc); setEdit(null); toast('Saved'); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/catalog/subjects/${id}`),
    onSuccess: () => { refresh(qc); setDel(null); toast('Deleted'); },
    onError: (e: any) => { setDel(null); toast(e.status === 409 ? 'Still used by books. It cannot be deleted.' : e.message, 'err'); },
  });
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div><h2 className="font-semibold text-slate-900">Subjects</h2><p className="text-xs text-slate-600">Shared by all curricula.</p></div>
        <Button size="sm" onClick={() => setEdit({ name: '', sort: (q.data?.length ?? 0) * 10, color: '#6366f1' })}><Plus className="size-4" />Add subject</Button>
      </div>
      <div className="flex flex-wrap gap-2 p-5">
        {q.data?.map((x) => (
          <span key={x.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 py-1 pl-3 pr-1 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: x.color }} aria-hidden /><span className="font-medium text-slate-800">{x.name}</span>
            {x.packageCount > 0 && <span className="text-xs text-slate-600">· {x.packageCount}</span>}
            <button className="focus-ring rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${x.name}`} onClick={() => setEdit(x)}><Pencil className="size-3.5" /></button>
            <button className="focus-ring rounded-full p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label={`Delete ${x.name}`} disabled={x.packageCount > 0} onClick={() => setDel(x)}><Trash2 className="size-3.5" /></button>
          </span>))}
      </div>
      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : 'New subject'}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
            <Field label="Name"><Input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Order"><Input type="number" min={0} value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: e.target.value })} /></Field>
              <Field label="Colour"><Input type="color" className="h-10 p-1" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} /></Field>
            </div>
            {save.error ? <ErrorBox error={save.error} /> : null}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.isPending}>Save</Button></div>
          </form>
        </Dialog>
      )}
      <Confirm open={!!del} onOpenChange={() => setDel(null)} title={`Delete ${del?.name}?`} body="This cannot be undone." danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(del.id)} />
    </Card>
  );
}
