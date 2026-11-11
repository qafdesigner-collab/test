'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Volume2, XCircle } from 'lucide-react';
import { api, fmtDay } from '@/lib/api';
import { cn, ErrorBox, PageLoader } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const COLORS = ['bg-sky-400', 'bg-pink-400', 'bg-emerald-400', 'bg-amber-400', 'bg-violet-400', 'bg-orange-400'];
const say = (t: string) => { try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = 0.85; window.speechSynthesis.speak(u); } catch { /* not available */ } };

export default function Homework({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['homework', id], queryFn: () => api.get(`/student/homework/${id}`) });
  const [i, setI] = useState(0); const [answers, setAnswers] = useState<Record<string, any>>({}); const [busy, setBusy] = useState(false);
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <div className="p-6"><ErrorBox error={q.error} /></div>;
  const h = q.data; const sub = h.submission;

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-amber-50 p-4 sm:p-8"><div className="mx-auto max-w-2xl">
      <Link href="/learn" className="mb-4 inline-flex items-center gap-1 rounded-xl px-2 py-1 font-semibold text-slate-600 hover:bg-white"><ArrowLeft className="size-5" />Home</Link>
      <h1 className="text-2xl font-extrabold text-slate-800 sm:text-3xl">{h.title}</h1>{children}</div></main>);

  if (sub) {
    const shown = (it: any, r: any) => (it.type === 'MCQ' ? it.options[r] : it.type === 'TRUE_FALSE' ? (r ? 'True' : 'False') : r) ?? '—';
    return shell(<>
      <div className="my-6 rounded-3xl bg-white p-6 text-center shadow-sm">
        {sub.score !== null ? <><div className="text-6xl">{sub.score === sub.maxScore ? '🏆' : sub.score / sub.maxScore >= 0.5 ? '🌟' : '💪'}</div>
          <div className="mt-2 text-3xl font-extrabold text-amber-600">{sub.score} / {sub.maxScore}</div>
          {sub.feedback && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-lg text-slate-700">💬 {sub.feedback}</p>}</>
          : <><div className="text-6xl">⏳</div><p className="mt-2 text-xl font-bold">Handed in! Your teacher is checking it.</p></>}
      </div>
      {sub.score !== null && <div className="space-y-3">{h.items.map((it: any, n: number) => {
        const a = sub.answers.find((x: any) => x.itemId === it.id);
        return <div key={it.id} className="rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-start gap-2"><span className="font-bold">{n + 1}.</span><span className="flex-1 font-semibold">{it.prompt}</span>
          {a?.correct === true ? <CheckCircle2 className="size-6 text-emerald-500" /> : a?.correct === false ? <XCircle className="size-6 text-red-400" /> : null}</div>
          <p className="ml-6 mt-1 text-slate-600">You said: <b>{String(shown(it, a?.response))}</b>{a?.correct === false && it.answer && <> · Answer: <b className="text-emerald-700">{String(it.type === 'MCQ' ? it.options[it.answer[0]] : it.type === 'TRUE_FALSE' ? (it.answer[0] ? 'True' : 'False') : it.answer[0])}</b></>}</p></div>;
      })}</div>}
    </>);
  }
  if (h.status !== 'PUBLISHED') return shell(<p className="mt-6 rounded-3xl bg-white p-6 text-center text-lg shadow-sm">This homework is closed.</p>);

  const it = h.items[i]; const last = i === h.items.length - 1; const val = answers[it.id];
  const set = (v: any) => setAnswers({ ...answers, [it.id]: v });
  const submit = async () => {
    const missing = h.items.filter((x: any) => answers[x.id] === undefined || answers[x.id] === '').length;
    if (missing && !confirm(`You skipped ${missing} question(s). Hand in anyway?`)) return;
    setBusy(true);
    try {
      const r = await api.post(`/student/homework/${id}/submit`, { answers: Object.entries(answers).map(([itemId, response]) => ({ itemId, response })) });
      toast(r.status === 'GRADED' ? `You got ${r.score} out of ${r.maxScore}! 🎉` : 'Handed in! 🎉');
      qc.invalidateQueries({ queryKey: ['homework'] }); qc.invalidateQueries({ queryKey: ['myReport'] });
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return shell(<>
    {h.instructions && i === 0 && <p className="mt-2 text-lg text-slate-600">{h.instructions}</p>}
    {h.dueAt && <p className="mt-1 text-sm text-slate-500">Due {fmtDay(h.dueAt)}</p>}
    <div className="my-5 flex gap-1.5" aria-label={`Question ${i + 1} of ${h.items.length}`}>{h.items.map((x: any, n: number) => (
      <button key={x.id} onClick={() => setI(n)} aria-label={`Question ${n + 1}`} className={cn('h-3 flex-1 rounded-full', n === i ? 'bg-pink-500' : answers[x.id] !== undefined ? 'bg-emerald-400' : 'bg-slate-200')} />))}</div>
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3"><p className="flex-1 text-2xl font-bold text-slate-800">{it.prompt}</p>
        <button onClick={() => say(it.prompt)} aria-label="Read the question aloud" className="rounded-2xl bg-sky-100 p-3 text-sky-700 hover:bg-sky-200"><Volume2 className="size-6" /></button></div>
      <div className="mt-6">
        {it.type === 'MCQ' && <div className="grid gap-3 sm:grid-cols-2">{it.options.map((o: string, n: number) => (
          <button key={n} onClick={() => set(n)} aria-pressed={val === n} className={cn('rounded-2xl px-5 py-4 text-left text-xl font-bold text-white shadow transition', COLORS[n % COLORS.length], val === n ? 'scale-105 ring-4 ring-slate-800' : 'opacity-90 hover:opacity-100')}>{o}</button>))}</div>}
        {it.type === 'TRUE_FALSE' && <div className="grid grid-cols-2 gap-3">{[true, false].map((v) => (
          <button key={String(v)} onClick={() => set(v)} aria-pressed={val === v} className={cn('rounded-2xl py-6 text-2xl font-extrabold text-white shadow', v ? 'bg-emerald-400' : 'bg-red-400', val === v ? 'scale-105 ring-4 ring-slate-800' : 'opacity-90')}>{v ? '👍 True' : '👎 False'}</button>))}</div>}
        {(it.type === 'FILL_BLANK' || it.type === 'SHORT') && <input autoFocus aria-label="Your answer" value={val ?? ''} onChange={(e) => set(e.target.value)} placeholder="Type your answer ✏️"
          className="w-full rounded-2xl border-4 border-sky-200 px-5 py-4 text-2xl outline-none focus:border-sky-400" />}
      </div>
    </div>
    <div className="mt-6 flex justify-between">
      <button disabled={i === 0} onClick={() => setI(i - 1)} className="flex items-center gap-1 rounded-2xl bg-white px-5 py-3 text-lg font-bold text-slate-600 shadow disabled:opacity-30"><ChevronLeft className="size-6" />Back</button>
      {!last ? <button onClick={() => setI(i + 1)} className="flex items-center gap-1 rounded-2xl bg-sky-500 px-6 py-3 text-lg font-bold text-white shadow">Next<ChevronRight className="size-6" /></button>
        : <button onClick={submit} disabled={busy} className="rounded-2xl bg-emerald-500 px-6 py-3 text-lg font-bold text-white shadow disabled:opacity-50">{busy ? '…' : '🚀 Hand in'}</button>}
    </div>
  </>);
}
