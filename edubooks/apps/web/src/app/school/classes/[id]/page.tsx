'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, Plus, UserMinus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { className } from '@/lib/lms';
import { Button, Card, Dialog, ErrorBox, PageLoader, Select } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { StudentReportDialog } from '@/components/student-report';

export default function SchoolClass({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({ queryKey: ['class', id], queryFn: () => api.get(`/classes/${id}`) });
  const [dlg, setDlg] = useState<'' | 'enrol' | 'teachers'>(''); const [report, setReport] = useState<string | null>(null);
  const unenrol = useAction((sid: string) => api.del(`/classes/${id}/students/${sid}`), { ok: 'Removed from class', keys: ['class', 'classes'] });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const c = q.data;
  return (
    <div className="space-y-6">
      <Link href="/school/classes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Classes</Link>
      <PageHeader title={className(c)} sub={`${c.gradeName ?? ''} · ${c.academicYear}`}>
        <Link href={`/school/classes/${id}/gradebook`} className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50"><BarChart3 className="size-4" />Gradebook</Link>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card><div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="font-semibold">Students ({c.roster.length})</h2><Button size="sm" onClick={() => setDlg('enrol')}><Plus className="size-4" />Enrol</Button></div>
          <ul className="divide-y divide-slate-100">{c.roster.map((s: any) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-sm"><button className="flex-1 text-left font-medium hover:text-emerald-700" onClick={() => setReport(s.id)}>{s.displayName}</button>
              <span className="font-mono text-xs text-slate-500">{s.username}</span><button aria-label={`Remove ${s.displayName}`} onClick={() => unenrol.mutate(s.id)} className="text-slate-500 hover:text-red-600"><UserMinus className="size-4" /></button></li>))}
            {!c.roster.length && <li className="px-5 py-8 text-center text-sm text-slate-500">No students yet.</li>}</ul></Card>
        <Card className="h-fit"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="font-semibold">Teachers</h2><Button size="sm" variant="secondary" onClick={() => setDlg('teachers')}>Edit</Button></div>
          <ul className="divide-y divide-slate-100 text-sm">{c.teachers.map((t: any) => <li key={t.id} className="px-5 py-2.5"><b>{t.displayName}</b>{t.subject && <span className="text-slate-500"> · {t.subject}</span>}</li>)}
            {!c.teachers.length && <li className="px-5 py-6 text-center text-slate-500">No teacher assigned.</li>}</ul></Card>
      </div>
      {dlg === 'enrol' && <EnrolDialog classId={id} onClose={() => setDlg('')} />}
      {dlg === 'teachers' && <TeachersDialog classId={id} current={c.teachers} onClose={() => setDlg('')} />}
      {report && <StudentReportDialog studentId={report} classId={id} onClose={() => setReport(null)} />}
    </div>
  );
}

function EnrolDialog({ classId, onClose }: { classId: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['unplaced', classId], queryFn: () => api.get(`/classes/${classId}/unplaced`) });
  const [ids, setIds] = useState<string[]>([]);
  const m = useAction(() => api.post(`/classes/${classId}/students`, { studentIds: ids }), { ok: (r) => 'Students enrolled', keys: ['class', 'classes', 'unplaced'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title="Enrol students" description="Students not yet in a class this academic year.">
      {!q.data ? <PageLoader /> : !q.data.length ? <p className="text-sm text-slate-500">Every student is already in a class. Add students under “Students”.</p> : (
        <>
          <button className="mb-2 text-xs text-emerald-700 hover:underline" onClick={() => setIds(q.data.map((s: any) => s.id))}>Select all ({q.data.length})</button>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{q.data.map((s: any) => (
            <li key={s.id}><label className="flex items-center gap-3 px-3 py-2 text-sm"><input type="checkbox" checked={ids.includes(s.id)} onChange={(e) => setIds(e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id))} />
              <span className="flex-1">{s.displayName}</span><span className="font-mono text-xs text-slate-500">{s.username}</span></label></li>))}</ul>
        </>
      )}
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!ids.length} loading={m.isPending} onClick={() => m.mutate()}>Enrol {ids.length || ''}</Button></div>
    </Dialog>
  );
}

function TeachersDialog({ classId, current, onClose }: { classId: string; current: any[]; onClose: () => void }) {
  const teachers = useQuery({ queryKey: ['people', 'TEACHER', 'all'], queryFn: () => api.get('/school/users?role=TEACHER&pageSize=100') });
  const opts = useQuery({ queryKey: ['classOptions'], queryFn: () => api.get('/classes/options') });
  const [rows, setRows] = useState<{ userId: string; subjectId: string }[]>(current.map((t) => ({ userId: t.id, subjectId: t.subjectId ?? '' })));
  const m = useAction(() => api.post(`/classes/${classId}/teachers`, { teachers: rows.filter((r) => r.userId).map((r) => ({ userId: r.userId, subjectId: r.subjectId || null })) }), { ok: 'Teachers updated', keys: ['class', 'classes'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title="Class teachers" description="A class can have several teachers, e.g. one per subject.">
      <div className="space-y-2">{rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_160px_32px] gap-2">
          <Select aria-label="Teacher" value={r.userId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, userId: e.target.value } : x)))}><option value="">Select…</option>{teachers.data?.items.map((t: any) => <option key={t.id} value={t.id}>{t.displayName}</option>)}</Select>
          <Select aria-label="Subject" value={r.subjectId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, subjectId: e.target.value } : x)))}><option value="">All subjects</option>{opts.data?.subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <button aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-600"><UserMinus className="size-4" /></button>
        </div>))}
        <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { userId: '', subjectId: '' }])}><Plus className="size-4" />Add teacher</Button></div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Save</Button></div>
    </Dialog>
  );
}
