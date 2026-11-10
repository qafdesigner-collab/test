'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, Clock, LogOut, Star } from 'lucide-react';
import { api, daysLeft, fmtDay } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';

/** Student home: my books, homework and progress (the full playful portal with games arrives in Phase 6). */
export default function Portal() {
  const { data: me, isLoading } = useMe(); const router = useRouter();
  const kid = hasRole(me, 'STUDENT');
  const lib = useQuery({ queryKey: ['library'], queryFn: () => api.get('/library'), enabled: !!me });
  const hw = useQuery({ queryKey: ['homework'], queryFn: () => api.get('/student/homework'), enabled: kid });
  const rep = useQuery({ queryKey: ['myReport'], queryFn: () => api.get('/student/report'), enabled: kid });
  if (isLoading || !me) return <PageLoader />;
  const todo = (hw.data ?? []).filter((h: any) => !h.submission && h.status === 'PUBLISHED');
  const done = (hw.data ?? []).filter((h: any) => h.submission);
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-pink-50 to-sky-50">
      <header className="mx-auto flex max-w-5xl items-center justify-between p-6">
        <div><h1 className="text-3xl font-extrabold text-pink-600">Hi {me.displayName}! 👋</h1><p className="text-slate-500">{me.school?.name}</p></div>
        <button onClick={async () => { await api.post('/auth/logout'); router.replace('/login'); }} className="focus-ring rounded-xl p-3 text-slate-500 hover:bg-white" aria-label="Sign out"><LogOut className="size-6" /></button>
      </header>
      <div className="mx-auto max-w-5xl space-y-10 px-6 pb-16">
        {kid && (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-800">📝 Today&apos;s homework</h2>
            {!hw.data ? <PageLoader /> : !todo.length ? <p className="rounded-3xl bg-white p-6 text-center text-lg text-slate-500 shadow-sm">All done! 🎉 Great job.</p> : (
              <div className="grid gap-4 sm:grid-cols-2">{todo.map((h: any) => (
                <Link key={h.id} href={`/homework/${h.id}`} className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-sm ring-4 ring-white transition hover:scale-[1.02]">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl text-2xl text-white" style={{ background: h.coverColor ?? '#f472b6' }}>✏️</span>
                  <span className="flex-1"><span className="block text-lg font-bold">{h.title}</span><span className="text-sm text-slate-500">{h.bookTitle ?? ''} · {h.items} questions</span>
                    {h.dueAt && <span className={`mt-1 flex items-center gap-1 text-sm ${daysLeft(h.dueAt) <= 1 ? 'text-red-600' : 'text-slate-500'}`}><Clock className="size-4" />Due {fmtDay(h.dueAt)}</span>}</span>
                  <span className="rounded-full bg-pink-500 px-4 py-2 font-bold text-white">Start</span></Link>))}</div>
            )}
          </section>
        )}
        <section>
          <h2 className="mb-4 text-2xl font-bold text-slate-800">📚 My Books</h2>
          {!lib.data ? <PageLoader /> : lib.data.length === 0 ? <p className="rounded-3xl bg-white p-8 text-center text-slate-500 shadow-sm">No books yet — ask your teacher! 🌈</p> : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{lib.data.map((b: any) => (
              <Link key={b.editionId} href={`/read/${b.editionId}`} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-4 ring-white transition hover:-rotate-1 hover:scale-105">
                <div className="flex h-32 items-center justify-center text-white" style={{ background: b.coverColor }}><BookOpen className="size-12" /></div>
                <div className="p-4"><div className="text-lg font-bold">{b.title}</div><div className="text-xs text-slate-500">{b.grade} · {b.subject}</div></div>
              </Link>))}</div>
          )}
        </section>
        {kid && done.length > 0 && (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-800">⭐ My work</h2>
            <div className="divide-y divide-slate-100 rounded-3xl bg-white shadow-sm">{done.map((h: any) => (
              <Link key={h.id} href={`/homework/${h.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-amber-50">
                <CheckCircle2 className="size-6 text-emerald-500" /><span className="flex-1 font-semibold">{h.title}</span>
                {h.submission.score !== null ? <span className="flex items-center gap-1 text-lg font-bold text-amber-600"><Star className="size-5 fill-amber-400 text-amber-400" />{h.submission.score} / {h.submission.maxScore}</span>
                  : <span className="text-sm text-slate-500">Teacher is checking…</span>}</Link>))}</div>
          </section>
        )}
        {kid && rep.data?.evaluations?.length > 0 && (
          <section><h2 className="mb-4 text-2xl font-bold text-slate-800">🌈 What my teacher says</h2>
            <div className="grid gap-3 sm:grid-cols-2">{rep.data.evaluations.map((e: any) => (
              <div key={e.id} className="rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><b>{e.skill}</b><span className="text-amber-500">{'★'.repeat(e.rating)}<span className="text-slate-200">{'★'.repeat(5 - e.rating)}</span></span></div>
                {e.remarks && <p className="mt-1 text-sm text-slate-600">{e.remarks}</p>}</div>))}</div></section>
        )}
      </div>
    </main>
  );
}
