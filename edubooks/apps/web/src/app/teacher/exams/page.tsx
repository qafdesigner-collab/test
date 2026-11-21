'use client';
import { ExamsList } from '@/components/exams';
import { PageLoader } from '@/components/ui';
import { className, useMyClasses } from '@/lib/lms';

export default function Page() {
  const q = useMyClasses();
  return !q.data ? <PageLoader /> : <ExamsList base="/teacher/exams" classes={q.data.map((c) => ({ id: c.id, label: `${className(c)} · ${c.academicYear}` }))} />;
}
