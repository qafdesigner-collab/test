'use client';
import Link from 'next/link';
import { Suspense, use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookMarked, CheckCircle2, Download, KeyRound, Plus, Printer, Send, Sparkles, Trash2, XCircle } from 'lucide-react';
import { useBranding } from '@/lib/branding';
import { useMe } from '@/lib/session';
import { printExamPaper } from '@/lib/print-docs';
import { useToast } from '@/components/ui/toast';
import { VoicePlayer } from '@/components/voice';
import { api, downloadCsv, fmtDate, fmtDay } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { className, KIND_LABEL, QTYPE_LABEL, useMyClasses } from '@/lib/lms';
import { Badge, Button, Card, Confirm, Dialog, ErrorBox, Field, Input, PageLoader, Select, Tabs, Textarea } from '@/components/ui';
import { PageHeader, Status, Table, Td } from '@/components/common';
import { BookScope } from '@/components/book-scope';
import { Item, ItemEditor, newItem } from '@/components/item-editor';

function Builder({ initial, id }: { initial: any; id: string | null }) {
  const router = useRouter(); const classes = useMyClasses();
  const [f, setF] = useState<any>(initial); const [items, setItems] = useState<Item[]>(initial.items ?? [newItem()]);
  const roster = useQuery({ queryKey: ['class', f.classId], queryFn: () => api.get(`/classes/${f.classId}`), enabled: !!f.classId });
  const [bank, setBank] = useState(false); const [publishAsk, setPublishAsk] = useState(false); const [ai, setAi] = useState(false);
  const brand = useBranding(); const me = useMe().data;
  const printSheet = (key: boolean) => {
    const cls = classes.data?.find((c) => c.id === f.classId);
    const list = items.filter((i) => i.prompt.trim());
    printExamPaper({ title: f.title || 'Assessment sheet', durationMin: f.durationMin ?? 30, instructions: f.instructions ?? '', total: list.reduce((n, i) => n + (i.points || 0), 0),
      school: me?.school?.name, className: cls?.name, classSection: cls?.section, subject: f.bookTitle ?? null,
      items: list.map((i, n) => ({ id: String(n), section: 'A', type: i.type, prompt: i.prompt, options: i.options, answer: i.answer, marks: i.points || 0, lines: i.type === 'SHORT' ? 3 : 0 })) }, brand, { key });
  };
  const body = () => ({ title: f.title, instructions: f.instructions, dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null, allowLate: f.allowLate, studentIds: f.studentIds ?? [],
    // Send only question fields (server rows also carry ids/positions, which the API rightly rejects).
    items: items.map(({ type, prompt, options, answer, points }) => ({ type, prompt, options, points, answer: type === 'FILL_BLANK' ? answer.filter((x: string) => x) : answer })) });
  const save = useAction(() => (id ? api.patch(`/teacher/assessments/${id}`, body()) : api.post('/teacher/assessments', { ...body(), classId: f.classId, kind: f.kind, editionId: f.editionId || null, lessonId: f.lessonId || null })),
    { ok: 'Saved', keys: ['assessments', 'assessment'], after: (r) => !id && router.replace(`/teacher/assessments/${r.id}`) });
  const publish = useAction(async () => { await api.patch(`/teacher/assessments/${id}`, body()); return api.post(`/teacher/assessments/${id}/publish`); },
    { ok: 'Published to the class 🎉', keys: ['assessments', 'assessment'], after: () => setPublishAsk(false) });
  const move = (i: number, d: -1 | 1) => { const n = [...items]; [n[i], n[i + d]] = [n[i + d], n[i]]; setItems(n); };
  const points = items.reduce((n, i) => n + (i.points || 0), 0);
  return (
    <div className="space-y-6">
      <Link href="/teacher/assessments" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Assessments</Link>
      <PageHeader title={id ? `Edit: ${f.title}` : 'New assessment sheet'} sub={`${items.length} questions · ${points} points`}>
        <Button variant="secondary" onClick={() => save.mutate()} loading={save.isPending} disabled={!f.title || !f.classId}>Save draft</Button>
        {id && <Button variant="success" onClick={() => setPublishAsk(true)}><Send className="size-4" />Publish</Button>}
      </PageHeader>
      <Card className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Letter B homework" /></Field>
          <Field label="Type"><Select disabled={!!id} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="HOMEWORK">Homework</option><option value="QUIZ">Quiz</option><option value="TEST">Test</option></Select></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Class"><Select disabled={!!id} value={f.classId ?? ''} onChange={(e) => setF({ ...f, classId: e.target.value, studentIds: [] })}><option value="">Select…</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></Field>
          <Field label="Due"><Input type="datetime-local" value={f.dueAt ?? ''} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.allowLate} onChange={(e) => setF({ ...f, allowLate: e.target.checked })} />Accept late work</label>
        </div>
        {!id ? <BookScope editionId={f.editionId} lessonId={f.lessonId} onChange={(v) => setF({ ...f, ...v })} /> : f.bookTitle && <p className="text-sm text-slate-500">Book: {f.bookTitle}</p>}
        <Field label="Instructions for children"><Textarea rows={2} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
        {roster.data && (
          <details className="rounded-lg border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-medium">Assign to {f.studentIds?.length ? `${f.studentIds.length} selected student(s)` : 'the whole class'}</summary>
            <div className="mt-2 grid gap-1 sm:grid-cols-3">{roster.data.roster.map((s: any) => (
              <label key={s.id} className="flex items-center gap-2"><input type="checkbox" checked={f.studentIds?.includes(s.id) ?? false}
                onChange={(e) => setF({ ...f, studentIds: e.target.checked ? [...(f.studentIds ?? []), s.id] : f.studentIds.filter((x: string) => x !== s.id) })} />{s.displayName}</label>))}</div>
            <p className="mt-2 text-xs text-slate-500">Leave everyone unticked to assign the whole class (useful for differentiated work).</p></details>
        )}
      </Card>
      <div className="space-y-3">{items.map((it, i) => <ItemEditor key={i} item={it} index={i} count={items.length} onChange={(n) => setItems(items.map((x, j) => (j === i ? n : x)))} onRemove={() => setItems(items.filter((_, j) => j !== i))} onMove={(d) => move(i, d)} />)}</div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setItems([...items, newItem()])}><Plus className="size-4" />Add question</Button>
        <Button variant="secondary" onClick={() => setAi(true)} className="border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"><Sparkles className="size-4" />Ask AI for questions</Button>
        {id && <Button variant="ghost" onClick={() => setBank(true)}><BookMarked className="size-4" />From question bank</Button>}
        <span className="flex-1" />
        <Button variant="ghost" onClick={() => printSheet(false)} disabled={!items.some((i) => i.prompt.trim())}><Printer className="size-4" />Print sheet</Button>
        <Button variant="ghost" onClick={() => printSheet(true)} disabled={!items.some((i) => i.prompt.trim())}><KeyRound className="size-4" />Answer key</Button></div>
      {ai && <AiQuestions editionId={f.editionId} lessonId={f.lessonId} onClose={() => setAi(false)}
        onAdd={(add) => { setItems([...items.filter((i) => i.prompt.trim()), ...add]); setAi(false); }} />}
      {bank && id && <BankPicker assessmentId={id} editionId={f.editionId} onClose={() => setBank(false)} beforeAdd={() => api.patch(`/teacher/assessments/${id}`, body())} />}
      <Confirm open={publishAsk} onOpenChange={setPublishAsk} title="Publish to the class?" confirmLabel="Publish" loading={publish.isPending} onConfirm={() => publish.mutate()}
        body={<p>Students can see and answer it straight away. Once someone has answered, the questions can no longer be changed.</p>} />
    </div>
  );
}

/** Ask the AI for questions on the chosen book lesson, review them, then add the ones you want to the sheet. */
function AiQuestions({ editionId, lessonId, onClose, onAdd }: { editionId?: string | null; lessonId?: string | null; onClose: () => void; onAdd: (items: Item[]) => void }) {
  const toast = useToast();
  const [o, setO] = useState({ task: 'ASSESSMENT', count: 5, difficulty: 'EASY', notes: '' });
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<any>(null); const [pick, setPick] = useState<number[]>([]);
  const ask = async () => {
    setBusy(true); setRes(null);
    try { const r = await api.post<any>('/ai/generate', { task: o.task, editionId, lessonId: lessonId || undefined, count: o.count, difficulty: o.difficulty, notes: o.notes || undefined });
      setRes(r); setPick((r.output?.items ?? []).map((_: any, i: number) => i)); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const items: any[] = res?.output?.items ?? [];
  const toItem = (it: any): Item => ({ type: it.type, prompt: it.prompt ?? '', options: it.type === 'MCQ' ? (it.options ?? []) : [], answer: it.answer ?? (it.type === 'TRUE_FALSE' ? [true] : it.type === 'MCQ' ? [0] : []), points: 1 });
  return (
    <Dialog open onOpenChange={onClose} wide title="✨ Ask AI for questions" description="The AI reads the chosen lesson of your book and suggests questions. Check each one before you use it.">
      {!editionId ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Choose the book and lesson (the topic) above first, so the questions match what your pupils have read.</p> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Kind"><Select value={o.task} onChange={(e) => setO({ ...o, task: e.target.value })}><option value="ASSESSMENT">Assessment (mixed)</option><option value="WORKSHEET">Worksheet (write-in)</option><option value="HOMEWORK">Homework</option></Select></Field>
            <Field label="How many"><Input type="number" min={1} max={20} value={o.count} onChange={(e) => setO({ ...o, count: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
            <Field label="Level"><Select value={o.difficulty} onChange={(e) => setO({ ...o, difficulty: e.target.value })}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></Select></Field>
            <div className="flex items-end"><Button className="w-full" onClick={ask} loading={busy}><Sparkles className="size-4" />{res ? 'Ask again' : 'Suggest'}</Button></div>
          </div>
          <Field label="Anything special?" hint="Optional, e.g. “focus on words that start with B”"><Input value={o.notes} maxLength={500} onChange={(e) => setO({ ...o, notes: e.target.value })} /></Field>
          {!lessonId && <p className="text-xs text-slate-500">Tip: choose a lesson above for questions on that exact topic; otherwise the AI uses the whole book.</p>}
          {res && (
            <div className="space-y-2">
              {(res.warnings ?? []).map((w: string) => <p key={w} className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{w}</p>)}
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {items.map((it, i) => (
                  <li key={i}><label className="flex items-start gap-3 p-3 text-sm"><input type="checkbox" className="mt-1" checked={pick.includes(i)} onChange={(e) => setPick(e.target.checked ? [...pick, i] : pick.filter((x) => x !== i))} />
                    <span className="min-w-0"><span className="font-medium text-slate-900">{i + 1}. {it.prompt}</span>
                      <span className="block text-xs text-slate-500">{QTYPE_LABEL[it.type] ?? it.type}{it.type === 'MCQ' && it.options ? ` · ${it.options.map((x: string, k: number) => (it.answer?.[0] === k ? `✔ ${x}` : x)).join(' · ')}` : it.type === 'TRUE_FALSE' ? ` · answer: ${it.answer?.[0] ? 'True' : 'False'}` : it.answer?.length ? ` · answer: ${it.answer.join(' / ')}` : ''}</span></span></label></li>))}
                {!items.length && <li className="p-4 text-center text-sm text-slate-500">No questions came back. Try again or change the notes.</li>}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!pick.length} onClick={() => onAdd(pick.sort((a, b) => a - b).map((i) => toItem(items[i])))}><Plus className="size-4" />Add {pick.length || ''} to the sheet</Button></div>
    </Dialog>
  );
}

function BankPicker({ assessmentId, editionId, onClose, beforeAdd }: { assessmentId: string; editionId?: string; onClose: () => void; beforeAdd: () => Promise<unknown> }) {
  const q = useQuery({ queryKey: ['bank', editionId], queryFn: () => api.get(`/teacher/question-bank${editionId ? `?editionId=${editionId}` : ''}`) });
  const [ids, setIds] = useState<string[]>([]);
  // Save the teacher's unsaved edits first, then append the bank questions; the builder remounts with fresh data.
  const add = useAction(async () => { await beforeAdd(); return api.post(`/teacher/assessments/${assessmentId}/from-bank`, { questionIds: ids }); },
    { ok: (r) => `${r.added} question(s) added`, keys: ['assessment'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} wide title="Add from question bank" description="Shared questions from teachers at your school.">
      {!q.data ? <PageLoader /> : !q.data.length ? <p className="text-sm text-slate-500">No questions in the bank yet.</p> : (
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{q.data.map((x: any) => (
          <li key={x.id}><label className="flex items-start gap-3 p-3 text-sm"><input type="checkbox" className="mt-1" checked={ids.includes(x.id)} onChange={(e) => setIds(e.target.checked ? [...ids, x.id] : ids.filter((y) => y !== x.id))} />
            <span><span className="font-medium">{x.prompt}</span><span className="block text-xs text-slate-500">{QTYPE_LABEL[x.type]} · by {x.owner}</span></span></label></li>))}</ul>
      )}
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!ids.length} loading={add.isPending} onClick={() => add.mutate()}>Add {ids.length || ''}</Button></div>
    </Dialog>
  );
}

function MarkDialog({ a, student, onClose }: { a: any; student: any; onClose: () => void }) {
  const s = student.submission;
  const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries((s.answers as any[]).filter((x) => x.awarded !== null).map((x) => [x.itemId, x.awarded])));
  const [feedback, setFeedback] = useState(s.feedback ?? '');
  const save = useAction((ret: boolean) => api.patch(`/teacher/submissions/${s.id}`, { itemScores: Object.entries(scores).map(([itemId, awarded]) => ({ itemId, awarded })), feedback, returnToStudent: ret }),
    { ok: (r) => (r.status === 'RETURNED' ? 'Returned to the student' : 'Marks saved'), keys: ['assessment', 'assessments'], after: onClose });
  const shown = (it: any, resp: any) => it.type === 'MCQ' ? it.options[resp] ?? '—' : it.type === 'TRUE_FALSE' ? (resp === true ? 'True' : resp === false ? 'False' : '—') : resp || '—';
  const total = a.items.reduce((n: number, it: any) => n + (scores[it.id] ?? 0), 0);
  return (
    <Dialog open onOpenChange={onClose} wide title={`Mark: ${student.displayName}`} description={`Handed in ${fmtDate(s.submittedAt)}${s.late ? ' (late)' : ''}`}>
      <div className="space-y-3">
        {a.items.map((it: any, i: number) => {
          const ans = (s.answers as any[]).find((x) => x.itemId === it.id) ?? {};
          return (
            <div key={it.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex justify-between gap-2"><span className="font-medium">{i + 1}. {it.prompt}</span><span className="text-xs text-slate-500">{QTYPE_LABEL[it.type]}</span></div>
              <div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-slate-500">Answer:</span>{it.type === 'READING' ? (ans.response ? <VoicePlayer id={ans.response} big /> : <b>— no recording</b>) : <b>{String(shown(it, ans.response))}</b>}
                {ans.correct === true && <CheckCircle2 className="size-4 text-emerald-600" />}{ans.correct === false && <XCircle className="size-4 text-red-500" />}
                {it.type === 'SHORT' && it.answer[0] && <span className="text-xs text-slate-500">Model: {it.answer[0]}</span>}
                <span className="flex-1" /><label className="flex items-center gap-1">Points<Input type="number" min={0} max={it.points} className="h-8 w-16" value={scores[it.id] ?? ''}
                  onChange={(e) => setScores({ ...scores, [it.id]: Math.min(it.points, Math.max(0, Number(e.target.value))) })} />/ {it.points}</label></div>
            </div>);
        })}
        <Field label="Feedback for the student"><Textarea rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Well done! …" /></Field>
        <div className="flex items-center justify-between"><span className="text-sm">Total: <b>{total} / {s.maxScore}</b></span>
          <div className="flex gap-2"><Button variant="secondary" loading={save.isPending} onClick={() => save.mutate(false)}>Save marks</Button><Button loading={save.isPending} onClick={() => save.mutate(true)}>Return to student</Button></div></div>
      </div>
    </Dialog>
  );
}

function Results({ a }: { a: any }) {
  const [tab, setTab] = useState<'students' | 'questions'>('students'); const [mark, setMark] = useState<any>(null); const [closeAsk, setCloseAsk] = useState(false);
  const close = useAction(() => api.post(`/teacher/assessments/${a.id}/close`), { ok: 'Closed', keys: ['assessment', 'assessments'], after: () => setCloseAsk(false) });
  const exportCsv = () => downloadCsv(`${a.title}.csv`, a.students.map((s: any) => ({ student: s.displayName, username: s.username, status: s.submission?.status ?? 'NOT SUBMITTED', score: s.submission?.score ?? '', max: a.maxScore, late: s.submission?.late ? 'yes' : '' })));
  return (
    <div className="space-y-6">
      <Link href="/teacher/assessments" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Assessments</Link>
      <PageHeader title={a.title} sub={`${KIND_LABEL[a.kind]} · ${a.items.length} questions · ${a.maxScore} points${a.dueAt ? ` · due ${fmtDate(a.dueAt)}` : ''}`}>
        <Status s={a.status} /><Button variant="secondary" onClick={exportCsv}><Download className="size-4" />CSV</Button>
        {a.status === 'PUBLISHED' && <Button variant="ghost" onClick={() => setCloseAsk(true)}>Close</Button>}
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs uppercase text-slate-500">Handed in</div><div className="text-2xl font-semibold">{a.stats.submitted} / {a.stats.assigned}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-slate-500">Average</div><div className="text-2xl font-semibold">{a.stats.average === null ? '—' : `${Math.round((a.stats.average / a.maxScore) * 100)}%`}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-slate-500">To mark</div><div className="text-2xl font-semibold text-amber-600">{a.students.filter((s: any) => s.submission?.status === 'SUBMITTED').length}</div></Card>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'students', label: 'Students', count: a.students.length }, { id: 'questions', label: 'Questions', count: a.items.length }]} />
      {tab === 'students' ? (
        <Table head={['Student', 'Status', 'Score', 'Handed in', '']}>
          {a.students.map((s: any) => (
            <tr key={s.id}><Td className="font-medium">{s.displayName}</Td>
              <Td>{s.submission ? <><Status s={s.submission.status} />{s.submission.late && <Badge tone="danger" className="ml-1">late</Badge>}</> : <span className="text-xs text-slate-500">not handed in</span>}</Td>
              <Td className="tabular-nums">{s.submission?.score ?? (s.submission ? '…' : '')}{s.submission && ` / ${a.maxScore}`}</Td>
              <Td className="text-slate-500">{s.submission ? fmtDate(s.submission.submittedAt) : ''}</Td>
              <Td className="text-right">{s.submission && <Button size="sm" variant={s.submission.status === 'SUBMITTED' ? 'primary' : 'ghost'} onClick={() => setMark(s)}>{s.submission.status === 'SUBMITTED' ? 'Mark' : 'View'}</Button>}</Td></tr>))}
        </Table>
      ) : (
        <div className="space-y-2">{a.items.map((it: any, i: number) => {
          const st = a.itemStats.find((x: any) => x.itemId === it.id);
          return <Card key={it.id} className="flex items-center gap-3 p-4 text-sm"><span className="font-semibold text-slate-500">{i + 1}</span><span className="flex-1">{it.prompt}<span className="block text-xs text-slate-500">{QTYPE_LABEL[it.type]} · {it.points} pt</span></span>
            {st?.correctRate !== null && st?.correctRate !== undefined && <span className={`font-semibold ${st.correctRate < 0.5 ? 'text-red-600' : 'text-emerald-600'}`}>{Math.round(st.correctRate * 100)}% correct</span>}</Card>;
        })}</div>
      )}
      {mark && <MarkDialog a={a} student={mark} onClose={() => setMark(null)} />}
      <Confirm open={closeAsk} onOpenChange={setCloseAsk} title="Close this work?" confirmLabel="Close" loading={close.isPending} onConfirm={() => close.mutate()} body="Students can no longer hand it in. Marks stay visible." />
    </div>
  );
}

function Page({ id }: { id: string }) {
  const params = useSearchParams();
  const q = useQuery({ queryKey: ['assessment', id], queryFn: () => api.get(`/teacher/assessments/${id}`), enabled: id !== 'new' });
  if (id === 'new') return <Builder id={null} initial={{ title: '', kind: 'HOMEWORK', classId: params.get('classId') ?? '', editionId: params.get('editionId'), lessonId: params.get('lessonId'), instructions: '', dueAt: '', allowLate: true, studentIds: [] }} />;
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const a = q.data;
  if (a.status === 'DRAFT') return <Builder key={`${a.updatedAt}-${a.items.length}`} id={id} initial={{ ...a, dueAt: a.dueAt ? new Date(a.dueAt).toISOString().slice(0, 16) : '', studentIds: a.targeted, items: a.items }} />;
  return <Results a={a} />;
}
export default function AssessmentPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <Suspense><Page id={id} /></Suspense>; }
