'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, LayoutDashboard, Library, Tags, ScrollText, LogOut, Menu, Package, Building2, KeyRound, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { isPublisherStaff, useMe } from '@/lib/session';
import { cn, PageLoader } from '@/components/ui';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/books', label: 'Book Packages', icon: Library },
  { href: '/admin/catalog', label: 'Grades & Subjects', icon: Tags },
  { href: '/admin/audit', label: 'Audit Log', icon: ScrollText },
];
const NEXT = [
  { label: 'Products & Bundles', icon: Package }, { label: 'Schools & Orders', icon: Building2 },
  { label: 'Licences', icon: KeyRound }, { label: 'AI Assistant', icon: Sparkles },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, isError } = useMe();
  const router = useRouter(); const path = usePathname(); const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (isError) router.replace('/login?next=' + encodeURIComponent(path)); }, [isError, router, path]);
  useEffect(() => setOpen(false), [path]);
  if (isLoading || !me) return <PageLoader />;
  if (!isPublisherStaff(me)) return <div className="p-10 text-center text-slate-600">This area is for publisher staff only. <Link className="text-brand-600 underline" href="/portal">Go to your portal</Link></div>;

  const logout = async () => { await api.post('/auth/logout'); qc.clear(); router.replace('/login'); };
  return (
    <div className="min-h-screen lg:flex">
      <aside className={cn('fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5 font-semibold text-slate-900"><BookOpen className="size-5 text-brand-600" /> EduBooks <span className="text-xs font-normal text-slate-400">Publisher</span></div>
        <nav className="space-y-1 p-3" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                className={cn('focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50')}>
                <Icon className="size-4" />{label}
              </Link>
            );
          })}
          <p className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Coming next</p>
          {NEXT.map(({ label, icon: Icon }) => (
            <span key={label} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400" title="Planned in a later phase"><Icon className="size-4" />{label}</span>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button className="focus-ring rounded-md p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="flex-1" />
          <div className="text-right text-sm leading-tight"><div className="font-medium text-slate-800">{me.displayName}</div><div className="text-xs text-slate-500">{me.roles.map((r) => r.replace('PUBLISHER_', '').toLowerCase()).join(', ')}</div></div>
          <button onClick={logout} className="focus-ring rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Sign out" title="Sign out"><LogOut className="size-5" /></button>
        </header>
        <main className="mx-auto max-w-7xl p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
