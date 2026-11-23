'use client';
import Link from 'next/link';
import { GroupPicker } from '@/components/groups';
import { Suspense, use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookMarked, CheckCircle2, Download, KeyRound, PenLine, Plus, Printer, Send, Sparkles, Trash2, XCircle } from 'lucide-react';
import { usePrintBrand } from '@/lib/branding';
import { useMe } from '@/lib/session';
import { gradeFor, printExamPaper, printResultSheet } from '@/lib/print-docs';
import { useToast } from '@/components/ui/toast';
import { VoicePlayer } from '@/components/voice';
import { api, downloadCsv, fmtDate, fmtDay } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { className, KIND_LABEL, QTYPE_LABEL, useMyClasses } from '@/lib/lms';
import { Badge, Button, Card, Confirm, Dialog, ErrorBox, Field, Input, PageLoader, Select, Tabs, Textarea } from '@/components/ui';
import { PageHeader, Status, Table, Td } from '@/components/common';
import { BookScope } from '@/components/book-scope';
import { Item, ItemEditor, newItem } from '@/components/item-editor';
import { PageQuestionsPanel } from '@/components/page-questions';
import { LiveView } from '@/components/live-view';

function Builder({ initial, id }: { initial: any; id: string | null }) {
  const router = useRouter(); const classes = useMyClasses();
  const [f, setF] = useState<any>(initial); const [items, setItems] = useState<Item[]>(initial.items ?? [newItem()]);
  const roster = useQuery({ queryKey: ['class', f.classId], queryFn: () => api.get(`/classes/${f.classId}`), enabled: !!f.classId });
  const [bank, setBank] = useState(false); const [publishAsk, setPublishAsk] = useState(false); const [ai, setAi] = useState(false);
  const brand = usePrintBrand(); const me = useMe().data;
  const printSheet = (key: boolean) => {
    const cls = classes.data?.find((c) => c.id === f.classId);
    const list = items.filter((i) => i.prompt.trim());
    printExamPaper({ title: f.title || 'Assessment sheet', durationMin: f.durationMin ?? 30, instructions: f.instructions ?? '', total: list.reduce((n, i) => n + (i.points || 0), 0),
      school: me?.school?.name, className: cls?.name, classSection: cls?.section, subject: f.bookTitle ?? null,
      items: list.map((i, n) => ({ id: String(n), section: 'A', type: i.type, prompt: i.prompt, options: i.options, answer: i.answer, marks: i.points || 0, lines: i.type === 'SHORT' ? 3 : 0 })) }, brand, { key });
  };
  const body = () => ({ title: f.title, instructions: f.instructions, bookComponentId: f.bookComponentId || null, bookPage: f.bookComponentId ? f.bookPage || null : null, dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null, allowLate: f.allowLate, studentIds: f.studentIds ?? [],
    proctor: { camera: !!f.proctor?.camera, roomScan: !!f.proctor?.roomScan, screen: !!f.proctor?.screen },
    maxAttempts: Number(f.maxAttempts) || 1, timeLimitMin: Number(f.timeLimitMin) > 0 ? Math.min(600, Math.round(Number(f.timeLimitMin))) : null,
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
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Time limit (minutes)" hint="Empty: no limit. The clock starts when the student presses Start; answers are handed in when the time is up.">
            <Input type="number" min={1} max={600} placeholder="No limit" value={f.timeLimitMin ?? ''} onChange={(e) => setF({ ...f, timeLimitMin: e.target.value })} /></Field>
          <Field label="Tries allowed" hint="With 2 or 3 tries, students see only their score until the last try; you see every try and its time.">
            <Select value={String(f.maxAttempts ?? 1)} onChange={(e) => setF({ ...f, maxAttempts: Number(e.target.value) })}><option value="1">1 — hand in once</option><option value="2">2 tries</option><option value="3">3 tries</option></Select></Field>
        </div>
        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-800">🛡️ Online exam safety (optional)</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {([['roomScan', '🔄 Room scan before starting'], ['camera', '📷 Camera photos at random times'], ['screen', '🖥️ Whole-screen pictures at random times']] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!f.proctor?.[k]} onChange={(e) => setF({ ...f, proctor: { ...f.proctor, [k]: e.target.checked } })} />{l}</label>))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Students are told exactly what is recorded before they start. Leaving the page or switching apps is always logged for watched work. Screen sharing works on computers (Chrome, Edge, Firefox), not on phones or iPads — you will see “no screen” for those. Photos are deleted automatically after 90 days, or when you delete them.</p>
        </fieldset>
        {!id ? <BookScope editionId={f.editionId} lessonId={f.lessonId} onChange={(v) => setF({ ...f, ...v })} /> : f.bookTitle && <p className="text-sm text-slate-500">Book: {f.bookTitle}</p>}
        <Field label="Instructions for children"><Textarea rows={2} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
        {roster.data && (
          <details className="rounded-lg border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-medium">Assign to {f.studentIds?.length ? `${f.studentIds.length} selected student(s)` : 'the whole class'}</summary>
            {f.classId && <div className="mt-2"><GroupPicker classId={f.classId} onPick={(ids) => setF({ ...f, studentIds: ids })} /></div>}
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
      {f.bookComponentId && f.bookPage && <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600"><span className="rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-800">📖 Linked to book page {f.bookPage}</span> Students can open this page next to the questions.
        <button className="text-xs text-slate-500 underline" onClick={() => setF({ ...f, bookComponentId: null, bookPage: null })}>Remove link</button></p>}
      {ai && <AiQuestions editionId={f.editionId} lessonId={f.lessonId} pageRef={{ componentId: f.bookComponentId, page: f.bookPage }} onClose={() => setAi(false)}
        onAdd={(add, ref) => { setItems([...items.filter((i) => i.prompt.trim()), ...add]); if (ref) setF({ ...f, bookComponentId: ref.componentId, bookPage: ref.page }); setAi(false); }} />}
      {bank && id && <BankPicker assessmentId={id} editionId={f.editionId} onClose={() => setBank(false)} beforeAdd={() => api.patch(`/teacher/assessments/${id}`, body())} />}
      <Confirm open={publishAsk} onOpenChange={setPublishAsk} title="Publish to the class?" confirmLabel="Publish" loading={publish.isPending} onConfirm={() => publish.mutate()}
        body={<p>Students can see and answer it straight away. Once someone has answered, the questions can no longer be changed.</p>} />
    </div>
  );
}

/** Ask the AI for questions on the chosen book lesson, review them, then add the ones you want to the sheet. */
function AiQuestions({ editionId, lessonId, pageRef, onClose, onAdd }: { editionId?: string | null; lessonId?: string | null; pageRef?: { componentId?: string | null; page?: number | null }; onClose: () => void; onAdd: (items: Item[], ref?: { componentId: string; page: number } | null) => void }) {
  const toast = useToast(); const [mode, setMode] = useState<'page' | 'lesson'>('page');
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
    <Dialog open onOpenChange={onClose} wide title="✨ Questions from your book" description="Pick a page of the book (free and unlimited) or a lesson, and get questions to check and use.">
      {editionId && <div role="tablist" className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
        <button role="tab" aria-selected={mode === 'page'} onClick={() => setMode('page')} className={`flex-1 rounded-lg px-3 py-1.5 ${mode === 'page' ? 'bg-white shadow-sm' : 'text-slate-600'}`}>📖 From a book page — free</button>
        <button role="tab" aria-selected={mode === 'lesson'} onClick={() => setMode('lesson')} className={`flex-1 rounded-lg px-3 py-1.5 ${mode === 'lesson' ? 'bg-white shadow-sm' : 'text-slate-600'}`}>✨ From a lesson (AI)</button>
      </div>}
      {editionId && mode === 'page' ? <PageQuestionsPanel editionId={editionId} initial={{ componentId: pageRef?.componentId, page: pageRef?.page }} onAdd={(add, ref) => onAdd(add, ref)} />
      : !editionId ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Choose the book and lesson (the topic) above first, so the questions match what your students have read.</p> : (
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
      {mode === 'lesson' || !editionId ? <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!pick.length} onClick={() => onAdd(pick.sort((a, b) => a - b).map((i) => toItem(items[i])))}><Plus className="size-4" />Add {pick.length || ''} to the sheet</Button></div>
        : <div className="mt-3 flex justify-start"><Button variant="ghost" onClick={onClose}>Close</Button></div>}
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

function MarkDialog({ a, student, onClose, onNext, left }: { a: any; student: any; onClose: () => void; onNext?: () => void; left?: number }) {
  const s = student.submission;
  const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries((s.answers as any[]).filter((x) => x.awarded !== null).map((x) => [x.itemId, x.awarded])));
  const [feedback, setFeedback] = useState(s.feedback ?? '');
  const save = useAction((ret: boolean) => api.patch(`/teacher/submissions/${s.id}`, { itemScores: Object.entries(scores).map(([itemId, awarded]) => ({ itemId, awarded })), feedback, returnToStudent: ret }),
    { ok: (r) => (r.status === 'RETURNED' ? 'Returned to the student' : 'Marks saved'), keys: ['assessment', 'assessments'], after: () => (onNext ? onNext() : onClose()) });
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
              <AnswerCheck c={s.integrity?.items?.[it.id]} />
            </div>);
        })}
        <Field label="Feedback for the student"><Textarea rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Well done! …" /></Field>
        <div className="flex items-center justify-between"><span className="text-sm">Total: <b>{total} / {s.maxScore}</b></span>
          <div className="flex gap-2"><Button variant="secondary" loading={save.isPending} onClick={() => save.mutate(false)}>Save marks</Button><Button loading={save.isPending} onClick={() => save.mutate(true)}>{onNext && left ? `Return & mark next (${left})` : 'Return to student'}</Button></div></div>
      </div>
    </Dialog>
  );
}

function Results({ a }: { a: any }) {
  const [tab, setTab] = useState<'students' | 'questions'>('students'); const [mark, setMark] = useState<any>(null); const [closeAsk, setCloseAsk] = useState(false);
  const close = useAction(() => api.post(`/teacher/assessments/${a.id}/close`), { ok: 'Closed', keys: ['assessment', 'assessments'], after: () => setCloseAsk(false) });
  const brand = usePrintBrand(); const me = useMe().data; const classes = useMyClasses();
  const [pass, setPass] = useState(40);
  const watchedOn = !!(a.proctor?.camera || a.proctor?.screen || a.proctor?.roomScan) || a.students.some((s: any) => s.watch);
  const [watchOf, setWatchOf] = useState<any>(null); const [live, setLive] = useState(false);
  const checkOn = a.students.some((s: any) => Object.keys(s.submission?.integrity?.items ?? {}).length);
  const res = (s: any) => {
    const sc = s.submission?.score; const pct = sc === null || sc === undefined || !a.maxScore ? null : Math.round((sc / a.maxScore) * 1000) / 10;
    const g = pct === null ? null : gradeFor(pct)?.[1] ?? null;
    return { pct, grade: g, result: !s.submission ? 'ABSENT' : pct === null ? 'PENDING' : pct >= pass ? 'PASS' : 'FAIL' };
  };
  const scored = a.students.filter((s: any) => res(s).pct !== null).sort((x: any, y: any) => (y.submission.score ?? 0) - (x.submission.score ?? 0));
  const rankOf = (s: any) => { const i = scored.findIndex((x: any) => x.submission.score === s.submission?.score); return i < 0 ? null : i + 1; };
  const waiting = a.students.filter((s: any) => s.submission?.status === 'SUBMITTED');
  const nextAfter = (cur: any) => { const rest = waiting.filter((s: any) => s.id !== cur?.id); setMark(rest[0] ?? null); };
  const exportCsv = () => downloadCsv(`${a.title}.csv`, a.students.map((s: any, i: number) => { const r = res(s); return { no: i + 1, student: s.displayName, username: s.username, status: s.submission?.status ?? 'NOT HANDED IN', score: s.submission?.score ?? '', outOf: a.maxScore, percent: r.pct ?? '', grade: r.grade ?? '', result: r.result === 'ABSENT' ? 'not handed in' : r.result.toLowerCase(), position: rankOf(s) ?? '', late: s.submission?.late ? 'yes' : '' }; }));
  const printResults = () => {
    const cls = classes.data?.find((c) => c.id === a.classId);
    const rows = a.students.map((s: any) => { const r = res(s); return { name: s.displayName, username: s.username, marks: s.submission?.score ?? null, percent: r.pct, grade: r.grade, result: r.result, rank: rankOf(s), remarks: s.submission?.feedback ?? '' }; });
    const got = scored.map((s: any) => s.submission.score as number);
    printResultSheet({ title: a.title, kind: KIND_LABEL[a.kind] ?? 'Assessment', school: me?.school?.name, className: cls ? `${cls.name}${cls.section ? ` ${cls.section}` : ''}` : a.className, subject: a.bookTitle ?? null, date: a.dueAt ?? a.publishedAt ?? null, total: a.maxScore, passPercent: pass, rows,
      stats: { passed: rows.filter((r: any) => r.result === 'PASS').length, failed: rows.filter((r: any) => r.result === 'FAIL').length, absent: rows.filter((r: any) => r.result === 'ABSENT').length,
        average: got.length ? Math.round((got.reduce((x: number, y: number) => x + y, 0) / got.length) * 10) / 10 : null, highest: got.length ? Math.max(...got) : null, lowest: got.length ? Math.min(...got) : null } }, brand);
  };
  return (
    <div className="space-y-6">
      <Link href="/teacher/assessments" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Assessments</Link>
      <PageHeader title={a.title} sub={`${KIND_LABEL[a.kind]} · ${a.items.length} questions · ${a.maxScore} points${a.dueAt ? ` · due ${fmtDate(a.dueAt)}` : ''}${a.timeLimitMin ? ` · ⏱ ${a.timeLimitMin} min` : ''}${a.maxAttempts > 1 ? ` · ${a.maxAttempts} tries` : ''}`}>
        <Status s={a.status} />
        {watchedOn && a.status === 'PUBLISHED' && <Button variant="danger" onClick={() => setLive(true)}>🔴 Live view</Button>}
        {waiting.length > 0 && <Button onClick={() => setMark(waiting[0])}><PenLine className="size-4" />Mark next ({waiting.length})</Button>}
        <Button variant="secondary" onClick={printResults}><Printer className="size-4" />Print results</Button>
        <Button variant="secondary" onClick={exportCsv}><Download className="size-4" />Save (Excel / CSV)</Button>
        {a.status === 'PUBLISHED' && <Button variant="ghost" onClick={() => setCloseAsk(true)}>Close</Button>}
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs uppercase text-slate-500">Handed in</div><div className="text-2xl font-semibold">{a.stats.submitted} / {a.stats.assigned}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-slate-500">Average</div><div className="text-2xl font-semibold">{a.stats.average === null ? '—' : `${Math.round((a.stats.average / a.maxScore) * 100)}%`}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-slate-500">To mark</div><div className="text-2xl font-semibold text-amber-600">{a.students.filter((s: any) => s.submission?.status === 'SUBMITTED').length}</div></Card>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'students', label: 'Students', count: a.students.length }, { id: 'questions', label: 'Questions', count: a.items.length }]} />
      {tab === 'students' ? (
        <>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">Pass mark <Input type="number" min={0} max={100} className="h-8 w-20" value={pass} onChange={(e) => setPass(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} aria-label="Pass mark (%)" />%
          <span className="text-xs text-slate-500">— used for Pass / Fail on this page and on the printed sheet.</span></div>
        <Table head={['Student', 'Status', 'Score', '%', 'Grade', 'Result', 'Time taken', ...(checkOn ? ['Check'] : []), ...(watchedOn ? ['Watch'] : []), '']}>
          {a.students.map((s: any) => (
            <tr key={s.id}><Td className="font-medium">{s.displayName}</Td>
              <Td>{s.submission ? <><Status s={s.submission.status} />{s.submission.late && <Badge tone="danger" className="ml-1">late</Badge>}</> : <span className="text-xs text-slate-500">not handed in</span>}</Td>
              <Td className="tabular-nums">{s.submission?.score ?? (s.submission ? '…' : '')}{s.submission && ` / ${a.maxScore}`}</Td>
              {(() => { const r = res(s); return <><Td className="tabular-nums">{r.pct === null ? '' : `${r.pct}%`}</Td><Td className="font-semibold">{r.grade ?? ''}</Td>
                <Td>{r.result === 'PASS' ? <Badge tone="PUBLISHED">Pass</Badge> : r.result === 'FAIL' ? <Badge tone="danger">Fail</Badge> : r.result === 'PENDING' ? <span className="text-xs text-amber-700">to mark</span> : ''}</Td></>; })()}
              <Td className="text-slate-500"><Timings s={s} timeLimit={a.timeLimitMin} /></Td>
              {checkOn && <Td><CheckCell s={s} /></Td>}
              {watchedOn && <Td>{s.watch ? <button onClick={() => setWatchOf(s)} className="flex flex-wrap items-center gap-1 rounded-lg px-1 py-0.5 text-left text-xs hover:bg-slate-100">
                {s.watch.photos > 0 && <Badge>📷 {s.watch.photos}</Badge>}{s.watch.screens > 0 && <Badge>🖥️ {s.watch.screens}</Badge>}
                {s.watch.away > 0 && <Badge tone={s.watch.awaySeconds >= 30 ? 'danger' : 'DRAFT'}>↗ left {s.watch.away}× ({mins(s.watch.awaySeconds)})</Badge>}
                {s.watch.warnings > 0 && <Badge tone="danger">⚠ {s.watch.warnings}</Badge>}</button> : s.attempts?.length ? <span className="text-xs text-slate-400">nothing</span> : null}</Td>}
              <Td className="text-right">{s.submission && <Button size="sm" variant={s.submission.status === 'SUBMITTED' ? 'primary' : 'ghost'} onClick={() => setMark(s)}>{s.submission.status === 'SUBMITTED' ? 'Mark' : 'View'}</Button>}</Td></tr>))}
        </Table>
        </>
      ) : (
        <div className="space-y-2">{a.items.map((it: any, i: number) => {
          const st = a.itemStats.find((x: any) => x.itemId === it.id);
          return <Card key={it.id} className="flex items-center gap-3 p-4 text-sm"><span className="font-semibold text-slate-500">{i + 1}</span><span className="flex-1">{it.prompt}<span className="block text-xs text-slate-500">{QTYPE_LABEL[it.type]} · {it.points} pt</span></span>
            {st?.correctRate !== null && st?.correctRate !== undefined && <span className={`font-semibold ${st.correctRate < 0.5 ? 'text-red-600' : 'text-emerald-600'}`}>{Math.round(st.correctRate * 100)}% correct</span>}</Card>;
        })}</div>
      )}
      {live && <LiveView a={a} onClose={() => setLive(false)} onOpenRecord={(st) => { setLive(false); setWatchOf(st); }} />}
      {watchOf && <WatchDialog a={a} student={watchOf} onClose={() => setWatchOf(null)} />}
      {mark && <MarkDialog key={mark.id} a={a} student={mark} onClose={() => setMark(null)} onNext={mark.submission?.status === 'SUBMITTED' ? () => nextAfter(mark) : undefined} left={waiting.filter((s: any) => s.id !== mark.id).length} />}
      <Confirm open={closeAsk} onOpenChange={setCloseAsk} title="Close this work?" confirmLabel="Close" loading={close.isPending} onConfirm={() => close.mutate()} body="Students can no longer hand it in. Marks stay visible." />
    </div>
  );
}

const mins = (sec: number) => (sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`);
const hhmm = (d: string) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** When each try was started and handed in, how long it took, and its score — very quick tries or long gaps can show a student had help. */
function Timings({ s }: { s: any; timeLimit?: number | null }) {
  const tries: any[] = s.attempts ?? []; const sub = s.submission; const hist: any[] = sub?.history ?? [];
  if (!tries.length) return sub ? <span>{fmtDate(sub.submittedAt)}</span> : null;
  const scoreOf = (n: number) => (sub && n === sub.attempt ? sub.score : hist.find((x) => x.attempt === n)?.score);
  return <ul className="space-y-0.5 text-xs">{tries.map((t) => (
    <li key={t.attempt} className="whitespace-nowrap">
      {tries.length > 1 || (sub?.attempt ?? 1) > 1 ? <b className="text-slate-700">Try {t.attempt}: </b> : null}
      {hhmm(t.startedAt)} → {t.submittedAt ? <>{new Date(t.submittedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} <b className="text-slate-800">({mins(t.seconds)})</b></> : <span className="text-amber-700">not handed in</span>}
      {t.submittedAt && scoreOf(t.attempt) != null && tries.length > 1 && <span> · score {scoreOf(t.attempt)}/{sub.maxScore}</span>}
      {t.overTime && <Badge tone="danger" className="ml-1">over time</Badge>}
    </li>))}</ul>;
}

const aiTone = (n: number) => (n >= 70 ? 'danger' : n >= 40 ? 'DRAFT' : 'neutral');
/** How a written answer was made and the AI-writing estimate — for teachers only (students never see this). */
function AnswerCheck({ c }: { c?: any }) {
  if (!c) return null;
  const secs = Math.round((c.ms ?? 0) / 1000);
  return <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600" title="Only teachers see this">
    <span className="font-medium text-slate-500">🔎 Check:</span>
    {c.copied ? <Badge tone="danger">📋 copied in{c.pasted ? ` (${c.pasted} of ${c.length} letters pasted)` : ' (appeared without typing)'}</Badge> : <span>⌨️ typed</span>}
    {secs > 0 && <span>· {mins(secs)} on this answer</span>}
    {c.ai && c.length >= 60 && <Badge tone={aiTone(c.ai.score)}>🤖 AI-written: {c.ai.score}%{c.ai.by === 'ai' ? '' : ' (rules)'}</Badge>}
    {c.ai?.reasons?.length > 0 && c.length >= 60 && <span className="text-slate-500">— {c.ai.reasons.join('; ')}</span>}
  </div>;
}
/** The strongest signs in a submission, for the results table. */
function CheckCell({ s }: { s: any }) {
  const items: any[] = Object.values(s.submission?.integrity?.items ?? {});
  if (!items.length) return null;
  const copied = items.filter((x) => x.copied).length; const ai = Math.max(0, ...items.filter((x) => x.length >= 60).map((x) => x.ai?.score ?? 0));
  if (!copied && ai < 40) return <span className="text-xs text-emerald-700">✓ looks own work</span>;
  return <span className="flex flex-wrap gap-1">{copied > 0 && <Badge tone="danger">📋 copied {copied}</Badge>}{ai >= 40 && <Badge tone={aiTone(ai)}>🤖 AI {ai}%</Badge>}</span>;
}
const WATCH: Record<string, string> = { ROOM: '🔄 Room scan', PANORAMA: '🌄 Room panorama', ROOM_VIDEO: '🎥 Room scan video', CAMERA: '📷 Camera photo', SCREEN: '🖥️ Screen picture', AWAY: '↗ Left the page', SCREEN_OFF: '⚠ Stopped sharing the screen',
  CAMERA_OFF: '⚠ Camera turned off', SCREEN_PART: '⚠ Shared only a window, not the whole screen', NO_SCREEN: '⚠ Device cannot share its screen', NO_CAMERA: '⚠ No camera', FULLSCREEN_OFF: '⚠ Left full screen' };
/** Everything recorded while a student did watched work: a timeline, and the photos and screen pictures. */
function WatchDialog({ a, student, onClose }: { a: any; student: any; onClose: () => void }) {
  const q = useQuery({ queryKey: ['watch', a.id, student.id], queryFn: () => api.get<any[]>(`/teacher/assessments/${a.id}/watch/${student.id}`) });
  const [big, setBig] = useState<string | null>(null); const [ask, setAsk] = useState(false);
  const clear = useAction(() => api.del(`/teacher/assessments/${a.id}/watch`), { ok: 'Exam photos deleted', keys: ['assessment', 'watch'], after: () => { setAsk(false); onClose(); } });
  const ev = q.data ?? []; const pics = ev.filter((e) => e.hasImage && e.kind !== 'PANORAMA' && e.kind !== 'ROOM_VIDEO');
  const panos = ev.filter((e) => e.kind === 'PANORAMA'); const vids = ev.filter((e) => e.kind === 'ROOM_VIDEO');
  const time = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <Dialog open onOpenChange={onClose} wide title={`🛡️ ${student.displayName} — what was recorded`} description="Look at the pictures and the timeline together: leaving the page for a long time, other apps on the screen or another person in the photos can show the student had help.">
      {(panos.length > 0 || vids.length > 0) && <div className="mb-4 space-y-2">
        {panos.map((e) => <figure key={e.id}><figcaption className="mb-1 text-xs font-medium text-slate-600">🌄 Room panorama · {new Date(e.createdAt).toLocaleTimeString()}{e.attempt > 1 ? ` · try ${e.attempt}` : ''} — scroll sideways, click to enlarge</figcaption>
          <div className="overflow-x-auto rounded-lg bg-slate-900"><button type="button" onClick={() => setBig(e.id)}><img src={`/api/teacher/watch/${e.id}/image`} alt="Room panorama" className="h-40 max-w-none" /></button></div></figure>)}
        {vids.map((e) => <figure key={e.id}><figcaption className="mb-1 text-xs font-medium text-slate-600">🎥 Room scan video · {new Date(e.createdAt).toLocaleTimeString()}</figcaption>
          <video src={`/api/teacher/watch/${e.id}/image`} controls playsInline className="max-h-56 rounded-lg bg-black" /></figure>)}
      </div>}
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : !ev.length ? <p className="text-slate-500">Nothing was recorded.</p> : (
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto md:grid-cols-[1fr_16rem]">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] content-start gap-2">{pics.map((e) => (
            <button key={e.id} onClick={() => setBig(e.id)} className="overflow-hidden rounded-lg bg-slate-100 text-left ring-1 ring-slate-200 hover:ring-brand-400">
              <img src={`/api/teacher/watch/${e.id}/image`} alt={WATCH[e.kind]} loading="lazy" className="h-24 w-full object-cover" />
              <span className="block px-1.5 py-1 text-[11px] text-slate-600">{WATCH[e.kind]} · {time(e.createdAt)}{e.attempt > 1 ? ` · try ${e.attempt}` : ''}</span></button>))}
            {!pics.length && <p className="text-sm text-slate-500">No pictures.</p>}</div>
          <ol className="space-y-1 text-xs">{ev.filter((e) => !e.hasImage || e.kind === 'ROOM').filter((e, i, all) => e.kind !== 'ROOM' || all.findIndex((x) => x.kind === 'ROOM') === i).map((e) => (
            <li key={e.id} className={`rounded px-2 py-1 ${e.kind.includes('_') || (e.kind === 'AWAY' && e.detail?.seconds >= 30) ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700'}`}>
              <b>{time(e.createdAt)}</b> {WATCH[e.kind] ?? e.kind}{e.kind === 'AWAY' ? ` for ${mins(e.detail?.seconds ?? 0)}` : ''}{e.attempt > 1 ? ` (try ${e.attempt})` : ''}</li>))}</ol>
        </div>)}
      {big && <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setBig(null)}><img src={`/api/teacher/watch/${big}/image`} alt="Recorded picture" className="max-h-full max-w-full rounded-lg" /></div>}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <Button variant="ghost" onClick={() => setAsk(true)}><Trash2 className="size-4" />Delete all photos of this assessment</Button>
        <Button variant="secondary" onClick={onClose}>Close</Button></div>
      <Confirm open={ask} onOpenChange={setAsk} danger title="Delete all exam photos?" body="All camera photos, screen pictures and the timeline of every student for this assessment are deleted. Scores stay." confirmLabel="Delete" loading={clear.isPending} onConfirm={() => clear.mutate()} />
    </Dialog>
  );
}

function Page({ id }: { id: string }) {
  const params = useSearchParams();
  const q = useQuery({ queryKey: ['assessment', id], queryFn: () => api.get(`/teacher/assessments/${id}`), enabled: id !== 'new' });
  if (id === 'new') return <Builder id={null} initial={{ title: '', kind: 'HOMEWORK', classId: params.get('classId') ?? '', editionId: params.get('editionId'), lessonId: params.get('lessonId'), instructions: '', dueAt: '', allowLate: true, studentIds: [], maxAttempts: 1, timeLimitMin: '', proctor: {} }} />;
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const a = q.data;
  if (a.status === 'DRAFT') return <Builder key={`${a.updatedAt}-${a.items.length}`} id={id} initial={{ ...a, dueAt: a.dueAt ? new Date(a.dueAt).toISOString().slice(0, 16) : '', studentIds: a.targeted, items: a.items }} />;
  return <Results a={a} />;
}
export default function AssessmentPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <Suspense><Page id={id} /></Suspense>; }
