'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookCopy, FileStack, HardDrive, Layers, ListTree, Plus } from 'lucide-react';
import { api, fmtBytes, fmtDate } from '@/lib/api';
import { Card, ErrorBox, PageLoader, StatusBadge } from '@/components/ui';

export default function Dashboard() {
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api.get('/publishing/stats') });
  const audit = useQuery({ queryKey: ['audit', 'recent'], queryFn: () => api.get('/audit?pageSize=8') });
  if (stats.isLoading) return <PageLoader />;
  if (stats.error) return <ErrorBox error={stats.error} />;
  const s = stats.data;
  const total = s.packages.DRAFT + s.packages.PUBLISHED + s.packages.ARCHIVED;
  const tiles = [
    { label: 'Book packages', value: total, icon: BookCopy, sub: `${s.packages.PUBLISHED} published · ${s.packages.DRAFT} draft` },
    { label: 'Editions', value: s.editions, icon: Layers, sub: 'All versions' },
    { label: 'Lessons', value: s.lessons, icon: ListTree, sub: 'Across all editions' },
    { label: 'Teaching resources', value: s.resources, icon: FileStack, sub: `${s.files} unique files` },
    { label: 'Storage used', value: fmtBytes(s.storageBytes), icon: HardDrive, sub: 'De-duplicated' },
  ];
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-slate-900">Publisher dashboard</h1><p className="text-sm text-slate-500">Your catalogue at a glance.</p></div>
        <Link href="/admin/books?new=1" className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"><Plus className="size-4" />New book package</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label} className="p-5">
            <div className="flex items-center justify-between text-sm text-slate-500">{t.label}<t.icon className="size-4 text-brand-500" /></div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{t.value}</div>
            <div className="mt-1 text-xs text-slate-500">{t.sub}</div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-900">Package status</h2>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${s.packages.PUBLISHED} published, ${s.packages.DRAFT} draft, ${s.packages.ARCHIVED} archived`}>
          {(['PUBLISHED', 'DRAFT', 'ARCHIVED'] as const).map((k) => (
            <div key={k} style={{ width: `${total ? (s.packages[k] / total) * 100 : 0}%` }} className={{ PUBLISHED: 'bg-emerald-500', DRAFT: 'bg-amber-400', ARCHIVED: 'bg-slate-400' }[k]} />
          ))}
        </div>
        <div className="mt-3 flex gap-5 text-sm text-slate-600">
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-emerald-500" />Published {s.packages.PUBLISHED}</span>
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-amber-400" />Draft {s.packages.DRAFT}</span>
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-slate-400" />Archived {s.packages.ARCHIVED}</span>
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="border-b border-slate-100 px-5 py-4 font-semibold">Recently updated</div>
          <ul className="divide-y divide-slate-100">
            {s.recent.map((p: any) => (
              <li key={p.id}><Link href={`/admin/books/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <span className="size-8 rounded-md" style={{ background: p.coverColor }} aria-hidden />
                <span className="flex-1 font-medium text-slate-800">{p.title}</span><StatusBadge status={p.status} />
                <span className="hidden text-xs text-slate-400 sm:inline">{fmtDate(p.updatedAt)}</span></Link></li>
            ))}
          </ul>
        </Card>
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><span className="font-semibold">Recent activity</span><Link href="/admin/audit" className="text-sm text-brand-600 hover:underline">View all</Link></div>
          <ul className="divide-y divide-slate-100 text-sm">
            {audit.data?.items.map((a: any) => (
              <li key={a.id} className="px-5 py-3"><div className="text-slate-800">{a.summary}</div><div className="text-xs text-slate-400">{a.actor ?? 'System'} · {fmtDate(a.createdAt)}</div></li>
            ))}
            {audit.data?.items.length === 0 && <li className="px-5 py-6 text-center text-slate-400">No activity yet</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
