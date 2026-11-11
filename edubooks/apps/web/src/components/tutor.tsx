'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { Badge, Button, Card, ErrorBox, Field, Input, PageLoader, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';

type Turn = { who: 'me' | 'owl'; text: string; quiz?: { q: string; options: string[]; answer: number }[] | null; pages?: number[] };
const speak = (t: string) => { try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t.replace(/[\u{1F300}-\u{1FAFF}]/gu, '')); u.rate = 0.9; window.speechSynthesis.speak(u); } catch { /* no voice */ } };

export function useTutorStatus(enabled: boolean) {
  return useQuery({ queryKey: ['tutorStatus'], queryFn: () => api.get<{ enabled: boolean; remaining: number }>('/tutor/status'), enabled, staleTime: 60_000 });
}

/** "Ask Owl" panel inside the reader for pupils. */
export function TutorPanel({ editionId, componentId, page, onGo, onClose }: { editionId: string; componentId: string; page: number; onGo: (p: number) => void; onClose: () => void }) {
  const { t } = useT(); const qc = useQueryClient(); const toast = useToast();
  const status = useTutorStatus(true);
  const [turns, setTurns] = useState<Turn[]>([{ who: 'owl', text: t("Hi! I'm Owl 🦉 I can explain this page, answer a question about your book, or give you a little quiz.") }]);
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [turns.length]);
  const ask = async (mode: 'EXPLAIN' | 'ASK' | 'QUIZ', question = '') => {
    if (busy) return;
    const label = mode === 'EXPLAIN' ? t('Explain this page') : mode === 'QUIZ' ? t('Quiz me') : question;
    setTurns((x) => [...x, { who: 'me', text: label }]); setBusy(true); setQ('');
    try {
      const r = await api.post<any>('/tutor/ask', { editionId, componentId, page, mode, question: question || undefined });
      setTurns((x) => [...x, { who: 'owl', text: r.answer, quiz: r.quiz, pages: (r.sources ?? []).map((s: any) => s.page) }]);
      qc.setQueryData(['tutorStatus'], (o: any) => ({ ...(o ?? {}), enabled: true, remaining: r.remaining }));
    } catch (e: any) { setTurns((x) => [...x, { who: 'owl', text: e.message }]); }
    finally { setBusy(false); }
  };
  return (
    <aside className="flex w-80 shrink-0 flex-col border-s border-amber-200 bg-amber-50 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:z-30 max-md:h-[70vh] max-md:w-full max-md:rounded-t-3xl max-md:shadow-2xl" aria-label={t('Ask Owl')}>
      <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-3"><span className="text-3xl" aria-hidden>🦉</span><b className="flex-1 text-lg text-slate-900">{t('Ask Owl')}</b>
        {status.data && <span className="text-xs font-bold text-amber-800">{t('{n} left today', { n: status.data.remaining })}</span>}
        <button onClick={onClose} aria-label={t('Close')} className="rounded-full p-1 hover:bg-amber-100"><X className="size-5" /></button></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {turns.map((x, i) => (
          <div key={i} className={cn('flex', x.who === 'me' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[90%] rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-sm', x.who === 'me' ? 'bg-violet-600 text-white' : 'bg-white text-slate-900')}>
              <p className="whitespace-pre-wrap">{x.text}</p>
              {x.who === 'owl' && i > 0 && <button onClick={() => speak(x.text)} className="mt-1 text-xs font-bold text-amber-700">🔊 {t('Read to me')}</button>}
              {x.pages?.length ? <div className="mt-1 flex flex-wrap gap-1">{x.pages.map((p) => <button key={p} onClick={() => onGo(p)} className="rounded-full bg-amber-100 px-2 text-xs font-bold text-amber-900">📖 {t('page {n}', { n: p })}</button>)}</div> : null}
              {x.quiz?.length ? <MiniQuiz quiz={x.quiz} /> : null}
            </div></div>))}
        {busy && <div className="text-sm font-bold text-amber-800">🦉 {t('Owl is thinking…')}</div>}
        <div ref={end} />
      </div>
      <div className="space-y-2 border-t border-amber-200 p-3">
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => ask('EXPLAIN')}>💡 {t('Explain this page')}</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => ask('QUIZ')}>⭐ {t('Quiz me')}</Button>
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) ask('ASK', q.trim()); else toast(t('Type your question'), 'err'); }}>
          <Input aria-label={t('Your question')} maxLength={300} placeholder={t('Ask about your book…')} value={q} onChange={(e) => setQ(e.target.value)} />
          <Button disabled={busy}>{t('Ask')}</Button>
        </form>
        <p className="text-[11px] text-slate-600">{t('Owl only knows your book. Your teacher can see your questions.')}</p>
      </div>
    </aside>
  );
}

function MiniQuiz({ quiz }: { quiz: { q: string; options: string[]; answer: number }[] }) {
  const { t } = useT(); const [picked, setPicked] = useState<Record<number, number>>({});
  const done = Object.keys(picked).length === quiz.length; const right = quiz.filter((x, i) => picked[i] === x.answer).length;
  return (
    <div className="mt-2 space-y-2">{quiz.map((x, i) => (
      <div key={i}><p className="font-bold">{i + 1}. {x.q}</p>
        <div className="mt-1 flex flex-wrap gap-1">{x.options.map((o, k) => {
          const chosen = picked[i] === k; const show = picked[i] !== undefined;
          return <button key={k} disabled={show} onClick={() => setPicked({ ...picked, [i]: k })}
            className={cn('rounded-xl border px-2 py-1 text-sm', show && k === x.answer ? 'border-emerald-600 bg-emerald-100' : chosen ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white')}>{o}{show && k === x.answer ? ' ✅' : ''}</button>; })}</div></div>))}
      {done && <p className="font-black text-violet-700">{right === quiz.length ? t('Perfect! ⭐⭐⭐') : t('{a} of {b} right — well done!', { a: right, b: quiz.length })}</p>}
    </div>
  );
}

/** School admin: switch the tutor on/off and set the daily limit. */
export function TutorSettings() {
  const q = useQuery({ queryKey: ['tutorSettings'], queryFn: () => api.get<any>('/tutor/settings') });
  const [limit, setLimit] = useState(20); const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (q.data) setLimit(q.data.dailyLimit); }, [q.data]);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const save = async (enabled: boolean) => { try { qc.setQueryData(['tutorSettings'], await api.put('/tutor/settings', { enabled, dailyLimit: Number(limit) })); toast(enabled ? 'Ask Owl is on for your pupils' : 'Ask Owl is off'); } catch (e: any) { toast(e.message, 'err'); } };
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3"><span className="text-4xl">🦉</span><div className="flex-1">
        <h2 className="font-semibold text-slate-900">Ask Owl — AI reading helper for pupils</h2>
        <p className="text-sm text-slate-600">In the book reader, pupils can ask Owl to explain the page, answer a question about their book, or give a short quiz. Owl only uses the book’s own pages, refuses unsafe topics, never asks for personal details, and every question is shown to teachers below.
          {!q.data.live && ' No AI model is set up yet, so Owl answers by showing the matching sentences from the book.'}</p></div>
        <Badge tone={q.data.enabled ? 'PUBLISHED' : 'DRAFT'}>{q.data.enabled ? 'On' : 'Off'}</Badge></div>
      {!q.data.available ? <p className="text-sm text-amber-800">Your publisher has turned this feature off.</p> : (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Questions per pupil per day"><Input type="number" min={1} max={200} className="w-28" value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></Field>
          {q.data.enabled ? <><Button variant="secondary" onClick={() => save(true)}>Save limit</Button><Button variant="ghost" onClick={() => save(false)}>Turn off</Button></> : <Button onClick={() => save(true)}>Turn on for pupils</Button>}
        </div>)}
    </Card>
  );
}

/** What pupils asked Owl. Flagged = Owl gave the "talk to a trusted grown-up" answer, worth a gentle check-in. */
export function TutorLog({ classes }: { classes?: { id: string; label: string }[] }) {
  const [cls, setCls] = useState(''); const [flagged, setFlagged] = useState(false);
  const q = useQuery({ queryKey: ['tutorLog', cls, flagged], queryFn: () => api.get<any[]>(`/tutor/log?${new URLSearchParams({ ...(cls ? { classId: cls } : {}), ...(flagged ? { flagged: '1' } : {}) })}`) });
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3"><h2 className="font-semibold text-slate-900">Questions pupils asked</h2>
        {classes && <select aria-label="Class" className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">All my classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />Only flagged</label></div>
      {q.error ? <div className="p-4"><ErrorBox error={q.error} /></div> : !q.data ? <PageLoader /> : !q.data.length ? <p className="p-6 text-center text-sm text-slate-600">No questions yet.</p> : (
        <ul className="divide-y divide-slate-100">{q.data.map((x) => (
          <li key={x.id} className={cn('px-5 py-3 text-sm', x.flagged && 'bg-red-50')}>
            <div className="flex flex-wrap items-center gap-2"><b>{x.student}</b><span className="text-xs text-slate-600">{x.book} · page {x.page} · {fmtDate(x.createdAt)}</span>
              {x.flagged && <Badge tone="danger">Flagged — please check in with this pupil</Badge>}</div>
            <p className="mt-1 text-slate-800"><span className="text-slate-500">{{ EXPLAIN: 'Explain this page', QUIZ: 'Quiz me', ASK: 'Asked:' }[x.mode as string]}</span> {x.question}</p>
            <p className="mt-0.5 text-slate-600">🦉 {x.answer}</p></li>))}</ul>)}
    </Card>
  );
}
