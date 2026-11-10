'use client';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, LogOut } from 'lucide-react';
import { api, fmtDay } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';

/** Interim teacher/student home: shows the books their licences unlock. Full portals arrive in Phases 4–6. */
export default function Portal() {
  const { data: me, isLoading } = useMe(); const router = useRouter();
  const lib = useQuery({ queryKey: ['library'], queryFn: () => api.get('/library'), enabled: !!me });
  if (isLoading || !me) return <PageLoader />;
  const kid = hasRole(me, 'STUDENT');
  return (
    <main className={kid ? 'min-h-screen bg-gradient-to-b from-amber-50 via-pink-50 to-sky-50' : 'min-h-screen'}>
      <header className="mx-auto flex max-w-5xl items-center justify-between p-6">
        <div><h1 className={kid ? 'text-3xl font-extrabold text-pink-600' : 'text-2xl font-semibold'}>{kid ? `Hi ${me.displayName}! 👋` : `Welcome, ${me.displayName}`}</h1>
          <p className="text-slate-500">{me.school?.name}</p></div>
        <button onClick={async () => { await api.post('/auth/logout'); router.replace('/login'); }} className="focus-ring rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Sign out"><LogOut className="size-5" /></button>
      </header>
      <section className="mx-auto max-w-5xl px-6 pb-12">
        <h2 className={kid ? 'mb-4 text-2xl font-bold text-slate-800' : 'mb-4 font-semibold'}>{kid ? '📚 My Books' : 'My books'}</h2>
        {!lib.data ? <PageLoader /> : lib.data.length === 0 ? (
          <p className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">{kid ? 'No books yet — ask your teacher! 🌈' : 'No book licence is assigned to you yet. Ask your school admin.'}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {lib.data.map((b: any) => (
              <div key={b.editionId} className={`overflow-hidden bg-white shadow-sm ${kid ? 'rounded-3xl ring-4 ring-white transition hover:-rotate-1 hover:scale-105' : 'rounded-xl border border-slate-200'}`}>
                <div className="flex h-32 items-center justify-center text-white" style={{ background: b.coverColor }}><BookOpen className="size-12 opacity-90" /></div>
                <div className="p-4"><div className={kid ? 'text-lg font-bold' : 'font-semibold'}>{b.title}</div><div className="text-xs text-slate-500">{b.grade} · {b.subject} · {b.editionLabel}</div>
                  {!kid && <div className="mt-1 text-xs text-slate-400">Access until {fmtDay(b.validUntil)}</div>}</div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-8 text-center text-xs text-slate-400">The digital reader, homework and games arrive in the next phases.</p>
      </section>
    </main>
  );
}
