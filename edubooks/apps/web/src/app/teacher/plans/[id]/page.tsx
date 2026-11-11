'use client';
import Link from 'next/link';
import { Suspense, use, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, Download, ExternalLink, Plus, Printer, Sparkles, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { className, useBook, useMyClasses } from '@/lib/lms';
import { Button, Card, Confirm, Field, Input, PageLoader, Select, Textarea } from '@/components/ui';
import { BookScope } from '@/components/book-scope';
import { useToast } from '@/components/ui/toast';
import { AiNotices, SourceChips } from '@/components/ai-bits';

type Step = { title: string; minutes: number; detail: string };
type Content = { objectives: string; materials: string; warmUp: string; steps: Step[]; practice: string; assessment: string; homework: string; differentiation: string; notes: string };
const EMPTY: Content = { objectives: '', materials: '', warmUp: '', steps: [{ title: 'Introduce the topic', minutes: 10, detail: '' }], practice: '', assessment: '', homework: '', differentiation: '', notes: '' };
const SECTIONS: [keyof Content, string, string][] = [
  ['objectives', 'Learning objectives', 'By the end of the lesson, children will be able to…'], ['materials', 'Materials & resources', 'Book pages, flashcards, teacher cards…'],
  ['warmUp', 'Warm-up', 'Song, rhyme or quick game to start'], ['practice', 'Classroom practice', 'Group or individual activity'],
  ['assessment', 'Assessment', 'How will you check understanding?'], ['homework', 'Homework', 'Homework book page or activity'],
  ['differentiation', 'Differentiation', 'Support for children who need help; challenge for fast learners'], ['notes', 'Notes / reflection', ''],
];
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

function Editor({ id }: { id: string }) {
  const isNew = id === 'new'; const router = useRouter(); const params = useSearchParams(); const toast = useToast();
  const existing = useQuery({ queryKey: ['plan', id], queryFn: () => api.get(`/teacher/lesson-plans/${id}`), enabled: !isNew });
  const classes = useMyClasses();
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (f) return;
    if (isNew) setF({ title: '', classId: params.get('classId'), editionId: params.get('editionId'), lessonId: params.get('lessonId'), planDate: new Date().toISOString().slice(0, 10), durationMin: 40, status: 'DRAFT', content: EMPTY });
    else if (existing.data) setF({ ...existing.data, planDate: existing.data.planDate?.slice(0, 10) ?? '', content: { ...EMPTY, ...existing.data.content } });
  }, [existing.data, isNew, params, f]);
  const book = useBook(f?.editionId ?? undefined);
  const lesson = useMemo(() => book.data?.components.flatMap((c: any) => c.units.flatMap((u: any) => u.lessons.map((l: any) => ({ ...l, unit: u, comp: c })))).find((l: any) => l.id === f?.lessonId), [book.data, f?.lessonId]);
  const resources = (book.data?.resources ?? []).filter((r: any) => lesson && (r.lessonId === lesson.id || (r.unitId === lesson.unit.id && !r.lessonId)));
  useEffect(() => { if (lesson && f && !f.title) setF((x: any) => ({ ...x, title: `${lesson.title} — Lesson plan` })); }, [lesson, f]);
  const save = useAction(() => {
    const body = { ...f, planDate: f.planDate ? `${f.planDate}T08:00:00Z` : null, classId: f.classId || null, editionId: f.editionId || null, lessonId: f.lessonId || null };
    ['id', 'publisherId', 'schoolId', 'teacherId', 'createdAt', 'updatedAt'].forEach((k) => delete body[k]);
    return isNew ? api.post('/teacher/lesson-plans', body) : api.put(`/teacher/lesson-plans/${id}`, body);
  }, { ok: 'Lesson plan saved', keys: ['plans', 'plan'], after: (r) => isNew && router.replace(`/teacher/plans/${r.id}`) });
  const dup = useAction(() => api.post(`/teacher/lesson-plans/${id}/duplicate`), { ok: 'Copy created', keys: ['plans'], after: (r) => router.push(`/teacher/plans/${r.id}`) });
  const del = useAction(() => api.del(`/teacher/lesson-plans/${id}`), { ok: 'Deleted', keys: ['plans'], after: () => router.push('/teacher/plans') });
  const [confirmDel, setConfirmDel] = useState(false);
  const [aiInfo, setAiInfo] = useState<any>(null);
  // Fills the editor with an AI draft grounded in the chosen lesson; the teacher edits, then saves.
  const ai = useAction(() => api.post('/ai/generate', { task: 'LESSON_PLAN', editionId: f.editionId, lessonId: f.lessonId || undefined, durationMin: f.durationMin }), {
    keys: ['aiStatus'], after: (r: any) => {
      const o = r.output;
      setF((x: any) => ({ ...x, title: x.title || o.title, aiGenerated: true, content: { ...x.content, objectives: o.objectives, materials: o.materials, warmUp: o.warmUp,
        steps: o.steps.map((st: any) => ({ title: st.title, minutes: st.minutes, detail: st.detail })), practice: o.practice, assessment: o.assessment, homework: o.homework,
        differentiation: o.differentiation, notes: o.notes } }));
      setAiInfo(r);
    } });
  if (!f) return <PageLoader />;
  const c: Content = f.content; const setC = (patch: Partial<Content>) => setF({ ...f, content: { ...c, ...patch } });
  const total = c.steps.reduce((n, s) => n + (Number(s.minutes) || 0), 0);

  const html = () => `<h1>${esc(f.title)}</h1><p>${esc([book.data?.title, lesson && `Unit ${lesson.unit.number} · Lesson ${lesson.number}: ${lesson.title}${lesson.pageStart ? ` (pages ${lesson.pageStart}–${lesson.pageEnd ?? lesson.pageStart})` : ''}`, f.planDate, `${f.durationMin} minutes`].filter(Boolean).join(' · '))}</p>`
    + SECTIONS.slice(0, 3).map(([k, l]) => (c[k] ? `<h3>${l}</h3><p>${esc(String(c[k])).replace(/\n/g, '<br>')}</p>` : '')).join('')
    + `<h3>Teaching steps</h3><ol>${c.steps.map((s) => `<li><b>${esc(s.title)}</b> (${s.minutes} min)${s.detail ? `<br>${esc(s.detail).replace(/\n/g, '<br>')}` : ''}</li>`).join('')}</ol>`
    + SECTIONS.slice(3).map(([k, l]) => (c[k] ? `<h3>${l}</h3><p>${esc(String(c[k])).replace(/\n/g, '<br>')}</p>` : '')).join('');
  const print = () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<!doctype html><title>${esc(f.title)}</title><style>body{font-family:system-ui;max-width:760px;margin:24px auto;line-height:1.5}h3{margin-bottom:4px;color:#334155}</style>${html()}<script>print()</script>`); w.document.close(); };
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`<html><head><meta charset="utf-8"></head><body>${html()}</body></html>`], { type: 'application/msword' })); a.download = `${f.title || 'lesson-plan'}.doc`; a.click(); };

  return (
    <div className="space-y-6">
      <Link href="/teacher/plans" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Lesson planner</Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold">{isNew ? 'New lesson plan' : f.title}</h1>
        <Button variant="secondary" loading={ai.isPending} disabled={!f.editionId} title={f.editionId ? 'Draft this plan from the lesson pages' : 'Choose a book first'}
          onClick={() => ai.mutate()}><Sparkles className="size-4" />Generate with AI</Button>
        {!isNew && <><Button variant="ghost" onClick={print}><Printer className="size-4" />Print</Button><Button variant="ghost" onClick={download}><Download className="size-4" />Word</Button>
          <Button variant="ghost" onClick={() => dup.mutate()}><Copy className="size-4" />Duplicate</Button><Button variant="ghost" onClick={() => setConfirmDel(true)} aria-label="Delete"><Trash2 className="size-4 text-red-500" /></Button></>}
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!f.title.trim()}>Save</Button>
      </div>
      {aiInfo && <Card className="space-y-2 p-4"><AiNotices r={aiInfo} /><div className="text-sm text-slate-600">Pages used: <SourceChips editionId={f.editionId} sources={aiInfo.sources} /></div>
        <p className="text-xs text-slate-500">Review the draft below, change anything you like, then press Save.</p></Card>}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Letter B — Lesson plan" /></Field>
            <BookScope editionId={f.editionId} lessonId={f.lessonId} onChange={(v) => setF({ ...f, ...v })} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Class"><Select value={f.classId ?? ''} onChange={(e) => setF({ ...f, classId: e.target.value || null })}><option value="">—</option>{classes.data?.map((x) => <option key={x.id} value={x.id}>{className(x)}</option>)}</Select></Field>
              <Field label="Date"><Input type="date" value={f.planDate ?? ''} onChange={(e) => setF({ ...f, planDate: e.target.value })} /></Field>
              <Field label="Duration (min)"><Input type="number" min={5} max={300} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></Field>
              <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="DRAFT">Draft</option><option value="READY">Ready to teach</option></Select></Field>
            </div>
          </Card>
          <Card className="space-y-4 p-5">
            {SECTIONS.slice(0, 3).map(([k, label, ph]) => <Field key={k} label={label}><Textarea rows={k === 'objectives' ? 3 : 2} value={String(c[k])} placeholder={ph} onChange={(e) => setC({ [k]: e.target.value } as any)} /></Field>)}
            <div>
              <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-slate-700">Teaching steps</span>
                <span className={`text-xs ${total > f.durationMin ? 'text-red-600' : 'text-slate-500'}`}>{total} / {f.durationMin} min planned</span></div>
              <div className="space-y-2">{c.steps.map((s, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3">
                  <div className="grid grid-cols-[1fr_90px_32px] gap-2">
                    <Input aria-label={`Step ${i + 1} title`} value={s.title} onChange={(e) => setC({ steps: c.steps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                    <Input aria-label={`Step ${i + 1} minutes`} type="number" min={0} value={s.minutes} onChange={(e) => setC({ steps: c.steps.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)) })} />
                    <button aria-label="Remove step" onClick={() => setC({ steps: c.steps.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-600"><Trash2 className="size-4" /></button>
                  </div>
                  <Textarea rows={2} className="mt-2" placeholder="What you and the children do" value={s.detail} onChange={(e) => setC({ steps: c.steps.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)) })} />
                </div>))}</div>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setC({ steps: [...c.steps, { title: '', minutes: 5, detail: '' }] })}><Plus className="size-4" />Add step</Button>
            </div>
            {SECTIONS.slice(3).map(([k, label, ph]) => <Field key={k} label={label}><Textarea rows={2} value={String(c[k])} placeholder={ph} onChange={(e) => setC({ [k]: e.target.value } as any)} /></Field>)}
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="p-4 text-sm">
            <h3 className="mb-2 font-semibold">From the book</h3>
            {!lesson ? <p className="text-slate-500">Choose a book and lesson to see its pages and resources here.</p> : <>
              <p className="font-medium">Unit {lesson.unit.number} · Lesson {lesson.number}: {lesson.title}</p>
              {lesson.pageStart && <Link href={`/read/${f.editionId}`} className="mt-1 inline-flex items-center gap-1 text-brand-700 hover:underline">Open pages {lesson.pageStart}–{lesson.pageEnd ?? lesson.pageStart}<ExternalLink className="size-3" /></Link>}
              <p className="mb-1 mt-3 text-xs font-semibold uppercase text-slate-500">Resources</p>
              {resources.length ? resources.map((r: any) => (
                <button key={r.id} onClick={async () => { const w = window.open('', '_blank'); try { const { url } = await api.get(`/assets/${r.assetId}/link`); if (w) { w.opener = null; w.location.href = url; } } catch (e: any) { w?.close(); toast(e.message, 'err'); } }}
                  className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-slate-50"><span className="rounded bg-slate-100 px-1 text-[9px] font-bold uppercase">{r.ext}</span><span className="truncate">{r.title}</span></button>
              )) : <p className="text-slate-500">No resources for this lesson yet.</p>}
              <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setC({ materials: [c.materials, ...resources.map((r: any) => `• ${r.title}`), lesson.pageStart ? `• Student book pages ${lesson.pageStart}–${lesson.pageEnd ?? lesson.pageStart}` : ''].filter(Boolean).join('\n') })}>Add to materials</Button>
            </>}
          </Card>
        </aside>
      </div>
      <Confirm open={confirmDel} onOpenChange={setConfirmDel} title="Delete this plan?" danger confirmLabel="Delete" loading={del.isPending} onConfirm={() => del.mutate()} body="This cannot be undone." />
    </div>
  );
}
export default function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <Suspense><Editor id={id} /></Suspense>; }
