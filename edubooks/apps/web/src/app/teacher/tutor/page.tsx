'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { TutorLog } from '@/components/tutor';
import { Card } from '@/components/ui';
import { className, useMyClasses } from '@/lib/lms';

export default function Page() {
  const cls = useMyClasses(); const s = useQuery({ queryKey: ['tutorSettings'], queryFn: () => api.get<any>('/tutor/settings') });
  return (
    <div className="space-y-6"><PageHeader title="Ask Owl (AI tutor)" sub="See what your students ask Owl while reading. Flagged questions may need a gentle check-in." />
      {s.data && !s.data.enabled && <Card className="p-4 text-sm text-slate-700">Ask Owl is switched off for your school. The school admin can turn it on.</Card>}
      <TutorLog classes={cls.data?.map((c) => ({ id: c.id, label: className(c) }))} /></div>
  );
}
