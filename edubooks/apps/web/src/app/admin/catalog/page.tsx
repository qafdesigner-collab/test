'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useGrades, useSubjects } from '@/lib/catalog';
import { Button, Card, Confirm, Dialog, ErrorBox, Field, Input, PageLoader } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

type Kind = 'grades' | 'subjects';
function Section({ kind, title, hint }: { kind: Kind; title: string; hint: string }) {
  const grades = useGrades(); const subjects = useSubjects();
  const q = kind === 'grades' ? grades : subjects;
  const qc = useQueryClient(); const toast = useToast();
  const [edit, setEdit] = useState<any | null>(null); const [del, setDel] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: (v: any) => (v.id ? api.patch(`/catalog/${kind}/${v.id}`, { name: v.name, sort: Number(v.sort) || 0, ...(kind === 'subjects' ? { color: v.color } : {}) })
      : api.post(`/catalog/${kind}`, { name: v.name, sort: Number(v.sort) || 0, ...(kind === 'subjects' ? { color: v.color } : {}) })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [kind] }); setEdit(null); toast('Saved'); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/catalog/${kind}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [kind] }); setDel(null); toast('Deleted'); },
    onError: (e: any) => { setDel(null); toast(e.status === 409 ? 'Still used by book packages — it cannot be deleted.' : e.message, 'err'); },
  });
  if (q.isLoading) return <PageLoader />;
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div><h2 className="font-semibold text-slate-900">{title}</h2><p className="text-xs text-slate-500">{hint}</p></div>
        <Button size="sm" onClick={() => setEdit({ name: '', sort: (q.data?.length ?? 0), color: '#6366f1' })}><Plus className="size-4" />Add</Button>
      </div>
      <ul className="divide-y divide-slate-100">
        {q.data?.map((x: any) => (
          <li key={x.id} className="flex items-center gap-3 px-5 py-3 text-sm">
            {kind === 'subjects' && <span className="size-3 rounded-full" style={{ background: x.color }} aria-hidden />}
            <span className="flex-1 font-medium text-slate-800">{x.name}</span>
            <span className="text-xs text-slate-500">{x.packageCount} package{x.packageCount === 1 ? '' : 's'}</span>
            <button className="focus-ring rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${x.name}`} onClick={() => setEdit(x)}><Pencil className="size-4" /></button>
            <button className="focus-ring rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label={`Delete ${x.name}`} disabled={x.packageCount > 0}
              title={x.packageCount ? 'In use by packages' : 'Delete'} onClick={() => setDel(x)}><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : `New ${kind === 'grades' ? 'grade' : 'subject'}`}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
            <Field label="Name"><Input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <Field label="Display order"><Input type="number" min={0} value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: e.target.value })} /></Field>
            {kind === 'subjects' && <Field label="Colour"><Input type="color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} className="h-10 w-20 p-1" /></Field>}
            {save.error && <ErrorBox error={save.error} />}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.isPending}>Save</Button></div>
          </form>
        </Dialog>
      )}
      <Confirm open={!!del} onOpenChange={() => setDel(null)} title={`Delete ${del?.name}?`} body="This cannot be undone." danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(del.id)} />
    </Card>
  );
}

export default function CatalogPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold text-slate-900">Grades & subjects</h1><p className="text-sm text-slate-500">Unlimited grades and subjects used to organise book packages.</p></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section kind="grades" title="Grades" hint="e.g. Nursery, KG, Grade 1" />
        <Section kind="subjects" title="Subjects" hint="e.g. English, Mathematics, Urdu" />
      </div>
    </div>
  );
}
