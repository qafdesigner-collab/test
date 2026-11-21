'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { cn } from '@/components/ui';

const ICON: Record<string, string> = { HOMEWORK: '📝', RESULT: '✅', LICENCE_EXPIRY: '🔑', DEMO_EXPIRY: '⏳', CALENDAR: '📅', ATTENDANCE: '🗓️', REPORT: '📊', TEST: '💬' };

/** Bell with unread count and the latest notifications. `playful` = children's portal style. */
export function NotificationBell({ playful }: { playful?: boolean }) {
  const qc = useQueryClient(); const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  const count = useQuery({ queryKey: ['notifCount'], queryFn: () => api.get<{ unread: number }>('/notifications/count'), refetchInterval: 60_000 });
  const list = useQuery({ queryKey: ['notifs'], queryFn: () => api.get<any[]>('/notifications'), enabled: open });
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, []);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['notifCount'] }); qc.invalidateQueries({ queryKey: ['notifs'] }); };
  const read = async (id: string) => { await api.post(`/notifications/${id}/read`).catch(() => undefined); refresh(); setOpen(false); };
  const n = count.data?.unread ?? 0;
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} aria-label={`Notifications${n ? `, ${n} unread` : ''}`} aria-expanded={open}
        className={cn('focus-ring relative rounded-full p-2', playful ? 'bg-white shadow hover:bg-amber-50' : 'text-slate-600 hover:bg-slate-100')}>
        <Bell className={playful ? 'size-6 text-amber-500' : 'size-5'} />
        {n > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{n > 99 ? '99+' : n}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="font-semibold text-slate-900">Notifications</span>
            {n > 0 && <button className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline" onClick={async () => { await api.post('/notifications/read-all'); refresh(); }}><CheckCheck className="size-3.5" />Mark all read</button>}
          </div>
          <ul className="max-h-[24rem] divide-y divide-slate-100 overflow-y-auto">
            {!list.data ? <li className="p-4 text-sm text-slate-600">Loading…</li> : !list.data.length ? <li className="p-6 text-center text-sm text-slate-600">Nothing new. 🎈</li>
              : list.data.map((x) => {
                const inner = (<><span className="text-lg" aria-hidden>{ICON[x.kind] ?? '🔔'}</span>
                  <span className="min-w-0 flex-1"><span className={cn('block text-sm', !x.readAt ? 'font-semibold text-slate-900' : 'text-slate-700')}>{x.title}</span>
                    {x.body && <span className="block text-xs text-slate-600">{x.body}</span>}
                    <span className="block text-[11px] text-slate-500">{fmtDate(x.createdAt)}</span></span>
                  {!x.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" aria-label="unread" />}</>);
                return <li key={x.id}>{x.link
                  ? <Link href={x.link} onClick={() => read(x.id)} className="flex gap-3 px-4 py-3 hover:bg-slate-50">{inner}</Link>
                  : <button onClick={() => read(x.id)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50">{inner}</button>}</li>;
              })}
          </ul>
        </div>)}
    </div>
  );
}
