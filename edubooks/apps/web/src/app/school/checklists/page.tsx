'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ChecklistsList } from '@/components/checklists';
import { PageLoader } from '@/components/ui';
import { className } from '@/lib/lms';

export default function Page() {
  const q = useQuery({ queryKey: ['classes', 'all'], queryFn: () => api.get<any[]>('/classes') });
  return !q.data ? <PageLoader /> : <ChecklistsList base="/school/checklists" classes={q.data.map((c) => ({ id: c.id, label: `${className(c)} · ${c.academicYear}` }))} />;
}
