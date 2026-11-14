'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StaffMessages } from '@/components/messages-page';
import { className } from '@/lib/lms';

export default function Page() {
  const q = useQuery({ queryKey: ['classes', 'all'], queryFn: () => api.get<any[]>('/classes') });
  return <StaffMessages admin classes={q.data?.map((c) => ({ id: c.id, label: `${className(c)} · ${c.academicYear}` }))} />;
}
