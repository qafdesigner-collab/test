'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { className } from '@/lib/lms';
import { PageHeader } from '@/components/common';
import { ClassInsights, SchoolInsights } from '@/components/insights';

export default function Page() {
  const classes = useQuery({ queryKey: ['classes', 'all'], queryFn: () => api.get<any[]>('/classes') });
  const [cls, setCls] = useState('');
  return (
    <div className="space-y-6">
      <PageHeader title="Insights" sub="How each class is doing and how much the school uses its books." />
      <SchoolInsights />
      <div className="flex flex-wrap items-center gap-3 pt-2"><h2 className="text-lg font-semibold text-slate-900">One class in detail</h2>
        <select aria-label="Class" className="focus-ring h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">Choose a class…</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)} · {c.academicYear}</option>)}</select></div>
      {cls && <ClassInsights key={cls} classId={cls} />}
    </div>
  );
}
