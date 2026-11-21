'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageLoader } from '@/components/ui';
import { WhiteboardViewer } from '@/components/whiteboard';
import { ContentGuard } from '@/components/content-guard';
import { useT } from '@/lib/i18n';

export default function PupilBoard() {
  const { id } = useParams<{ id: string }>(); const { t } = useT();
  const q = useQuery({ queryKey: ['whiteboard', id], queryFn: () => api.get<any>(`/whiteboards/${id}`), retry: false });
  if (q.error) return <p className="rounded-[2rem] bg-white p-8 text-center text-xl font-bold text-slate-600">{t('This whiteboard is not available.')} <Link href="/learn" className="text-violet-700 underline">{t('Home')}</Link></p>;
  if (!q.data) return <PageLoader />;
  return (
    <div className="space-y-4">
      <h1 className="text-center text-3xl font-black text-slate-800">🧑‍🏫 {q.data.title}</h1>
      <ContentGuard><WhiteboardViewer board={q.data} playful /></ContentGuard>
    </div>
  );
}
