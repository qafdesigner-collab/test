'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, fmtDate } from '@/lib/api';
import { Badge, Card, EmptyState, ErrorBox, PageLoader, cn } from '@/components/ui';
import { UpcomingEvents } from '@/components/calendar';
import { MyTimetable } from '@/components/timetable';
import { useT } from '@/lib/i18n';
import { Printer } from 'lucide-react';
import { useBranding } from '@/lib/branding';
import { printReportCards } from '@/lib/print-docs';

const pct = (s: number | null, m: number) => (s === null || s === undefined || !m ? null : Math.round((s / m) * 100));
const STARS = (n: number) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

export default function ParentHome() {
  const { t } = useT();
  const kids = useQuery({ queryKey: ['parentKids'], queryFn: () => api.get<any>('/parent/children') });
  const [sel, setSel] = useState('');
  useEffect(() => { if (!sel && kids.data?.children?.length) setSel(kids.data.children[0].id); }, [kids.data, sel]);
  if (kids.error) return <ErrorBox error={kids.error} />;
  if (!kids.data) return <PageLoader />;
  if (!kids.data.children.length) return <EmptyState icon={<span className="text-4xl">👪</span>} title={t('No children linked yet')}>{t('Ask the school office to link your child to your account.')}</EmptyState>;
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label={t('Children')} className="flex flex-wrap gap-2">
        {kids.data.children.map((k: any) => (
          <button key={k.id} role="tab" aria-selected={sel === k.id} onClick={() => setSel(k.id)}
            className={cn('focus-ring rounded-2xl border px-4 py-2 text-left', sel === k.id ? 'border-sky-600 bg-sky-600 text-white shadow' : 'border-slate-200 bg-white hover:bg-slate-50')}>
            <span className="block font-semibold">{k.displayName}</span><span className={cn('block text-xs', sel === k.id ? 'text-sky-50' : 'text-slate-600')}>{k.className ?? t('No class yet')}</span>
          </button>))}
      </div>
      {sel && <Child id={sel} />}
    </div>
  );
}

function Child({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['parentChild', id], queryFn: () => api.get<any>(`/parent/children/${id}`) });
  const brand = useBranding(); const { t } = useT();
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const d = q.data;
  const now = Date.now();
  const todo = d.work.filter((w: any) => !w.status && (!w.dueAt || new Date(w.dueAt).getTime() > now - 864e5));
  const marked = d.work.filter((w: any) => ['GRADED', 'RETURNED'].includes(w.status));
  const waiting = d.work.filter((w: any) => w.status && !['GRADED', 'RETURNED'].includes(w.status));
  const att = d.attendance as { status: string; n: number }[] | null;
  const attTotal = att?.reduce((n, a) => n + a.n, 0) ?? 0;
  const present = att?.filter((a) => ['PRESENT', 'LATE'].includes(a.status)).reduce((n, a) => n + a.n, 0) ?? 0;
  return (
    <div className="space-y-6">
      <div className="flex justify-end"><button onClick={() => printReportCards([d], brand, { term: '' })}
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Printer className="size-4" />{t('Print report card')}</button></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile emoji="📝" label={t('Homework to do')} value={todo.length} tone={todo.length ? 'amber' : 'green'} />
        <Tile emoji="✅" label={t('Marked work')} value={marked.length} sub={d.bySubject.length ? t('{n}% average', { n: Math.round(d.bySubject.reduce((n: number, s: any) => n + (s.percent ?? 0), 0) / d.bySubject.length) }) : undefined} />
        <Tile emoji="⭐" label={t('Stars from games')} value={d.stars} sub={t('{n} games played', { n: d.gamesPlayed })} />
        <Tile emoji="🗓️" label={t('Attendance (30 days)')} value={att && attTotal ? `${Math.round((present / attTotal) * 100)}%` : '—'} sub={att && attTotal ? t('{a} of {b} days', { a: present, b: attTotal }) : t('not recorded yet')} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 font-semibold">{t('📝 Homework & tests')}</div>
          {!d.work.length ? <p className="p-5 text-sm text-slate-600">{t('No homework yet.')}</p> : (
            <ul className="divide-y divide-slate-100">{d.work.slice(0, 12).map((w: any) => {
              const p = pct(w.score, w.maxScore);
              return (
                <li key={w.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{w.title}</span>
                    <span className="block text-xs text-slate-600">{[w.subject, w.lesson && t('Lesson {n}: {title}', { n: w.lessonNumber, title: w.lesson }), w.dueAt && t('due {date}', { date: fmtDate(w.dueAt) })].filter(Boolean).join(' · ')}</span></span>
                  {['GRADED', 'RETURNED'].includes(w.status) ? <Badge tone={p !== null && p >= 50 ? 'PUBLISHED' : 'danger'}>{w.score} / {w.maxScore}</Badge>
                    : w.status ? <Badge tone="info">{t('handed in')}</Badge> : <Badge tone="DRAFT">{t('to do')}</Badge>}
                </li>);
            })}</ul>)}
          {waiting.length > 0 && <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-600">{t('{n} piece(s) handed in, waiting for the teacher to mark.', { n: waiting.length })}</p>}
        </Card>
        <div className="space-y-6">
          <UpcomingEvents limit={5} days={60} />
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3 font-semibold">{t('💬 What the teachers say')}</div>
            {!d.evaluations.length ? <p className="p-5 text-sm text-slate-600">{t('No comments yet.')}</p> : (
              <ul className="divide-y divide-slate-100">{d.evaluations.slice(0, 8).map((e: any) => (
                <li key={e.id} className="px-5 py-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium">{e.skill}{e.subject ? ` · ${e.subject}` : ''}</span>
                  <span className="text-amber-500" aria-label={`${e.rating} of 5`}>{STARS(Math.max(0, Math.min(5, e.rating)))}</span></div>
                  {e.remarks && <p className="mt-1 text-slate-700">{e.remarks}</p>}<p className="mt-1 text-xs text-slate-600">{e.teacher}{e.term ? ` · ${e.term}` : ''}</p></li>))}</ul>)}
          </Card>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5"><div className="mb-3 font-semibold">{t('🏅 Badges')}</div>
          {!d.badges.length ? <p className="text-sm text-slate-600">{t('Badges appear when your child plays and reads.')}</p>
            : <div className="flex flex-wrap gap-2">{d.badges.map((b: any) => <span key={b.badge} className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900" title={b.hint}>{b.emoji} {t(b.label)}</span>)}</div>}</Card>
        <Card className="p-5"><div className="mb-3 font-semibold">{t('📖 Reading')}</div>
          {!d.reading.length ? <p className="text-sm text-slate-600">{t('No reading recorded yet.')}</p> : (
            <ul className="space-y-3">{d.reading.slice(0, 6).map((r: any, i: number) => { const p = r.pageCount ? Math.min(100, Math.round((r.pagesRead / r.pageCount) * 100)) : null; return (
              <li key={i} className="text-sm"><div className="flex justify-between"><span className="font-medium">{r.book} · {r.part}</span><span className="text-slate-600">{p !== null ? `${p}%` : t('{n} pages', { n: r.pagesRead })}</span></div>
                {p !== null && <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-600" style={{ width: `${p}%` }} /></div>}</li>); })}</ul>)}</Card>
      </div>
      <MyTimetable path={`/parent/children/${id}/timetable`} title={t('🗓️ Timetable')} />
    </div>
  );
}

function Tile({ emoji, label, value, sub, tone }: { emoji: string; label: string; value: React.ReactNode; sub?: string; tone?: 'amber' | 'green' }) {
  return (
    <Card className={cn('p-4', tone === 'amber' && 'border-amber-200 bg-amber-50', tone === 'green' && 'border-emerald-200 bg-emerald-50')}>
      <div className="flex items-center gap-3"><span className="text-3xl" aria-hidden>{emoji}</span>
        <div><div className="text-2xl font-bold text-slate-900">{value}</div><div className="text-sm text-slate-700">{label}</div>{sub && <div className="text-xs text-slate-600">{sub}</div>}</div></div>
    </Card>
  );
}
