'use client';
import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Volume2, XCircle } from 'lucide-react';
import { LangScope, useT } from '@/lib/i18n';
import { Clip, ReadAloud } from '@/components/voice';
import { api, fmtDay } from '@/lib/api';
import { cn, ErrorBox, PageLoader } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { CamBadge, ProctorGate, Streams, useProctor, watched } from '@/components/proctor';

const COLORS = ['bg-sky-700', 'bg-pink-600', 'bg-emerald-700', 'bg-amber-700', 'bg-violet-600', 'bg-orange-700'];
const say = (t: string) => { try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = 0.85; window.speechSynthesis.speak(u); } catch { /* not available */ } };

export default function Homework(props: { params: Promise<{ id: string }> }) { return <LangScope><HomeworkPage {...props} /></LangScope>; }

function HomeworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const qc = useQueryClient(); const toast = useToast(); const { t } = useT();
  const q = useQuery({ queryKey: ['homework', id], queryFn: () => api.get(`/student/homework/${id}`) });
  const [retry, setRetry] = useState(false);
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <div className="p-6"><ErrorBox error={q.error} /></div>;
  const h = q.data; const sub = h.submission;

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-amber-50 p-4 sm:p-8"><div className="mx-auto max-w-2xl">
      <Link href="/learn" className="mb-4 inline-flex items-center gap-1 rounded-xl px-2 py-1 font-semibold text-slate-600 hover:bg-white"><ArrowLeft className="size-5 rtl:rotate-180" />{t('Home')}</Link>
      <h1 className="text-2xl font-extrabold text-slate-800 sm:text-3xl">{h.title}</h1>
      {h.editionId && h.bookComponentId && h.bookPage && <Link href={`/read/${h.editionId}?component=${h.bookComponentId}&page=${h.bookPage}`}
        className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-base font-bold text-white shadow hover:bg-violet-700">📖 {t('Open page {n} of the book', { n: h.bookPage })}</Link>}
      {children}</div></main>);

  if (sub && !((retry || h.current) && h.triesLeft > 0)) {
    const shown = (it: any, r: any) => (it.type === 'MCQ' ? it.options[r] : it.type === 'TRUE_FALSE' ? (r ? t('True') : t('False')) : r) ?? '—';
    return shell(<>
      <div className="my-6 rounded-3xl bg-white p-6 text-center shadow-sm">
        {sub.score !== null ? <><div className="text-6xl">{sub.score === sub.maxScore ? '🏆' : sub.score / sub.maxScore >= 0.5 ? '🌟' : '💪'}</div>
          <div className="mt-2 text-3xl font-extrabold text-amber-600">{sub.score} / {sub.maxScore}</div>
          {sub.feedback && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-lg text-slate-700">💬 {sub.feedback}</p>}</>
          : <><div className="text-6xl">⏳</div><p className="mt-2 text-xl font-bold">{t('Handed in! Your teacher is checking it.')}</p></>}
        {h.triesLeft > 0 && <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="text-slate-600">{t('You can try again to get a better score.')} ({t('Try {a} of {b}', { a: sub.attempt + 1, b: h.maxAttempts })})</p>
          <button onClick={() => setRetry(true)} className="mt-3 rounded-2xl bg-sky-700 px-6 py-3 text-lg font-bold text-white shadow">🔁 {t('Try again')}</button></div>}
      </div>
      {sub.score !== null && h.triesLeft === 0 && <div className="space-y-3">{h.items.map((it: any, n: number) => {
        const a = sub.answers.find((x: any) => x.itemId === it.id);
        return <div key={it.id} className="rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-start gap-2"><span className="font-bold">{n + 1}.</span><span className="flex-1 font-semibold">{it.prompt}</span>
          {a?.correct === true ? <CheckCircle2 className="size-6 text-emerald-500" /> : a?.correct === false ? <XCircle className="size-6 text-red-400" /> : null}</div>
          <p className="ml-6 mt-1 text-slate-600">{t('You said:')} <b>{String(shown(it, a?.response))}</b>{a?.correct === false && it.answer && <> · {t('Answer:')} <b className="text-emerald-700">{String(it.type === 'MCQ' ? it.options[it.answer[0]] : it.type === 'TRUE_FALSE' ? (it.answer[0] ? t('True') : t('False')) : it.answer[0])}</b></>}</p></div>;
      })}</div>}
    </>);
  }
  if (h.status !== 'PUBLISHED') return shell(<p className="mt-6 rounded-3xl bg-white p-6 text-center text-lg shadow-sm">{t('This homework is closed.')}</p>);

  return shell(<Doing h={h} id={id} key={h.attemptsUsed} onDone={() => { setRetry(false); qc.invalidateQueries({ queryKey: ['homework'] }); qc.invalidateQueries({ queryKey: ['myReport'] }); }} />);
}

const clock = (sec: number) => { const s = Math.max(0, Math.floor(sec)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`; };

/** Answering: the timer starts when the student starts (the start time is kept for the teacher); with a time limit it counts down and hands in by itself. */
function Doing({ h, id, onDone }: { h: any; id: string; onDone: () => void }) {
  const toast = useToast(); const { t } = useT();
  const [i, setI] = useState(0); const [answers, setAnswers] = useState<Record<string, any>>({}); const [clips, setClips] = useState<Record<string, Clip>>({}); const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<{ startedAt: number; endsAt: number | null; skew: number } | null>(null); const [now, setNow] = useState(Date.now());
  const sent = useRef(false); const answersRef = useRef(answers); answersRef.current = answers;
  // how each written answer was made (typed, pasted, time) — sent with the answers for the teacher
  const sig = useRef<Record<string, { pasted: number; pastes: number; typed: number; ms: number; len: number; since: number | null }>>({});
  const sigOf = (k: string) => (sig.current[k] ??= { pasted: 0, pastes: 0, typed: 0, ms: 0, len: 0, since: null });
  const track = (k: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const r = sigOf(k); const kind = String((e.nativeEvent as InputEvent).inputType ?? ''); const len = e.target.value.length; const delta = len - r.len; r.len = len;
    if (delta <= 0) return;
    if (kind.startsWith('insertFromPaste') || kind === 'insertFromDrop' || kind === 'insertFromYank') { r.pasted += delta; r.pastes++; } else r.typed += delta;
  };
  const focusOn = (k: string) => { sigOf(k).since = Date.now(); };
  const focusOff = (k: string) => { const r = sigOf(k); if (r.since) { r.ms += Date.now() - r.since; r.since = null; } };
  const guard = watched(h.proctor); const [streams, setStreams] = useState<Streams | null>(null);
  const iRef = useRef(0); iRef.current = i;
  const pr = useProctor(id, h.proctor, streams, !!run && !!streams, () => ({ q: iRef.current + 1, answered: Object.values(answersRef.current).filter((v) => v !== undefined && v !== '').length }));
  const start = async () => {
    try {
      const r = await api.post<any>(`/student/homework/${id}/start`);
      const skew = Date.now() - new Date(r.serverNow).getTime(); // the device clock may be wrong: count from the server's time
      setRun({ startedAt: new Date(r.startedAt).getTime() + skew, endsAt: r.endsAt ? new Date(r.endsAt).getTime() + skew : null, skew });
    } catch (e: any) { toast(e.message, 'err'); }
  };
  // no time limit, or a try already started: start (or go on) straight away
  useEffect(() => { if (!guard && (!h.timeLimitMin || h.current)) void start(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!run) return; const k = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(k); }, [run]);
  const submit = async (auto = false) => {
    if (sent.current) return;
    const ans = answersRef.current;
    const missing = h.items.filter((x: any) => ans[x.id] === undefined || ans[x.id] === '').length;
    if (!auto && missing && !confirm(t('You skipped {n} question(s). Hand in anyway?', { n: missing }))) return;
    sent.current = true; setBusy(true);
    try {
      Object.keys(sig.current).forEach(focusOff);
      const signals = Object.entries(sig.current).map(([itemId, x]) => ({ itemId, pasted: x.pasted, pastes: x.pastes, typed: x.typed, ms: x.ms }));
      const r = await api.post<any>(`/student/homework/${id}/submit`, { answers: Object.entries(ans).map(([itemId, response]) => ({ itemId, response })), signals });
      pr.stopAll();
      toast(auto ? t('Time is up — your answers were handed in.') : r.status === 'GRADED' ? t('You got {a} out of {b}! 🎉', { a: r.score, b: r.maxScore }) : t('Handed in! 🎉'));
      onDone();
    } catch (e: any) { sent.current = false; toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const left = run?.endsAt ? (run.endsAt - now) / 1000 : null;
  useEffect(() => { if (left !== null && left <= 0) void submit(true); }, [left !== null && left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run && guard) return <>
    {h.timeLimitMin && !h.current && <p className="mt-4 rounded-2xl bg-white p-3 text-center font-bold text-slate-700 shadow-sm">⏱️ {t('You have {n} minutes.', { n: h.timeLimitMin })} {t('The clock starts when you press Start.')}</p>}
    <ProctorGate id={id} p={h.proctor} resume={!!h.current} onReady={(s) => { setStreams(s); void start(); }} />
  </>;
  if (!run) return h.timeLimitMin && !h.current ? (
    <div className="mt-6 rounded-3xl bg-white p-6 text-center shadow-sm">
      {h.instructions && <p className="mb-4 text-lg text-slate-600">{h.instructions}</p>}
      <div className="text-5xl">⏱️</div>
      <p className="mt-2 text-xl font-bold text-slate-800">{t('You have {n} minutes.', { n: h.timeLimitMin })}</p>
      <p className="mt-1 text-slate-600">{t('The clock starts when you press Start. When the time is up, your answers are handed in by themselves.')}</p>
      {h.maxAttempts > 1 && <p className="mt-1 text-sm text-slate-500">{t('Try {a} of {b}', { a: h.attemptsUsed + 1, b: h.maxAttempts })}</p>}
      <button onClick={start} className="mt-5 rounded-2xl bg-emerald-700 px-8 py-3 text-xl font-bold text-white shadow">▶ {t('Start')}</button>
    </div>) : <PageLoader />;

  const it = h.items[i]; const last = i === h.items.length - 1; const val = answers[it.id];
  const set = (v: any) => setAnswers({ ...answers, [it.id]: v });
  return <>
    {guard && <CamBadge stream={pr.cam.current} />}
    {pr.lost && <div role="alert" className="fixed inset-x-0 top-0 z-30 flex flex-wrap items-center justify-center gap-3 bg-red-600 p-3 text-white shadow-lg">
      <b>{pr.lost === 'screen' ? t('Screen sharing stopped — your teacher can see this.') : t('The camera stopped — your teacher can see this.')}</b>
      <button onClick={pr.reshare} className="rounded-xl bg-white px-4 py-1.5 font-bold text-red-700">{pr.lost === 'screen' ? t('Share the screen again') : t('Turn the camera on again')}</button></div>}
    <div className={cn('sticky top-2 z-10 mt-3 flex w-fit items-center gap-2 rounded-full px-4 py-1.5 text-lg font-bold tabular-nums shadow', left === null ? 'bg-white text-slate-700' : left < 60 ? 'animate-pulse bg-red-600 text-white' : left < 300 ? 'bg-amber-400 text-amber-950' : 'bg-white text-slate-700')}
      role="timer" aria-live={left !== null && left < 60 ? 'assertive' : 'off'}>
      {left === null ? <>⏱ {clock((now - run.startedAt) / 1000)}</> : <>⏳ {clock(left)} {t('left')}</>}
      {h.maxAttempts > 1 && <span className="text-sm font-medium opacity-80">· {t('Try {a} of {b}', { a: h.attemptsUsed + 1, b: h.maxAttempts })}</span>}
    </div>
    {h.instructions && i === 0 && <p className="mt-2 text-lg text-slate-600">{h.instructions}</p>}
    {h.dueAt && <p className="mt-1 text-sm text-slate-500">Due {fmtDay(h.dueAt)}</p>}
    <div className="my-5 flex gap-1.5" aria-label={`Question ${i + 1} of ${h.items.length}`}>{h.items.map((x: any, n: number) => (
      <button key={x.id} onClick={() => setI(n)} aria-label={`Question ${n + 1}`} className={cn('h-3 flex-1 rounded-full', n === i ? 'bg-pink-500' : answers[x.id] !== undefined ? 'bg-emerald-400' : 'bg-slate-200')} />))}</div>
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3"><p className="flex-1 text-2xl font-bold text-slate-800">{it.prompt}</p>
        <button onClick={() => say(it.prompt)} aria-label="Read the question aloud" className="rounded-2xl bg-sky-100 p-3 text-sky-700 hover:bg-sky-200"><Volume2 className="size-6" /></button></div>
      <div className="mt-6">
        {it.type === 'MCQ' && <div className="grid gap-3 sm:grid-cols-2">{it.options.map((o: string, n: number) => (
          <button key={n} onClick={() => set(n)} aria-pressed={val === n} className={cn('rounded-2xl px-5 py-4 text-left text-xl font-bold text-white shadow transition', COLORS[n % COLORS.length], val === n ? 'scale-105 ring-4 ring-slate-800' : '')}>{o}</button>))}</div>}
        {it.type === 'TRUE_FALSE' && <div className="grid grid-cols-2 gap-3">{[true, false].map((v) => (
          <button key={String(v)} onClick={() => set(v)} aria-pressed={val === v} className={cn('rounded-2xl py-6 text-2xl font-extrabold text-white shadow', v ? 'bg-emerald-700' : 'bg-red-600', val === v ? 'scale-105 ring-4 ring-slate-800' : '')}>{v ? '👍 True' : '👎 False'}</button>))}</div>}
        {it.type === 'READING' && <ReadAloud playful value={clips[it.id] ?? null} onChange={(c: Clip | null) => { setClips({ ...clips, [it.id]: c as Clip }); set(c ? c.id : undefined); }} />}
        {(it.type === 'FILL_BLANK' || it.type === 'SHORT') && <input key={it.id} autoFocus aria-label="Your answer" value={val ?? ''} onChange={(e) => { track(it.id, e); set(e.target.value); }}
          onFocus={() => focusOn(it.id)} onBlur={() => focusOff(it.id)} placeholder="Type your answer ✏️"
          className="w-full rounded-2xl border-4 border-sky-200 px-5 py-4 text-2xl outline-none focus:border-sky-400" />}
      </div>
    </div>
    <div className="mt-6 flex justify-between">
      <button disabled={i === 0} onClick={() => setI(i - 1)} className="flex items-center gap-1 rounded-2xl bg-white px-5 py-3 text-lg font-bold text-slate-600 shadow disabled:opacity-30"><ChevronLeft className="size-6 rtl:rotate-180" />{t('Back')}</button>
      {!last ? <button onClick={() => setI(i + 1)} className="flex items-center gap-1 rounded-2xl bg-sky-700 px-6 py-3 text-lg font-bold text-white shadow">{t('Next')}<ChevronRight className="size-6 rtl:rotate-180" /></button>
        : <button onClick={() => submit()} disabled={busy} className="rounded-2xl bg-emerald-700 px-6 py-3 text-lg font-bold text-white shadow disabled:opacity-50">{busy ? '…' : `🚀 ${t('Hand in')}`}</button>}
    </div>
  </>;
}
