'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, daysLeft } from '@/lib/api';
import { useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';
import { Mascot } from '@/components/games/mascot';
import { GameCard } from '@/components/games/cards';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export default function LearnHome() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['studentHome'], queryFn: () => api.get('/student/home') });
  if (!q.data) return <PageLoader />;
  const h = q.data; const first = me?.displayName.split(' ')[0];
  const tip = h.homework.length ? `You have ${h.homework.length} homework to do!` : h.continueReading ? `Let's read ${h.continueReading.title}!` : "Let's play and learn!";
  return (
    <div className="space-y-10">
      <section className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <h1 className="sr-only">Home</h1>
        <Mascot say={`${greet()}, ${first}! ${tip}`} size={110} />
      </section>

      {h.continueReading && (
        <Link href={`/read/${h.continueReading.editionId}?component=${h.continueReading.componentId}&page=${h.continueReading.page}`}
          className="flex items-center gap-5 rounded-[2rem] p-5 text-white shadow-lg transition hover:scale-[1.02] motion-reduce:transform-none" style={{ background: `linear-gradient(135deg, ${h.continueReading.coverColor}, ${h.continueReading.coverColor}bb)` }}>
          <span className="text-6xl">📖</span>
          <span className="flex-1"><span className="block text-sm font-black uppercase tracking-wide opacity-90">Continue reading</span>
            <span className="block text-2xl font-black">{h.continueReading.title}</span><span className="font-bold opacity-90">{h.continueReading.part} · page {h.continueReading.page}</span>
            {h.continueReading.pageCount && <span className="mt-2 block h-3 overflow-hidden rounded-full bg-white/30"><span className="block h-full rounded-full bg-white" style={{ width: `${Math.min(100, (h.continueReading.page / h.continueReading.pageCount) * 100)}%` }} /></span>}</span>
          <span className="rounded-full bg-white px-5 py-3 text-xl font-black" style={{ color: h.continueReading.coverColor }}>Go ▶</span>
        </Link>
      )}

      <section><h2 className="mb-4 text-3xl font-black text-slate-800">📝 Today&apos;s homework</h2>
        {!h.homework.length ? <p className="rounded-[2rem] bg-white p-6 text-center text-xl font-bold text-slate-500 shadow-sm">All done! 🎉</p> : (
          <div className="grid gap-4 sm:grid-cols-2">{h.homework.map((w: any) => (
            <Link key={w.id} href={`/homework/${w.id}`} className="flex items-center gap-4 rounded-[2rem] bg-white p-5 shadow-sm ring-4 ring-white transition hover:scale-[1.02] motion-reduce:transform-none">
              <span className="grid size-16 shrink-0 place-items-center rounded-3xl text-3xl" style={{ background: w.coverColor ?? '#f472b6' }}>✏️</span>
              <span className="flex-1"><span className="block text-xl font-black">{w.title}</span><span className="text-sm font-bold text-slate-500">{w.items} questions{w.dueAt && ` · ${daysLeft(w.dueAt) <= 0 ? 'due today!' : `${daysLeft(w.dueAt)} days left`}`}</span></span>
              <span className="rounded-full bg-pink-600 px-5 py-3 text-lg font-black text-white">Start</span></Link>))}</div>
        )}</section>

      {h.games.length > 0 && <section><div className="mb-4 flex items-end justify-between"><h2 className="text-3xl font-black text-slate-800">🎮 Play & learn</h2><Link href="/learn/games" className="text-lg font-black text-emerald-600">See all ▶</Link></div>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">{h.games.slice(0, 4).map((g: any) => <GameCard key={g.id} g={g} />)}</div></section>}

      {h.badges.length > 0 && <section><h2 className="mb-4 text-3xl font-black text-slate-800">🏅 My newest badges</h2>
        <div className="flex flex-wrap gap-4">{h.badges.map((b: any) => <Link href="/learn/me" key={b.key} className="rounded-[2rem] bg-white px-6 py-4 text-center shadow-sm"><div className="text-5xl">{b.emoji}</div><div className="font-black text-slate-700">{b.label}</div></Link>)}</div></section>}
    </div>
  );
}
