'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageLoader } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function LearnBooks() {
  const { t } = useT();
  const lib = useQuery({ queryKey: ['library'], queryFn: () => api.get('/library') });
  const ach = useQuery({ queryKey: ['achievements'], queryFn: () => api.get('/student/achievements') });
  if (!lib.data) return <PageLoader />;
  return (
    <div><h1 className="mb-6 text-4xl font-black text-slate-800">{t('📚 My Books')}</h1>
      {!lib.data.length ? <p className="rounded-[2rem] bg-white p-8 text-center text-xl font-bold text-slate-500">{t('No books yet — ask your teacher! 🌈')}</p> : (
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">{lib.data.map((b: any) => {
          const p = ach.data?.books.find((x: any) => x.editionId === b.editionId);
          const pct = p?.pages ? Math.min(100, Math.round((p.pagesRead / p.pages) * 100)) : 0;
          return (
            <Link key={b.editionId} href={`/read/${b.editionId}`} className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-4 ring-white transition hover:-rotate-2 hover:scale-105 motion-reduce:transform-none">
              <div className="relative flex h-40 items-center justify-center text-7xl" style={{ background: `linear-gradient(160deg, ${b.coverColor}, ${b.coverColor}aa)` }}>
                {{ English: '🔤', Mathematics: '🔢', Urdu: 'ا', 'General Knowledge': '🌍' }[b.subject as string] ?? '📘'}</div>
              <div className="p-4"><div className="text-xl font-black leading-tight">{b.title}</div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100" aria-label={t('{n}% read', { n: pct })}><div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} /></div>
                <div className="mt-1 text-xs font-bold text-slate-500">{t('{n}% read', { n: pct })}</div></div>
            </Link>);
        })}</div>
      )}
    </div>
  );
}
