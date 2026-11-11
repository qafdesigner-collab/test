'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gamepad2, Plus, Send, X } from 'lucide-react';
import { api, fmtDay } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { className, useMyBooks, useMyClasses } from '@/lib/lms';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageLoader, Select } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { ENGINE_INFO, Engine } from '@/components/games/engines';

export default function TeacherGames() {
  const books = useMyBooks(); const classes = useMyClasses();
  const [editionId, setEditionId] = useState('');
  const q = useQuery({ queryKey: ['teacherGames', editionId], queryFn: () => api.get(`/teacher/games${editionId ? `?editionId=${editionId}` : ''}`) });
  const [assign, setAssign] = useState<any>(null);
  const unassign = useAction((id: string) => api.del(`/teacher/game-assignments/${id}`), { ok: 'Removed from the class', keys: ['teacherGames'] });
  const cls = (id: string) => classes.data?.find((c) => c.id === id);
  return (
    <div className="space-y-6">
      <PageHeader title="Games" sub="Learning games from your books and your own. Assign them to a class — children earn stars, and you see their progress in the class report.">
        <Link href="/teacher/games/new" className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"><Plus className="size-4" />New game</Link>
      </PageHeader>
      <Select className="w-64" aria-label="Book" value={editionId} onChange={(e) => setEditionId(e.target.value)}><option value="">All my books</option>{books.data?.map((b) => <option key={b.editionId} value={b.editionId}>{b.title}</option>)}</Select>
      {!q.data ? <PageLoader /> : !q.data.length ? <EmptyState icon={<Gamepad2 className="size-10" />} title="No games yet" /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{q.data.map((g: any) => {
          const info = ENGINE_INFO[g.engine as Engine];
          return (
            <Card key={g.id} className="flex flex-col p-4">
              <div className="flex items-start gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: `${info.color}22` }}>{info.icon}</span>
                <div className="min-w-0 flex-1"><div className="font-semibold">{g.title}</div><div className="text-xs text-slate-500">{info.label}{g.bookTitle && ` · ${g.bookTitle}`}</div>
                  {g.lesson && <div className="truncate text-xs text-slate-400">{g.lesson}</div>}</div>
                {g.own ? <Badge tone="info">Our school</Badge> : <Badge>Publisher</Badge>}</div>
              <div className="mt-3 flex flex-wrap gap-1">{g.assignments.map((a: any) => (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">{cls(a.classId) ? className(cls(a.classId)!) : 'Class'}{a.dueAt && ` · ${fmtDay(a.dueAt)}`}
                  <button aria-label="Unassign" onClick={() => unassign.mutate(a.id)}><X className="size-3" /></button></span>))}</div>
              <div className="mt-auto flex gap-2 pt-4">
                <Link href={`/teacher/games/${g.id}`} className="focus-ring inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50">{g.own ? 'Edit / preview' : 'Preview'}</Link>
                <Button size="sm" onClick={() => setAssign(g)}><Send className="size-4" />Assign</Button></div>
            </Card>);
        })}</div>
      )}
      {assign && <AssignDialog game={assign} onClose={() => setAssign(null)} />}
    </div>
  );
}

function AssignDialog({ game, onClose }: { game: any; onClose: () => void }) {
  const classes = useMyClasses(); const [f, setF] = useState({ classId: '', dueAt: '' });
  const m = useAction(() => api.post(`/teacher/games/${game.id}/assign`, { classId: f.classId, dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null }), { ok: 'Assigned — it appears in “From your teacher”', keys: ['teacherGames'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title={`Assign “${game.title}”`}>
      <div className="space-y-4">
        <Field label="Class"><Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}><option value="">Select…</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></Field>
        <Field label="Play by (optional)"><Input type="date" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></Field>
        {!game.own && <p className="text-xs text-slate-500">Only children with a licence for this book can open it.</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!f.classId} loading={m.isPending} onClick={() => m.mutate()}>Assign</Button></div>
      </div>
    </Dialog>
  );
}
