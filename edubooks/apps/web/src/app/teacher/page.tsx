'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ClipboardCheck, NotebookPen, Plus } from 'lucide-react';
import { api, fmtDay } from '@/lib/api';
import { className, KIND_LABEL, useMyBooks, useMyClasses } from '@/lib/lms';
import { useMe } from '@/lib/session';
import { Badge, Card, PageLoader } from '@/components/ui';
import { PageHeader, Stat, Status } from '@/components/common';
import { UpcomingEvents } from '@/components/calendar';

export default function TeacherHome() {
  const { data: me } = useMe(); const classes = useMyClasses(); const books = useMyBooks();
  const work = useQuery({ queryKey: ['assessments', 'all'], queryFn: () => api.get('/teacher/assessments') });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.get('/teacher/lesson-plans') });
  if (!classes.data || !books.data) return <PageLoader />;
  const toGrade = (work.data ?? []).reduce((n: number, a: any) => n + a.toGrade, 0);
  return (
    <div className="space-y-6">
      <PageHeader title={`Good day, ${me?.displayName ?? ''}`} sub="Your classes, books and work to mark.">
        <Link href="/teacher/plans/new" className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50"><NotebookPen className="size-4" />New lesson plan</Link>
        <Link href="/teacher/assessments/new" className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"><Plus className="size-4" />New homework</Link>
      </PageHeader>
      <UpcomingEvents />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="My classes" value={classes.data.length} /><Stat label="My books" value={books.data.length} />
        <Stat label="To mark" value={toGrade} tone={toGrade ? 'amber' : 'slate'} sub="written answers waiting" /><Stat label="Lesson plans" value={plans.data?.length ?? '…'} />
      </div>
      {!books.data.length && <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">You don&apos;t have a teacher seat for any book yet. Ask your school admin to give you one under “Book licences”.</Card>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><div className="border-b border-slate-100 px-5 py-3 font-semibold">My classes</div>
          <ul className="divide-y divide-slate-100">{classes.data.map((c) => (
            <li key={c.id}><Link href={`/teacher/classes/${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"><span className="font-medium">{className(c)}</span><span className="text-sm text-slate-500">{c.students} students · {c.academicYear}</span></Link></li>))}
            {!classes.data.length && <li className="px-5 py-6 text-center text-sm text-slate-500">No classes yet — your school admin assigns teachers to classes.</li>}</ul></Card>
        <Card><div className="border-b border-slate-100 px-5 py-3 font-semibold">Recent homework & tests</div>
          <ul className="divide-y divide-slate-100">{(work.data ?? []).slice(0, 6).map((a: any) => (
            <li key={a.id}><Link href={`/teacher/assessments/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"><span className="flex-1"><span className="font-medium">{a.title}</span>
              <span className="block text-xs text-slate-500">{KIND_LABEL[a.kind]} · {a.className}{a.dueAt && ` · due ${fmtDay(a.dueAt)}`}</span></span>
              {a.toGrade > 0 && <Badge tone="DRAFT"><ClipboardCheck className="size-3" />{a.toGrade} to mark</Badge>}<Status s={a.status} /></Link></li>))}
            {!work.data?.length && <li className="px-5 py-6 text-center text-sm text-slate-500">Nothing yet.</li>}</ul></Card>
      </div>
      <Card className="p-5"><h2 className="mb-3 font-semibold">My books</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{books.data.map((b) => (
          <Link key={b.editionId} href={`/read/${b.editionId}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:shadow-sm">
            <span className="grid size-10 place-items-center rounded-lg text-white" style={{ background: b.coverColor }}><BookOpen className="size-5" /></span>
            <span className="min-w-0"><span className="block truncate font-medium">{b.title}</span><span className="text-xs text-slate-500">{b.editionLabel}</span></span></Link>))}</div></Card>
    </div>
  );
}
