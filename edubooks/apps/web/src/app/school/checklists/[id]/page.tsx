'use client';
import { use } from 'react';
import { ChecklistEditor } from '@/components/checklists';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ChecklistEditor id={id} back="/school/checklists" />;
}
