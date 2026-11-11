'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageLoader, cn } from '@/components/ui';
import { Mascot } from '@/components/games/mascot';
import { useT } from '@/lib/i18n';

export default function Me() {
  const { t, lang } = useT();
  const q = useQuery({ queryKey: ['achievements'], queryFn: () => api.get('/student/achievements') });
  const rep = useQuery({ queryKey: ['myReport'], queryFn: () => api.get('/student/report') });
  if (!q.data) return <PageLoader />;
  const a = q.data; const earned = a.badges.filter((b: any) => b.earnedAt).length;
  const week = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); const k = d.toISOString().slice(0, 10); return { k, day: d.toLocaleDateString(lang === 'ar' ? 'ar' : undefined, { weekday: lang === 'ar' ? 'short' : 'narrow' }), on: a.activeDays.includes(k) }; });
  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-black text-slate-800">{t('⭐ My Stars')}</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[2rem] bg-gradient-to-br from-amber-600 to-orange-700 p-6 text-center text-white shadow"><div className="text-6xl font-black">{a.stars}</div><div className="text-xl font-black">{t('stars')}</div></div>
        <div className="rounded-[2rem] bg-gradient-to-br from-pink-600 to-rose-700 p-6 text-center text-white shadow"><div className="text-6xl font-black">{earned}</div><div className="text-xl font-black">{t('badges')}</div></div>
        <div className="rounded-[2rem] bg-gradient-to-br from-orange-600 to-red-700 p-6 text-center text-white shadow"><div className="text-6xl font-black">🔥 {a.streak}</div><div className="text-xl font-black">{t('days in a row')}</div></div>
      </div>
      <section className="rounded-[2rem] bg-white p-6 shadow-sm"><h2 className="mb-4 text-2xl font-black">{t('📅 This week')}</h2>
        <div className="flex justify-between gap-2">{week.map((d) => <div key={d.k} className="flex flex-col items-center gap-1"><span className={cn('grid size-12 place-items-center rounded-full text-2xl', d.on ? 'bg-emerald-400' : 'bg-slate-100')}>{d.on ? '⭐' : ''}</span><span className="font-black text-slate-500">{d.day}</span></div>)}</div></section>
      <section><h2 className="mb-4 text-2xl font-black text-slate-800">{t('🏅 Badges')}</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">{a.badges.map((b: any) => (
          <div key={b.key} className={cn('rounded-[2rem] p-4 text-center shadow-sm', b.earnedAt ? 'bg-white' : 'bg-white/50')}>
            <div className={cn('text-5xl', !b.earnedAt && 'opacity-25 grayscale')}>{b.earnedAt ? b.emoji : '🔒'}</div>
            <div className="mt-1 font-black text-slate-700">{t(b.label)}</div><div className="text-xs font-bold text-slate-500">{t(b.hint)}</div></div>))}</div></section>
      <section><h2 className="mb-4 text-2xl font-black text-slate-800">{t('📈 My progress')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">{a.books.map((b: any) => {
          const pct = b.pages ? Math.min(100, Math.round((b.pagesRead / b.pages) * 100)) : 0;
          return <div key={b.editionId} className="rounded-[2rem] bg-white p-5 shadow-sm"><div className="mb-2 flex items-center gap-2 text-xl font-black text-slate-800"><span aria-hidden className="size-4 shrink-0 rounded-full" style={{ background: b.coverColor }} />{b.title}</div>
            <div className="mb-1 flex justify-between text-sm font-bold text-slate-500"><span>{t('📖 Pages read')}</span><span>{pct}%</span></div>
            <div className="mb-3 h-4 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.coverColor }} /></div>
            <div className="flex gap-4 text-sm font-bold text-slate-600"><span>{t('🎮 {n} games', { n: b.plays })}</span><span>{t('📝 {n} homework', { n: b.homework })}</span></div></div>;
        })}</div></section>
      {rep.data?.exams?.length > 0 && <section><h2 className="mb-4 text-2xl font-black text-slate-800">{t('📝 Exam results')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">{rep.data.exams.map((x: any) => <div key={x.id} className="flex items-center justify-between rounded-[2rem] bg-white p-4 shadow-sm">
          <div><b className="text-lg">{x.title}</b><div className="text-sm font-bold text-slate-500">{[x.subject, x.term].filter(Boolean).join(' · ')}</div></div>
          <span className="rounded-full bg-violet-100 px-4 py-2 text-xl font-black text-violet-800">{x.absent ? t('Absent') : `${x.marks} / ${x.total}`}</span></div>)}</div></section>}
      {rep.data?.evaluations?.length > 0 && <section><h2 className="mb-4 text-2xl font-black text-slate-800">{t('🌈 What my teacher says')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">{rep.data.evaluations.map((e: any) => <div key={e.id} className="rounded-[2rem] bg-white p-4 shadow-sm"><div className="flex justify-between"><b className="text-lg">{e.skill}</b><span className="text-xl text-amber-400">{'★'.repeat(e.rating)}<span className="text-slate-200">{'★'.repeat(5 - e.rating)}</span></span></div>{e.remarks && <p className="text-slate-600">{e.remarks}</p>}</div>)}</div></section>}
      {!a.stars && <Mascot say={t('Play a game or finish your homework to collect stars!')} />}
    </div>
  );
}
