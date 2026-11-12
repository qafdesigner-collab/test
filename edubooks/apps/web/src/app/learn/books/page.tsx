'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageLoader } from '@/components/ui';
import { Book3D, Shelf } from '@/components/kid-ui';
import { savedEditionIds } from '@/lib/offline';
import { useT } from '@/lib/i18n';

export default function LearnBooks() {
  const { t } = useT(); const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => { savedEditionIds().then(setSaved).catch(() => undefined); }, []);
  const lib = useQuery({ queryKey: ['library'], queryFn: () => api.get<any[]>('/library') });
  const ach = useQuery({ queryKey: ['achievements'], queryFn: () => api.get<any>('/student/achievements') });
  if (!lib.data) return <PageLoader />;
  const rows: any[][] = []; for (let i = 0; i < lib.data.length; i += 4) rows.push(lib.data.slice(i, i + 4));
  return (
    <div><h1 className="mb-8 text-4xl font-black text-slate-800">{t('📚 My Books')}</h1>
      {!lib.data.length ? <p className="rounded-[2rem] bg-white p-8 text-center text-xl font-bold text-slate-500">{t('No books yet — ask your teacher! 🌈')}</p> : (
        <div className="space-y-12 rounded-[2.5rem] bg-gradient-to-b from-amber-50/80 to-orange-100/80 p-6 shadow-inner ring-4 ring-white sm:p-10">{rows.map((row, r) => (
          <div key={r}>
            <div className="grid grid-cols-2 items-end gap-x-8 gap-y-10 px-2 sm:grid-cols-4">{row.map((b: any) => {
              const p = ach.data?.books.find((x: any) => x.editionId === b.editionId);
              const pct = p?.pages ? Math.min(100, Math.round((p.pagesRead / p.pages) * 100)) : 0;
              return (
                <Link key={b.editionId} href={`/read/${b.editionId}`} className="group flex flex-col items-center gap-3 text-center">
                  <div className="relative">
                    <Book3D url={b.coverUrl} color={b.coverColor} title={b.title} className="w-32 sm:w-36" />
                    {pct > 0 && <span className="absolute -right-3 -top-3 z-10 grid size-12 place-items-center rounded-full bg-white text-sm font-black text-emerald-700 shadow-lg ring-4 ring-emerald-300">{pct}%</span>}
                    {saved.includes(b.editionId) && <span className="absolute -left-3 -top-3 z-10 grid size-9 place-items-center rounded-full bg-white text-base shadow-lg" title={t('✅ On this device')}>📲</span>}
                  </div>
                </Link>);
            })}</div>
            <Shelf />
            <div className="mt-3 grid grid-cols-2 gap-x-8 px-2 sm:grid-cols-4">{row.map((b: any) => <p key={b.editionId} className="text-center text-lg font-black leading-tight text-slate-800">{b.title}</p>)}</div>
          </div>))}</div>
      )}
    </div>
  );
}
