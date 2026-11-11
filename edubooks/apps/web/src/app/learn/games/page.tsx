'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageLoader } from '@/components/ui';
import { GameCard } from '@/components/games/cards';

export default function LearnGames() {
  const q = useQuery({ queryKey: ['studentGames'], queryFn: () => api.get('/student/games') });
  if (!q.data) return <PageLoader />;
  const assigned = q.data.filter((g: any) => g.assignmentId);
  const byBook = Object.entries(q.data.filter((g: any) => !g.assignmentId).reduce((m: Record<string, any[]>, g: any) => ((m[g.bookTitle ?? 'More games'] ??= []).push(g), m), {}));
  return (
    <div className="space-y-10"><h1 className="text-4xl font-black text-slate-800">🎮 Play & learn</h1>
      {!q.data.length && <p className="rounded-[2rem] bg-white p-8 text-center text-xl font-bold text-slate-500">No games yet!</p>}
      {assigned.length > 0 && <section><h2 className="mb-4 text-2xl font-black text-pink-600">💌 From your teacher</h2>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">{assigned.map((g: any) => <GameCard key={g.id} g={g} />)}</div></section>}
      {byBook.map(([book, games]) => <section key={book}><h2 className="mb-4 text-2xl font-black text-slate-700">{book}</h2>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">{(games as any[]).map((g) => <GameCard key={g.id} g={g} />)}</div></section>)}
    </div>
  );
}
