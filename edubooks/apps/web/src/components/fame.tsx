'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { cn } from '@/components/ui';
import { Avatar } from '@/components/welcome';

/** The Hall of Fame board: leadership on top, then the school's brilliant students. */
export function FameBoard({ data, playful }: { data: any; playful?: boolean }) {
  const { t } = useT();
  if (!data?.leaders?.length && !data?.students?.length) return (
    <div className="rounded-3xl bg-white p-10 text-center shadow-sm"><div className="text-6xl">🏛️</div><p className="mt-2 text-slate-600">{t('The Hall of Fame is empty for now.')}</p></div>);
  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#3b2a0a_0%,#7c5a12_45%,#d4a72c_100%)] p-6 text-center text-amber-50 shadow-xl sm:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #fff6 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, #fff6 0 2px, transparent 3px)', backgroundSize: '60px 60px' }} />
        <p className="relative text-sm font-bold uppercase tracking-[0.3em] text-amber-200">{data.school}</p>
        <h1 className="relative mt-1 font-serif text-4xl font-black drop-shadow sm:text-5xl">🏛️ {t('Hall of Fame')}</h1>
        <p className="relative mt-2 text-amber-100">{t('Celebrating the people who make our school shine')}</p>
      </div>
      {data.leaders.length > 0 && <section>
        <h2 className={cn('mb-4 text-center font-black text-amber-800', playful ? 'text-3xl' : 'text-2xl')}>🎖️ {t('Our leadership')}</h2>
        <div className="flex flex-wrap justify-center gap-5">{data.leaders.map((f: any) => (
          <article key={f.id} className="w-60 rounded-3xl bg-gradient-to-b from-amber-50 to-white p-5 text-center shadow-md ring-2 ring-amber-300">
            <div className="mx-auto w-fit rounded-full p-1 ring-4 ring-amber-400"><Avatar name={f.name} photoUrl={f.picture} size={104} open /></div>
            <h3 className="mt-3 text-lg font-extrabold text-slate-900">{f.name}</h3>
            <p className="font-bold text-amber-700">{f.emoji} {f.title}</p>
            {f.achievement && <p className="mt-2 text-sm italic text-slate-600" dir="auto">“{f.achievement}”</p>}
          </article>))}</div>
      </section>}
      {data.students.length > 0 && <section>
        <h2 className={cn('mb-4 text-center font-black text-amber-800', playful ? 'text-3xl' : 'text-2xl')}>🌟 {t('Our brilliant students')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.students.map((f: any, i: number) => (
          <article key={f.id} className="relative flex gap-4 overflow-hidden rounded-3xl bg-white p-4 shadow-sm ring-1 ring-amber-200">
            <span aria-hidden className="absolute -end-3 -top-3 text-6xl opacity-15">{f.emoji}</span>
            <div className="shrink-0 rounded-full p-0.5 ring-[3px] ring-amber-300"><Avatar name={f.name} photoUrl={f.picture} size={72} open /></div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-amber-600">{['🥇', '🥈', '🥉'][i] ?? '🏅'} {f.title}{f.year ? ` · ${f.year}` : ''}</p>
              <h3 className="text-lg font-extrabold text-slate-900">{f.name}</h3>
              {f.achievement && <p className="text-sm text-slate-700" dir="auto">{f.achievement}</p>}
            </div>
          </article>))}</div>
      </section>}
    </div>
  );
}

/** A small card for home pages, when the school shows the Hall of Fame to this person. */
export function FamePeek({ href, playful }: { href: string; playful?: boolean }) {
  const { t } = useT();
  const q = useQuery({ queryKey: ['fame'], queryFn: () => api.get<any>('/fame') });
  const d = q.data; if (!d?.visible || (!d.leaders.length && !d.students.length)) return null;
  const faces = [...d.leaders, ...d.students].slice(0, 5);
  return (
    <a href={href} className={cn('flex items-center gap-4 overflow-hidden bg-[linear-gradient(120deg,#7c5a12,#d4a72c)] p-4 text-amber-50 shadow hover:opacity-95', playful ? 'rounded-[2rem]' : 'rounded-3xl')}>
      <span className="text-4xl">🏛️</span>
      <span className="min-w-0 flex-1"><b className={cn('block', playful ? 'text-2xl' : 'text-lg')}>{t('Hall of Fame')}</b><span className="text-sm text-amber-100">{t('Our brilliant students and leadership')}</span></span>
      <span className="hidden -space-x-3 sm:flex">{faces.map((f: any) => <Avatar key={f.id} name={f.name} photoUrl={f.picture} size={40} className="ring-2 ring-amber-200" />)}</span>
      <span className="text-xl">▶</span>
    </a>
  );
}

const AV = ['teacher-woman', 'teacher-man', 'teacher-woman-2', 'teacher-man-2', 'graduate-girl', 'graduate-boy', 'girl', 'boy', 'girl-hijab', 'boy-2', 'star', 'books'];
const blank = { kind: 'STUDENT', userId: '', name: '', title: '', achievement: '', year: String(new Date().getFullYear()), emoji: '🏆', avatar: '' };

/** For the school admin: who sees it, and the people in it. */
export function FameAdmin() {
  const q = useQuery({ queryKey: ['fame'], queryFn: () => api.get<any>('/fame') });
  const qc = useQueryClient();
  const [f, setF] = useState<any>(blank); const [edit, setEdit] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [cls, setCls] = useState({ name: '', classId: '' });
  const classes = useQuery({ queryKey: ['fameClasses'], queryFn: () => api.get<any[]>('/fame/classes') });
  const names = [...new Set((classes.data ?? []).map((c) => c.name))];
  const sections = (classes.data ?? []).filter((c) => c.name === cls.name);
  const people = useQuery({ queryKey: ['famePeople', f.kind, cls.classId], enabled: f.kind !== 'STUDENT' || !!cls.classId,
    queryFn: () => api.get<any[]>(f.kind === 'STUDENT' ? `/fame/people?role=STUDENT&classId=${cls.classId}` : '/fame/people?role=STAFF') });
  const s = q.data?.settings;
  const setS = async (k: string, v: boolean) => { await api.put('/fame/settings', { ...s, [k]: v }); qc.invalidateQueries({ queryKey: ['fame'] }); };
  const save = async () => {
    setBusy(true); setErr('');
    const body = { ...f, userId: f.userId || null, avatar: f.avatar || null };
    try { if (edit) await api.patch(`/fame/${edit}`, body); else await api.post('/fame', body); setF({ ...blank, kind: f.kind }); setEdit(null); qc.invalidateQueries({ queryKey: ['fame'] }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const del = async (id: string) => { if (!confirm('Remove from the Hall of Fame?')) return; await api.del(`/fame/${id}`); qc.invalidateQueries({ queryKey: ['fame'] }); };
  const all = [...(q.data?.leaders ?? []), ...(q.data?.students ?? [])];
  const pickPerson = (id: string) => { const p = people.data?.find((x) => x.id === id); setF({ ...f, userId: id, name: p?.name ?? f.name, title: f.title || (f.kind === 'LEADER' ? p?.designation ?? '' : '') }); };
  const toggle = (k: string, label: string) => (
    <label className={cn('flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold', s?.[k] ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200', k !== 'enabled' && !s?.enabled && 'opacity-50')}>
      <input type="checkbox" checked={!!s?.[k]} disabled={k !== 'enabled' && !s?.enabled} onChange={(e) => setS(k, e.target.checked)} />{label}</label>);
  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-extrabold text-slate-900">👁️ Who can see the Hall of Fame</h2>
        <div className="flex flex-wrap gap-2">{toggle('enabled', 'Show the Hall of Fame')}{toggle('teachers', '👩‍🏫 Teachers')}{toggle('students', '🧒 Students')}{toggle('parents', '👪 Parents')}</div>
        <p className="text-xs text-slate-500">Only you can change this. Switched off, nobody but the school admin sees it.</p>
      </section>
      <section className="space-y-3 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
        <h2 className="font-extrabold text-slate-900">{edit ? '✏️ Change' : '➕ Add to the Hall of Fame'}</h2>
        <div className="flex gap-2">{[['STUDENT', '🌟 Brilliant student'], ['LEADER', '🎖️ Leadership / honoured teacher']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setF({ ...blank, kind: k, emoji: k === 'LEADER' ? '🎖️' : '🏆' })} className={cn('rounded-xl px-3 py-2 text-sm font-bold', f.kind === k ? 'bg-amber-500 text-white' : 'bg-white text-slate-700 ring-1 ring-amber-200')}>{l}</button>))}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {f.kind === 'STUDENT' && <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <label className="text-sm font-medium text-slate-700">1. Class<select value={cls.name} onChange={(e) => { const n = e.target.value; const secs = (classes.data ?? []).filter((c) => c.name === n); setCls({ name: n, classId: secs.length === 1 ? secs[0].id : '' }); setF({ ...f, userId: '' }); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="">— choose a class —</option>{names.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">2. Section<select value={cls.classId} disabled={!cls.name} onChange={(e) => { setCls({ ...cls, classId: e.target.value }); setF({ ...f, userId: '' }); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100">
              <option value="">— choose a section —</option>{sections.map((c) => <option key={c.id} value={c.id}>{c.section || '(no section)'} · {c.students} students</option>)}</select></label>
          </div>}
          <label className="text-sm font-medium text-slate-700">{f.kind === 'STUDENT' ? '3. Student' : 'Person (optional — or type the name)'}
            <select value={f.userId} disabled={f.kind === 'STUDENT' && !cls.classId} onChange={(e) => pickPerson(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100">
              <option value="">{f.kind === 'STUDENT' && !cls.classId ? '— choose the class and section first —' : '— choose —'}</option>{people.data?.map((p) => <option key={p.id} value={p.id}>{p.name}{p.designation ? ` · ${p.designation}` : ''}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Name shown<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700">{f.kind === 'STUDENT' ? 'Award' : 'Role'}<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} placeholder={f.kind === 'STUDENT' ? 'e.g. Reading Champion, Top in Maths' : 'e.g. Principal, Vice Principal, Teacher of the Year'} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700">Year<input value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} maxLength={20} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">{f.kind === 'STUDENT' ? 'Achievement' : 'A few words'}<textarea value={f.achievement} onChange={(e) => setF({ ...f, achievement: e.target.value })} maxLength={600} rows={2} placeholder={f.kind === 'STUDENT' ? 'e.g. Read 40 books this term and helped friends to read' : 'e.g. 20 years of caring for our children'} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        </div>
        <div><p className="mb-1 text-sm font-medium text-slate-700">Picture <span className="font-normal text-slate-500">— their own photo is used when you choose a person; or pick one:</span></p>
          <div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setF({ ...f, avatar: '' })} className={cn('h-12 rounded-xl px-3 text-xs font-semibold', !f.avatar ? 'bg-amber-200 ring-2 ring-amber-400' : 'bg-white ring-1 ring-slate-200')}>Their photo</button>
            {AV.map((a) => <button key={a} type="button" onClick={() => setF({ ...f, avatar: a })} className={cn('size-12 rounded-xl p-1', f.avatar === a ? 'bg-amber-200 ring-2 ring-amber-400' : 'bg-white ring-1 ring-slate-200')}><img src={`/avatars/${a}.webp`} alt={a} className="size-full object-contain" /></button>)}</div></div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex gap-2"><button type="button" disabled={busy || f.name.trim().length < 2} onClick={save} className="rounded-xl bg-amber-600 px-5 py-2 font-bold text-white disabled:opacity-50">{edit ? 'Save' : '🏆 Add'}</button>
          {edit && <button type="button" onClick={() => { setEdit(null); setF(blank); }} className="rounded-xl px-4 py-2 text-slate-600 hover:bg-white">Cancel</button>}</div>
      </section>
      {all.length > 0 && <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="mb-2 font-extrabold text-slate-900">In the Hall of Fame</h2>
        <ul className="divide-y divide-slate-100">{all.map((x: any) => (
          <li key={x.id} className="flex items-center gap-3 py-2"><Avatar name={x.name} photoUrl={x.picture} size={40} />
            <span className="min-w-0 flex-1"><b className="text-slate-900">{x.name}</b> <span className="text-sm text-slate-500">· {x.kind === 'LEADER' ? '🎖️' : '🌟'} {x.title}</span></span>
            <button type="button" onClick={() => { setEdit(x.id); setF({ kind: x.kind, userId: x.userId ?? '', name: x.name, title: x.title, achievement: x.achievement, year: x.year, emoji: x.emoji, avatar: x.avatar ?? '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Change"><Pencil className="size-4" /></button>
            <button type="button" onClick={() => del(x.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label="Remove"><Trash2 className="size-4" /></button></li>))}</ul></section>}
      <h2 className="pt-2 text-lg font-extrabold text-slate-900">👀 How it looks</h2>
      {q.data && <FameBoard data={q.data} />}
    </div>
  );
}
