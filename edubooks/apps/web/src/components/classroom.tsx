'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mic, Square, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { cn } from '@/components/ui';
import { useRecorder, VoicePlayer } from '@/components/voice';

export const STICKERS: Record<string, string> = {
  GREAT: '⭐ Great!', WELL_DONE: '👏 Well done', SUPER_STAR: '🌟 Super star', NEAT: '✍️ Neat work', READING: '📚 Great reading',
  CLEVER: '🧠 Clever thinking', CREATIVE: '🎨 So creative', IMPROVED: '📈 Big improvement', KIND: '❤️ Kind helper', TRY: '💪 Keep trying',
};
type Kind = 'submission' | 'page-work';
const fmt = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ====================== feedback: stickers + voice note ======================
/** For teachers: tap stickers, record a short voice note, add a line — the child and the parents get it. */
export function FeedbackEditor({ kind, targetId, onSaved }: { kind: Kind; targetId: string; onSaved?: () => void }) {
  const q = useQuery({ queryKey: ['feedback', kind, targetId], queryFn: () => api.get<any>(`/feedback/${kind}/${targetId}`) });
  const qc = useQueryClient(); const rec = useRecorder('FEEDBACK');
  const [picked, setPicked] = useState<string[]>([]); const [voice, setVoice] = useState<{ id: string; ms?: number } | null>(null); const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle'); const [err, setErr] = useState('');
  useEffect(() => { if (q.data !== undefined) { setPicked(q.data?.stickers.map((s: any) => s.key) ?? []); setVoice(q.data?.voiceId ? { id: q.data.voiceId } : null); setNote(q.data?.note ?? ''); } }, [q.data]);
  const save = async (next?: { stickers?: string[]; voice?: typeof voice }) => {
    const stickers = next?.stickers ?? picked; const v = next && 'voice' in next ? next.voice : voice;
    setState('saving'); setErr('');
    try { await api.put(`/feedback/${kind}/${targetId}`, { stickers, voiceId: v?.id ?? null, note }); setState('saved'); qc.invalidateQueries({ queryKey: ['feedback', kind, targetId] }); onSaved?.(); setTimeout(() => setState('idle'), 1500); }
    catch (e: any) { setErr(e.message); setState('idle'); }
  };
  const toggle = (k: string) => { const next = picked.includes(k) ? picked.filter((x) => x !== k) : picked.length >= 5 ? picked : [...picked, k]; setPicked(next); void save({ stickers: next }); };
  return (
    <div className="space-y-3 rounded-2xl bg-gradient-to-br from-amber-50 to-violet-50 p-4 ring-1 ring-amber-200">
      <div className="flex items-center justify-between"><p className="text-sm font-extrabold text-slate-800">🏅 Stickers and a voice note <span className="font-normal text-slate-500">— one tap; the child and the parents see it</span></p>
        <span className="text-xs font-semibold text-emerald-700">{state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Sent' : ''}</span></div>
      <div className="flex flex-wrap gap-1.5">{Object.entries(STICKERS).map(([k, label]) => (
        <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={picked.includes(k)}
          className={cn('rounded-full px-3 py-1.5 text-sm font-bold transition', picked.includes(k) ? 'scale-105 bg-amber-400 text-amber-950 shadow' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-amber-100')}>{label}</button>))}</div>
      <div className="flex flex-wrap items-center gap-2">
        {rec.state === 'recording' ? <>
          <span className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><span className="size-2.5 animate-pulse rounded-full bg-red-500" />{fmt(rec.ms)}</span>
          <button type="button" onClick={rec.cancel} className="rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Cancel recording"><Trash2 className="size-4" /></button>
          <button type="button" onClick={async () => { const c = await rec.stop(); if (c) { const v = { id: c.id, ms: c.durationMs }; setVoice(v); void save({ voice: v }); } }} className="inline-flex items-center gap-1 rounded-xl bg-red-500 px-3 py-2 text-sm font-bold text-white"><Square className="size-4" />Stop and send</button>
        </> : voice ? <>
          <VoicePlayer id={voice.id} ms={voice.ms} />
          <button type="button" onClick={() => { setVoice(null); void save({ voice: null }); }} className="rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Remove the voice note"><Trash2 className="size-4" /></button>
        </> : <button type="button" disabled={rec.state === 'uploading'} onClick={rec.start} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Mic className="size-4" />{rec.state === 'uploading' ? 'Saving…' : 'Record a voice note'}</button>}
        <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => (note !== (q.data?.note ?? '') ? void save() : undefined)} maxLength={500} placeholder="A short line (optional)…"
          className="min-w-40 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
      </div>
      {(rec.error || err) && <p className="text-xs text-red-700">{rec.error || err}</p>}
    </div>
  );
}

/** For the child (and parents): the stickers, the teacher's voice and note, big and happy. */
export function FeedbackView({ kind, targetId, playful }: { kind: Kind; targetId: string; playful?: boolean }) {
  const { t } = useT();
  const q = useQuery({ queryKey: ['feedback', kind, targetId], queryFn: () => api.get<any>(`/feedback/${kind}/${targetId}`) });
  const f = q.data; if (!f) return null;
  return (
    <div className={cn('space-y-3 rounded-3xl bg-gradient-to-br from-amber-100 via-rose-50 to-violet-100 p-4 text-start shadow-sm', playful && 'p-5')}>
      <p className="font-extrabold text-slate-800">🏅 {t('From {name}', { name: f.teacher ?? t('your teacher') })}</p>
      {!!f.stickers.length && <div className="flex flex-wrap gap-2">{f.stickers.map((s: any) => (
        <span key={s.key} className={cn('rounded-full bg-white px-4 py-2 font-black text-amber-700 shadow-[0_4px_0_rgba(0,0,0,.08)] animate-[pop-in_.5s_both]', playful ? 'text-2xl' : 'text-base')}>{t(s.label)}</span>))}</div>}
      {f.voiceId && <div className="rounded-2xl bg-white/80 p-3"><p className="mb-1 text-sm font-semibold text-slate-600">🎤 {t('Listen to your teacher')}</p><VoicePlayer id={f.voiceId} big={playful} /></div>}
      {f.note && <p className={cn('rounded-2xl bg-white/80 p-3 text-slate-800', playful && 'text-lg')} dir="auto">💬 {f.note}</p>}
    </div>
  );
}

/** The newest stickers and voice notes for one child — for the student home and the parent page. */
export function FeedbackWall({ studentId, playful, limit = 4 }: { studentId: string; playful?: boolean; limit?: number }) {
  const { t } = useT();
  const q = useQuery({ queryKey: ['feedbackWall', studentId], queryFn: () => api.get<any[]>(`/feedback/student/${studentId}`) });
  const list = (q.data ?? []).slice(0, limit);
  if (!list.length) return null;
  return (
    <section className={cn('rounded-3xl bg-white p-4 shadow-sm', playful && 'rounded-[2rem]')}>
      <h2 className={cn('mb-3 font-black text-slate-800', playful ? 'text-2xl' : 'text-lg')}>🏅 {t('Stickers from my teacher')}</h2>
      <ul className="space-y-2">{list.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 p-3">
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">{f.stickers.map((s: any) => t(s.label)).join('  ') || '🎤'}</span>
            <span className="block truncate text-xs text-slate-500">{f.what} · {f.teacher}</span>{f.note && <span className="block text-sm text-slate-700" dir="auto">💬 {f.note}</span>}</span>
          {f.voiceId && <VoicePlayer id={f.voiceId} />}
        </li>))}</ul>
    </section>
  );
}

// ====================== class reward goals ======================
const REWARDS = [
  // fun
  ['🎉', 'Class party'], ['⚽', 'Extra playtime'], ['🎬', 'Movie time'], ['🎨', 'Free art time'],
  // educational
  ['📖', 'Story time with the teacher'], ['📚', 'Library visit'], ['🔬', 'Science experiment day'], ['🧩', 'Puzzle and brain-games time'],
  ['🌍', 'Educational trip'], ['🎭', 'Class play or show'], ['💻', 'Computer and coding time'], ['🌱', 'Plant a class garden'],
  ['🐝', 'Spelling bee party'], ['🗣️', 'Choose the next class read-aloud book'], ['🏅', 'Certificates for everyone'], ['👩‍🔬', 'Visit from a guest expert'],
];
function Progress({ g, big }: { g: any; big?: boolean }) {
  const pct = Math.min(100, Math.round((g.stars / g.target) * 100));
  return (
    <div className={cn('relative overflow-hidden rounded-full bg-white/70 ring-1 ring-amber-200', big ? 'h-8' : 'h-5')}>
      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-pink-500 transition-all duration-700" style={{ width: `${Math.max(pct, 3)}%` }} />
      <span className={cn('absolute inset-0 grid place-items-center font-black text-slate-800', big ? 'text-base' : 'text-xs')}>⭐ {g.stars} / {g.target}</span>
    </div>
  );
}

/** For teachers and the school admin: start a class goal ("200 stars → class party") and watch it fill up. */
export function ClassGoals({ classes, manageRewards = true }: { classes: { id: string; name: string; students?: number }[]; manageRewards?: boolean }) {
  const q = useQuery({ queryKey: ['classGoals'], queryFn: () => api.get<any[]>('/classroom/goals') });
  const rw = useQuery({ queryKey: ['schoolRewards'], queryFn: () => api.get<any[]>('/classroom/rewards') });
  const qc = useQueryClient();
  const [f, setF] = useState({ classId: '', pick: '🎉|Class party', emoji: '🎁', reward: '', target: 0, keep: true });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [manage, setManage] = useState(false);
  const active = (q.data ?? []).filter((g) => g.status === 'ACTIVE'); const done = (q.data ?? []).filter((g) => g.status === 'DONE').slice(0, 3);
  const free = classes.filter((c) => !active.some((g) => g.classId === c.id));
  const cls = classes.find((c) => c.id === (f.classId || free[0]?.id));
  const suggested = Math.max(30, Math.round(((cls?.students ?? 10) * 15) / 10) * 10);
  const other = f.pick === 'OTHER';
  const start = async () => {
    setBusy(true); setErr('');
    try {
      const [emoji, reward] = other ? [f.emoji || '🎁', f.reward.trim()] : f.pick.split('|');
      if (other && f.keep && reward.length >= 2) await api.post('/classroom/rewards', { emoji, title: reward }).catch(() => undefined);
      await api.post('/classroom/goals', { classId: f.classId || free[0]?.id, reward, emoji, target: f.target || suggested });
      setF({ ...f, classId: '', reward: '', target: 0 }); qc.invalidateQueries({ queryKey: ['classGoals'] }); qc.invalidateQueries({ queryKey: ['schoolRewards'] });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const stop = async (id: string) => { if (!confirm('Stop this class goal?')) return; await api.del(`/classroom/goals/${id}`); qc.invalidateQueries({ queryKey: ['classGoals'] }); };
  return (
    <section className="space-y-3 rounded-3xl bg-gradient-to-br from-amber-50 to-pink-50 p-5 shadow-sm ring-1 ring-amber-200">
      <div className="flex flex-wrap items-start gap-2"><div className="min-w-0 flex-1"><h2 className="text-lg font-extrabold text-slate-900">🏆 Class reward board</h2>
        <p className="text-sm text-slate-600">One goal for the whole class — every star from games, homework, book work and your stickers counts. No ranking of children.</p></div>
        {manageRewards && <button type="button" onClick={() => setManage(!manage)} className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-50">🎁 {manage ? 'Close' : 'Our rewards'}</button>}</div>
      {manage && <RewardList />}
      {active.map((g) => (
        <div key={g.id} className="space-y-2 rounded-2xl bg-white/80 p-3">
          <div className="flex items-center gap-2"><span className="text-2xl">{g.emoji}</span><b className="flex-1 text-slate-900">{g.className}: {g.target} stars → {g.reward}</b>
            <button type="button" onClick={() => stop(g.id)} className="text-xs text-slate-500 underline">Stop</button></div>
          <Progress g={g} />
        </div>))}
      {done.map((g) => <p key={g.id} className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">✅ {g.className} reached {g.target} stars → {g.emoji} {g.reward}</p>)}
      {free.length > 0 && <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-white/60 p-3">
        <label className="text-xs font-semibold text-slate-600">Class<select value={f.classId || free[0]?.id} onChange={(e) => setF({ ...f, classId: e.target.value })} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">{free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Reward<select value={f.pick} onChange={(e) => setF({ ...f, pick: e.target.value })} className="mt-1 block max-w-60 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
          {(rw.data ?? []).length > 0 && <optgroup label="Our school's rewards">{(rw.data ?? []).map((r) => <option key={r.id} value={`${r.emoji}|${r.title}`}>{r.emoji} {r.title}</option>)}</optgroup>}
          <optgroup label="Fun">{REWARDS.slice(0, 4).filter(([, t]) => !(rw.data ?? []).some((r) => r.title.toLowerCase() === t.toLowerCase())).map(([e, r]) => <option key={r} value={`${e}|${r}`}>{e} {r}</option>)}</optgroup>
          <optgroup label="Learning rewards">{REWARDS.slice(4).filter(([, t]) => !(rw.data ?? []).some((r) => r.title.toLowerCase() === t.toLowerCase())).map(([e, r]) => <option key={r} value={`${e}|${r}`}>{e} {r}</option>)}</optgroup>
          <option value="OTHER">✏️ Other reward…</option></select></label>
        {other && <>
          <label className="text-xs font-semibold text-slate-600">Emoji<input value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} maxLength={16} className="mt-1 block w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-lg" /></label>
          <label className="text-xs font-semibold text-slate-600">Your reward<input autoFocus value={f.reward} onChange={(e) => setF({ ...f, reward: e.target.value })} maxLength={120} placeholder="e.g. Ice-cream Friday" className="mt-1 block w-52 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" /></label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600"><input type="checkbox" checked={f.keep} onChange={(e) => setF({ ...f, keep: e.target.checked })} />Add to our school's list</label>
        </>}
        <label className="text-xs font-semibold text-slate-600">Stars<input type="number" min={10} max={10000} value={f.target || suggested} onChange={(e) => setF({ ...f, target: Number(e.target.value) })} className="mt-1 block w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" /></label>
        <button type="button" disabled={busy || (other && f.reward.trim().length < 2)} onClick={start} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white shadow disabled:opacity-50">🚀 Start the goal</button>
        {err && <p className="w-full text-xs text-red-700">{err}</p>}
      </div>}
    </section>
  );
}

const EMOJIS = ['🎉', '🎈', '🍦', '🍕', '🎬', '⚽', '🧸', '🎨', '📖', '🎮', '🏖️', '🎵', '🌳', '🧁', '🏅', '🎁'];
/** The school's own rewards: teachers and the school admin add them; everyone in the school can choose them. */
export function RewardList() {
  const q = useQuery({ queryKey: ['schoolRewards'], queryFn: () => api.get<any[]>('/classroom/rewards') });
  const qc = useQueryClient(); const [emoji, setEmoji] = useState('🎁'); const [title, setTitle] = useState(''); const [err, setErr] = useState('');
  const add = async () => {
    setErr('');
    try { await api.post('/classroom/rewards', { emoji, title }); setTitle(''); qc.invalidateQueries({ queryKey: ['schoolRewards'] }); } catch (e: any) { setErr(e.message); }
  };
  const del = async (id: string) => { await api.del(`/classroom/rewards/${id}`); qc.invalidateQueries({ queryKey: ['schoolRewards'] }); };
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-amber-200">
      <p className="text-sm font-bold text-slate-800">🎁 Our school's rewards <span className="font-normal text-slate-500">— added by teachers and the school admin; everyone can choose them for a class goal</span></p>
      <ul className="flex flex-wrap gap-2">{(q.data ?? []).map((r) => (
        <li key={r.id} className="flex items-center gap-1.5 rounded-full bg-amber-50 py-1 pe-1 ps-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200" title={r.by ? `Added by ${r.by}` : ''}>
          {r.emoji} {r.title}{r.canDelete && <button type="button" onClick={() => del(r.id)} className="rounded-full p-1 text-amber-700 hover:bg-amber-100" aria-label={`Remove ${r.title}`}><Trash2 className="size-3.5" /></button>}</li>))}
        {!q.data?.length && <li className="text-sm text-slate-500">No rewards of your own yet — the usual ones (class party, movie time…) are always there.</li>}</ul>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">{EMOJIS.map((e) => <button key={e} type="button" onClick={() => setEmoji(e)} className={cn('size-9 rounded-lg text-xl', emoji === e ? 'bg-amber-200 ring-2 ring-amber-400' : 'hover:bg-amber-50')}>{e}</button>)}</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="New reward, e.g. Ice-cream Friday" onKeyDown={(e) => e.key === 'Enter' && title.trim().length >= 2 && add()}
          className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="button" disabled={title.trim().length < 2} onClick={add} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">+ Add</button>
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
    </div>
  );
}

/** For students: our class goal, filling up — and a celebration when it is reached. */
export function ClassGoalBanner() {
  const { t } = useT();
  const q = useQuery({ queryKey: ['myGoals'], queryFn: () => api.get<any[]>('/classroom/my-goals') });
  const g = q.data?.[0]; if (!g) return null;
  const won = g.status === 'DONE';
  return (
    <section className={cn('relative overflow-hidden rounded-[2rem] p-5 shadow', won ? 'bg-gradient-to-r from-emerald-300 via-lime-200 to-yellow-200' : 'bg-gradient-to-r from-amber-200 via-orange-100 to-pink-200')}>
      {won && <div aria-hidden className="pointer-events-none absolute inset-0">{Array.from({ length: 18 }).map((_, i) => <span key={i} className="absolute text-xl motion-safe:animate-[confetti-fall_3s_linear_infinite]" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.4}s` }}>{['🎉', '⭐', '🎈', '✨'][i % 4]}</span>)}</div>}
      <div className="relative flex items-center gap-4">
        <span className="text-6xl motion-safe:animate-[bob_2s_ease-in-out_infinite]">{g.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black uppercase tracking-wide text-slate-600">{t('Our class goal')}</p>
          <p className="text-2xl font-black text-slate-900">{won ? t('We did it! {reward}!', { reward: t(g.reward) }) : t('{n} stars → {reward}', { n: g.target, reward: t(g.reward) })}</p>
          <div className="mt-2"><Progress g={g} big /></div>
          {!won && <p className="mt-1 text-sm font-semibold text-slate-700">{t('Play, read and do your homework — every star helps the whole class!')}</p>}
        </div>
      </div>
    </section>
  );
}

// ====================== plan my week ======================
/** Fills the week with the next lessons of a book, skipping holidays (and following the timetable when there is one). */
export function PlanWeek({ classes, books, onDone }: { classes: { id: string; name: string }[]; books: { editionId: string; title: string }[]; onDone?: (n: number) => void }) {
  const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };
  const [f, setF] = useState({ classId: classes[0]?.id ?? '', editionId: books[0]?.editionId ?? '', weekStart: nextMonday(), perDay: 1 });
  const [p, setP] = useState<any>(null); const [skip, setSkip] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const preview = async () => { setBusy(true); setErr(''); setSkip([]); try { setP(await api.post('/teacher/plans/week/preview', f)); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const items = p ? p.days.flatMap((d: any) => d.lessons.filter((l: any) => !skip.includes(`${d.date}|${l.lessonId}`)).map((l: any) => ({ date: d.date, lessonId: l.lessonId }))) : [];
  const create = async () => { setBusy(true); setErr(''); try { const r = await api.post<any>('/teacher/plans/week', { ...f, items }); onDone?.(r.created); setP(null); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const wd = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Class<select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Book<select value={f.editionId} onChange={(e) => setF({ ...f, editionId: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{books.map((b) => <option key={b.editionId} value={b.editionId}>{b.title}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Week of<input type="date" value={f.weekStart} onChange={(e) => setF({ ...f, weekStart: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-700">Lessons a day (when the class has no timetable)&nbsp;
          <select value={f.perDay} onChange={(e) => setF({ ...f, perDay: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-2 py-1">{[1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select></label>
        <button type="button" disabled={busy || !f.classId || !f.editionId} onClick={preview} className="rounded-xl bg-violet-600 px-4 py-2 font-bold text-white disabled:opacity-50">📅 Show the week</button>
      </div>
      {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      {p && <>
        <p className="text-sm text-slate-600">{p.fromTimetable ? '🗓️ Following the class timetable for this subject.' : `${f.perDay} lesson${f.perDay > 1 ? 's' : ''} a day.`} Holidays from the school calendar are skipped. Untick a lesson to leave it out.{p.left ? ` ${p.left} lessons are left in the book after this week.` : ''}</p>
        <div className="grid gap-2 sm:grid-cols-5">{p.days.map((d: any) => (
          <div key={d.date} className={cn('min-h-32 rounded-2xl p-3', d.holiday ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-white ring-1 ring-slate-200')}>
            <p className="text-sm font-extrabold text-slate-800">{wd(d.date)}</p>
            {d.holiday ? <p className="mt-2 text-sm font-semibold text-rose-700">🏖️ {d.holiday}</p> : !d.lessons.length ? <p className="mt-2 text-xs text-slate-400">No lesson of this subject</p>
              : d.lessons.map((l: any) => { const k = `${d.date}|${l.lessonId}`; return (
                <label key={k} className="mt-2 flex items-start gap-2 rounded-xl bg-violet-50 p-2 text-xs font-semibold text-violet-900">
                  <input type="checkbox" className="mt-0.5" checked={!skip.includes(k)} onChange={(e) => setSkip(e.target.checked ? skip.filter((x) => x !== k) : [...skip, k])} />{l.title}</label>); })}
          </div>))}</div>
        <div className="flex justify-end"><button type="button" disabled={busy || !items.length} onClick={create} className="rounded-xl bg-emerald-600 px-5 py-2 font-bold text-white disabled:opacity-50">✅ Make {items.length} lesson plan{items.length === 1 ? '' : 's'}</button></div>
      </>}
    </div>
  );
}

// ====================== the parents' weekly summary ======================
export function WeekSummary({ studentId }: { studentId: string }) {
  const { t, lang } = useT();
  const q = useQuery({ queryKey: ['weekSummary', studentId], queryFn: () => api.get<any>(`/parent/week/${studentId}`) });
  const s = q.data; if (!s) return <p className="p-6 text-center text-slate-500">{t('Loading…')}</p>;
  const n = s.numbers; const d = (x: string) => new Date(`${x}T12:00:00`).toLocaleDateString(lang === 'ar' ? 'ar' : undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const tiles = [['⭐', n.stars, 'stars'], ['📝', n.homeworkDone, 'homework done'], ['🎮', n.games, 'games played'], ['🏅', n.stickers, 'stickers'], ['🖍️', n.bookWork, 'book work sent'], ['🗓️', n.present + n.absent + n.late ? `${n.present}/${n.present + n.absent + n.late}` : '—', 'days present']];
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 p-5 text-white shadow">
        <p className="text-sm font-semibold opacity-90">{d(s.from)} – {d(s.to)}</p>
        <h2 className="text-2xl font-black">{t('{name}’s week', { name: String(s.child.name).split(/\s+/)[0] })} 🌈</h2>
        {n.avgScore !== null && <p className="mt-1 font-semibold">{t('Homework score this week: {n}%', { n: n.avgScore })}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{tiles.map(([i, v, l]) => (
        <div key={l as string} className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-100"><div className="text-3xl">{i}</div><div className="text-2xl font-black text-slate-900">{v}</div><div className="text-xs font-semibold text-slate-500">{t(l as string)}</div></div>))}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-4 shadow-sm"><h3 className="mb-2 font-extrabold text-slate-900">📚 {t('What we learned')}</h3>
          {s.learned.length ? <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">{s.learned.map((l: string) => <li key={l}>{l}</li>)}</ul> : <p className="text-sm text-slate-500">—</p>}</section>
        <section className="rounded-3xl bg-white p-4 shadow-sm"><h3 className="mb-2 font-extrabold text-slate-900">📅 {t('Coming next week')}</h3>
          {s.next.length ? <ul className="space-y-1 text-sm">{s.next.map((e: any, i: number) => <li key={i} className="flex gap-2"><span className="w-28 shrink-0 font-semibold text-slate-500">{d(e.on)}</span><span className="text-slate-800">{e.title}</span></li>)}</ul> : <p className="text-sm text-slate-500">—</p>}</section>
      </div>
      {s.missing.length > 0 && <section className="rounded-3xl bg-amber-50 p-4 ring-1 ring-amber-200"><h3 className="mb-1 font-extrabold text-amber-900">⚠️ {t('Not handed in yet')}</h3>
        <ul className="list-inside list-disc text-sm text-amber-900">{s.missing.map((m: any) => <li key={m.id}>{m.title}</li>)}</ul></section>}
      {s.feedback.length > 0 && <section className="rounded-3xl bg-white p-4 shadow-sm"><h3 className="mb-2 font-extrabold text-slate-900">🏅 {t('From the teacher')}</h3>
        <ul className="space-y-2">{s.feedback.map((f: any, i: number) => <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 p-3 text-sm">
          <span className="flex-1 font-bold">{f.stickers.map((x: string) => t(x)).join('  ')}{f.note && <span className="block font-normal text-slate-700">💬 {f.note}</span>}</span>{f.voiceId && <VoicePlayer id={f.voiceId} />}</li>)}</ul></section>}
      {s.goals.map((g: any) => <section key={g.id} className="rounded-3xl bg-gradient-to-r from-amber-100 to-pink-100 p-4"><p className="mb-2 font-extrabold text-slate-900">{g.emoji} {t('Class goal')}: {g.target} ⭐ → {t(g.reward)}</p><Progress g={g} /></section>)}
    </div>
  );
}
