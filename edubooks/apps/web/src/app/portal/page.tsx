'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { homeFor, useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';

/** Legacy entry point: forwards everyone to their portal. */
export default function Portal() {
  const { data: me, isError } = useMe(); const router = useRouter();
  useEffect(() => { if (me) router.replace(homeFor(me) === '/portal' ? '/' : homeFor(me)); if (isError) router.replace('/login'); }, [me, isError, router]);
  return <PageLoader />;
}
