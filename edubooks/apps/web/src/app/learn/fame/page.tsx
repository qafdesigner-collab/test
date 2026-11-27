'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { PageLoader } from '@/components/ui';
import { FameBoard } from '@/components/fame';

export default function LearnFame() {
  const { t } = useT();
  const q = useQuery({ queryKey: ['fame'], queryFn: () => api.get<any>('/fame') });
  if (!q.data) return <PageLoader />;
  if (!q.data.visible) return <div className="rounded-3xl bg-white p-10 text-center shadow-sm"><div className="text-5xl">🏛️</div><p className="mt-2 text-slate-600">{t('The Hall of Fame is not shown right now.')}</p></div>;
  return <FameBoard data={q.data} playful />;
}
