'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ExamsList } from '@/components/exams';
import { PageLoader } from '@/components/ui';
import { className } from '@/lib/lms';

export default function Page() {
  const q = useQuery({ queryKey: ['classes', 'all'], queryFn: () => api.get<any[]>('/classes') });
  return !q.data ? <PageLoader /> : <ExamsList base="/school/exams" classes={q.data.map((c) => ({ id: c.id, label: `${className(c)} · ${c.academicYear}` }))} />;
}
