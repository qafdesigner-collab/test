'use client';
import { use } from 'react';
import { CompetitionDetail } from '@/components/competitions';

export default function Competition({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CompetitionDetail id={id} back="/parent/competitions" />;
}
