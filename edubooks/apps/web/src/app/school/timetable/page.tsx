'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { className } from '@/lib/lms';
import { PageHeader } from '@/components/common';
import { PageLoader } from '@/components/ui';
import { BellTimesEditor, ClassTimetableEditor } from '@/components/timetable';

export default function SchoolTimetable() {
  const classes = useQuery({ queryKey: ['classes', 'all'], queryFn: () => api.get<any[]>('/classes') });
  const [cls, setCls] = useState('');
  if (!classes.data) return <PageLoader />;
  const sel = cls || classes.data[0]?.id || '';
  return (
    <div className="space-y-6">
      <PageHeader title="Timetable" sub="Set the school's bell times once, then plan each class's week. Teachers, students and parents see it in their portals." />
      <BellTimesEditor />
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold text-slate-900">Class timetable</h2>
        <select aria-label="Class" className="focus-ring h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={sel} onChange={(e) => setCls(e.target.value)}>
          {classes.data.map((c) => <option key={c.id} value={c.id}>{className(c)} · {c.academicYear}</option>)}</select></div>
      {sel ? <ClassTimetableEditor key={sel} classId={sel} /> : <p className="text-sm text-slate-600">Create a class first.</p>}
    </div>
  );
}
