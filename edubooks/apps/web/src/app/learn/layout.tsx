'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { cn, PageLoader } from '@/components/ui';
import { NotificationBell } from '@/components/notifications';
import { useBranding } from '@/lib/branding';

const NAV = [
  { href: '/learn', label: 'Home', emoji: '🏠', color: 'bg-pink-600', exact: true },
  { href: '/learn/books', label: 'My Books', emoji: '📚', color: 'bg-sky-700' },
  { href: '/learn/games', label: 'Play', emoji: '🎮', color: 'bg-emerald-700' },
  { href: '/learn/me', label: 'My Stars', emoji: '⭐', color: 'bg-amber-700' },
];

/** Playful student shell: big tiles, bright colours, minimal reading. */
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, isError } = useMe(); const router = useRouter(); const path = usePathname(); const qc = useQueryClient();
  const ach = useQuery({ queryKey: ['achievements'], queryFn: () => api.get('/student/achievements'), enabled: hasRole(me, 'STUDENT') });
  useEffect(() => { if (isError) router.replace('/login'); else if (me && !hasRole(me, 'STUDENT')) router.replace('/'); }, [isError, me, router]);
  if (isLoading || !me || !hasRole(me, 'STUDENT')) return <PageLoader />;
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#fef3c7,transparent_40%),radial-gradient(circle_at_90%_20%,#fce7f3,transparent_40%),radial-gradient(circle_at_50%_100%,#e0f2fe,transparent_50%)] bg-amber-50 pb-28 sm:pb-8"
      style={{ fontFamily: '"Nunito", "Baloo 2", system-ui, sans-serif' }}>
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-4 pt-4 sm:px-6">
        <Link href="/learn" className="flex items-center gap-2 text-2xl font-black text-violet-600">🦉 <span className="hidden sm:inline"><KidBrand /></span></Link>
        <div className="flex-1" />
        <Link href="/learn/me" className="flex items-center gap-1 rounded-full bg-white px-4 py-2 text-xl font-black text-amber-600 shadow">⭐ {ach.data?.stars ?? '…'}</Link>
        {ach.data?.streak > 0 && <span className="hidden items-center gap-1 rounded-full bg-white px-4 py-2 text-xl font-black text-orange-600 shadow sm:flex" title="Days in a row">🔥 {ach.data.streak}</span>}
        <NotificationBell playful />
        <button onClick={async () => { await api.post('/auth/logout'); qc.clear(); router.replace('/login'); }} className="focus-ring rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-500 shadow" aria-label="Sign out">👋 Bye</button>
      </header>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-2 bg-white/90 p-2 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur sm:static sm:mx-auto sm:mt-4 sm:max-w-5xl sm:bg-transparent sm:px-6 sm:shadow-none">
        {NAV.map((n) => {
          const on = n.exact ? path === n.href : path.startsWith(n.href);
          return <Link key={n.href} href={n.href} aria-current={on ? 'page' : undefined}
            className={cn('focus-ring flex flex-col items-center rounded-3xl py-2 text-sm font-black text-white shadow-[0_5px_0_rgba(0,0,0,0.12)] transition sm:flex-row sm:justify-center sm:gap-2 sm:py-3 sm:text-lg', n.color, on ? 'ring-4 ring-white sm:scale-105' : '')}>
            <span className="text-3xl sm:text-2xl">{n.emoji}</span>{n.label}</Link>;
        })}
      </nav>
      <main className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">{children}</main>
    </div>
  );
}

function KidBrand() { return <>{useBranding().name}</>; }
