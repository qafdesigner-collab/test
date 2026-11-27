'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { cn, PageLoader } from '@/components/ui';
import { WeekSummary } from '@/components/classroom';

/** The child's week: what they did and learned, stickers from the teacher, and what is coming next week. */
export default function ParentWeekPage() { return <Suspense fallback={<PageLoader />}><ParentWeek /></Suspense>; }

function ParentWeek() {
  const { t } = useT(); const params = useSearchParams();
  const kids = useQuery({ queryKey: ['weekKids'], queryFn: () => api.get<any[]>('/parent/week/children') });
  const [sel, setSel] = useState(params.get('student') ?? '');
  useEffect(() => { if (!sel && kids.data?.length) setSel(kids.data[0].id); }, [kids.data, sel]);
  if (!kids.data) return <PageLoader />;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">📅 {t('This week')}</h1>
      {kids.data.length > 1 && <div className="flex flex-wrap gap-2">{kids.data.map((k) => (
        <button key={k.id} type="button" onClick={() => setSel(k.id)} className={cn('rounded-2xl border px-4 py-2 font-semibold', sel === k.id ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-white')}>{k.name}</button>))}</div>}
      {sel && <WeekSummary studentId={sel} />}
      <p className="text-xs text-slate-500">{t('Every Friday you also get this summary as a notification (and by email when the school has email switched on).')}</p>
    </div>
  );
}
