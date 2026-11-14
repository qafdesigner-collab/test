'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, LogOut, Menu, X } from 'lucide-react';
import { api } from '@/lib/api';
import { hasRole, Me, useMe } from '@/lib/session';
import { cn, PageLoader } from '@/components/ui';
import { NotificationBell } from '@/components/notifications';
import { useBranding } from '@/lib/branding';

export interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; color?: string; roles?: string[] }

/** Calm-but-bright colours for the little icon chips in the sidebar (cycled when an item has none). */
const CHIP = ['#8b8ff0', '#ec8fb8', '#6aaeea', '#b294e6', '#57c39b', '#f0a46b', '#e98a8a', '#e3bd55', '#4fbfb4', '#97a3f0', '#79c98a', '#62b9e2', '#d18fdc', '#e6ad5c', '#9fc76a', '#5cc2d6', '#ee8fa1'];

/** One colour family per portal, so each looks colourful but stays easy on the eye. */
export const THEMES = {
  publisher: { side: 'linear-gradient(180deg,#1f2a5c 0%,#263774 55%,#33408c 100%)', hero: 'linear-gradient(115deg,#4d63d1 0%,#6a63d6 50%,#9d72cf 100%)', page: '#f4f6fc', sub: '#c7d0f5' },
  school: { side: 'linear-gradient(180deg,#123f45 0%,#155159 55%,#1b6470 100%)', hero: 'linear-gradient(115deg,#1f968d 0%,#3488c4 55%,#6b78d6 100%)', page: '#f1f8f7', sub: '#bfe3df' },
  teacher: { side: 'linear-gradient(180deg,#2c2766 0%,#3a2d78 55%,#4f3480 100%)', hero: 'linear-gradient(115deg,#6857cf 0%,#9a5cc3 50%,#d9847a 100%)', page: '#f6f4fb', sub: '#d9d0f5' },
} as const;
export type ThemeName = keyof typeof THEMES;

const initials = (n?: string) => (n ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '🙂';

/** Colourful sidebar layout shared by the school-admin and teacher portals. */
export function Shell({ role, roleLabel, nav, children, deny, theme = 'teacher', subtitle }: { role: string | string[]; roleLabel: string | ((me: Me) => string); nav: NavItem[]; children: React.ReactNode; deny?: string; accent?: string; theme?: ThemeName; subtitle?: string }) {
  const { data: me, isLoading, isError } = useMe(); const router = useRouter(); const path = usePathname(); const qc = useQueryClient();
  const b = useBranding(); const T = THEMES[theme];
  const [open, setOpen] = useState(false);
  useEffect(() => { if (isError) router.replace('/login?next=' + encodeURIComponent(path)); }, [isError, router, path]);
  useEffect(() => setOpen(false), [path]);
  if (isLoading || !me) return <PageLoader />;
  if (!hasRole(me, ...(Array.isArray(role) ? role : [role]))) return <div className="p-10 text-center text-slate-600">{deny ?? 'This area is not available for your account.'} <Link className="text-brand-600 underline" href="/">Go home</Link></div>;
  const logout = async () => { await api.post('/auth/logout'); qc.clear(); router.replace('/login'); };
  return (
    <div className="min-h-screen lg:flex" style={{ background: T.page, ['--hero' as any]: T.hero }}>
      <aside style={{ background: T.side }} className={cn('fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col overflow-y-auto px-3 py-5 text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-violet-700 shadow">
            {b.logoUrl ? <img src={b.logoUrl} alt="" className="size-8 object-contain" /> : <BookOpen className="size-5" />}</span>
          <span className="min-w-0"><span className="block truncate text-lg font-extrabold leading-tight">{b.name}</span>
            <span className="block truncate text-xs" style={{ color: T.sub }}>{subtitle ?? `${me.school?.name ?? ''}${me.school?.code ? ` · ${me.school.code}` : ''}`}</span></span>
          <button className="ml-auto rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
        </div>
        <nav className="space-y-0.5" aria-label="Main">
          {nav.filter((n) => !n.roles || n.roles.some((r) => me.roles.includes(r))).map(({ href, label, icon: Icon, exact, color }, i) => {
            const on = exact ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={on ? 'page' : undefined}
                className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2 text-[14px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-white/70',
                  on ? 'bg-white/15 text-white ring-1 ring-inset ring-white/20' : 'text-white/80 hover:bg-white/10 hover:text-white')}>
                <span className="grid size-8 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ background: color ?? CHIP[i % CHIP.length] }}><Icon className="size-4" /></span>
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 px-4 backdrop-blur lg:px-8" style={{ background: `color-mix(in srgb, ${T.page} 85%, transparent)` }}>
          <button className="focus-ring rounded-xl bg-white p-2 shadow-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="flex-1" />
          <span className="rounded-2xl bg-white shadow-sm"><NotificationBell /></span>
          <div className="hidden text-right text-sm leading-tight sm:block"><div className="font-semibold text-slate-800">{me.displayName}</div><div className="text-xs text-slate-500">{typeof roleLabel === 'function' ? roleLabel(me) : roleLabel}</div></div>
          <span className="grid size-10 place-items-center rounded-full text-sm font-extrabold text-white shadow" style={{ background: T.hero }} aria-hidden>{initials(me.displayName)}</span>
          <button onClick={logout} className="focus-ring rounded-xl bg-white p-2 text-slate-500 shadow-sm hover:text-slate-800" aria-label="Sign out"><LogOut className="size-5" /></button>
        </header>
        <main className="mx-auto max-w-7xl p-4 lg:p-8 lg:pt-4">{children}</main>
      </div>
    </div>
  );
}
