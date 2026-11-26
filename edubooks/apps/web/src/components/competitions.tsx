'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Mic, Square, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { cn } from '@/components/ui';
import { useRecorder, VoicePlayer } from '@/components/voice';
import { Avatar } from '@/components/welcome';

export const CATS: Record<string, { label: string; emoji: string }> = {
  SINGING: { label: 'Singing', emoji: '🎤' }, ART: { label: 'Art', emoji: '🎨' }, DRAWING: { label: 'Drawing', emoji: '✏️' }, POETRY: { label: 'Poetry', emoji: '📜' },
  QURAN: { label: 'Quran recitation', emoji: '📖' }, SPELLING: { label: 'Spelling', emoji: '🐝' }, STORY: { label: 'Storytelling', emoji: '📚' },
  SCIENCE: { label: 'Science', emoji: '🔬' }, SPORTS: { label: 'Sports', emoji: '⚽' }, OTHER: { label: 'Other', emoji: '🏆' },
};
const KIND: Record<string, string> = { PHOTO: '📷 A photo', AUDIO: '🎤 A voice recording', TEXT: '✍️ Writing', ANY: '📷 🎤 ✍️ Photo, recording or writing' };
const STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Taking part', cls: 'bg-emerald-100 text-emerald-800' }, VOTING: { label: 'Voting', cls: 'bg-violet-100 text-violet-800' }, RESULTS: { label: 'Results', cls: 'bg-amber-100 text-amber-800' },
};
const MEDAL = ['🥇', '🥈', '🥉'];
const fmt = (d?: string | null, lang?: string) => (d ? new Date(d).toLocaleDateString(lang === 'ar' ? 'ar' : undefined, { day: 'numeric', month: 'short' }) : '');

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.85; let out = c.toDataURL('image/jpeg', q); while (out.length > 1_300_000 && q > 0.4) { q -= 0.12; out = c.toDataURL('image/jpeg', q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

/** All competitions I can see. */
export function CompetitionList({ base, admin, playful }: { base: string; admin?: boolean; playful?: boolean }) {
  const { t, lang } = useT();
  const q = useQuery({ queryKey: ['competitions'], queryFn: () => api.get<any[]>('/competitions') });
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-5">
      {admin && (creating ? <CompetitionForm onDone={() => setCreating(false)} /> : (
        <button type="button" onClick={() => setCreating(true)} className="rounded-2xl bg-gradient-to-r from-pink-500 to-violet-600 px-5 py-3 font-black text-white shadow">➕ New competition</button>))}
      {!q.data ? <p className="text-slate-500">{t('Loading…')}</p> : !q.data.length ? (
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm"><div className="text-5xl">🏆</div><p className="mt-2 text-slate-600">{t('No competitions yet.')}</p></div>
      ) : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{q.data.map((c) => (
        <a key={c.id} href={`${base}/${c.id}`} className={cn('group relative overflow-hidden bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md', playful ? 'rounded-[2rem]' : 'rounded-3xl')}>
          <span aria-hidden className="absolute -end-4 -top-4 text-8xl opacity-10">{c.emoji}</span>
          <div className="flex items-center gap-2"><span className="text-3xl">{c.emoji}</span><span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', STATUS[c.status].cls)}>{t(STATUS[c.status].label)}</span>
            {c.entered && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">✓ {t('I took part')}</span>}{c.voted && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">🗳️ {t('Voted')}</span>}</div>
          <h3 className={cn('mt-2 font-black text-slate-900', playful ? 'text-2xl' : 'text-lg')}>{c.title}</h3>
          <p className="text-sm text-slate-500">{t(CATS[c.category]?.label ?? c.category)} · {c.entries} {t('entries')}{c.entriesUntil && c.status === 'OPEN' ? ` · ${t('until {d}', { d: fmt(c.entriesUntil, lang) })}` : ''}</p>
          {c.winners?.length > 0 && <p className="mt-2 text-sm font-bold text-amber-700">{c.winners.map((w: any) => `${MEDAL[w.place - 1]} ${w.name}`).join('  ')}</p>}
        </a>))}</div>}
    </div>
  );
}

/** For the school admin: start (or change) a competition. */
export function CompetitionForm({ initial, onDone }: { initial?: any; onDone: () => void }) {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['classes', 'all'], queryFn: () => api.get<any[]>('/classes') });
  const [f, setF] = useState<any>(initial ?? { title: '', category: 'SINGING', emoji: '🎤', description: '', entryKind: 'AUDIO', classIds: [], entriesUntil: '', votingUntil: '', studentVotes: true, teacherVotes: true });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    const body = { ...f, entriesUntil: f.entriesUntil ? new Date(`${f.entriesUntil}T23:59:00`).toISOString() : null, votingUntil: f.votingUntil ? new Date(`${f.votingUntil}T23:59:00`).toISOString() : null };
    try { if (initial?.id) await api.patch(`/competitions/${initial.id}`, body); else await api.post('/competitions', body); qc.invalidateQueries({ queryKey: ['competitions'] }); qc.invalidateQueries({ queryKey: ['competition'] }); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const cls = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  return (
    <div className="space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-violet-200">
      <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold text-slate-900">{initial?.id ? '✏️ Change the competition' : '➕ New competition'}</h2>
        <button type="button" onClick={onDone} className="rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="size-5" /></button></div>
      <div className="flex flex-wrap gap-2">{Object.entries(CATS).map(([k, c]) => (
        <button key={k} type="button" onClick={() => setF({ ...f, category: k, emoji: c.emoji, entryKind: k === 'SINGING' || k === 'QURAN' ? 'AUDIO' : k === 'ART' || k === 'DRAWING' || k === 'SCIENCE' ? 'PHOTO' : k === 'POETRY' || k === 'STORY' ? 'ANY' : f.entryKind })}
          className={cn('rounded-full px-3 py-1.5 text-sm font-bold', f.category === k ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-violet-50')}>{c.emoji} {c.label}</button>))}</div>
      <div className="grid gap-3 sm:grid-cols-[5rem_1fr]">
        <label className="text-sm font-medium text-slate-700">Emoji<input value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} maxLength={16} className={cn(cls, 'text-center text-xl')} /></label>
        <label className="text-sm font-medium text-slate-700">Title<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} placeholder="e.g. Spring Singing Star 2026" className={cls} /></label>
      </div>
      <label className="block text-sm font-medium text-slate-700">What to do, and the rules<textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} maxLength={3000} placeholder="e.g. Sing one song you love (up to 2 minutes). Everyone gets a certificate!" className={cls} /></label>
      <div><p className="text-sm font-medium text-slate-700">Students send</p><div className="mt-1 flex flex-wrap gap-2">{Object.entries(KIND).map(([k, l]) => (
        <button key={k} type="button" onClick={() => setF({ ...f, entryKind: k })} className={cn('rounded-xl px-3 py-1.5 text-sm font-semibold', f.entryKind === k ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700')}>{l}</button>))}</div></div>
      <div><p className="text-sm font-medium text-slate-700">Who can take part <span className="font-normal text-slate-500">— no class chosen = the whole school</span></p>
        <div className="mt-1 flex flex-wrap gap-1.5">{classes.data?.filter((c) => !c.archived).map((c) => { const on = f.classIds.includes(c.id); return (
          <button key={c.id} type="button" onClick={() => setF({ ...f, classIds: on ? f.classIds.filter((x: string) => x !== c.id) : [...f.classIds, c.id] })}
            className={cn('rounded-full px-3 py-1 text-sm', on ? 'bg-sky-600 font-bold text-white' : 'bg-slate-100 text-slate-700')}>{c.name}{c.section ? ` ${c.section}` : ''}</button>); })}</div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Entries until (optional)<input type="date" value={f.entriesUntil?.slice(0, 10) ?? ''} onChange={(e) => setF({ ...f, entriesUntil: e.target.value })} className={cls} /></label>
        <label className="text-sm font-medium text-slate-700">Voting until (optional)<input type="date" value={f.votingUntil?.slice(0, 10) ?? ''} onChange={(e) => setF({ ...f, votingUntil: e.target.value })} className={cls} /></label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm"><span className="font-medium text-slate-700">Who votes:</span>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.studentVotes} onChange={(e) => setF({ ...f, studentVotes: e.target.checked })} />🧒 Students</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.teacherVotes} onChange={(e) => setF({ ...f, teacherVotes: e.target.checked })} />👩‍🏫 Teachers</label></div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={onDone} className="rounded-xl px-4 py-2 text-slate-600 hover:bg-slate-100">Cancel</button>
        <button type="button" disabled={busy || f.title.trim().length < 2} onClick={save} className="rounded-xl bg-violet-600 px-5 py-2 font-bold text-white disabled:opacity-50">{initial?.id ? 'Save' : '🚀 Start the competition'}</button></div>
    </div>
  );
}

/** The student's own entry: a photo, a recording and/or writing. */
function EntryForm({ c, mine }: { c: any; mine: any }) {
  const { t } = useT(); const qc = useQueryClient(); const rec = useRecorder('ENTRY'); const file = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ title: mine?.title ?? '', description: mine?.description ?? '' });
  const [image, setImage] = useState<{ key?: string; preview: string } | null>(mine?.image ? { preview: mine.image } : null);
  const [audio, setAudio] = useState<{ id: string; ms?: number } | null>(mine?.audioId ? { id: mine.audioId } : null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const want = (k: string) => c.entryKind === 'ANY' || c.entryKind === k;
  const pick = async (fl?: File) => { if (!fl) return; setErr(''); try { const img = await shrink(fl); const r = await api.post<{ key: string }>('/competitions/uploads', { image: img }); setImage({ key: r.key, preview: img }); } catch (e: any) { setErr(e.message); } };
  const send = async () => {
    setBusy(true); setErr('');
    // a picture already sent (no new key) is kept as it is
    const keep = image && !image.key;
    try { await api.post(`/competitions/${c.id}/entry`, { title: f.title, description: f.description, ...(keep ? {} : { imageKey: image?.key ?? null }), audioId: audio?.id ?? null }); qc.invalidateQueries({ queryKey: ['competition', c.id] }); qc.invalidateQueries({ queryKey: ['competitions'] }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const withdraw = async () => { if (!confirm(t('Take your entry back?'))) return; await api.del(`/competitions/${c.id}/entry`); qc.invalidateQueries({ queryKey: ['competition', c.id] }); };
  return (
    <section className="space-y-3 rounded-[2rem] bg-gradient-to-br from-emerald-50 to-sky-50 p-5 ring-2 ring-emerald-200">
      <h2 className="text-2xl font-black text-slate-900">{mine ? `✅ ${t('Your entry')}` : `🙋 ${t('Take part!')}`}</h2>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} placeholder={t('Name of your entry, e.g. My favourite song')} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-lg" />
      {want('PHOTO') && <div>
        <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {image ? <div className="relative w-fit"><img src={image.preview} alt="" className="max-h-64 rounded-2xl object-contain shadow" />
          <button type="button" onClick={() => setImage(null)} className="absolute end-2 top-2 rounded-full bg-black/60 p-1.5 text-white" aria-label={t('Remove')}><X className="size-4" /></button></div>
          : <button type="button" onClick={() => file.current?.click()} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 font-bold text-emerald-800 shadow ring-1 ring-emerald-200"><ImagePlus className="size-5" />{t('Add a photo of your work')}</button>}</div>}
      {want('AUDIO') && <div className="flex flex-wrap items-center gap-2">
        {rec.state === 'recording' ? <>
          <span className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 font-bold text-red-700"><span className="size-3 animate-pulse rounded-full bg-red-500" />{Math.round(rec.ms / 1000)}s</span>
          <button type="button" onClick={async () => { const a = await rec.stop(); if (a) setAudio({ id: a.id, ms: a.durationMs }); }} className="inline-flex items-center gap-2 rounded-2xl bg-red-500 px-4 py-3 font-bold text-white"><Square className="size-5" />{t('Stop')}</button>
        </> : audio ? <><VoicePlayer id={audio.id} ms={audio.ms} big /><button type="button" onClick={() => setAudio(null)} className="rounded-lg p-2 text-slate-500 hover:bg-white" aria-label={t('Remove')}><Trash2 className="size-4" /></button></>
          : <button type="button" disabled={rec.state === 'uploading'} onClick={rec.start} className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 font-bold text-white disabled:opacity-50"><Mic className="size-5" />{rec.state === 'uploading' ? t('Saving…') : t('Record')}</button>}
        {rec.error && <span className="text-sm text-red-700">{rec.error}</span>}</div>}
      {want('TEXT') && <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} rows={4} placeholder={c.entryKind === 'TEXT' ? t('Write your entry here…') : t('Tell us about it (optional)…')} className="w-full rounded-xl border border-slate-300 px-3 py-2" dir="auto" />}
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || rec.state !== 'idle'} onClick={send} className="rounded-2xl bg-emerald-600 px-6 py-3 text-lg font-black text-white shadow disabled:opacity-50">{mine ? `💾 ${t('Save my entry')}` : `🚀 ${t('Send my entry')}`}</button>
        {mine && <button type="button" onClick={withdraw} className="rounded-2xl px-4 py-3 text-sm text-slate-600 hover:bg-white">{t('Take it back')}</button>}</div>
    </section>
  );
}

/** Choose 1st, 2nd and 3rd place (suggested from the votes) and announce it. */
function ResultsForm({ c, onDone }: { c: any; onDone: () => void }) {
  const qc = useQueryClient();
  const top = [...c.entries].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  const [places, setPlaces] = useState<Record<string, number>>(() => Object.fromEntries(top.slice(0, 3).filter((e) => (e.votes ?? 0) > 0 || top.length <= 3).map((e, i) => [e.id, i + 1])));
  const [note, setNote] = useState(''); const [toTimeline, setToTimeline] = useState(true); const [toFame, setToFame] = useState(true); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await api.post(`/competitions/${c.id}/results`, { places: Object.entries(places).filter(([, p]) => p).map(([entryId, place]) => ({ entryId, place })), note, toTimeline, toFame }); qc.invalidateQueries({ queryKey: ['competition', c.id] }); qc.invalidateQueries({ queryKey: ['competitions'] }); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-3 rounded-3xl bg-amber-50 p-5 ring-2 ring-amber-300">
      <h2 className="text-lg font-extrabold text-slate-900">🏆 Announce the results</h2>
      <p className="text-sm text-slate-600">The places are suggested from the votes — change them as you like (two children can share a place).</p>
      <ul className="space-y-1">{top.map((e) => (
        <li key={e.id} className="flex items-center gap-3 rounded-xl bg-white p-2"><Avatar name={e.name} photoUrl={e.picture} size={32} />
          <span className="min-w-0 flex-1 text-sm"><b>{e.name}</b> <span className="text-slate-500">· {e.title || '—'} · {e.votes ?? 0} votes</span></span>
          <select value={places[e.id] ?? 0} onChange={(x) => setPlaces({ ...places, [e.id]: Number(x.target.value) })} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
            <option value={0}>—</option><option value={1}>🥇 1st</option><option value={2}>🥈 2nd</option><option value={3}>🥉 3rd</option></select></li>))}</ul>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="A message, e.g. Thank you to everyone who sang so beautifully!" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
      <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-1.5"><input type="checkbox" checked={toTimeline} onChange={(e) => setToTimeline(e.target.checked)} />📰 Post the winners on the timeline</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={toFame} onChange={(e) => setToFame(e.target.checked)} />🏛️ Put the 1st place in the Hall of Fame</label></div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={onDone} className="rounded-xl px-4 py-2 text-slate-600 hover:bg-white">Cancel</button>
        <button type="button" disabled={busy || !Object.values(places).some(Boolean)} onClick={go} className="rounded-xl bg-amber-600 px-5 py-2 font-bold text-white disabled:opacity-50">📣 Announce</button></div>
    </section>
  );
}

/** One competition: the entries, voting, who took part (teachers), and the admin's controls. */
export function CompetitionDetail({ id, back, playful }: { id: string; back: string; playful?: boolean }) {
  const { t, lang } = useT(); const qc = useQueryClient(); const router = useRouter();
  const q = useQuery({ queryKey: ['competition', id], queryFn: () => api.get<any>(`/competitions/${id}`) });
  const [mode, setMode] = useState<'edit' | 'results' | null>(null); const [view, setView] = useState<string | null>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && setView(null); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const c = q.data; if (!c) return <p className="p-6 text-slate-500">{t('Loading…')}</p>;
  const mine = c.entries.find((e: any) => e.mine);
  const vote = async (entryId: string) => { await api.post(`/competitions/${id}/vote`, { entryId }); qc.invalidateQueries({ queryKey: ['competition', id] }); qc.invalidateQueries({ queryKey: ['competitions'] }); };
  const status = async (s: string) => { await api.post(`/competitions/${id}/status`, { status: s }); qc.invalidateQueries({ queryKey: ['competition', id] }); qc.invalidateQueries({ queryKey: ['competitions'] }); };
  const del = async () => { if (!confirm('Delete this competition and all its entries?')) return; await api.del(`/competitions/${id}`); qc.invalidateQueries({ queryKey: ['competitions'] }); router.push(back); };
  const entered = c.roster?.filter((r: any) => r.entered).length ?? 0;
  return (
    <div className="space-y-5">
      <a href={back} className="text-sm text-slate-500 hover:text-slate-800">← {t('All competitions')}</a>
      <header className={cn('relative overflow-hidden bg-gradient-to-r from-pink-500 via-violet-600 to-indigo-600 p-6 text-white shadow', playful ? 'rounded-[2rem]' : 'rounded-3xl')}>
        <span aria-hidden className="absolute -end-6 -top-8 text-[9rem] opacity-15">{c.emoji}</span>
        <div className="relative"><span className="rounded-full bg-white/25 px-3 py-1 text-xs font-bold">{t(STATUS[c.status].label)} · {t(CATS[c.category]?.label ?? c.category)}</span>
          <h1 className={cn('mt-2 font-black', playful ? 'text-4xl' : 'text-3xl')}>{c.emoji} {c.title}</h1>
          {c.description && <p className="mt-1 max-w-3xl whitespace-pre-line text-white/90" dir="auto">{c.description}</p>}
          <p className="mt-2 text-sm text-white/80">{t(KIND[c.entryKind])}{c.classNames.length ? ` · ${c.classNames.join(', ')}` : ` · ${t('Whole school')}`}
            {c.entriesUntil ? ` · ${t('entries until {d}', { d: fmt(c.entriesUntil, lang) })}` : ''}{c.votingUntil ? ` · ${t('voting until {d}', { d: fmt(c.votingUntil, lang) })}` : ''}</p></div>
      </header>
      {c.admin && c.status !== 'RESULTS' && mode === null && <div className="flex flex-wrap gap-2">
        {c.status === 'OPEN' ? <button type="button" onClick={() => status('VOTING')} className="rounded-xl bg-violet-600 px-4 py-2 font-bold text-white">🗳️ Open the voting</button>
          : <button type="button" onClick={() => status('OPEN')} className="rounded-xl bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-300">↩ Back to taking entries</button>}
        <button type="button" disabled={!c.entries.length} onClick={() => setMode('results')} className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-white disabled:opacity-50">🏆 Announce the results</button>
        <button type="button" onClick={() => setMode('edit')} className="rounded-xl bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-300">✏️ Change</button>
        <button type="button" onClick={del} className="rounded-xl px-4 py-2 font-semibold text-red-600 hover:bg-red-50">Delete</button></div>}
      {mode === 'edit' && <CompetitionForm initial={c} onDone={() => setMode(null)} />}
      {mode === 'results' && <ResultsForm c={c} onDone={() => setMode(null)} />}
      {c.status === 'RESULTS' && <section className="rounded-3xl bg-gradient-to-r from-amber-100 to-yellow-50 p-5 text-center ring-2 ring-amber-300">
        <p className="text-sm font-black uppercase tracking-widest text-amber-700">🏆 {t('The winners')}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-6">{c.entries.filter((e: any) => e.place).map((e: any) => (
          <div key={e.id} className="text-center"><div className="text-5xl">{MEDAL[e.place - 1]}</div><div className="mx-auto mt-1 w-fit"><Avatar name={e.name} photoUrl={e.picture} size={64} /></div><p className="mt-1 font-extrabold text-slate-900">{e.name}</p><p className="text-xs text-slate-500">{e.className}</p></div>))}</div>
        {c.resultsNote && <p className="mt-3 text-slate-700" dir="auto">{c.resultsNote}</p>}</section>}
      {c.canEnter && <EntryForm key={mine?.id ?? 'new'} c={c} mine={mine} />}
      {c.canVote && <p className="rounded-2xl bg-violet-50 p-3 text-center font-bold text-violet-900">🗳️ {t('Vote for your favourite! You have one vote and can change it until the voting closes.')}</p>}
      <section>
        <h2 className={cn('mb-3 font-black text-slate-800', playful ? 'text-2xl' : 'text-lg')}>{t('Entries')} ({c.entries.length})</h2>
        {!c.entries.length ? <p className="rounded-3xl bg-white p-6 text-center text-slate-500">{t('No entries yet.')}</p> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{c.entries.map((e: any) => (
            <article key={e.id} className={cn('space-y-2 overflow-hidden rounded-3xl bg-white p-4 shadow-sm ring-1', e.place ? 'ring-2 ring-amber-300' : c.myVote === e.id ? 'ring-2 ring-violet-400' : 'ring-slate-200')}>
              <div className="flex items-center gap-2"><Avatar name={e.name} photoUrl={e.picture} size={40} />
                <div className="min-w-0 flex-1"><p className="truncate font-extrabold text-slate-900">{e.place ? `${MEDAL[e.place - 1]} ` : ''}{e.name}</p><p className="truncate text-xs text-slate-500">{e.className}</p></div>
                {e.votes !== null && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700">🗳️ {e.votes}</span>}</div>
              {e.title && <p className="font-bold text-slate-800" dir="auto">{e.title}</p>}
              {e.image && <button type="button" onClick={() => setView(e.image)} className="block w-full overflow-hidden rounded-2xl bg-slate-100"><img src={e.image} alt={e.title} loading="lazy" className="aspect-[4/3] w-full object-cover" /></button>}
              {e.audioId && <VoicePlayer id={e.audioId} big={playful} />}
              {e.description && <p className="whitespace-pre-line text-sm text-slate-700" dir="auto">{e.description}</p>}
              {c.canVote && !e.mine && <button type="button" onClick={() => vote(e.id)} className={cn('w-full rounded-2xl py-2 font-black', c.myVote === e.id ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-800 hover:bg-violet-100')}>
                {c.myVote === e.id ? `✓ ${t('My vote')}` : `🗳️ ${t('Vote')}`}</button>}
            </article>))}</div>)}
      </section>
      {c.roster && <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-2 font-extrabold text-slate-900">👥 Who is taking part — {entered} of {c.roster.length}</h2>
        <div className="flex flex-wrap gap-1.5">{c.roster.map((r: any) => (
          <span key={r.id} className={cn('rounded-full px-3 py-1 text-xs font-semibold', r.entered ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')} title={r.class_name}>{r.entered ? '✓ ' : ''}{r.name} · {r.class_name}</span>))}</div>
      </section>}
      {view && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] grid place-items-center bg-black/90 p-4" onClick={() => setView(null)}><img src={view} alt="" className="max-h-[90vh] max-w-[94vw] rounded-xl object-contain" /></div>}
    </div>
  );
}

/** A card for home pages when there is a competition to take part in or vote for. */
export function CompetitionPeek({ href, playful }: { href: string; playful?: boolean }) {
  const { t } = useT();
  const q = useQuery({ queryKey: ['competitions'], queryFn: () => api.get<any[]>('/competitions') });
  const live = (q.data ?? []).filter((c) => c.status !== 'RESULTS'); if (!live.length) return null;
  const c = live[0];
  return (
    <a href={href} className={cn('flex items-center gap-4 bg-gradient-to-r from-pink-500 via-violet-600 to-indigo-600 p-4 text-white shadow hover:opacity-95', playful ? 'rounded-[2rem]' : 'rounded-3xl')}>
      <span className="text-4xl">{c.emoji}</span>
      <span className="min-w-0 flex-1"><b className={cn('block', playful ? 'text-2xl' : 'text-lg')}>{t('Competitions')}</b>
        <span className="block truncate text-sm text-white/90">{c.title} · {c.status === 'VOTING' ? `🗳️ ${t('Voting is open!')}` : `🙋 ${t('Take part!')}`}{live.length > 1 ? ` · +${live.length - 1}` : ''}</span></span>
      <span className="text-xl">▶</span>
    </a>
  );
}
