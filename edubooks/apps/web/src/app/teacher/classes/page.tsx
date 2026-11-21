'use client';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { className, useMyClasses } from '@/lib/lms';
import { Card, EmptyState, PageLoader } from '@/components/ui';
import { PageHeader } from '@/components/common';

export default function TeacherClasses() {
  const q = useMyClasses();
  return (
    <div className="space-y-6">
      <PageHeader title="Classes & reports" sub="Gradebooks, report cards and skill evaluations for the classes you teach." />
      {!q.data ? <PageLoader /> : !q.data.length ? <EmptyState icon={<Users className="size-10" />} title="No classes yet" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{q.data.map((c) => (
          <Link key={c.id} href={`/teacher/classes/${c.id}`}><Card className="p-5 transition hover:shadow-md"><div className="text-lg font-semibold">{className(c)}</div>
            <div className="text-sm text-slate-500">{c.gradeName ?? ''} · {c.academicYear}</div><div className="mt-2 text-sm">{c.students} students</div></Card></Link>))}</div>
      )}
    </div>
  );
}
