'use client';
import Link from 'next/link';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ErrorBox, PageLoader } from '@/components/ui';
import { WeeklyPlanEditor } from '@/components/weekly-plan';

export default function WeeklyPlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const isNew = id === 'new'; const router = useRouter();
  const q = useQuery({ queryKey: ['weeklyPlan', id], queryFn: () => api.get<any>(`/teacher/weekly-plans/${id}`), enabled: !isNew });
  if (!isNew && q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const del = async () => { if (!confirm('Delete this weekly plan?')) return; await api.del(`/teacher/weekly-plans/${id}`); router.push('/teacher/plans/weekly'); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><Link href="/teacher/plans/weekly" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Weekly plans</Link>
        {!isNew && <button type="button" onClick={del} className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"><Trash2 className="size-4" />Delete</button>}</div>
      <h1 className="text-2xl font-extrabold text-slate-900">🗓️ {isNew ? 'New weekly plan' : q.data?.title || 'Weekly plan'}</h1>
      <WeeklyPlanEditor key={q.data?.updatedAt ?? 'new'} plan={isNew ? null : q.data} />
    </div>
  );
}
