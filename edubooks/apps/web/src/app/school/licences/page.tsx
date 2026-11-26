'use client';
import Link from 'next/link';
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
      <Link href="/school/licences/give" className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-violet-600 to-emerald-500 p-5 text-white shadow hover:opacity-95">
        <span className="text-4xl">🎒</span><span><b className="block text-lg">Give books by class</b><span className="text-sm text-white/90">Choose a grade and its sections — every student and teacher gets the books in one click. See seats left, and switch on automatic giving.</span></span></Link>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <PoolsTable pools={q.data} onOpen={(p) => router.push(`/school/licences/${p.id}`)}
          action={(p) => <button onClick={() => router.push(`/school/licences/${p.id}`)} className="text-sm font-medium text-emerald-700 hover:underline">Manage</button>} />
      )}
    </div>
  );
}
