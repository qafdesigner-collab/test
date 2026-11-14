'use client';
import { Suspense, useState } from 'react';
import { PageHeader } from '@/components/common';
import { PageLoader, cn } from '@/components/ui';
import { Announcements, Inbox, LiveLessons } from '@/components/messaging';

/** Staff page: parent messages, announcements and live lessons in three tabs. */
export function StaffMessages({ classes, admin }: { classes: { id: string; label: string }[] | undefined; admin?: boolean }) {
  const [tab, setTab] = useState<'inbox' | 'ann' | 'live'>('inbox');
  if (!classes) return <PageLoader />;
  const annClasses = admin ? [{ id: '', label: 'Whole school' }, ...classes] : classes;
  return (
    <div className="space-y-6">
      <PageHeader title="Messages" sub="Talk with parents, send announcements and schedule live online lessons." />
      <div role="tablist" className="flex w-fit rounded-lg bg-slate-100 p-1 text-sm">{([['inbox', 'Parent messages'], ['ann', 'Announcements'], ['live', 'Live lessons']] as const).map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('rounded-md px-3 py-1.5 font-medium', tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>{l}</button>))}</div>
      {tab === 'inbox' && <Suspense><Inbox canOversee={admin} /></Suspense>}
      {tab === 'ann' && <Announcements canPost classes={annClasses} />}
      {tab === 'live' && <LiveLessons canSchedule classes={classes} />}
    </div>
  );
}
