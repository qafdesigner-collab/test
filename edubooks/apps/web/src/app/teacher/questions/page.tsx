'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookMarked, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { QTYPE_LABEL, useMyBooks } from '@/lib/lms';
import { Badge, Button, Card, Dialog, EmptyState, PageLoader, Select } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { BookScope } from '@/components/book-scope';
import { Item, ItemEditor, newItem } from '@/components/item-editor';

export default function QuestionBank() {
  const books = useMyBooks();
  const [f, setF] = useState({ editionId: '', type: '' });
  const q = useQuery({ queryKey: ['bank', f], queryFn: () => api.get(`/teacher/question-bank?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`) });
  const [add, setAdd] = useState(false);
  const del = useAction((id: string) => api.del(`/teacher/question-bank/${id}`), { ok: 'Deleted', keys: ['bank'] });
  return (
    <div className="space-y-6">
      <PageHeader title="Question bank" sub="Reusable questions shared by teachers at your school, organised by book and lesson."><Button onClick={() => setAdd(true)}><Plus className="size-4" />Add question</Button></PageHeader>
      <div className="flex gap-3">
        <Select className="w-56" aria-label="Book" value={f.editionId} onChange={(e) => setF({ ...f, editionId: e.target.value })}><option value="">All books</option>{books.data?.map((b) => <option key={b.editionId} value={b.editionId}>{b.title}</option>)}</Select>
        <Select className="w-48" aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">All types</option>{Object.entries(QTYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </div>
      {!q.data ? <PageLoader /> : !q.data.length ? <EmptyState icon={<BookMarked className="size-10" />} title="The bank is empty">Add questions here, then pull them into any homework or test.</EmptyState> : (
        <div className="space-y-2">{q.data.map((x: any) => (
          <Card key={x.id} className="flex items-start gap-3 p-4 text-sm">
            <div className="flex-1"><div className="font-medium">{x.prompt}</div>
              {x.type === 'MCQ' && <div className="mt-1 text-xs text-slate-500">{x.options.map((o: string, i: number) => <span key={i} className={i === x.answer[0] ? 'font-semibold text-emerald-700' : ''}>{i ? ' · ' : ''}{o}</span>)}</div>}
              {x.type === 'TRUE_FALSE' && <div className="mt-1 text-xs text-emerald-700">Answer: {x.answer[0] ? 'True' : 'False'}</div>}
              {x.type === 'FILL_BLANK' && <div className="mt-1 text-xs text-emerald-700">Accepts: {x.answer.join(', ')}</div>}
              <div className="mt-1 text-xs text-slate-400">by {x.owner}</div></div>
            <Badge>{QTYPE_LABEL[x.type]}</Badge>
            {x.mine && <button aria-label="Delete question" onClick={() => del.mutate(x.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" /></button>}
          </Card>))}</div>
      )}
      {add && <AddQuestion onClose={() => setAdd(false)} />}
    </div>
  );
}

function AddQuestion({ onClose }: { onClose: () => void }) {
  const [item, setItem] = useState<Item>(newItem()); const [scope, setScope] = useState<{ editionId: string | null; lessonId: string | null }>({ editionId: null, lessonId: null });
  const save = useAction(() => api.post('/teacher/question-bank', { ...item, answer: item.type === 'FILL_BLANK' ? item.answer.filter((x: string) => x) : item.answer, ...scope }), { ok: 'Added to the bank', keys: ['bank'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} wide title="Add to question bank">
      <div className="space-y-4"><BookScope editionId={scope.editionId} lessonId={scope.lessonId} onChange={setScope} />
        <ItemEditor item={item} index={0} onChange={setItem} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!item.prompt.trim()} onClick={() => save.mutate()}>Save</Button></div></div>
    </Dialog>
  );
}
