'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { Card, ErrorBox, PageLoader, cn } from '@/components/ui';
import { TrainingCourses } from '@/components/training';

export default function SchoolTraining() {
  const q = useQuery({ queryKey: ['training', 'school'], queryFn: () => api.get<any>('/training/school') });
  return (
    <div className="space-y-6">
      <PageHeader title="Teacher training" sub="See how far each teacher has got, and take the courses yourself." />
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">Your teachers</div>
          {!q.data.courses.length ? <p className="p-5 text-sm text-slate-600">No courses published yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">Teacher</th>{q.data.courses.map((c: any) => <th key={c.id} className="px-4 py-2 font-medium">{c.title}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{q.data.teachers.map((t: any) => (
                <tr key={t.id}><td className="px-4 py-2 font-medium">{t.displayName}</td>{q.data.courses.map((c: any) => { const d = t.progress[c.id] ?? 0; const full = d >= c.lessons;
                  return <td key={c.id} className={cn('px-4 py-2', full ? 'font-medium text-emerald-700' : d ? 'text-amber-700' : 'text-slate-500')}>{full ? '✓ Completed' : d ? `${d} of ${c.lessons}` : 'Not started'}</td>; })}</tr>))}
                {!q.data.teachers.length && <tr><td className="px-4 py-4 text-slate-600" colSpan={9}>No teachers yet.</td></tr>}</tbody>
            </table></div>)}
        </Card>)}
      <h2 className="text-lg font-semibold text-slate-900">Courses</h2>
      <TrainingCourses base="/school/training" />
    </div>
  );
}
