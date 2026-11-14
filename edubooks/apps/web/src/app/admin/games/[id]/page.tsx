'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, Confirm, ErrorBox, PageLoader } from '@/components/ui';
import { EMPTY_CONTENT, GameDraft, GameEditor } from '@/components/games/editor';
import { useSellable } from '@/components/edition-picker';

export default function AdminGame({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const isNew = id === 'new'; const router = useRouter();
  const eds = useSellable();
  const q = useQuery({ queryKey: ['libGame', id], queryFn: () => api.get(`/publishing/games/${id}`), enabled: !isNew });
  const [del, setDel] = useState(false);
  const save = useAction((g: GameDraft) => {
    const body = { engine: g.engine, title: g.title, instructions: g.instructions, difficulty: g.difficulty, editionId: g.editionId, lessonId: g.lessonId, content: g.content, published: g.published };
    return isNew ? api.post('/publishing/games', body) : api.patch(`/publishing/games/${id}`, body);
  }, { ok: 'Game saved', keys: ['libGames', 'libGame'], after: (r) => isNew && router.replace(`/admin/games/${r.id}`) });
  const remove = useAction(() => api.del(`/publishing/games/${id}`), { ok: 'Deleted', keys: ['libGames'], after: () => router.push('/admin/games') });
  if ((!isNew && q.isLoading) || !eds.data) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const g = q.data;
  const books = eds.data.map((e) => ({ editionId: e.id, title: e.packageTitle, editionLabel: e.label }));
  const draft: GameDraft = isNew ? { engine: 'ALPHABET_MATCH', title: '', instructions: '', difficulty: 1, editionId: null, lessonId: null, content: EMPTY_CONTENT.ALPHABET_MATCH, published: false }
    : { id: g.id, engine: g.engine, title: g.title, instructions: g.instructions, difficulty: g.difficulty, editionId: g.editionId, lessonId: g.lessonId, content: g.content, published: g.published };
  return (
    <div className="space-y-6">
      <Link href="/admin/games" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Game library</Link>
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{isNew ? 'New game' : g.title}</h1>{!isNew && <Button variant="ghost" onClick={() => setDel(true)}><Trash2 className="size-4 text-red-500" />Delete</Button>}</div>
      <GameEditor key={g?.updatedAt ?? 'new'} initial={draft} books={books} showPublish onSave={(x) => save.mutate(x)} saving={save.isPending} error={save.error} />
      <Confirm open={del} onOpenChange={setDel} title="Delete this game?" danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate()} body="Schools lose access to it and children's scores for it are removed." />
    </div>
  );
}
