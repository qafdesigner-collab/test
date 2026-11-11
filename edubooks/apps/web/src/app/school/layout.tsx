'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, School, BookOpen, GraduationCap, KeyRound, LayoutDashboard, LogOut, Menu, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { cn, PageLoader } from '@/components/ui';

const NAV = [
  { href: '/school', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/school/classes', label: 'Classes', icon: School },
  { href: '/school/teachers', label: 'Teachers', icon: GraduationCap },
  { href: '/school/students', label: 'Students', icon: Users },
  { href: '/school/licences', label: 'Book licences', icon: KeyRound },
  { href: '/school/transfers', label: 'Transfer requests', icon: ArrowLeftRight },
];

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, isError } = useMe(); const router = useRouter(); const path = usePathname(); const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (isError) router.replace('/login?next=' + encodeURIComponent(path)); }, [isError, router, path]);
  useEffect(() => setOpen(false), [path]);
  if (isLoading || !me) return <PageLoader />;
  if (!hasRole(me, 'SCHOOL_ADMIN')) return <div className="p-10 text-center text-slate-600">This area is for school administrators. <Link className="text-brand-600 underline" href="/">Go home</Link></div>;
  const logout = async () => { await api.post('/auth/logout'); qc.clear(); router.replace('/login'); };
  return (
    <div className="min-h-screen lg:flex">
      <aside className={cn('fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2 font-semibold text-slate-900"><BookOpen className="size-5 text-emerald-600" />EduBooks</div>
          <div className="mt-1 truncate text-sm text-slate-600">{me.school?.name}</div><div className="font-mono text-xs text-slate-500">{me.school?.code}</div></div>
        <nav className="space-y-1 p-3" aria-label="School">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? path === href : path.startsWith(href);
            return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={cn('focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', active ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50')}><Icon className="size-4" />{label}</Link>;
          })}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button className="focus-ring rounded-md p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="flex-1" /><div className="text-right text-sm leading-tight"><div className="font-medium">{me.displayName}</div><div className="text-xs text-slate-500">School admin</div></div>
          <button onClick={logout} className="focus-ring rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Sign out"><LogOut className="size-5" /></button>
        </header>
        <main className="mx-auto max-w-7xl p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
