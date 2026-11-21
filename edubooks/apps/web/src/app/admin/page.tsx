'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, fmtBytes, fmtDate } from '@/lib/api';
import { Card, ErrorBox, PageLoader, StatusBadge } from '@/components/ui';
import { useMe, hasRole } from '@/lib/session';
import { ActionTile, Doodles, greeting, Hero, StatTile } from '@/components/vivid';

export default function Dashboard() {
  const { data: me } = useMe();
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api.get('/publishing/stats') });
  const audit = useQuery({ queryKey: ['audit', 'recent'], queryFn: () => api.get('/audit?pageSize=8') });
  if (stats.isLoading) return <PageLoader />;
  if (stats.error) return <ErrorBox error={stats.error} />;
  const s = stats.data;
  const total = s.packages.DRAFT + s.packages.PUBLISHED + s.packages.ARCHIVED;
  const g = greeting(); const admin = hasRole(me, 'PUBLISHER_ADMIN');
  const tiles = [
    { label: `book packages · ${s.packages.PUBLISHED} published`, value: total, icon: '📚', bg: '#e6e9fb', href: '/admin/books' },
    { label: 'editions', value: s.editions, icon: '🗂️', bg: '#f6e6ef', href: '/admin/books' },
    { label: 'lessons', value: s.lessons, icon: '📖', bg: '#e3f3ec', href: '/admin/books' },
    { label: `resources · ${s.files} files`, value: s.resources, icon: '📎', bg: '#fbf0dc', href: '/admin/books' },
    { label: 'storage used', value: fmtBytes(s.storageBytes), icon: '💾', bg: '#e4eff8' },
  ];
  return (
    <div className="space-y-6">
      <Hero>
        <Doodles items={['📘', '📗', '📕', '🏫', '📦', '⭐']} />
        <p className="font-medium opacity-95">{g.icon} {g.text}</p>
        <h1 className="mb-1.5 mt-1 text-3xl font-extrabold sm:text-[32px]">{me?.displayName} 👋</h1>
        <p className="font-medium opacity-95">Your catalogue at a glance: {total} book{total === 1 ? '' : 's'}, {s.lessons} lessons and {s.resources} resources.</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link href="/admin/books?new=1" className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-4 py-2.5 font-semibold text-indigo-700 shadow hover:bg-indigo-50"><Plus className="size-4" />New book package</Link>
          <span className="rounded-2xl bg-white/20 px-4 py-2.5 backdrop-blur-sm"><small className="opacity-85">published</small><b className="ml-2">{s.packages.PUBLISHED}</b></span>
          <span className="rounded-2xl bg-white/20 px-4 py-2.5 backdrop-blur-sm"><small className="opacity-85">drafts</small><b className="ml-2">{s.packages.DRAFT}</b></span>
        </div>
      </Hero>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {tiles.map((t) => <StatTile key={t.label} icon={t.icon} bg={t.bg} value={t.value} label={t.label} href={t.href} />)}
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <ActionTile href="/admin/books" icon="📚" label="Books" gradient="from-[#8b7be0] to-[#6a5acb]" />
        <ActionTile href="/admin/products" icon="📦" label="Products" gradient="from-[#4fa9dc] to-[#3486bf]" />
        <ActionTile href="/admin/schools" icon="🏫" label="Schools" gradient="from-[#45b483] to-[#2f9468]" />
        <ActionTile href="/admin/orders" icon="🧾" label="Orders" gradient="from-[#ec9a5c] to-[#cf7840]" />
        <ActionTile href={admin ? '/admin/users' : '/admin/licences'} icon={admin ? '👥' : '🔑'} label={admin ? 'Users' : 'Licences'} gradient="from-[#e07aa3] to-[#c45886]" />
        <ActionTile href="/admin/games" icon="🎮" label="Games" gradient="from-[#e27c7c] to-[#c55c5c]" />
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
                <span className="hidden text-xs text-slate-500 sm:inline">{fmtDate(p.updatedAt)}</span></Link></li>
            ))}
          </ul>
        </Card>
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><span className="font-semibold">Recent activity</span><Link href="/admin/audit" className="text-sm text-brand-600 hover:underline">View all</Link></div>
          <ul className="divide-y divide-slate-100 text-sm">
            {audit.data?.items.map((a: any) => (
              <li key={a.id} className="px-5 py-3"><div className="text-slate-800">{a.summary}</div><div className="text-xs text-slate-500">{a.actor ?? 'System'} · {fmtDate(a.createdAt)}</div></li>
            ))}
            {audit.data?.items.length === 0 && <li className="px-5 py-6 text-center text-slate-500">No activity yet</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
