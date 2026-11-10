'use client';
import Link from 'next/link';
import { BookOpen, ClipboardList, NotebookPen } from 'lucide-react';
import { fmtDay } from '@/lib/api';
import { useMyBooks } from '@/lib/lms';
import { EmptyState, PageLoader } from '@/components/ui';
import { PageHeader } from '@/components/common';

export default function TeacherBooks() {
  const books = useMyBooks();
  if (!books.data) return <PageLoader />;
  return (
    <div className="space-y-6">
      <PageHeader title="My books" sub="Books unlocked by your teacher seats. Open the digital book, plan lessons or set homework from it." />
      {!books.data.length ? <EmptyState icon={<BookOpen className="size-10" />} title="No teacher seats yet">Ask your school admin to assign you a teacher seat.</EmptyState> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{books.data.map((b) => (
          <div key={b.editionId} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex h-28 items-end p-4 text-white" style={{ background: `linear-gradient(135deg, ${b.coverColor}, ${b.coverColor}bb)` }}><span className="text-lg font-semibold">{b.title}</span></div>
            <div className="space-y-3 p-4"><p className="text-xs text-slate-500">{b.grade} · {b.subject} · {b.editionLabel} · access until {fmtDay(b.validUntil)}</p>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link href={`/read/${b.editionId}`} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700"><BookOpen className="size-4" />Open book</Link>
                <Link href={`/teacher/plans/new?editionId=${b.editionId}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"><NotebookPen className="size-4" />Plan</Link>
                <Link href={`/teacher/assessments/new?editionId=${b.editionId}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"><ClipboardList className="size-4" />Homework</Link>
              </div></div>
          </div>))}</div>
      )}
    </div>
  );
}
