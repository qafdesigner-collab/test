'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui';
import { ENGINE_INFO, Engine } from '@/components/games/engines';

/** Students × assigned games: best stars and number of plays. */
export function GameReport({ classId, teacher }: { classId: string; teacher?: boolean }) {
  const q = useQuery({ queryKey: ['gameReport', classId], queryFn: () => api.get(`/teacher/classes/${classId}/games`) });
  if (!q.data) return null;
  const r = q.data;
  return (
    <Card className="overflow-x-auto">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="font-semibold">🎮 Games</h2>{teacher && <Link href="/teacher/games" className="text-sm text-brand-600 hover:underline">Assign games</Link>}</div>
      {!r.games.length ? <p className="p-5 text-sm text-slate-500">No games assigned to this class yet.</p> : (
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-2">Student</th>
          {r.games.map((g: any) => <th key={g.assignmentId} className="px-3 py-2 font-medium">{ENGINE_INFO[g.engine as Engine].icon} {g.title}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{r.students.map((s: any) => (
            <tr key={s.id}><td className="px-4 py-2 font-medium">{s.displayName}</td>{s.cells.map((c: any, i: number) => (
              <td key={i} className="px-3 py-2">{c ? <span title={`${c.plays} play(s)`}>{'⭐'.repeat(c.best)}<span className="opacity-20">{'⭐'.repeat(3 - c.best)}</span> <span className="text-xs text-slate-400">×{c.plays}</span></span> : <span className="text-slate-300">not played</span>}</td>))}</tr>))}</tbody></table>
      )}
    </Card>
  );
}
