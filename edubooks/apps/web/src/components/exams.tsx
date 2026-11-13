'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Download, FileKey, Plus, Printer, Shuffle, Sparkles, Trash2 } from 'lucide-react';
import { api, downloadCsv, fmtDay } from '@/lib/api';
import { className as clsName } from '@/lib/lms';
import { usePrintBrand } from '@/lib/branding';
import { printExamPaper, printResultSheet } from '@/lib/print-docs';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Select, Textarea, cn } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { useToast } from '@/components/ui/toast';

const TYPE_LABEL: Record<string, string> = { MCQ: 'Multiple choice', TRUE_FALSE: 'True / false', FILL_BLANK: 'Fill the gap', SHORT: 'Short answer', LONG: 'Long answer' };
const STATUS: Record<string, [string, string]> = { DRAFT: ['DRAFT', 'Draft'], READY: ['info', 'Paper ready'], PUBLISHED: ['PUBLISHED', 'Results published'] };

/** List of exams for the teacher's classes (or the whole school for admins). */
export function ExamsList({ base, classes }: { base: string; classes: { id: string; label: string }[] }) {
  const q = useQuery({ queryKey: ['exams'], queryFn: () => api.get<any[]>('/exams') });
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader title="Exams" sub="Make term exam papers, print them with an answer key, then type in the marks. Published results go on report cards and to parents.">
        <Button onClick={() => setAdding(true)} disabled={!classes.length}><Plus className="size-4" />New exam</Button>
      </PageHeader>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <Card className="overflow-hidden">{!q.data.length ? <p className="p-8 text-center text-sm text-slate-600">No exams yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr>
            <th className="px-4 py-2">Exam</th><th className="px-4 py-2">Class</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Paper</th><th className="px-4 py-2">Marks entered</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{q.data.map((e) => (
              <tr key={e.id}><td className="px-4 py-2"><Link href={`${base}/${e.id}`} className="font-medium text-brand-700 hover:underline">{e.title}</Link><span className="block text-xs text-slate-600">{[e.term, e.subject].filter(Boolean).join(' · ')}</span></td>
                <td className="px-4 py-2">{clsName({ name: e.className, section: e.section })}</td><td className="px-4 py-2">{e.examDate ? fmtDay(e.examDate) : '—'}</td>
                <td className="px-4 py-2">{e.questions} questions · {e.total} marks</td><td className="px-4 py-2">{e.marked} / {e.students}</td>
                <td className="px-4 py-2"><Badge tone={STATUS[e.status][0]}>{STATUS[e.status][1]}</Badge></td></tr>))}</tbody></table></div>)}</Card>)}
      {adding && <NewExam base={base} classes={classes} onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewExam({ base, classes, onClose }: { base: string; classes: { id: string; label: string }[]; onClose: () => void }) {
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api.get<any[]>('/catalog/subjects') });
  const [f, setF] = useState({ classId: classes[0]?.id ?? '', title: '', term: 'Term 1', subjectId: '', examDate: '', durationMin: 60 });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const router = useRouter();
  const save = async () => { setBusy(true); setErr(null); try { const e = await api.post<any>('/exams', { ...f, subjectId: f.subjectId || null, examDate: f.examDate || null, durationMin: Number(f.durationMin) }); router.push(`${base}/${e.id}`); } catch (e) { setErr(e); setBusy(false); } };
  return (
    <Dialog open onOpenChange={onClose} title="New exam">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Title"><Input required minLength={2} maxLength={160} placeholder="Mid-term English" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Class"><Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>{classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
          <Field label="Subject"><Select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}><option value="">—</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Term"><Input maxLength={60} value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={f.examDate} onChange={(e) => setF({ ...f, examDate: e.target.value })} /></Field>
          <Field label="Time (minutes)"><Input type="number" min={5} max={600} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></Field>
        </div>
        {err ? <ErrorBox error={err} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>Create and add questions</Button></div>
      </form>
    </Dialog>
  );
}

type Item = { section: string; type: string; prompt: string; options: string[]; answer: any[]; marks: number; lines?: number };

/** One exam: paper editor, printing, and marks. */
export function ExamWorkspace({ id, back }: { id: string; back: string }) {
  const q = useQuery({ queryKey: ['exam', id], queryFn: () => api.get<any>(`/exams/${id}`) });
  const [tab, setTab] = useState<'paper' | 'marks' | 'results'>('paper');
  const brand = usePrintBrand(); const qc = useQueryClient(); const toast = useToast(); const router = useRouter();
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const e = q.data; const locked = e.status === 'PUBLISHED';
  const print = (o: { key?: boolean; version?: 'A' | 'B' }) => { if (!e.items.length) return toast('Add questions first', 'err'); if (!printExamPaper(e, brand, o)) toast('Allow pop-ups for this site to print', 'err'); };
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); qc.invalidateQueries({ queryKey: ['exam', id] }); qc.invalidateQueries({ queryKey: ['exams'] }); toast(ok); } catch (x: any) { toast(x.message, 'err'); } };
  return (
    <div className="space-y-5">
      <Link href={back} className="text-sm text-slate-600 hover:text-slate-900">← Exams</Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-semibold text-slate-900">{e.title}</h1>
          <p className="text-sm text-slate-600">{[clsName({ name: e.className, section: e.classSection }), e.subject, e.term, e.examDate && fmtDay(e.examDate), `${e.durationMin} min`, `${e.total} marks`].filter(Boolean).join(' · ')}</p></div>
        <Badge tone={STATUS[e.status][0]}>{STATUS[e.status][1]}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => print({})}><Printer className="size-4" />Print paper</Button>
        <Button variant="secondary" onClick={() => print({ version: 'B' })} title="Same questions in a different order, so neighbours cannot copy"><Shuffle className="size-4" />Version B</Button>
        <Button variant="secondary" onClick={() => print({ key: true })}><FileKey className="size-4" />Answer key</Button>
        <span className="flex-1" />
        {!locked && e.marked === undefined && null}
        {!locked && <Button variant="ghost" onClick={() => confirm('Delete this exam?') && act(async () => { await api.del(`/exams/${id}`); router.push(back); }, 'Exam deleted')}><Trash2 className="size-4" />Delete</Button>}
      </div>
      <div role="tablist" className="flex w-fit rounded-lg bg-slate-100 p-1 text-sm">{([['paper', 'Question paper'], ['marks', 'Enter marks'], ['results', 'Results']] as const).map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('rounded-md px-3 py-1.5 font-medium', tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>{l}</button>))}</div>
      {tab === 'paper' ? <PaperEditor exam={e} locked={locked} /> : tab === 'marks' ? <MarksEntry examId={id} /> : <ExamResults examId={id} />}
    </div>
  );
}

function PaperEditor({ exam, locked }: { exam: any; locked: boolean }) {
  const [items, setItems] = useState<Item[]>(exam.items);
  const [details, setDetails] = useState({ title: exam.title, term: exam.term, examDate: exam.examDate ?? '', durationMin: exam.durationMin, instructions: exam.instructions });
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const [dlg, setDlg] = useState<'' | 'bank' | 'gen'>('');
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { setItems(exam.items); setDirty(false); }, [exam.items]);
  const upd = (i: number, p: Partial<Item>) => { setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x))); setDirty(true); };
  const move = (i: number, d: number) => { const b = [...items]; [b[i], b[i + d]] = [b[i + d], b[i]]; setItems(b); setDirty(true); };
  const total = items.reduce((s, i) => s + (Number(i.marks) || 0), 0);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.patch(`/exams/${exam.id}`, { ...details, examDate: details.examDate || null, durationMin: Number(details.durationMin) });
      const r = await api.put(`/exams/${exam.id}/items`, { items: items.map((i) => ({ ...i, marks: Number(i.marks), options: i.type === 'MCQ' ? i.options : [] })) });
      qc.setQueryData(['exam', exam.id], r); qc.invalidateQueries({ queryKey: ['exams'] }); setDirty(false); toast('Paper saved');
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const sections = [...new Set(items.map((i) => i.section))];
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {!locked && <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { setItems([...items, { section: sections.at(-1) ?? 'A', type: 'SHORT', prompt: '', options: [], answer: [], marks: 2 }]); setDirty(true); }}><Plus className="size-4" />Add question</Button>
          <Button size="sm" variant="secondary" onClick={() => dirty ? toast('Save the paper first', 'err') : setDlg('bank')}>From question bank</Button>
          <Button size="sm" variant="secondary" onClick={() => dirty ? toast('Save the paper first', 'err') : setDlg('gen')}><Sparkles className="size-4" />Make a paper for me</Button>
        </div>}
        {!items.length && <Card className="p-8 text-center text-sm text-slate-600">No questions yet. Add your own, pick from the question bank, or let the app pick a balanced set for you.</Card>}
        {items.map((it, i) => (
          <Card key={i} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b className="w-7">{i + 1}.</b>
              <Input aria-label={`Section of question ${i + 1}`} disabled={locked} className="h-8 w-16" value={it.section} maxLength={60} onChange={(e) => upd(i, { section: e.target.value })} title="Section" />
              <Select aria-label={`Type of question ${i + 1}`} disabled={locked} className="h-8 w-40" value={it.type} onChange={(e) => upd(i, { type: e.target.value, answer: e.target.value === 'TRUE_FALSE' ? [true] : e.target.value === 'MCQ' ? [0] : [], options: e.target.value === 'MCQ' && it.options.length < 2 ? ['', ''] : it.options })}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              <label className="flex items-center gap-1">Marks <Input aria-label={`Marks for question ${i + 1}`} disabled={locked} type="number" min={0.5} max={100} step={0.5} className="h-8 w-20" value={it.marks} onChange={(e) => upd(i, { marks: Number(e.target.value) })} /></label>
              {!locked && <span className="ms-auto flex gap-1">
                <button aria-label="Move up" disabled={!i} onClick={() => move(i, -1)} className="p-1 text-slate-500 disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="p-1 text-slate-500 disabled:opacity-30"><ArrowDown className="size-4" /></button>
                <button aria-label={`Delete question ${i + 1}`} onClick={() => { setItems(items.filter((_, j) => j !== i)); setDirty(true); }} className="p-1 text-slate-500 hover:text-red-600"><Trash2 className="size-4" /></button></span>}
            </div>
            <Textarea aria-label={`Question ${i + 1}`} disabled={locked} rows={2} maxLength={2000} placeholder={it.type === 'FILL_BLANK' ? 'Use ___ for the gap' : 'Question'} value={it.prompt} onChange={(e) => upd(i, { prompt: e.target.value })} />
            {it.type === 'MCQ' && <div className="space-y-1.5 ps-7">{it.options.map((o, k) => (
              <div key={k} className="flex items-center gap-2"><input type="radio" disabled={locked} name={`ans-${i}`} aria-label={`Choice ${k + 1} is right`} checked={it.answer[0] === k} onChange={() => upd(i, { answer: [k] })} />
                <Input disabled={locked} aria-label={`Question ${i + 1}, choice ${k + 1}`} className="h-8" value={o} onChange={(e) => upd(i, { options: it.options.map((x, j) => (j === k ? e.target.value : x)) })} />
                {!locked && it.options.length > 2 && <button aria-label="Remove choice" onClick={() => upd(i, { options: it.options.filter((_, j) => j !== k), answer: [Math.max(0, it.answer[0] >= k ? it.answer[0] - 1 : it.answer[0])] })} className="text-slate-400 hover:text-red-600"><Trash2 className="size-3.5" /></button>}</div>))}
              {!locked && it.options.length < 6 && <button className="text-xs text-brand-700 hover:underline" onClick={() => upd(i, { options: [...it.options, ''] })}>+ Add choice</button>}</div>}
            {it.type === 'TRUE_FALSE' && <div className="flex gap-4 ps-7 text-sm">{[true, false].map((v) => <label key={String(v)} className="flex items-center gap-1.5"><input type="radio" disabled={locked} name={`tf-${i}`} checked={it.answer[0] === v} onChange={() => upd(i, { answer: [v] })} />{v ? 'True' : 'False'} is right</label>)}</div>}
            {(it.type === 'FILL_BLANK' || it.type === 'SHORT') && <Input aria-label={`Model answer for question ${i + 1}`} disabled={locked} className="h-8" placeholder="Model answer (for the answer key)" value={(it.answer ?? []).join(', ')} onChange={(e) => upd(i, { answer: e.target.value ? e.target.value.split(',').map((x) => x.trim()) : [] })} />}
            {it.type === 'LONG' && <Input aria-label={`Marking notes for question ${i + 1}`} disabled={locked} className="h-8" placeholder="Marking notes (for the answer key)" value={(it.answer ?? []).join(' ')} onChange={(e) => upd(i, { answer: e.target.value ? [e.target.value] : [] })} />}
          </Card>))}
      </div>
      <Card className="h-fit space-y-3 p-4 xl:sticky xl:top-20">
        <div className="text-sm text-slate-600"><b className="text-2xl text-slate-900">{total}</b> marks · {items.length} questions</div>
        <Field label="Title"><Input disabled={locked} value={details.title} onChange={(e) => { setDetails({ ...details, title: e.target.value }); setDirty(true); }} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Term"><Input disabled={locked} value={details.term} onChange={(e) => { setDetails({ ...details, term: e.target.value }); setDirty(true); }} /></Field>
          <Field label="Minutes"><Input disabled={locked} type="number" min={5} max={600} value={details.durationMin} onChange={(e) => { setDetails({ ...details, durationMin: e.target.value }); setDirty(true); }} /></Field></div>
        <Field label="Date"><Input disabled={locked} type="date" value={details.examDate} onChange={(e) => { setDetails({ ...details, examDate: e.target.value }); setDirty(true); }} /></Field>
        <Field label="Instructions on the paper"><Textarea disabled={locked} rows={3} value={details.instructions} onChange={(e) => { setDetails({ ...details, instructions: e.target.value }); setDirty(true); }} /></Field>
        {err ? <ErrorBox error={err} /> : null}
        {locked ? <p className="text-xs text-slate-600">Results are published, so the paper is locked. Withdraw the results (Marks tab) to change it.</p>
          : <Button className="w-full" loading={busy} disabled={!dirty} onClick={save}>{dirty ? 'Save paper' : 'Saved'}</Button>}
      </Card>
      {dlg === 'bank' && <BankPicker examId={exam.id} editionId={exam.editionId} onClose={() => setDlg('')} />}
      {dlg === 'gen' && <Generate examId={exam.id} onClose={() => setDlg('')} />}
    </div>
  );
}

function BankPicker({ examId, editionId, onClose }: { examId: string; editionId?: string | null; onClose: () => void }) {
  const [type, setType] = useState(''); const [ids, setIds] = useState<string[]>([]); const [marks, setMarks] = useState(1); const [section, setSection] = useState('');
  const q = useQuery({ queryKey: ['bank', { type, editionId }], queryFn: () => api.get<any[]>(`/teacher/question-bank?${new URLSearchParams(Object.entries({ type, editionId: editionId ?? '' }).filter(([, v]) => v))}`) });
  const qc = useQueryClient(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const add = async () => { setBusy(true); try { const r = await api.post(`/exams/${examId}/from-bank`, { questionIds: ids, marks, section: section || undefined }); qc.setQueryData(['exam', examId], r); toast(`${ids.length} question(s) added`); onClose(); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const list = (q.data as any)?.items ?? q.data ?? [];
  return (
    <Dialog open onOpenChange={onClose} wide title="Add from the question bank">
      <div className="mb-3 flex flex-wrap items-end gap-3 text-sm">
        <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value)}><option value="">All</option>{['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT'].map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select></Field>
        <Field label="Marks each"><Input type="number" min={0.5} max={100} step={0.5} className="w-24" value={marks} onChange={(e) => setMarks(Number(e.target.value))} /></Field>
        <Field label="Section (empty = by type)"><Input className="w-28" value={section} onChange={(e) => setSection(e.target.value)} /></Field>
      </div>
      {!q.data ? <PageLoader /> : !list.length ? <p className="text-sm text-slate-600">No questions found. Add some under Question bank.</p> : (
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{list.map((x: any) => (
          <li key={x.id}><label className="flex items-start gap-3 px-3 py-2 text-sm"><input type="checkbox" className="mt-1" checked={ids.includes(x.id)} onChange={(e) => setIds(e.target.checked ? [...ids, x.id] : ids.filter((y) => y !== x.id))} />
            <span className="flex-1">{x.prompt}<span className="block text-xs text-slate-600">{TYPE_LABEL[x.type]}{x.lesson ? ` · ${x.lesson}` : ''}</span></span></label></li>))}</ul>)}
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!ids.length} loading={busy} onClick={add}>Add {ids.length || ''}</Button></div>
    </Dialog>
  );
}

function Generate({ examId, onClose }: { examId: string; onClose: () => void }) {
  const books = useQuery({ queryKey: ['teacherBooks'], queryFn: () => api.get<any[]>('/teacher/books') });
  const [editionId, setEditionId] = useState('');
  const [parts, setParts] = useState([{ type: 'MCQ', count: 10, marks: 1, section: 'A' }, { type: 'FILL_BLANK', count: 5, marks: 1, section: 'B' }, { type: 'SHORT', count: 5, marks: 2, section: 'C' }]);
  const qc = useQueryClient(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.post<any>(`/exams/${examId}/generate`, { editionId: editionId || undefined, parts: parts.filter((p) => p.count > 0) });
      qc.setQueryData(['exam', examId], r);
      toast(r.notEnough?.length ? `Added what the bank has. Not enough questions — ${r.notEnough.join('; ')}` : 'Questions added', r.notEnough?.length ? 'err' : undefined); onClose();
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose} title="Make a paper for me" description="Picks questions at random from the question bank. You can change any of them afterwards.">
      <Field label="Book"><Select value={editionId} onChange={(e) => setEditionId(e.target.value)}><option value="">The exam's book / any</option>{books.data?.map((b) => <option key={b.editionId} value={b.editionId}>{b.title}</option>)}</Select></Field>
      <table className="mt-3 w-full text-sm"><thead className="text-left text-xs text-slate-600"><tr><th>Type</th><th>How many</th><th>Marks each</th><th>Section</th></tr></thead>
        <tbody>{parts.map((p, i) => <tr key={p.type}><td className="py-1">{TYPE_LABEL[p.type]}</td>
          {(['count', 'marks'] as const).map((k) => <td key={k}><Input aria-label={`${TYPE_LABEL[p.type]} ${k}`} type="number" min={0} max={k === 'count' ? 50 : 100} className="h-8 w-20" value={p[k]} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)))} /></td>)}
          <td><Input aria-label={`${TYPE_LABEL[p.type]} section`} className="h-8 w-16" value={p.section} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, section: e.target.value } : x)))} /></td></tr>)}</tbody></table>
      <p className="mt-2 text-sm text-slate-600">Total: <b>{parts.reduce((s, p) => s + p.count * p.marks, 0)}</b> marks. Add long-answer questions yourself.</p>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={go}><Sparkles className="size-4" />Pick questions</Button></div>
    </Dialog>
  );
}

/** Type marks fast: Enter moves to the next pupil. */
function MarksEntry({ examId }: { examId: string }) {
  const q = useQuery({ queryKey: ['examMarks', examId], queryFn: () => api.get<any>(`/exams/${examId}/marks`) });
  const [rows, setRows] = useState<Record<string, { marks: string; absent: boolean; remarks: string }>>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const refs = useRef<(HTMLInputElement | null)[]>([]);
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (q.data) setRows(Object.fromEntries(q.data.roster.map((r: any) => [r.id, { marks: r.marks === null ? '' : String(r.marks), absent: r.absent, remarks: r.remarks }]))); }, [q.data]);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const d = q.data; const pub = d.status === 'PUBLISHED';
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const marks = d.roster.filter((r: any) => rows[r.id] && (rows[r.id].marks !== '' || rows[r.id].absent || r.marks !== null || r.absent))
        .map((r: any) => ({ studentId: r.id, marks: rows[r.id].marks === '' ? null : Number(rows[r.id].marks), absent: rows[r.id].absent, remarks: rows[r.id].remarks }));
      qc.setQueryData(['examMarks', examId], await api.put(`/exams/${examId}/marks`, { marks })); qc.invalidateQueries({ queryKey: ['exams'] }); toast('Marks saved');
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const publish = async (on: boolean) => { try { await save(); await api.post(`/exams/${examId}/${on ? 'publish' : 'unpublish'}`, {}); ['exam', 'examMarks', 'exams'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast(on ? 'Results published — students and parents have been told' : 'Results withdrawn'); } catch (e: any) { toast(e.message, 'err'); } };
  const entered = d.roster.filter((r: any) => rows[r.id]?.marks !== '' || rows[r.id]?.absent).length;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 px-5 py-3 text-sm">
        <span>Out of <b>{d.total}</b></span><span>Entered <b>{entered} / {d.roster.length}</b></span>
        {d.stats && <span className="text-slate-600">Average <b>{d.stats.average}</b> · highest {d.stats.highest} · lowest {d.stats.lowest}</span>}
      </div>
      <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">Student</th><th className="px-4 py-2">Marks</th><th className="px-4 py-2">%</th><th className="px-4 py-2">Absent</th><th className="px-4 py-2">Remark</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{d.roster.map((r: any, i: number) => { const v = rows[r.id] ?? { marks: '', absent: false, remarks: '' }; const pc = v.marks !== '' && d.total ? Math.round((Number(v.marks) / d.total) * 100) : null;
          return (<tr key={r.id}><td className="px-4 py-1.5 font-medium">{r.displayName}</td>
            <td className="px-4 py-1.5"><Input ref={(el) => { refs.current[i] = el; }} aria-label={`Marks for ${r.displayName}`} type="number" min={0} max={d.total} step={0.5} disabled={v.absent} className={cn('h-8 w-24', v.marks !== '' && Number(v.marks) > d.total && 'border-red-500')}
              value={v.marks} onChange={(e) => setRows({ ...rows, [r.id]: { ...v, marks: e.target.value } })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); refs.current[i + 1]?.focus(); } }} /></td>
            <td className="px-4 py-1.5 tabular-nums">{pc === null ? '' : `${pc}%`}</td>
            <td className="px-4 py-1.5"><input type="checkbox" aria-label={`${r.displayName} was absent`} checked={v.absent} onChange={(e) => setRows({ ...rows, [r.id]: { ...v, absent: e.target.checked, marks: e.target.checked ? '' : v.marks } })} /></td>
            <td className="px-4 py-1.5"><Input aria-label={`Remark for ${r.displayName}`} maxLength={300} className="h-8" value={v.remarks} onChange={(e) => setRows({ ...rows, [r.id]: { ...v, remarks: e.target.value } })} /></td></tr>); })}</tbody></table>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
        {err ? <div className="w-full"><ErrorBox error={err} /></div> : null}
        <span className="text-xs text-slate-600">{pub ? 'Results are visible on report cards and to students and parents.' : 'Students and parents see results only after you publish them.'}</span>
        <span className="flex-1" />
        <Button variant="secondary" loading={busy} onClick={save}>Save marks</Button>
        {pub ? <Button variant="secondary" onClick={() => publish(false)}>Withdraw results</Button> : <Button onClick={() => publish(true)} disabled={!entered}>Publish results</Button>}
      </div>
    </Card>
  );
}

const RES_CLS: Record<string, string> = { PASS: 'bg-emerald-100 text-emerald-800', FAIL: 'bg-red-100 text-red-700', ABSENT: 'bg-slate-100 text-slate-600', PENDING: 'bg-amber-50 text-amber-700' };
const RES_LABEL: Record<string, string> = { PASS: 'Pass', FAIL: 'Fail', ABSENT: 'Absent', PENDING: 'No marks yet' };

/** Class result sheet: pass/fail against the pass mark, grade and position; print it or save it. */
function ExamResults({ examId }: { examId: string }) {
  const q = useQuery({ queryKey: ['examMarks', examId], queryFn: () => api.get<any>(`/exams/${examId}/marks`) });
  const qc = useQueryClient(); const toast = useToast(); const brand = usePrintBrand();
  const [pass, setPass] = useState<string>(''); const [filter, setFilter] = useState<'ALL' | 'PASS' | 'FAIL' | 'ABSENT'>('ALL');
  useEffect(() => { if (q.data) setPass(String(q.data.passPercent)); }, [q.data?.passPercent]); // eslint-disable-line
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const d = q.data; const st = d.stats;
  const savePass = async () => { const n = Math.min(100, Math.max(0, Number(pass) || 0)); try { await api.patch(`/exams/${examId}`, { passPercent: n }); qc.invalidateQueries({ queryKey: ['examMarks', examId] }); toast(`Pass mark set to ${n}%`); } catch (e: any) { toast(e.message, 'err'); } };
  const cls = [d.className, d.classSection].filter(Boolean).join(' ');
  const rows = d.roster.filter((r: any) => filter === 'ALL' || r.result === filter);
  const print = () => printResultSheet({ title: d.title, kind: 'Exam', school: d.school, className: cls, subject: d.subject, term: d.term, date: d.examDate, total: d.total, passPercent: d.passPercent,
    rows: d.roster.map((r: any) => ({ name: r.displayName, username: r.username, marks: r.absent ? null : r.marks, percent: r.percent, grade: r.grade, result: r.result, rank: r.rank, remarks: r.remarks })), stats: st }, brand);
  const save = () => downloadCsv(`${d.title.replace(/[^\w -]+/g, '')} - results.csv`, d.roster.map((r: any, i: number) => ({ no: i + 1, student: r.displayName, login: r.username, marks: r.absent ? 'absent' : r.marks ?? '', outOf: d.total, percent: r.percent ?? '', grade: r.grade ?? '', result: RES_LABEL[r.result], position: r.rank ?? '', remark: r.remarks ?? '' })));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[['Students', d.roster.length, 'text-slate-900'], ['Passed', st?.passed ?? 0, 'text-emerald-700'], ['Failed', st?.failed ?? 0, 'text-red-600'], ['Absent', st?.absent ?? 0, 'text-slate-600'], ['Average', st ? `${st.average} / ${d.total}` : '—', 'text-violet-700']].map(([l, v, c]) => (
          <Card key={l as string} className="p-4"><div className="text-xs font-medium text-slate-500">{l}</div><div className={cn('mt-1 text-2xl font-bold', c as string)}>{v}</div></Card>))}
      </div>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm text-slate-700">Pass mark (%)<div className="mt-1 flex gap-2"><Input type="number" min={0} max={100} className="h-9 w-24" value={pass} onChange={(e) => setPass(e.target.value)} /><Button size="sm" variant="secondary" onClick={savePass}>Apply</Button></div></label>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm" role="tablist">{(['ALL', 'PASS', 'FAIL', 'ABSENT'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cn('rounded-md px-3 py-1 font-medium', filter === k ? 'bg-white shadow-sm' : 'text-slate-600')}>{k === 'ALL' ? 'Everyone' : RES_LABEL[k]}</button>))}</div>
        <span className="flex-1" />
        <Button variant="secondary" onClick={save}><Download className="size-4" />Save (Excel / CSV)</Button>
        <Button onClick={print}><Printer className="size-4" />Print result sheet</Button>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Student</th><th className="px-4 py-2">Marks</th><th className="px-4 py-2">%</th><th className="px-4 py-2">Grade</th><th className="px-4 py-2">Result</th><th className="px-4 py-2">Position</th><th className="px-4 py-2">Remark</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r: any, i: number) => (
            <tr key={r.id}><td className="px-4 py-2 text-slate-500">{i + 1}</td><td className="px-4 py-2 font-medium">{r.displayName}</td>
              <td className="px-4 py-2 tabular-nums">{r.absent ? '—' : r.marks ?? '—'}<span className="text-slate-400"> / {d.total}</span></td>
              <td className="px-4 py-2 tabular-nums">{r.percent === null ? '—' : `${r.percent}%`}</td><td className="px-4 py-2 font-semibold">{r.grade ?? '—'}</td>
              <td className="px-4 py-2"><span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', RES_CLS[r.result])}>{RES_LABEL[r.result]}</span></td>
              <td className="px-4 py-2 tabular-nums">{r.rank ?? '—'}</td><td className="px-4 py-2 text-slate-600">{r.remarks}</td></tr>))}
            {!rows.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Nobody here.</td></tr>}</tbody></table>
      </Card>
      <p className="text-xs text-slate-500">Results stay here in your account. Print the sheet (or choose “Save as PDF” in the print window), or save it for Excel. {d.status !== 'PUBLISHED' && 'Students and parents see their results after you publish them on the Enter marks tab.'}</p>
    </div>
  );
}
