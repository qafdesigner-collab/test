'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Dialog, ErrorBox, PageLoader, cn } from '@/components/ui';

type LiveStudent = { id: string; name: string; state: 'NOT_STARTED' | 'STARTED' | 'LIVE' | 'HANDED_IN'; startedAt: string | null; submittedAt: string | null; at: string | null;
  q: number | null; answered: number | null; cam: boolean; screen: boolean; away: number; awaySeconds: number; warnings: number };
const STATE: Record<LiveStudent['state'], [string, string]> = {
  LIVE: ['🔴 Live', 'danger'], STARTED: ['⏳ Started — no picture right now', 'DRAFT'], HANDED_IN: ['✅ Handed in', 'PUBLISHED'], NOT_STARTED: ['Not started', 'neutral'],
};
const secs = (n: number) => (n < 60 ? `${n}s` : `${Math.floor(n / 60)}m ${n % 60}s`);

/**
 * The teacher's live view of a watched test: for every student, their screen and camera (refreshed every few seconds),
 * which question they are on, and warnings. Only the newest picture is kept on the server; it is removed at hand-in.
 */
export function LiveView({ a, onClose, onOpenRecord }: { a: any; onClose: () => void; onOpenRecord: (s: { id: string; displayName: string }) => void }) {
  const q = useQuery({ queryKey: ['live', a.id], queryFn: () => api.get<{ students: LiveStudent[] }>(`/teacher/assessments/${a.id}/live`), refetchInterval: 3000 });
  const [tick, setTick] = useState(0); const [big, setBig] = useState<LiveStudent | null>(null);
  useEffect(() => { const k = setInterval(() => setTick((x) => x + 1), 3000); return () => clearInterval(k); }, []);
  const list = q.data?.students ?? [];
  const img = (s: LiveStudent, kind: 'cam' | 'screen') => `/api/teacher/assessments/${a.id}/live/${s.id}/${kind}?t=${tick}`;
  const count = (st: LiveStudent['state']) => list.filter((s) => s.state === st).length;
  const bigNow = big && list.find((s) => s.id === big.id);
  return (
    <Dialog open onOpenChange={onClose} wide title={`🔴 Live view — ${a.title}`} description="Each student's screen and camera, updated every few seconds while they answer. Click a student to see them bigger.">
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : <>
        <div className="mb-3 flex flex-wrap gap-2 text-sm"><Badge tone="danger">🔴 {count('LIVE')} live</Badge><Badge tone="DRAFT">⏳ {count('STARTED')} started</Badge>
          <Badge tone="PUBLISHED">✅ {count('HANDED_IN')} handed in</Badge><Badge>{count('NOT_STARTED')} not started</Badge></div>
        <div className="grid max-h-[65vh] grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 overflow-y-auto pe-1">
          {list.map((s) => (
            <button key={s.id} type="button" onClick={() => setBig(s)} className={cn('overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-slate-200 hover:ring-2 hover:ring-brand-400', s.warnings > 0 && 'ring-2 ring-red-300')}>
              <div className="relative aspect-video bg-slate-800">
                {s.state === 'LIVE' && s.screen && <img src={img(s, 'screen')} alt={`${s.name}'s screen`} className="size-full object-contain" />}
                {s.state === 'LIVE' && s.cam && <img src={img(s, 'cam')} alt={`${s.name}'s camera`} className={cn('object-cover', s.screen ? 'absolute bottom-1 end-1 h-1/3 rounded ring-2 ring-white' : 'size-full -scale-x-100')} />}
                {s.state !== 'LIVE' && <div className="grid size-full place-items-center text-3xl text-white/70">{s.state === 'HANDED_IN' ? '✅' : s.state === 'STARTED' ? '⏳' : '💤'}</div>}
              </div>
              <div className="space-y-1 p-2 text-xs">
                <div className="flex items-center gap-1"><b className="flex-1 truncate text-sm text-slate-900">{s.name}</b><Badge tone={STATE[s.state][1]}>{STATE[s.state][0].split(' —')[0]}</Badge></div>
                {s.state === 'LIVE' && s.q && <p className="text-slate-600">Question {s.q} of {a.items.length} · {s.answered ?? 0} answered</p>}
                {(s.away > 0 || s.warnings > 0) && <p className="flex flex-wrap gap-1">{s.away > 0 && <Badge tone={s.awaySeconds >= 30 ? 'danger' : 'DRAFT'}>↗ left {s.away}× ({secs(s.awaySeconds)})</Badge>}{s.warnings > 0 && <Badge tone="danger">⚠ {s.warnings}</Badge>}</p>}
              </div>
            </button>))}
        </div>
      </>}
      {bigNow && <Dialog open onOpenChange={() => setBig(null)} wide title={`${bigNow.name} — ${STATE[bigNow.state][0]}`}
        description={bigNow.state === 'LIVE' ? `Question ${bigNow.q ?? '?'} of ${a.items.length} · ${bigNow.answered ?? 0} answered · updated every few seconds` : undefined}>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <div className="aspect-video overflow-hidden rounded-xl bg-slate-900">{bigNow.state === 'LIVE' && bigNow.screen ? <img src={img(bigNow, 'screen')} alt="Screen" className="size-full object-contain" /> : <p className="grid size-full place-items-center text-sm text-white/70">No screen picture</p>}</div>
          <div className="aspect-video overflow-hidden rounded-xl bg-slate-900">{bigNow.state === 'LIVE' && bigNow.cam ? <img src={img(bigNow, 'cam')} alt="Camera" className="size-full -scale-x-100 object-cover" /> : <p className="grid size-full place-items-center text-sm text-white/70">No camera picture</p>}</div>
        </div>
        <div className="mt-3 flex justify-between gap-2"><Button variant="secondary" onClick={() => { onOpenRecord({ id: bigNow.id, displayName: bigNow.name }); setBig(null); }}>🗂 Saved photos and timeline</Button><Button variant="ghost" onClick={() => setBig(null)}>Back to all</Button></div>
      </Dialog>}
    </Dialog>
  );
}
