'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/session';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { KIND_ICON, KIND_NAME, embedUrl } from '@/components/training';

const COLORS = ['#4f46e5', '#0f766e', '#b91c1c', '#c2410c', '#7c3aed', '#0e7490', '#be185d', '#334155'];

export default function CourseEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe().data as any; const canEdit = me?.roles?.some((r: string) => ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR'].includes(r));
  const q = useQuery({ queryKey: ['training', 'admin', id], queryFn: () => api.get<any>(`/training/admin/courses/${id}`) });
  const qc = useQueryClient(); const toast = useToast(); const router = useRouter();
  const [f, setF] = useState<any>(null); const [edit, setEdit] = useState<any>(null); const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (q.data) setF({ title: q.data.title, description: q.data.description, audience: q.data.audience, color: q.data.color }); }, [q.data]);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data || !f) return <PageLoader />;
  const c = q.data; const lessons = c.lessons as any[];
  const refresh = () => qc.invalidateQueries({ queryKey: ['training'] });
  const act = async (fn: () => Promise<unknown>, ok: string) => { setErr(null); try { await fn(); await refresh(); toast(ok); } catch (e) { setErr(e); } };
  const move = (i: number, d: number) => { const ids = lessons.map((l) => l.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; act(() => api.post(`/training/admin/courses/${id}/reorder`, { ids }), 'Order saved'); };
  return (
    <div className="space-y-6">
      <Link href="/admin/training" className="text-sm text-slate-600 hover:text-slate-900">← Training</Link>
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold text-slate-900">{c.title}</h1><Badge tone={c.status}>{c.status.toLowerCase()}</Badge>
        {canEdit && <div className="ml-auto flex gap-2">
          {c.status !== 'PUBLISHED' && <Button onClick={() => act(() => api.patch(`/training/admin/courses/${id}`, { status: 'PUBLISHED' }), 'Published — teachers can see it now')}>Publish</Button>}
          {c.status === 'PUBLISHED' && <Button variant="secondary" onClick={() => act(() => api.patch(`/training/admin/courses/${id}`, { status: 'DRAFT' }), 'Hidden from teachers')}>Unpublish</Button>}
          {c.status !== 'ARCHIVED' && <Button variant="secondary" onClick={() => act(() => api.patch(`/training/admin/courses/${id}`, { status: 'ARCHIVED' }), 'Archived')}>Archive</Button>}
          <Button variant="ghost" onClick={() => confirm('Delete this course?') && act(async () => { await api.del(`/training/admin/courses/${id}`); router.push('/admin/training'); }, 'Deleted')}><Trash2 className="size-4" />Delete</Button>
        </div>}</div>
      {err ? <ErrorBox error={err} /> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="font-semibold">Lessons</h2>{canEdit && <Button size="sm" onClick={() => setEdit({ kind: 'VIDEO', title: '', body: '', url: '', minutes: 5, quiz: [] })}><Plus className="size-4" />Add lesson</Button>}</div>
          <ol className="divide-y divide-slate-100">{lessons.map((l, i) => { const Icon = KIND_ICON[l.kind as keyof typeof KIND_ICON]; return (
            <li key={l.id} className="flex items-center gap-3 px-5 py-3 text-sm"><span className="w-5 text-slate-500">{i + 1}</span><Icon className="size-4 text-brand-600" />
              <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{l.title}</span><span className="text-xs text-slate-600">{KIND_NAME[l.kind as keyof typeof KIND_NAME]} · {l.minutes} min{l.kind === 'QUIZ' && ` · ${l.quiz.length} question(s)`}</span></span>
              {canEdit && <><button aria-label={`Move ${l.title} up`} disabled={!i} onClick={() => move(i, -1)} className="text-slate-500 hover:text-slate-900 disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button aria-label={`Move ${l.title} down`} disabled={i === lessons.length - 1} onClick={() => move(i, 1)} className="text-slate-500 hover:text-slate-900 disabled:opacity-30"><ArrowDown className="size-4" /></button>
                <button aria-label={`Edit ${l.title}`} onClick={() => setEdit({ ...l, url: l.url ?? '' })} className="text-slate-500 hover:text-slate-900"><Pencil className="size-4" /></button>
                <button aria-label={`Delete ${l.title}`} onClick={() => confirm(`Delete “${l.title}”?`) && act(() => api.del(`/training/admin/lessons/${l.id}`), 'Lesson deleted')} className="text-slate-500 hover:text-red-600"><Trash2 className="size-4" /></button></>}
            </li>); })}
            {!lessons.length && <li className="px-5 py-8 text-center text-sm text-slate-600">No lessons yet. Add a short video, a reading or a quiz.</li>}</ol>
        </Card>
        <Card className="h-fit space-y-4 p-5">
          <Field label="Title"><Input disabled={!canEdit} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Description"><Textarea disabled={!canEdit} rows={4} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Who is it for?"><Select disabled={!canEdit} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="TEACHER">Teachers (and school admins)</option><option value="SCHOOL_ADMIN">School admins only</option><option value="ALL">Everyone in a school</option></Select></Field>
          <Field label="Colour"><div className="flex flex-wrap gap-2">{COLORS.map((x) => <button key={x} type="button" disabled={!canEdit} aria-label={`Colour ${x}`} aria-pressed={f.color === x} onClick={() => setF({ ...f, color: x })} className={`size-7 rounded-full ring-offset-2 ${f.color === x ? 'ring-2 ring-slate-900' : ''}`} style={{ background: x }} />)}</div></Field>
          {canEdit && <div className="flex justify-end"><Button onClick={() => act(() => api.patch(`/training/admin/courses/${id}`, f), 'Course saved')}>Save details</Button></div>}
        </Card>
      </div>
      {edit && <LessonDialog courseId={id} lesson={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
    </div>
  );
}

function LessonDialog({ courseId, lesson, onClose, onSaved }: { courseId: string; lesson: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>(lesson); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const toast = useToast();
  const quiz = f.quiz as { q: string; options: string[]; answer: number }[];
  const setQ = (i: number, p: any) => setF({ ...f, quiz: quiz.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const save = async () => {
    setBusy(true); setErr(null);
    const body = { title: f.title, kind: f.kind, body: f.body, url: ['VIDEO', 'LINK'].includes(f.kind) ? f.url : null, minutes: Number(f.minutes) || 5, quiz: f.kind === 'QUIZ' ? quiz : [] };
    try { f.id ? await api.patch(`/training/admin/lessons/${f.id}`, body) : await api.post(`/training/admin/courses/${courseId}/lessons`, body); toast('Lesson saved'); onSaved(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const preview = f.kind === 'VIDEO' ? embedUrl(f.url) : null;
  return (
    <Dialog open onOpenChange={onClose} wide title={f.id ? 'Edit lesson' : 'Add lesson'}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid gap-3 sm:grid-cols-[1fr_160px_110px]">
          <Field label="Title"><Input required maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, quiz: e.target.value === 'QUIZ' && !quiz.length ? [{ q: '', options: ['', ''], answer: 0 }] : quiz })}>
            {Object.entries(KIND_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Minutes"><Input type="number" min={1} max={600} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></Field>
        </div>
        {f.kind === 'VIDEO' && <Field label="YouTube or Vimeo link" hint="Upload the video to YouTube (it can be “unlisted”) and paste its link here."><Input required value={f.url} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>}
        {preview && <div className="aspect-video max-w-md overflow-hidden rounded-lg bg-black"><iframe src={preview} title="Preview" className="size-full" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen" /></div>}
        {f.kind === 'LINK' && <Field label="Link (https://…)" hint="A PDF guide, a web page or a shared folder."><Input required value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>}
        <Field label={f.kind === 'TEXT' ? 'Text' : 'Notes (optional)'}><Textarea rows={f.kind === 'TEXT' ? 10 : 3} maxLength={20000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        {f.kind === 'QUIZ' && (
          <div className="space-y-3"><p className="text-sm text-slate-700">Teachers need 70% to pass. Tick the right answer for each question.</p>
            {quiz.map((x, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="flex gap-2"><Input aria-label={`Question ${i + 1}`} required maxLength={300} placeholder={`Question ${i + 1}`} value={x.q} onChange={(e) => setQ(i, { q: e.target.value })} />
                  <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => setF({ ...f, quiz: quiz.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-600"><Trash2 className="size-4" /></button></div>
                {x.options.map((o, j) => (
                  <div key={j} className="flex items-center gap-2 pl-2"><input type="radio" name={`ans${i}`} aria-label={`Answer ${j + 1} is right`} checked={x.answer === j} onChange={() => setQ(i, { answer: j })} />
                    <Input aria-label={`Question ${i + 1}, answer ${j + 1}`} required maxLength={200} className="h-9" value={o} onChange={(e) => setQ(i, { options: x.options.map((y, k) => (k === j ? e.target.value : y)) })} />
                    {x.options.length > 2 && <button type="button" aria-label="Remove answer" onClick={() => setQ(i, { options: x.options.filter((_, k) => k !== j), answer: x.answer >= j && x.answer > 0 ? x.answer - 1 : x.answer })} className="text-slate-400 hover:text-red-600"><Trash2 className="size-3.5" /></button>}</div>))}
                {x.options.length < 6 && <button type="button" className="pl-2 text-xs text-brand-700 hover:underline" onClick={() => setQ(i, { options: [...x.options, ''] })}>+ Add answer</button>}
              </div>))}
            <Button type="button" size="sm" variant="secondary" onClick={() => setF({ ...f, quiz: [...quiz, { q: '', options: ['', ''], answer: 0 }] })}><Plus className="size-4" />Add question</Button>
          </div>)}
        {err ? <ErrorBox error={err} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>Save lesson</Button></div>
      </form>
    </Dialog>
  );
}
