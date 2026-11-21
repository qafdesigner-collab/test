'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { className } from '@/lib/lms';
import { PageHeader } from '@/components/common';
import { Card, ErrorBox, Input, PageLoader, cn } from '@/components/ui';
import { AttendanceWorkspace } from '@/components/attendance';

const today = () => new Date().toISOString().slice(0, 10);

export default function SchoolAttendance() {
  const [day, setDay] = useState(today());
  const q = useQuery({ queryKey: ['attendance', 'school', day], queryFn: () => api.get<any>(`/attendance/school?day=${day}`) });
  const classes = useQuery({ queryKey: ['classes', 'all'], queryFn: () => api.get<any[]>('/classes') });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data || !classes.data) return <PageLoader />;
  const t = q.data.totals; const rate = t.marked ? Math.round(((t.present + t.late) / t.marked) * 100) : null;
  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" sub="Who is in school, and which classes still need to take the register.">
        <label className="text-sm text-slate-700">Day<Input type="date" max={today()} className="mt-1 h-9" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[['Attendance', rate === null ? '—' : `${rate}%`, `${t.present + t.late} of ${t.marked} marked`], ['Absent', t.absent, `${t.excused} excused`], ['Late', t.late, 'counted as attended'],
          ['Registers not taken', t.unmarkedClasses, `of ${q.data.classes.filter((c: any) => c.students).length} classes with students`]].map(([l, v, s]) => (
          <Card key={l as string} className="p-5"><div className="text-sm text-slate-600">{l}</div><div className="mt-2 text-2xl font-semibold text-slate-900">{v}</div><div className="mt-1 text-xs text-slate-600">{s}</div></Card>))}
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">Classes</div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">Class</th><th className="px-4 py-2">Students</th><th className="px-4 py-2">Present</th><th className="px-4 py-2">Late</th><th className="px-4 py-2">Absent</th><th className="px-4 py-2">Excused</th><th className="px-4 py-2">Register</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{q.data.classes.map((c: any) => (
            <tr key={c.id}><td className="px-4 py-2 font-medium">{className(c)}</td><td className="px-4 py-2">{c.students}</td><td className="px-4 py-2">{c.present}</td><td className="px-4 py-2">{c.late}</td>
              <td className={cn('px-4 py-2', c.absent && 'font-semibold text-red-700')}>{c.absent}</td><td className="px-4 py-2">{c.excused}</td>
              <td className="px-4 py-2">{!c.students ? <span className="text-slate-500">—</span> : c.marked ? <span className="text-emerald-700">✓ taken</span> : <span className="font-medium text-amber-700">Not taken</span>}</td></tr>))}</tbody>
        </table></div>
      </Card>
      <h2 className="text-lg font-semibold text-slate-900">Take or correct a register</h2>
      <AttendanceWorkspace classes={classes.data.map((c) => ({ id: c.id, label: `${className(c)} · ${c.academicYear}` }))} />
    </div>
  );
}
