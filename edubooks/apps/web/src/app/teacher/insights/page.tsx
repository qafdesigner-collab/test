'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/common';
import { Card, PageLoader } from '@/components/ui';
import { ClassInsights } from '@/components/insights';
import { className, useMyClasses } from '@/lib/lms';

export default function TeacherInsights() {
  const q = useMyClasses(); const [cls, setCls] = useState('');
  const sel = cls || q.data?.[0]?.id || '';
  return (
    <div className="space-y-6">
      <PageHeader title="Insights" sub="Which students need help, which lessons to revisit, and how active your class is.">
        {q.data && q.data.length > 0 && <select aria-label="Class" className="focus-ring h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={sel} onChange={(e) => setCls(e.target.value)}>
          {q.data.map((c) => <option key={c.id} value={c.id}>{className(c)} · {c.academicYear}</option>)}</select>}
      </PageHeader>
      {!q.data ? <PageLoader /> : !sel ? <Card className="p-8 text-center text-sm text-slate-600">You have no classes yet.</Card> : <ClassInsights key={sel} classId={sel} />}
    </div>
  );
}
