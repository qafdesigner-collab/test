'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { hasRole, useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';

/** Notification links point here; send each person to their own inbox. */
function Go() {
  const { data: me, isError } = useMe(); const router = useRouter(); const q = useSearchParams().toString();
  useEffect(() => {
    if (isError) router.replace('/login'); if (!me) return;
    const base = hasRole(me, 'SCHOOL_ADMIN') ? '/school/messages' : hasRole(me, 'TEACHER') ? '/teacher/messages' : '/parent/messages';
    router.replace(q ? `${base}?${q}` : base);
  }, [me, isError, router, q]);
  return <PageLoader />;
}
export default function Page() { return <Suspense><Go /></Suspense>; }
