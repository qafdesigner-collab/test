'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { homeFor, useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';

export default function Home() {
  const { data, isError } = useMe();
  const router = useRouter();
  useEffect(() => { if (data) router.replace(homeFor(data)); if (isError) router.replace('/login'); }, [data, isError, router]);
  return <PageLoader />;
}
