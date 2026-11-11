'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gamepad2, Plus } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { Badge, EmptyState, PageLoader, Select } from '@/components/ui';
import { PageHeader, Table, Td } from '@/components/common';
import { ENGINE_INFO, Engine } from '@/components/games/engines';
import { useSellable } from '@/components/edition-picker';

export default function AdminGames() {
  const eds = useSellable(); const [editionId, setEditionId] = useState('');
  const q = useQuery({ queryKey: ['libGames', editionId], queryFn: () => api.get(`/publishing/games${editionId ? `?editionId=${editionId}` : ''}`) });
  return (
    <div className="space-y-6">
      <PageHeader title="Game library" sub="Reusable learning games linked to your books and lessons. Published games appear for every school licensed for the book.">
        <Link href="/admin/games/new" className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"><Plus className="size-4" />New game</Link>
      </PageHeader>
      <Select className="w-72" aria-label="Book" value={editionId} onChange={(e) => setEditionId(e.target.value)}><option value="">All books</option>{eds.data?.map((e) => <option key={e.id} value={e.id}>{e.packageTitle} · {e.label}</option>)}</Select>
      {!q.data ? <PageLoader /> : !q.data.length ? <EmptyState icon={<Gamepad2 className="size-10" />} title="No games yet" /> : (
        <Table head={['Game', 'Type', 'Book / lesson', 'Status', 'Updated']}>
          {q.data.map((g: any) => <tr key={g.id} className="hover:bg-slate-50">
            <Td><Link href={`/admin/games/${g.id}`} className="font-medium hover:text-brand-700">{g.title}</Link></Td><Td>{ENGINE_INFO[g.engine as Engine].icon} {ENGINE_INFO[g.engine as Engine].label}</Td>
            <Td className="text-slate-600">{g.bookTitle ?? '—'}{g.lesson && <div className="text-xs text-slate-400">{g.lesson}</div>}</Td>
            <Td>{g.published ? <Badge tone="PUBLISHED">Published</Badge> : <Badge tone="DRAFT">Draft</Badge>}</Td><Td className="text-slate-500">{fmtDate(g.updatedAt)}</Td></tr>)}
        </Table>
      )}
    </div>
  );
}
