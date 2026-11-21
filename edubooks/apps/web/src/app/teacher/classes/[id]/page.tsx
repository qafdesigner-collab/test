'use client';
import { use } from 'react';
import { Gradebook } from '@/components/gradebook';
import { ClassGroups } from '@/components/groups';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <div className="space-y-6"><Gradebook classId={id} back="/teacher/classes" /><ClassGroups classId={id} /></div>;
}
