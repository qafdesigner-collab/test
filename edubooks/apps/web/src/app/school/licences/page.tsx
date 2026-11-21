'use client';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ErrorBox, PageLoader } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { PoolsTable } from '@/components/pools';

export default function SchoolLicences() {
  const router = useRouter();
  const q = useQuery({ queryKey: ['schoolPools'], queryFn: () => api.get('/school/pools') });
  return (
    <div className="space-y-6">
      <PageHeader title="Book licences" sub="Seats your school bought. Give each student and teacher a seat to unlock the books. A bundle seat unlocks every book in the bundle." />
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <PoolsTable pools={q.data} onOpen={(p) => router.push(`/school/licences/${p.id}`)}
          action={(p) => <button onClick={() => router.push(`/school/licences/${p.id}`)} className="text-sm font-medium text-emerald-700 hover:underline">Manage</button>} />
      )}
    </div>
  );
}
