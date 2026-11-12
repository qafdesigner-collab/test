'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, daysLeft } from '@/lib/api';
import { useMe } from '@/lib/session';
import { PageLoader, cn } from '@/components/ui';
import { Mascot } from '@/components/games/mascot';
import { GameCard } from '@/components/games/cards';
import { UpcomingEvents } from '@/components/calendar';
import { Announcements, LiveLessons } from '@/components/messaging';
import { LiveBoards } from '@/components/whiteboard';
import { Book3D, Shelf, StarPath, levelOf } from '@/components/kid-ui';
import { useT } from '@/lib/i18n';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export default function LearnHome() {
  const { data: me } = useMe(); const { t } = useT();
  const q = useQuery({ queryKey: ['studentHome'], queryFn: () => api.get<any>('/student/home') });
  const lib = useQuery({ queryKey: ['library'], queryFn: () => api.get<any[]>('/library') });
  if (!q.data) return <PageLoader />;
  const h = q.data; const first = me?.displayName.split(' ')[0];
  const tip = h.homework.length ? t('You have {n} homework to do!', { n: h.homework.length }) : h.continueReading ? t("Let's read {title}!", { title: h.continueReading.title }) : t("Let's play and learn!");
  const lv = levelOf(h.stars ?? 0); const today = h.today ?? { reading: 0, games: 0, homework: 0 };
  const goals = [
    { done: today.reading > 0, emoji: '📖', label: t('Read a page'), href: h.continueReading ? `/read/${h.continueReading.editionId}` : '/learn/books', color: 'from-[#5fb0e6] to-[#3a86c9]' },
    { done: today.games > 0, emoji: '🎮', label: t('Play a game'), href: '/learn/games', color: 'from-[#4fbf92] to-[#2c9a6c]' },
    { done: today.homework > 0 || !h.homework.length, emoji: '✏️', label: t('Do homework'), href: h.homework[0] ? `/homework/${h.homework[0].id}` : '/learn', color: 'from-[#ea8db0] to-[#cf5f8c]' },
  ];
  const doneCount = goals.filter((g) => g.done).length;
  const cr = h.continueReading;
  return (
    <div className="space-y-10">
      <h1 className="sr-only">{t('Home')}</h1>
      {/* hero */}
      <section className="kid-rise relative overflow-hidden rounded-[2.5rem] bg-[linear-gradient(125deg,#6f5fd6_0%,#9a62cc_50%,#d8789f_100%)] p-6 text-white shadow-[0_24px_50px_-24px_rgba(90,70,170,.6)] sm:p-8">
        <span aria-hidden className="absolute -right-10 -top-10 size-48 rounded-full bg-white/10" /><span aria-hidden className="absolute bottom-[-4rem] left-1/3 size-56 rounded-full bg-white/10" />
        <div className="relative grid items-center gap-6 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="rounded-full bg-white/15 p-2"><Mascot size={110} /></div>
            <div><p className="text-lg font-bold text-white/90">{t(greet())},</p><p className="text-4xl font-black drop-shadow sm:text-5xl">{first}! 👋</p>
              <p className="mt-2 max-w-md text-lg font-bold text-white/95">{tip}</p></div>
          </div>
          <div className="flex gap-3">
            <div className="rounded-3xl bg-white/15 px-5 py-3 text-center backdrop-blur"><div className="text-3xl font-black">⭐ {h.stars}</div><div className="text-xs font-bold uppercase tracking-wide text-white/85">{t('stars')}</div></div>
            <div className="rounded-3xl bg-white/15 px-5 py-3 text-center backdrop-blur"><div className="text-3xl font-black">🔥 {h.streak}</div><div className="text-xs font-bold uppercase tracking-wide text-white/85">{t('days in a row')}</div></div>
            <div className="rounded-3xl bg-white/15 px-5 py-3 text-center backdrop-blur"><div className="text-3xl font-black">🏆 {lv.level}</div><div className="text-xs font-bold uppercase tracking-wide text-white/85">{t('Level {n}', { n: lv.level })}</div></div>
          </div>
        </div>
        {/* today's goals */}
        <div className="relative mt-6 rounded-3xl bg-white/15 p-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between"><p className="text-lg font-black">🎯 {t("Today's goals")}</p><p className="font-black">{doneCount} / 3 {doneCount === 3 ? '🎉' : ''}</p></div>
          <div className="grid gap-3 sm:grid-cols-3">{goals.map((g) => (
            <Link key={g.label} href={g.href} className={cn('flex items-center gap-3 rounded-2xl p-3 font-black shadow-[0_5px_0_rgba(0,0,0,.15)] transition hover:-translate-y-0.5', g.done ? 'bg-white text-emerald-700' : `bg-gradient-to-br ${g.color} text-white`)}>
              <span className="grid size-11 place-items-center rounded-xl bg-white/25 text-2xl">{g.done ? '✅' : g.emoji}</span><span className="text-lg">{g.label}</span></Link>))}</div>
        </div>
      </section>

      <LiveBoards />

      <StarPath stars={h.stars ?? 0} />

      <LiveLessons playful />

      {cr && (
        <Link href={`/read/${cr.editionId}?component=${cr.componentId}&page=${cr.page}`} className="kid-rise group flex flex-col items-center gap-6 rounded-[2.5rem] bg-white/90 p-6 shadow-lg ring-4 ring-white sm:flex-row" style={{ animationDelay: '.1s' }}>
          <Book3D url={cr.coverUrl} color={cr.coverColor} title={cr.title} className="w-32 shrink-0 sm:w-36" />
          <span className="flex-1 text-center sm:text-start"><span className="block text-sm font-black uppercase tracking-wide text-violet-600">{t('Continue reading')}</span>
            <span className="block text-3xl font-black text-slate-800">{cr.title}</span><span className="font-bold text-slate-600">{cr.part} · {t('page {n}', { n: cr.page })}</span>
            {cr.pageCount && <span className="mt-3 block h-4 overflow-hidden rounded-full bg-slate-100"><span className="relative block h-full overflow-hidden rounded-full bg-gradient-to-r from-violet-500 to-pink-500" style={{ width: `${Math.min(100, (cr.page / cr.pageCount) * 100)}%` }}><span className="absolute inset-y-0 w-1/3 bg-white/40 motion-safe:animate-[shine_2.5s_ease-in-out_infinite]" /></span></span>}</span>
          <span className="rounded-full bg-gradient-to-r from-[#7a66d8] to-[#d3709c] px-8 py-4 text-2xl font-black text-white shadow-[0_6px_0_#5a49b5] transition group-hover:-translate-y-0.5">{t('Read ▶')}</span>
        </Link>
      )}

      {(lib.data?.length ?? 0) > 0 && <section className="kid-rise" style={{ animationDelay: '.15s' }}>
        <div className="mb-3 flex items-end justify-between"><h2 className="text-3xl font-black text-slate-800">📚 {t('My bookshelf')}</h2><Link href="/learn/books" className="text-lg font-black text-violet-700">{t('See all ▶')}</Link></div>
        <div className="flex items-end gap-6 overflow-x-auto px-3 pb-1 pt-4">{lib.data!.slice(0, 8).map((b) => (
          <Link key={b.editionId} href={`/read/${b.editionId}`} className="group shrink-0" title={b.title}><Book3D url={b.coverUrl} color={b.coverColor} title={b.title} className="w-24 sm:w-28" /></Link>))}</div>
        <Shelf />
      </section>}

      <section className="kid-rise" style={{ animationDelay: '.2s' }}><h2 className="mb-4 text-3xl font-black text-slate-800">{t("📝 Today's homework")}</h2>
        {!h.homework.length ? <p className="rounded-[2rem] bg-white/90 p-6 text-center text-xl font-bold text-emerald-700 shadow-sm">{t('All done! 🎉')}</p> : (
          <div className="grid gap-4 sm:grid-cols-2">{h.homework.map((w: any) => (
            <Link key={w.id} href={`/homework/${w.id}`} className="flex items-center gap-4 rounded-[2rem] bg-white p-5 shadow-sm ring-4 ring-white transition hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none">
              <span className="grid size-16 shrink-0 place-items-center rounded-3xl text-3xl shadow-inner" style={{ background: w.coverColor ?? '#f472b6' }}>✏️</span>
              <span className="flex-1"><span className="block text-xl font-black">{w.title}</span><span className="text-sm font-bold text-slate-500">{t('{n} questions', { n: w.items })}{w.dueAt && ` · ${daysLeft(w.dueAt) <= 0 ? t('due today!') : t('{n} days left', { n: daysLeft(w.dueAt) })}`}</span></span>
              <span className="rounded-full bg-[#d4618e] px-5 py-3 text-lg font-black text-white shadow-[0_5px_0_#a8466f]">{t('Start')}</span></Link>))}</div>
        )}</section>

      <Announcements playful limit={3} />
      <UpcomingEvents playful limit={4} days={60} />

      {h.games.length > 0 && <section><div className="mb-4 flex items-end justify-between"><h2 className="text-3xl font-black text-slate-800">{t('🎮 Play & learn')}</h2><Link href="/learn/games" className="text-lg font-black text-emerald-700">{t('See all ▶')}</Link></div>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">{h.games.slice(0, 4).map((g: any) => <GameCard key={g.id} g={g} />)}</div></section>}

      {h.badges.length > 0 && <section><h2 className="mb-4 text-3xl font-black text-slate-800">{t('🏅 My newest badges')}</h2>
        <div className="flex flex-wrap gap-4">{h.badges.map((b: any) => <Link href="/learn/me" key={b.key} className="rounded-[2rem] bg-white px-6 py-4 text-center shadow-sm transition hover:-rotate-3 hover:scale-105"><div className="text-5xl motion-safe:animate-[float-y_4s_ease-in-out_infinite]">{b.emoji}</div><div className="font-black text-slate-700">{t(b.label)}</div></Link>)}</div></section>}
    </div>
  );
}
