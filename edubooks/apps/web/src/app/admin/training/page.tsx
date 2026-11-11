'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { api, downloadCsv, fmtDay } from '@/lib/api';
import { useMe } from '@/lib/session';
import { PageHeader } from '@/components/common';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Textarea, cn } from '@/components/ui';

export default function AdminTraining() {
  const me = useMe().data as any; const canEdit = me?.roles?.some((r: string) => ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR'].includes(r));
  const q = useQuery({ queryKey: ['training', 'admin'], queryFn: () => api.get<any[]>('/training/admin/courses') });
  const rep = useQuery({ queryKey: ['training', 'report'], queryFn: () => api.get<any>('/training/admin/report') });
  const [tab, setTab] = useState<'courses' | 'report'>('courses'); const [adding, setAdding] = useState(false);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  return (
    <div className="space-y-6">
      <PageHeader title="Teacher training" sub="Short courses for teachers in your schools: videos, reading, links and quizzes. Teachers get a certificate when they finish.">
        {canEdit && <Button onClick={() => setAdding(true)}><Plus className="size-4" />New course</Button>}
      </PageHeader>
      <div role="tablist" className="flex w-fit rounded-lg bg-slate-100 p-1 text-sm">{([['courses', 'Courses'], ['report', 'Who has done what']] as const).map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('rounded-md px-3 py-1.5 font-medium', tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>{l}</button>))}</div>
      {tab === 'courses' ? (
        <Card className="overflow-hidden">{!q.data.length ? <p className="p-8 text-center text-sm text-slate-600">No courses yet. Start with a welcome course on using your books.</p> : (
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">Course</th><th className="px-4 py-2">For</th><th className="px-4 py-2">Lessons</th><th className="px-4 py-2">Started</th><th className="px-4 py-2">Completed</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{q.data.map((c) => (
              <tr key={c.id}><td className="px-4 py-2"><Link href={`/admin/training/${c.id}`} className="font-medium text-brand-700 hover:underline"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: c.color }} />{c.title}</Link></td>
                <td className="px-4 py-2">{{ TEACHER: 'Teachers', SCHOOL_ADMIN: 'School admins', ALL: 'Everyone' }[c.audience as string]}</td><td className="px-4 py-2">{c.lessons} · {c.minutes} min</td>
                <td className="px-4 py-2">{c.learners}</td><td className="px-4 py-2">{c.completed}</td><td className="px-4 py-2"><Badge tone={c.status}>{c.status.toLowerCase()}</Badge></td></tr>))}</tbody></table>)}</Card>
      ) : !rep.data ? <PageLoader /> : (
        <div className="space-y-6">
          <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="font-semibold">By school</h2>
            <button className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline" onClick={() => downloadCsv('training-by-school.csv', rep.data.schools.map((s: any) => ({ school: s.name, city: s.city ?? '', teachers: s.teachers, started: s.started, completedACourse: s.completed })))}><Download className="size-4" />CSV</button></div>
            <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">School</th><th className="px-4 py-2">Teachers</th><th className="px-4 py-2">Started training</th><th className="px-4 py-2">Finished a course</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{rep.data.schools.map((s: any) => <tr key={s.id}><td className="px-4 py-2 font-medium">{s.name}<span className="block text-xs font-normal text-slate-600">{s.city}</span></td><td className="px-4 py-2">{s.teachers}</td><td className="px-4 py-2">{s.started}</td><td className="px-4 py-2">{s.completed}</td></tr>)}</tbody></table></Card>
          <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="font-semibold">Learners</h2>
            <button className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline" onClick={() => downloadCsv('training-learners.csv', rep.data.learners.map((l: any) => ({ name: l.displayName, school: l.school ?? '', course: l.course, lessonsDone: l.done, lessons: l.total, lastActivity: l.lastAt })))}><Download className="size-4" />CSV</button></div>
            {!rep.data.learners.length ? <p className="p-5 text-sm text-slate-600">Nobody has started yet.</p> : (
            <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">School</th><th className="px-4 py-2">Course</th><th className="px-4 py-2">Progress</th><th className="px-4 py-2">Last activity</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{rep.data.learners.map((l: any, i: number) => <tr key={i}><td className="px-4 py-2 font-medium">{l.displayName}</td><td className="px-4 py-2">{l.school ?? '—'}</td><td className="px-4 py-2">{l.course}</td>
                <td className={cn('px-4 py-2', l.done >= l.total && 'font-medium text-emerald-700')}>{l.done >= l.total ? '✓ Completed' : `${l.done} of ${l.total}`}</td><td className="px-4 py-2">{fmtDay(l.lastAt)}</td></tr>)}</tbody></table>)}</Card>
        </div>)}
      {adding && <NewCourse onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewCourse({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ title: '', description: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const router = useRouter();
  const save = async () => { setBusy(true); setErr(null); try { const c = await api.post<any>('/training/admin/courses', f); router.push(`/admin/training/${c.id}`); } catch (e) { setErr(e); setBusy(false); } };
  return (
    <Dialog open onOpenChange={onClose} title="New training course">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Title"><Input required minLength={2} maxLength={120} value={f.title} placeholder="Teaching with digital books" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Short description"><Textarea rows={3} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {err ? <ErrorBox error={err} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>Create and add lessons</Button></div>
      </form>
    </Dialog>
  );
}
