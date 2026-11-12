'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, ErrorBox, PageLoader } from '@/components/ui';
import { WhiteboardWriter } from '@/components/whiteboard';
import { useToast } from '@/components/ui/toast';

export default function BoardPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['whiteboard', id], queryFn: () => api.get<any>(`/whiteboards/${id}`) });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const b = q.data;
  const end = async () => { if (!confirm('End the live lesson? Pupils can still look at the board, but you can no longer write on it.')) return; await api.post(`/whiteboards/${id}/end`); qc.invalidateQueries({ queryKey: ['whiteboards'] }); router.push('/teacher/whiteboard'); };
  const resume = async () => { try { await api.post(`/whiteboards/${id}/resume`); q.refetch(); } catch (e: any) { toast(e.message, 'err'); } };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/teacher/whiteboard" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Whiteboards</Link>
        <h1 className="text-xl font-semibold text-slate-900">{b.title}</h1><span className="text-sm text-slate-500">{b.className}</span>
      </div>
      {b.live ? <WhiteboardWriter board={b} onEnd={end} />
        : <Card className="flex flex-wrap items-center justify-between gap-3 p-5"><span className="text-slate-600">This whiteboard has ended. Go live again to keep writing; pupils see it on their home page.</span><Button onClick={resume}>Go live again</Button></Card>}
    </div>
  );
}
