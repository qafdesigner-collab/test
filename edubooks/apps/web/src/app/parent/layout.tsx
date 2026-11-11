'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';
import { NotificationBell } from '@/components/notifications';
import { BrandMark } from '@/lib/branding';
import { LangScope, LangSwitch, useT } from '@/lib/i18n';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

export default function ParentLayout({ children }: { children: React.ReactNode }) { return <LangScope><ParentShell>{children}</ParentShell></LangScope>; }

function ParentShell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const { data: me, isLoading, isError } = useMe(); const router = useRouter(); const path = usePathname(); const qc = useQueryClient();
  useEffect(() => { if (isError) router.replace('/login?next=' + encodeURIComponent(path)); }, [isError, router, path]);
  if (isLoading || !me) return <PageLoader />;
  if (!hasRole(me, 'PARENT')) { router.replace('/portal'); return <PageLoader />; }
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-amber-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1"><div className="font-bold text-slate-900"><BrandMark /></div><div className="truncate text-xs text-slate-600">{me.school?.name} · {t('Parents')}</div></div>
          <MessagesLink />
          <LangSwitch className="border border-slate-300 text-slate-700 hover:bg-slate-50" />
          <NotificationBell />
          <button onClick={async () => { await api.post('/auth/logout'); qc.clear(); router.replace('/login'); }} className="focus-ring rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">{t('Sign out')}</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

function MessagesLink() {
  const { t } = useT();
  const q = useQuery({ queryKey: ['unreadMessages'], queryFn: () => api.get<{ unread: number }>('/messages/unread'), refetchInterval: 30_000 });
  return <Link href="/parent/messages" className="focus-ring relative rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">💬 {t('Messages')}
    {!!q.data?.unread && <span className="absolute -end-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{q.data.unread}</span>}</Link>;
}
