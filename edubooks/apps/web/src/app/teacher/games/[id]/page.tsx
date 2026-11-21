'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useMe } from '@/lib/session';
import { Button, Confirm, ErrorBox, PageLoader, Tabs } from '@/components/ui';
import { EMPTY_CONTENT, GameDraft, GameEditor } from '@/components/games/editor';
import { GamePlayer } from '@/components/games/player';

export default function TeacherGame({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const isNew = id === 'new'; const router = useRouter(); const { data: me } = useMe();
  const q = useQuery({ queryKey: ['teacherGame', id], queryFn: () => api.get(`/teacher/games/${id}`), enabled: !isNew });
  const [tab, setTab] = useState<'play' | 'edit'>('play'); const [del, setDel] = useState(false);
  const save = useAction((g: GameDraft) => {
    const body = { engine: g.engine, title: g.title, instructions: g.instructions, difficulty: g.difficulty, editionId: g.editionId, lessonId: g.lessonId, content: g.content };
    return isNew ? api.post('/teacher/games', body) : api.patch(`/teacher/games/${id}`, body);
  }, { ok: 'Game saved', keys: ['teacherGames', 'teacherGame'], after: (r) => isNew && router.replace(`/teacher/games/${r.id}`) });
  const remove = useAction(() => api.del(`/teacher/games/${id}`), { ok: 'Deleted', keys: ['teacherGames'], after: () => router.push('/teacher/games') });
  if (!isNew && q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const g = q.data; const own = isNew || g?.schoolId === me?.school?.id;
  const draft: GameDraft = isNew ? { engine: 'PICTURE_WORD', title: '', instructions: '', difficulty: 1, editionId: null, lessonId: null, content: EMPTY_CONTENT.PICTURE_WORD, published: true }
    : { id: g.id, engine: g.engine, title: g.title, instructions: g.instructions, difficulty: g.difficulty, editionId: g.editionId, lessonId: g.lessonId, content: g.content, published: g.published };
  return (
    <div className="space-y-6">
      <Link href="/teacher/games" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Games</Link>
      {isNew ? <><h1 className="text-2xl font-semibold">New game</h1><GameEditor initial={draft} onSave={(x) => save.mutate(x)} saving={save.isPending} error={save.error} /></> : (
        <>
          <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{g.title}</h1>
            {own && <Button variant="ghost" onClick={() => setDel(true)}><Trash2 className="size-4 text-red-500" />Delete</Button>}</div>
          {own && <Tabs value={tab} onChange={setTab} tabs={[{ id: 'play', label: 'Preview' }, { id: 'edit', label: 'Edit' }]} />}
          {tab === 'play' || !own ? <div className="rounded-3xl bg-amber-50 p-4 sm:p-8"><GamePlayer preview game={g} /></div>
            : <GameEditor key={g.updatedAt} initial={draft} onSave={(x) => save.mutate(x)} saving={save.isPending} error={save.error} />}
        </>
      )}
      <Confirm open={del} onOpenChange={setDel} title="Delete this game?" danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate()} body="Children's past scores for it are removed too." />
    </div>
  );
}
