'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { Badge, Button, Card, ErrorBox, Field, Input, PageLoader, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { speakText } from '@/lib/voice';

type Turn = { who: 'me' | 'owl'; text: string; quiz?: { q: string; options: string[]; answer: number }[] | null; pages?: number[]; reading?: { score: number | null; words: { w: string; ok: boolean }[] } };
const READ_LANGS: [string, string][] = [['en-US', 'English'], ['ar-SA', 'العربية'], ['ur-PK', 'اردو'], ['hi-IN', 'हिन्दी'], ['fr-FR', 'Français']];
const speak = (t: string) => { void speakText(t); };

export function useTutorStatus(enabled: boolean) {
  return useQuery({ queryKey: ['tutorStatus'], queryFn: () => api.get<{ enabled: boolean; remaining: number }>('/tutor/status'), enabled, staleTime: 60_000 });
}

/** "Ask Owl" panel inside the reader for pupils. */
export function TutorPanel({ editionId, componentId, page: openPage, toPage, flip, onGo, onClose }: { editionId: string; componentId: string; page: number; toPage?: number; flip?: boolean; onGo: (p: number) => void; onClose: () => void }) {
  const { t } = useT(); const qc = useQueryClient(); const toast = useToast();
  // page 0: the flipbook has not told the reader which page is open yet
  // two pages side by side: the student taps the one Owl should use (the left one first)
  const spread = !!toPage && toPage !== openPage; const [pick, setPick] = useState<number | null>(null);
  useEffect(() => { setPick(null); }, [openPage, toPage]);
  const page = spread && pick === toPage ? toPage! : openPage;
  const unknown = !page;
  const status = useTutorStatus(true);
  const [turns, setTurns] = useState<Turn[]>([{ who: 'owl', text: t("Hi! I'm Owl 🦉 I can explain the page you have open, answer a question about it, give you a little quiz, or listen to you read it.") }]);
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [turns.length]);
  const ask = async (mode: 'EXPLAIN' | 'ASK' | 'QUIZ', question = '') => {
    if (busy || unknown) return;
    const label = mode === 'EXPLAIN' ? t('Explain this page') : mode === 'QUIZ' ? t('Quiz me') : question;
    setTurns((x) => [...x, { who: 'me', text: label }]); setBusy(true); setQ('');
    try {
      const r = await api.post<any>('/tutor/ask', { editionId, componentId, page, mode, question: question || undefined });
      setTurns((x) => [...x, { who: 'owl', text: r.answer, quiz: r.quiz, pages: (r.sources ?? []).map((s: any) => s.page) }]);
      qc.setQueryData(['tutorStatus'], (o: any) => ({ ...(o ?? {}), enabled: true, remaining: r.remaining }));
    } catch (e: any) { setTurns((x) => [...x, { who: 'owl', text: e.message }]); }
    finally { setBusy(false); }
  };
  // Read-aloud self check: the browser listens, the server compares the words with the open page
  const [listening, setListening] = useState(false); const [heard, setHeard] = useState(''); const rec = useRef<any>(null); const heardRef = useRef('');
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('owlReadLang') || 'en-US'; } catch { return 'en-US'; } });
  const startReading = () => {
    if (busy || unknown) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast(t('This browser cannot listen. Please use Chrome, Edge or Safari.'), 'err'); return; }
    const r = new SR(); r.lang = lang; r.continuous = true; r.interimResults = true;
    let done = ''; heardRef.current = ''; setHeard('');
    r.onresult = (e: any) => { let live = ''; for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) done += e.results[i][0].transcript + ' '; else live += e.results[i][0].transcript; } heardRef.current = done + live; setHeard(done + live); };
    r.onerror = (e: any) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast(t('Please allow the microphone to read to Owl.'), 'err'); };
    r.onend = () => { setListening(false); rec.current = null; void check(heardRef.current); };
    rec.current = r; setListening(true);
    try { r.start(); } catch { setListening(false); }
  };
  const stopReading = () => { try { rec.current?.stop(); } catch { /* already stopped */ } };
  const check = async (said: string) => {
    if (!said.trim()) { setTurns((x) => [...x, { who: 'owl', text: t("Owl didn't hear you. Tap 🎤 and read the page aloud, nice and clear.") }]); return; }
    setTurns((x) => [...x, { who: 'me', text: `🎤 ${said.trim()}` }]); setBusy(true); setHeard('');
    try {
      const r = await api.post<any>('/tutor/read', { editionId, componentId, page, transcript: said.trim().slice(0, 4000) });
      setTurns((x) => [...x, { who: 'owl', text: r.feedback, reading: { score: r.score, words: r.words ?? [] } }]);
      qc.setQueryData(['tutorStatus'], (o: any) => ({ ...(o ?? {}), enabled: true, remaining: r.remaining }));
    } catch (e: any) { setTurns((x) => [...x, { who: 'owl', text: e.message }]); }
    finally { setBusy(false); }
  };
  useEffect(() => () => { try { rec.current?.abort(); } catch { /* ignore */ } }, []);

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
              {x.pages?.length && !flip ? <div className="mt-1 flex flex-wrap gap-1">{x.pages.map((p) => <button key={p} onClick={() => onGo(p)} className="rounded-full bg-amber-100 px-2 text-xs font-bold text-amber-900">📖 {t('page {n}', { n: p })}</button>)}</div> : null}
              {x.quiz?.length ? <MiniQuiz quiz={x.quiz} /> : null}
              {x.reading?.words.length ? <ReadingResult score={x.reading.score} words={x.reading.words} /> : null}
            </div></div>))}
        {busy && <div className="text-sm font-bold text-amber-800">🦉 {t('Owl is thinking…')}</div>}
        <div ref={end} />
      </div>
      <div className="space-y-2 border-t border-amber-200 p-3">
        {unknown ? <p className="text-sm font-bold text-amber-900">{t('Turn to a page in your book, then ask Owl.')}</p>
          : spread ? (
            <div className="flex items-center gap-2 text-sm font-bold text-amber-900">📖 {t('Which page?')}
              {[openPage, toPage!].map((n) => <button key={n} type="button" aria-pressed={page === n} onClick={() => setPick(n)}
                className={cn('rounded-full border px-3 py-0.5', page === n ? 'border-violet-600 bg-violet-600 text-white' : 'border-amber-300 bg-white text-amber-900')}>{t('Page {n}', { n })}</button>)}
            </div>)
            : <p className="text-sm font-bold text-amber-900">📖 {t('Page {n}', { n: page })}</p>}
        {listening ? (
          <div className="rounded-xl border-2 border-rose-300 bg-white p-2">
            <p className="text-sm font-black text-rose-700">🔴 {t('Listening… read the page aloud')}</p>
            {heard && <p className="mt-1 line-clamp-3 text-xs text-slate-600">{heard}</p>}
            <Button size="sm" className="mt-2 w-full" onClick={stopReading}>✅ {t('I finished reading')}</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1" disabled={busy || unknown} onClick={startReading}>🎤 {t('Read to Owl')}</Button>
            <select aria-label={t('Reading language')} className="h-8 rounded-lg border border-amber-200 bg-white px-1 text-xs" value={lang}
              onChange={(e) => { setLang(e.target.value); try { localStorage.setItem('owlReadLang', e.target.value); } catch { /* private mode */ } }}>
              {READ_LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={busy || unknown || listening} onClick={() => ask('EXPLAIN')}>💡 {t('Explain this page')}</Button>
          <Button size="sm" variant="secondary" disabled={busy || unknown || listening} onClick={() => ask('QUIZ')}>⭐ {t('Quiz me')}</Button>
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) ask('ASK', q.trim()); else toast(t('Type your question'), 'err'); }}>
          <Input aria-label={t('Your question')} maxLength={300} placeholder={t('Ask about your book…')} value={q} onChange={(e) => setQ(e.target.value)} />
          <Button disabled={busy || unknown || listening}>{t('Ask')}</Button>
        </form>
        <p className="text-[11px] text-slate-600">{t('Owl only knows your book. Your teacher can see your questions.')}</p>
      </div>
    </aside>
  );
}

/** The page's words in the part the student read: green when read right, red when missed. */
function ReadingResult({ score, words }: { score: number | null; words: { w: string; ok: boolean }[] }) {
  const { t } = useT();
  return (
    <div className="mt-2 rounded-xl bg-amber-50 p-2">
      {score !== null && <p className="text-sm font-black text-violet-700">{t('Score')}: {score}%</p>}
      <p className="mt-1 break-words text-sm leading-relaxed">{words.map((x, i) => <span key={i}><span className={cn('rounded px-0.5', x.ok ? 'text-emerald-700' : 'bg-rose-100 font-bold text-rose-700 underline decoration-wavy')}>{x.w}</span>{' '}</span>)}</p>
      <p className="mt-1 text-[11px] text-slate-500">{t('Green: read right · Red: missed or not clear')}</p>
    </div>
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
  const save = async (enabled: boolean) => { try { qc.setQueryData(['tutorSettings'], await api.put('/tutor/settings', { enabled, dailyLimit: Number(limit) })); toast(enabled ? 'Ask Owl is on for your students' : 'Ask Owl is off'); } catch (e: any) { toast(e.message, 'err'); } };
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3"><span className="text-4xl">🦉</span><div className="flex-1">
        <h2 className="font-semibold text-slate-900">Ask Owl — AI reading helper for students</h2>
        <p className="text-sm text-slate-600">In the book reader, students can ask Owl to explain the page, answer a question about their book, or give a short quiz. Owl only uses the book’s own pages, refuses unsafe topics, never asks for personal details, and every question is shown to teachers below.
          {!q.data.live && ' No AI model is set up yet, so Owl answers by showing the matching sentences from the book.'}</p></div>
        <Badge tone={q.data.enabled ? 'PUBLISHED' : 'DRAFT'}>{q.data.enabled ? 'On' : 'Off'}</Badge></div>
      {!q.data.available ? <p className="text-sm text-amber-800">Your publisher has turned this feature off.</p> : (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Questions per student per day"><Input type="number" min={1} max={200} className="w-28" value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></Field>
          {q.data.enabled ? <><Button variant="secondary" onClick={() => save(true)}>Save limit</Button><Button variant="ghost" onClick={() => save(false)}>Turn off</Button></> : <Button onClick={() => save(true)}>Turn on for students</Button>}
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
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3"><h2 className="font-semibold text-slate-900">Questions and reading checks</h2>
        {classes && <select aria-label="Class" className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">All my classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />Only flagged</label></div>
      {q.error ? <div className="p-4"><ErrorBox error={q.error} /></div> : !q.data ? <PageLoader /> : !q.data.length ? <p className="p-6 text-center text-sm text-slate-600">No questions yet.</p> : (
        <ul className="divide-y divide-slate-100">{q.data.map((x) => (
          <li key={x.id} className={cn('px-5 py-3 text-sm', x.flagged && 'bg-red-50')}>
            <div className="flex flex-wrap items-center gap-2"><b>{x.student}</b><span className="text-xs text-slate-600">{x.book} · page {x.page} · {fmtDate(x.createdAt)}</span>
              {x.mode === 'READ' && x.score !== null && <Badge tone={x.score >= 90 ? 'PUBLISHED' : x.score >= 70 ? 'DRAFT' : 'danger'}>🎤 Read aloud: {x.score}%</Badge>}
              {x.flagged && <Badge tone="danger">Flagged — please check in with this student</Badge>}</div>
            <p className="mt-1 text-slate-800"><span className="text-slate-500">{{ EXPLAIN: 'Explain this page', QUIZ: 'Quiz me', ASK: 'Asked:', READ: 'Read aloud (what Owl heard):' }[x.mode as string]}</span> {x.question}</p>
            <p className="mt-0.5 text-slate-600">🦉 {x.answer}</p></li>))}</ul>)}
    </Card>
  );
}
