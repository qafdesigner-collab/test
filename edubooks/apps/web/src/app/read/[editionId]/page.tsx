'use client';
import { use } from 'react';
import { Reader } from '@/components/reader';
import { homeFor, useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';

export default function ReadPage({ params }: { params: Promise<{ editionId: string }> }) {
  const { editionId } = use(params);
  const { data: me } = useMe();
  if (!me) return <PageLoader />;
  return <Reader editionId={editionId} backHref={homeFor(me) === '/teacher' ? '/teacher/books' : homeFor(me)} />;
}
