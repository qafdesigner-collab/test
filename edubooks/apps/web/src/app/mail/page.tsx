'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { hasRole, isPublisherStaff, useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';

/** Links in notifications and emails point here; send each person to the mail page of their own portal. */
function Go() {
  const { data: me, isError } = useMe(); const router = useRouter(); const p = useSearchParams();
  useEffect(() => {
    if (isError) { router.replace(`/login?next=${encodeURIComponent(`/mail?${p.toString()}`)}`); return; }
    if (!me) return;
    const base = isPublisherStaff(me) ? '/admin' : hasRole(me, 'SCHOOL_ADMIN') ? '/school' : hasRole(me, 'TEACHER') ? '/teacher' : hasRole(me, 'STUDENT') ? '/learn' : '/parent';
    router.replace(`${base}/mail${p.toString() ? `?${p.toString()}` : ''}`);
  }, [me, isError, router, p]);
  return <PageLoader />;
}
export default function MailRedirect() { return <Suspense fallback={<PageLoader />}><Go /></Suspense>; }
