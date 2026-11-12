'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, LogOut, Menu, X } from 'lucide-react';
import { api } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { cn, PageLoader } from '@/components/ui';
import { NotificationBell } from '@/components/notifications';
import { useBranding } from '@/lib/branding';

export interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; color?: string }

/** Colours for the little icon chips in the sidebar (cycled when an item has none). */
const CHIP = ['#a78bfa', '#f472b6', '#60a5fa', '#c084fc', '#34d399', '#fb923c', '#f87171', '#facc15', '#2dd4bf', '#818cf8', '#4ade80', '#38bdf8', '#e879f9', '#fbbf24', '#a3e635', '#22d3ee', '#fb7185'];

const initials = (n?: string) => (n ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '🙂';

/** Colourful sidebar layout shared by the school-admin and teacher portals. */
export function Shell({ role, roleLabel, nav, children, deny }: { role: string; roleLabel: string; nav: NavItem[]; children: React.ReactNode; deny?: string; accent?: string }) {
  const { data: me, isLoading, isError } = useMe(); const router = useRouter(); const path = usePathname(); const qc = useQueryClient();
  const b = useBranding();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (isError) router.replace('/login?next=' + encodeURIComponent(path)); }, [isError, router, path]);
  useEffect(() => setOpen(false), [path]);
  if (isLoading || !me) return <PageLoader />;
  if (!hasRole(me, role)) return <div className="p-10 text-center text-slate-600">{deny ?? 'This area is not available for your account.'} <Link className="text-brand-600 underline" href="/">Go home</Link></div>;
  const logout = async () => { await api.post('/auth/logout'); qc.clear(); router.replace('/login'); };
  return (
    <div className="min-h-screen bg-violet-50/70 lg:flex">
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col overflow-y-auto bg-gradient-to-b from-indigo-900 via-violet-900 to-fuchsia-900 px-3 py-5 text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-violet-700 shadow">
            {b.logoUrl ? <img src={b.logoUrl} alt="" className="size-8 object-contain" /> : <BookOpen className="size-5" />}</span>
          <span className="min-w-0"><span className="block truncate text-lg font-extrabold leading-tight">{b.name}</span>
            <span className="block truncate text-xs text-violet-200">{me.school?.name}{me.school?.code ? ` · ${me.school.code}` : ''}</span></span>
          <button className="ml-auto rounded-lg p-1.5 text-violet-200 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
        </div>
        <nav className="space-y-0.5" aria-label="Main">
          {nav.map(({ href, label, icon: Icon, exact, color }, i) => {
            const on = exact ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={on ? 'page' : undefined}
                className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2 text-[14px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-white/70',
                  on ? 'bg-white/15 text-white ring-1 ring-inset ring-white/20' : 'text-violet-100 hover:bg-white/10 hover:text-white')}>
                <span className="grid size-8 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ background: color ?? CHIP[i % CHIP.length] }}><Icon className="size-4" /></span>
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-violet-50/80 px-4 backdrop-blur lg:px-8">
          <button className="focus-ring rounded-xl bg-white p-2 shadow-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="flex-1" />
          <span className="rounded-2xl bg-white shadow-sm"><NotificationBell /></span>
          <div className="hidden text-right text-sm leading-tight sm:block"><div className="font-semibold text-slate-800">{me.displayName}</div><div className="text-xs text-slate-500">{roleLabel}</div></div>
          <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-pink-400 to-violet-500 text-sm font-extrabold text-white shadow" aria-hidden>{initials(me.displayName)}</span>
          <button onClick={logout} className="focus-ring rounded-xl bg-white p-2 text-slate-500 shadow-sm hover:text-slate-800" aria-label="Sign out"><LogOut className="size-5" /></button>
        </header>
        <main className="mx-auto max-w-7xl p-4 lg:p-8 lg:pt-4">{children}</main>
      </div>
    </div>
  );
}
