'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { EmptyState, PageLoader } from '@/components/ui';

/** The teacher's weekly lesson plans, made by hand. */
export default function WeeklyPlans() {
  const q = useQuery({ queryKey: ['weeklyPlans'], queryFn: () => api.get<any[]>('/teacher/weekly-plans') });
  return (
    <div className="space-y-6">
      <PageHeader title="Weekly plans" sub="Plan your week by hand: for each day choose the book, the part (student book, workbook, resources…), the lesson and the pages, add resources and what the class will do. Print it or keep it here.">
        <Link href="/teacher/plans" className="focus-ring inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">Lesson plans</Link>
        <Link href="/teacher/plans/weekly/new" className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"><Plus className="size-4" />New week</Link>
      </PageHeader>
      {!q.data ? <PageLoader /> : !q.data.length ? <EmptyState icon={<span className="text-4xl">🗓️</span>} title="No weekly plans yet">Press “New week” to plan your first week.</EmptyState> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{q.data.map((w) => (
          <Link key={w.id} href={`/teacher/plans/weekly/${w.id}`} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-violet-300">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-600">Week of {new Date(`${w.weekStart}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p className="mt-1 text-lg font-extrabold text-slate-900">{w.title || 'Weekly plan'}</p>
            <p className="text-sm text-slate-500">{w.className ?? 'No class'} · {w.entries} item{w.entries === 1 ? '' : 's'}</p>
          </Link>))}</div>)}
    </div>
  );
}
