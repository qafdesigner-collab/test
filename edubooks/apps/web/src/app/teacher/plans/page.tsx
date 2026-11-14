'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { NotebookPen, Plus } from 'lucide-react';
import { api, fmtDay } from '@/lib/api';
import { Badge, EmptyState, PageLoader } from '@/components/ui';
import { PageHeader, Table, Td } from '@/components/common';

export default function Plans() {
  const q = useQuery({ queryKey: ['plans'], queryFn: () => api.get('/teacher/lesson-plans') });
  return (
    <div className="space-y-6">
      <PageHeader title="Lesson planner" sub="Plan lessons from your books. Plans are private to you; print, download or reuse them.">
        <Link href="/teacher/plans/new" className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"><Plus className="size-4" />New plan</Link>
      </PageHeader>
      {!q.data ? <PageLoader /> : !q.data.length ? <EmptyState icon={<NotebookPen className="size-10" />} title="No lesson plans yet">Start from a lesson in one of your books.</EmptyState> : (
        <Table head={['Plan', 'Book / lesson', 'Class', 'Date', 'Status']}>
          {q.data.map((p: any) => (
            <tr key={p.id} className="hover:bg-slate-50"><Td><Link href={`/teacher/plans/${p.id}`} className="font-medium hover:text-brand-700">{p.title}</Link>{p.aiGenerated && <Badge tone="info" className="ml-2">AI</Badge>}</Td>
              <Td className="text-slate-600">{p.bookTitle ?? '—'}{p.lessonTitle && <div className="text-xs text-slate-500">{p.lessonTitle}</div>}</Td><Td>{p.className ?? '—'}</Td>
              <Td className="text-slate-500">{p.planDate ? fmtDay(p.planDate) : '—'} · {p.durationMin} min</Td><Td><Badge tone={p.status === 'READY' ? 'PUBLISHED' : 'DRAFT'}>{p.status === 'READY' ? 'Ready' : 'Draft'}</Badge></Td></tr>
          ))}
        </Table>
      )}
    </div>
  );
}
