'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';
import { NotificationBell } from '@/components/notifications';
import { BrandMark } from '@/lib/branding';

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, isError } = useMe(); const router = useRouter(); const path = usePathname(); const qc = useQueryClient();
  useEffect(() => { if (isError) router.replace('/login?next=' + encodeURIComponent(path)); }, [isError, router, path]);
  if (isLoading || !me) return <PageLoader />;
  if (!hasRole(me, 'PARENT')) { router.replace('/portal'); return <PageLoader />; }
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-amber-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1"><div className="font-bold text-slate-900"><BrandMark /></div><div className="truncate text-xs text-slate-600">{me.school?.name} · Parents</div></div>
          <NotificationBell />
          <button onClick={async () => { await api.post('/auth/logout'); qc.clear(); router.replace('/login'); }} className="focus-ring rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
