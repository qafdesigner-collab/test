'use client';
import Link from 'next/link';
import { use } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ErrorBox, PageLoader } from '@/components/ui';
import { GamePlayer } from '@/components/games/player';

export default function PlayGame({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['game', id], queryFn: () => api.get(`/student/games/${id}`) });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <div>
      <Link href="/learn/games" className="mb-4 inline-block rounded-full bg-white px-4 py-2 font-black text-slate-600 shadow">◀ Games</Link>
      <GamePlayer game={q.data} onDone={async (score, ms) => {
        const r = await api.post(`/student/games/${id}/attempts`, { score, durationMs: ms });
        ['achievements', 'studentGames', 'studentHome'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        return r;
      }} />
    </div>
  );
}
