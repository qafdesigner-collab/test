'use client';
import { ChecklistsList } from '@/components/checklists';
import { PageLoader } from '@/components/ui';
import { className, useMyClasses } from '@/lib/lms';

export default function Page() {
  const q = useMyClasses();
  return !q.data ? <PageLoader /> : <ChecklistsList base="/teacher/checklists" classes={q.data.map((c) => ({ id: c.id, label: `${className(c)} · ${c.academicYear}` }))} />;
}
