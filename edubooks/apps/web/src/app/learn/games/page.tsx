'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageLoader } from '@/components/ui';
import { GameCard } from '@/components/games/cards';
import { useT } from '@/lib/i18n';

export default function LearnGames() {
  const { t } = useT();
  const q = useQuery({ queryKey: ['studentGames'], queryFn: () => api.get('/student/games') });
  if (!q.data) return <PageLoader />;
  const assigned = q.data.filter((g: any) => g.assignmentId);
  // a game shows under its book and under each collection it is in (General games, Sports)
  const COLL: Record<string, string> = { SPORTS: t('⚽ Sports'), GENERAL: t('🎲 General games') };
  const byBook = Object.entries(q.data.filter((g: any) => !g.assignmentId).reduce((m: Record<string, any[]>, g: any) => {
    const where = [...(g.bookTitle ? [g.bookTitle] : []), ...(g.categories ?? []).map((c: string) => COLL[c] ?? c)];
    for (const w of where.length ? where : [t('More games')]) (m[w] ??= []).push(g);
    return m;
  }, {}));
  return (
    <div className="space-y-10"><h1 className="text-4xl font-black text-slate-800">{t('🎮 Play & learn')}</h1>
      {!q.data.length && <p className="rounded-[2rem] bg-white p-8 text-center text-xl font-bold text-slate-500">{t('No games yet!')}</p>}
      {assigned.length > 0 && <section><h2 className="mb-4 text-2xl font-black text-pink-600">{t('💌 From your teacher')}</h2>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">{assigned.map((g: any) => <GameCard key={g.id} g={g} />)}</div></section>}
      {byBook.map(([book, games]) => <section key={book}><h2 className="mb-4 text-2xl font-black text-slate-700">{book}</h2>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">{(games as any[]).map((g) => <GameCard key={g.id} g={g} />)}</div></section>)}
    </div>
  );
}
