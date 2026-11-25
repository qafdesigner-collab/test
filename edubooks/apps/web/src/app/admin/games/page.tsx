'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { Gamepad2, Plus } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { Badge, EmptyState, PageLoader, Select } from '@/components/ui';
import { PageHeader, Table, Td } from '@/components/common';
import { ENGINE_INFO, Engine } from '@/components/games/engines';
import { GAME_COLLECTIONS } from '@/components/games/editor';
import { useSellable } from '@/components/edition-picker';

export default function AdminGames() {
  const eds = useSellable(); const [editionId, setEditionId] = useState(''); const [cat, setCat] = useState('');
  const q = useQuery({ queryKey: ['libGames', editionId, cat], queryFn: () => api.get(`/publishing/games?${new URLSearchParams({ ...(editionId ? { editionId } : {}), ...(cat ? { category: cat } : {}) })}`) });
  return (
    <div className="space-y-6">
      <PageHeader title="Game library" sub="Reusable learning games linked to your books and lessons. Published games appear for every school licensed for the book — and for every school when they are in a collection (General games, Sports).">
        <StarterButton />
        <Link href="/admin/games/new" className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"><Plus className="size-4" />New game</Link>
      </PageHeader>
      <div className="flex flex-wrap gap-2"><Select className="w-72" aria-label="Book" value={editionId} onChange={(e) => setEditionId(e.target.value)}><option value="">All books</option>{eds.data?.map((e) => <option key={e.id} value={e.id}>{e.packageTitle} · {e.label}</option>)}</Select>
        <Select className="w-56" aria-label="Collection" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All collections</option>{GAME_COLLECTIONS.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</Select></div>
      {!q.data ? <PageLoader /> : !q.data.length ? <EmptyState icon={<Gamepad2 className="size-10" />} title="No games yet" /> : (
        <Table head={['Game', 'Type', 'Book / lesson', 'Collections', 'Status', 'Updated']}>
          {q.data.map((g: any) => <tr key={g.id} className="hover:bg-slate-50">
            <Td><Link href={`/admin/games/${g.id}`} className="font-medium hover:text-brand-700">{g.title}</Link></Td><Td>{ENGINE_INFO[g.engine as Engine].icon} {ENGINE_INFO[g.engine as Engine].label}</Td>
            <Td className="text-slate-600">{g.bookTitle ?? '—'}{g.lesson && <div className="text-xs text-slate-500">{g.lesson}</div>}</Td>
            <Td>{(g.categories ?? []).length ? g.categories.map((c: string) => { const x = GAME_COLLECTIONS.find((y) => y.id === c); return <Badge key={c} tone="info">{x ? `${x.icon} ${x.label}` : c}</Badge>; }) : <span className="text-slate-400">—</span>}</Td>
            <Td>{g.published ? <Badge tone="PUBLISHED">Published</Badge> : <Badge tone="DRAFT">Draft</Badge>}</Td><Td className="text-slate-500">{fmtDate(g.updatedAt)}</Td></tr>)}
        </Table>
      )}
    </div>
  );
}

/** Adds the ready-made General games and Sports games (the ones not in the library yet). */
function StarterButton() {
  const qc = useQueryClient(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const r = await api.post<{ added: number; total: number }>('/publishing/games/starter-pack'); toast(r.added ? `${r.added} ready-made games added` : 'All ready-made games are already in your library'); qc.invalidateQueries({ queryKey: ['libGames'] }); }
    finally { setBusy(false); }
  };
  return <button type="button" onClick={go} disabled={busy} title="Penalty kick, Running race, Whack-a-mole and more — for every school"
    className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50">🎁 {busy ? 'Adding…' : 'Add ready-made games'}</button>;
}
