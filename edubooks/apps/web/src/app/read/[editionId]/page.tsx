'use client';
import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { Reader } from '@/components/reader';
import { homeFor, useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';

function ReadInner({ editionId }: { editionId: string }) {
  const { data: me } = useMe(); const params = useSearchParams();
  if (!me) return <PageLoader />;
  const home = homeFor(me);
  return <Reader editionId={editionId} backHref={home === '/teacher' ? '/teacher/books' : home}
    initial={{ componentId: params.get('component') ?? undefined, page: params.get('page') ? Number(params.get('page')) : undefined }} />;
}
export default function ReadPage({ params }: { params: Promise<{ editionId: string }> }) {
  const { editionId } = use(params);
  return <Suspense fallback={<PageLoader />}><ReadInner editionId={editionId} /></Suspense>;
}
