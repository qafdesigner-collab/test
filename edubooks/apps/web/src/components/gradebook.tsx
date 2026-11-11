'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Plus } from 'lucide-react';
import { api, downloadCsv } from '@/lib/api';
import { className } from '@/lib/lms';
import { Card, ErrorBox, PageLoader } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { StudentReportDialog } from '@/components/student-report';
import { GameReport } from '@/components/game-report';

export function Gradebook({ classId, back }: { classId: string; back: string }) {
  const q = useQuery({ queryKey: ['gradebook', classId], queryFn: () => api.get(`/teacher/classes/${classId}/gradebook`) });
  const [student, setStudent] = useState<string | null>(null);
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const g = q.data;
  const exportCsv = () => downloadCsv(`gradebook-${className(g.class)}.csv`, g.students.map((s: any) => ({
    student: s.displayName, username: s.username, ...Object.fromEntries(g.columns.map((c: any, i: number) => [`${c.title} (/${c.max})`, s.cells[i]?.score ?? (s.cells[i] ? 'to mark' : '')])),
    overall: s.percent === null ? '' : `${s.percent}%`, missing: s.missing, pagesRead: s.pagesRead })));
  const tone = (p: number | null) => (p === null ? 'text-slate-500' : p >= 80 ? 'text-emerald-700' : p >= 50 ? 'text-amber-700' : 'text-red-600');
  return (
    <div className="space-y-6">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Back</Link>
      <PageHeader title={`${className(g.class)} — gradebook`} sub="Click a student for their report card and skill evaluations.">
        {back.startsWith('/teacher') && <Link href={`/teacher/assessments/new?classId=${classId}`} className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50"><Plus className="size-4" />Homework</Link>}
        <button onClick={exportCsv} className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"><Download className="size-4" />Export CSV</button>
      </PageHeader>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="sticky left-0 bg-slate-50 px-4 py-3">Student</th>
            {g.columns.map((c: any) => <th key={c.id} className="min-w-28 px-3 py-3 font-medium" title={c.lesson ?? ''}><div className="truncate">{c.title}</div><div className="font-normal text-slate-500">/{c.max} · avg {c.average ?? '—'}%</div></th>)}
            <th className="px-3 py-3">Overall</th><th className="px-3 py-3">Missing</th><th className="px-3 py-3">Pages read</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{g.students.map((s: any) => (
            <tr key={s.id} className="hover:bg-slate-50"><td className="sticky left-0 bg-white px-4 py-2"><button className="font-medium text-brand-700 hover:underline" onClick={() => setStudent(s.id)}>{s.displayName}</button></td>
              {s.cells.map((c: any, i: number) => <td key={i} className="px-3 py-2 tabular-nums">{c ? (c.score ?? <span className="text-amber-600">to mark</span>) : <span className="text-slate-500">—</span>}</td>)}
              <td className={`px-3 py-2 font-semibold ${tone(s.percent)}`}>{s.percent === null ? '—' : `${s.percent}%`}</td><td className="px-3 py-2">{s.missing || ''}</td><td className="px-3 py-2">{s.pagesRead}</td></tr>))}</tbody>
        </table>
        {!g.students.length && <p className="p-6 text-center text-sm text-slate-500">No students enrolled.</p>}
      </Card>
      <GameReport classId={classId} teacher={back.startsWith('/teacher')} />
      {student && <StudentReportDialog studentId={student} classId={classId} onClose={() => setStudent(null)} />}
    </div>
  );
}
