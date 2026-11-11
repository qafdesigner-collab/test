'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { api, fmtDay } from '@/lib/api';
import { className, KIND_LABEL, useMyClasses } from '@/lib/lms';
import { Badge, EmptyState, PageLoader, Select } from '@/components/ui';
import { PageHeader, SeatBar, Status, Table, Td } from '@/components/common';

export default function Assessments() {
  const classes = useMyClasses();
  const [f, setF] = useState({ classId: '', status: '' });
  const q = useQuery({ queryKey: ['assessments', f], queryFn: () => api.get(`/teacher/assessments?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`) });
  return (
    <div className="space-y-6">
      <PageHeader title="Homework & tests" sub="Create homework, quizzes and tests for your classes. Objective questions are marked automatically.">
        <Link href="/teacher/assessments/new" className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"><Plus className="size-4" />New</Link>
      </PageHeader>
      <div className="flex gap-3">
        <Select className="w-48" aria-label="Class" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}><option value="">All my classes</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select>
        <Select className="w-40" aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Any status</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="CLOSED">Closed</option></Select>
      </div>
      {!q.data ? <PageLoader /> : !q.data.length ? <EmptyState icon={<ClipboardList className="size-10" />} title="Nothing here yet" /> : (
        <Table head={['Title', 'Class', 'Book', 'Due', 'Handed in', 'Status']}>
          {q.data.map((a: any) => (
            <tr key={a.id} className="hover:bg-slate-50">
              <Td><Link href={`/teacher/assessments/${a.id}`} className="font-medium hover:text-brand-700">{a.title}</Link><div className="text-xs text-slate-500">{KIND_LABEL[a.kind]} · {a.items} questions · {a.maxScore} pts</div></Td>
              <Td>{a.className}</Td><Td className="text-slate-600">{a.bookTitle ?? '—'}</Td><Td className="text-slate-500">{a.dueAt ? fmtDay(a.dueAt) : '—'}</Td>
              <Td className="min-w-40">{a.status === 'DRAFT' ? <span className="text-xs text-slate-500">not published</span> : <><SeatBar assigned={a.submitted} total={a.assigned} />{a.toGrade > 0 && <Badge tone="DRAFT" className="mt-1">{a.toGrade} to mark</Badge>}</>}</Td>
              <Td><Status s={a.status} /></Td>
            </tr>))}
        </Table>
      )}
    </div>
  );
}
