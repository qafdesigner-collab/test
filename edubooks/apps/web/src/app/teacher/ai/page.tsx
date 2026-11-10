'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BookMarked, ClipboardList, NotebookPen, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { className, useMyClasses } from '@/lib/lms';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Select, Textarea } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { BookScope } from '@/components/book-scope';
import { ItemEditor } from '@/components/item-editor';
import { AiNotices, SourceChips } from '@/components/ai-bits';

const GROUPS: [string, string[]][] = [
  ['Plan', ['LESSON_PLAN']], ['Questions', ['HOMEWORK', 'WORKSHEET', 'MCQ', 'SHORT', 'FILL_BLANK', 'TRUE_FALSE', 'ASSESSMENT']],
  ['Ideas', ['ACTIVITIES', 'GAMES', 'DIFFERENTIATE']],
];
const PLAN_FIELDS: [string, string][] = [['objectives', 'Objectives'], ['materials', 'Materials & resources'], ['warmUp', 'Warm-up'], ['practice', 'Classroom practice'],
  ['assessment', 'Assessment'], ['homework', 'Homework'], ['differentiation', 'Differentiation'], ['notes', 'Notes']];

function Assistant() {
  const params = useSearchParams(); const router = useRouter();
  const status = useQuery({ queryKey: ['aiStatus'], queryFn: () => api.get('/ai/status') });
  const history = useQuery({ queryKey: ['aiHistory'], queryFn: () => api.get('/ai/generations') });
  const [f, setF] = useState({ editionId: params.get('editionId'), lessonId: params.get('lessonId'), task: params.get('task') ?? 'LESSON_PLAN', durationMin: 40, difficulty: 'EASY', count: 6, notes: '' });
  const [r, setR] = useState<any>(null); const [out, setOut] = useState<any>(null); const [useDlg, setUseDlg] = useState<'' | 'ASSESSMENT'>('');
  const gen = useAction(() => api.post('/ai/generate', { ...f, lessonId: f.lessonId || undefined }), { keys: ['aiHistory', 'aiStatus'], after: (res) => { setR(res); setOut(res.output); } });
  const use = useAction((v: { as: string; classId?: string }) => api.post(`/ai/generations/${r.id}/use`, { ...v, output: out, title: out.title }), {
    ok: (x) => (x.usedAs === 'QUESTION_BANK' ? 'Added to the question bank' : 'Saved — opening it now'), keys: ['aiHistory', 'plans', 'assessments', 'bank'],
    after: (x) => { if (x.usedAs === 'LESSON_PLAN') router.push(`/teacher/plans/${x.id}`); if (x.usedAs === 'ASSESSMENT') router.push(`/teacher/assessments/${x.id}`); },
  });
  const task = status.data?.tasks.find((t: any) => t.id === f.task);
  const s = status.data;
  return (
    <div className="space-y-6">
      <PageHeader title="AI teaching assistant" sub="Drafts lesson plans, homework, worksheets and activities from the pages of your licensed books. You review and edit everything before it is used.">
        {s && <Badge tone={s.live ? 'info' : 'DRAFT'}>{s.live ? `Model: ${s.model}` : 'Offline drafts (no AI model configured)'}</Badge>}
        {s?.monthlyLimit && <Badge>{s.usedThisMonth} / {s.monthlyLimit} requests this month</Badge>}
      </PageHeader>
      {s && !s.health.ok && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">The AI server is not available: {s.health.detail}</div>}
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="h-fit space-y-4 p-5">
          <BookScope editionId={f.editionId} lessonId={f.lessonId} onChange={(v) => setF({ ...f, ...v })} required />
          <Field label="What do you need?"><Select value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })}>
            {GROUPS.map(([g, ids]) => <optgroup key={g} label={g}>{ids.map((id) => <option key={id} value={id}>{s?.tasks.find((t: any) => t.id === id)?.label ?? id}</option>)}</optgroup>)}</Select></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Minutes"><Input type="number" min={10} max={180} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></Field>
            <Field label="Level"><Select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></Select></Field>
            <Field label="How many"><Input type="number" min={1} max={20} value={f.count} disabled={task?.kind === 'plan'} onChange={(e) => setF({ ...f, count: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Notes for the assistant (optional)" hint="e.g. “class of 30, include a song, children find /b/ and /d/ confusing”. Please don’t include children’s names.">
            <Textarea rows={3} maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <Button className="w-full" disabled={!f.editionId} loading={gen.isPending} onClick={() => gen.mutate()}><Sparkles className="size-4" />{r ? 'Generate again' : 'Generate draft'}</Button>
          {!f.lessonId && f.editionId && <p className="text-xs text-amber-700">Choose a lesson for the best results — the assistant then reads exactly those pages.</p>}
        </Card>

        <div className="space-y-4">
          {gen.isPending && <Card className="flex items-center gap-3 p-6 text-sm text-slate-600"><RefreshCw className="size-5 animate-spin" />Reading the lesson pages and drafting… this can take up to a minute on a self-hosted model.</Card>}
          {gen.error && <ErrorBox error={gen.error} />}
          {r && out && !gen.isPending && (
            <>
              <AiNotices r={r} />
              <Card className="space-y-4 p-5">
                <Input aria-label="Title" className="text-lg font-semibold" value={out.title} onChange={(e) => setOut({ ...out, title: e.target.value })} />
                {r.output.steps && <>
                  {PLAN_FIELDS.slice(0, 3).map(([k, l]) => <Field key={k} label={l}><Textarea rows={2} value={out[k]} onChange={(e) => setOut({ ...out, [k]: e.target.value })} /></Field>)}
                  <div><p className="mb-2 text-sm font-medium text-slate-700">Teaching steps</p>
                    {out.steps.map((st: any, i: number) => (
                      <div key={i} className="mb-2 rounded-lg border border-slate-200 p-3">
                        <div className="flex gap-2"><Input aria-label="Step title" value={st.title} onChange={(e) => setOut({ ...out, steps: out.steps.map((x: any, j: number) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                          <Input aria-label="Minutes" type="number" className="w-20" value={st.minutes} onChange={(e) => setOut({ ...out, steps: out.steps.map((x: any, j: number) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)) })} /></div>
                        <Textarea rows={2} className="mt-2" value={st.detail} onChange={(e) => setOut({ ...out, steps: out.steps.map((x: any, j: number) => (j === i ? { ...x, detail: e.target.value } : x)) })} />
                        <div className="mt-1"><SourceChips editionId={f.editionId!} sources={r.sources} ids={st.sources} /></div>
                      </div>))}</div>
                  {PLAN_FIELDS.slice(3).map(([k, l]) => <Field key={k} label={l}><Textarea rows={2} value={out[k]} onChange={(e) => setOut({ ...out, [k]: e.target.value })} /></Field>)}
                </>}
                {r.output.items && <>
                  <Field label="Instructions for children"><Textarea rows={2} value={out.instructions} onChange={(e) => setOut({ ...out, instructions: e.target.value })} /></Field>
                  {out.items.map((it: any, i: number) => (
                    <div key={i}>
                      <ItemEditor item={it} index={i} count={out.items.length} onChange={(n) => setOut({ ...out, items: out.items.map((x: any, j: number) => (j === i ? { ...n, sources: x.sources } : x)) })}
                        onRemove={() => setOut({ ...out, items: out.items.filter((_: any, j: number) => j !== i) })} />
                      <div className="ml-2 mt-1"><SourceChips editionId={f.editionId!} sources={r.sources} ids={it.sources} /></div>
                    </div>))}
                </>}
                {r.output.sections && out.sections.map((sec: any, i: number) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex gap-2"><Input aria-label="Heading" value={sec.heading} onChange={(e) => setOut({ ...out, sections: out.sections.map((x: any, j: number) => (j === i ? { ...x, heading: e.target.value } : x)) })} />
                      <button aria-label="Remove" onClick={() => setOut({ ...out, sections: out.sections.filter((_: any, j: number) => j !== i) })} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" /></button></div>
                    <Textarea rows={3} className="mt-2" value={sec.body} onChange={(e) => setOut({ ...out, sections: out.sections.map((x: any, j: number) => (j === i ? { ...x, body: e.target.value } : x)) })} />
                    <div className="mt-1"><SourceChips editionId={f.editionId!} sources={r.sources} ids={sec.sources} /></div>
                  </div>))}
              </Card>
              <Card className="flex flex-wrap items-center gap-2 p-4">
                <span className="mr-auto text-sm text-slate-600">Happy with it? Nothing reaches children until you publish it.</span>
                <Button variant="secondary" loading={use.isPending} onClick={() => use.mutate({ as: 'LESSON_PLAN' })}><NotebookPen className="size-4" />Save as lesson plan</Button>
                {r.output.items && <>
                  <Button variant="secondary" loading={use.isPending} onClick={() => use.mutate({ as: 'QUESTION_BANK' })}><BookMarked className="size-4" />Add to question bank</Button>
                  <Button loading={use.isPending} onClick={() => setUseDlg('ASSESSMENT')}><ClipboardList className="size-4" />Create homework draft</Button></>}
              </Card>
              <Card className="p-4">
                <p className="mb-2 text-sm font-semibold">Book pages used ({r.sources.length})</p>
                {r.sources.length ? <ul className="space-y-2 text-sm">{r.sources.map((x: any) => (
                  <li key={x.n} className="flex gap-2"><span className="w-6 shrink-0 text-right font-mono text-xs text-slate-400">[{x.n}]</span>
                    <span className="min-w-0"><SourceChips editionId={f.editionId!} sources={[x]} /> <span className="text-xs text-slate-500">{x.component}{x.lesson ? ` · ${x.lesson}` : ''}</span>
                      <span className="block truncate text-xs text-slate-400">{x.snippet}</span></span></li>))}</ul>
                  : <p className="text-sm text-slate-500">No digitised pages were available for this lesson.</p>}
              </Card>
            </>
          )}
          {!r && !gen.isPending && (
            <Card className="p-5"><p className="mb-3 text-sm font-semibold">Recent drafts</p>
              {!history.data ? <PageLoader /> : !history.data.length ? <p className="text-sm text-slate-500">Choose a book and lesson, pick what you need, and press “Generate draft”.</p> : (
                <ul className="divide-y divide-slate-100 text-sm">{history.data.map((h: any) => (
                  <li key={h.id} className="flex items-center gap-3 py-2"><span className="flex-1"><b>{h.title ?? h.task}</b><span className="block text-xs text-slate-400">{h.lesson ?? ''} · {fmtDate(h.createdAt)}</span></span>
                    {h.usedAs ? <Badge tone="PUBLISHED">used</Badge> : <Badge tone={h.status === 'OK' ? 'neutral' : 'danger'}>{h.status === 'OK' ? 'draft' : h.status.toLowerCase()}</Badge>}</li>))}</ul>
              )}</Card>
          )}
        </div>
      </div>
      {useDlg && <ClassPicker onClose={() => setUseDlg('')} onPick={(classId) => { setUseDlg(''); use.mutate({ as: 'ASSESSMENT', classId }); }} />}
    </div>
  );
}

function ClassPicker({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const classes = useMyClasses(); const [id, setId] = useState('');
  return (
    <Dialog open onOpenChange={onClose} title="Create homework draft" description="It is saved as a draft — you can still edit it, then publish it to the class.">
      <Field label="Class"><Select value={id} onChange={(e) => setId(e.target.value)}><option value="">Select…</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></Field>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!id} onClick={() => onPick(id)}><Plus className="size-4" />Create draft</Button></div>
    </Dialog>
  );
}

export default function Page() { return <Suspense fallback={<PageLoader />}><Assistant /></Suspense>; }
