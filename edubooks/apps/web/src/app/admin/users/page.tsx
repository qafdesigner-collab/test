'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Folder, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { Badge, Card, ErrorBox, Input, PageLoader } from '@/components/ui';
import { PageHeader } from '@/components/common';

const TINTS = ['text-amber-500', 'text-sky-500', 'text-violet-500', 'text-emerald-500', 'text-pink-500', 'text-orange-500'];

/** Super admin → Users: one folder per school. */
export default function UsersPage() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['userSchools'], queryFn: () => api.get<any[]>('/admin/users/schools'), enabled: hasRole(me, 'PUBLISHER_ADMIN') });
  const [search, setSearch] = useState('');
  if (me && !hasRole(me, 'PUBLISHER_ADMIN')) return <Card className="p-8 text-center text-slate-600">Only the super admin can open Users.</Card>;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const list = q.data.filter((s) => !search.trim() || `${s.name} ${s.code} ${s.city ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="space-y-6">
      <PageHeader title="Users" sub="Every school's accounts, one folder per school. Open a folder to see its school admins, teachers, students and parents, and to sign in as any of them." />
      <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Find a school…" aria-label="Find a school" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((s, i) => (
          <Link key={s.id} href={`/admin/users/${s.id}`} className="focus-ring group rounded-2xl">
            <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-md">
              <div className="flex items-start gap-3">
                <Folder className={`size-12 shrink-0 fill-current ${TINTS[i % TINTS.length]}`} aria-hidden />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">{s.name}</div>
                  <div className="font-mono text-xs text-slate-500">{s.code}{s.city ? ` · ${s.city}` : ''}</div>
                  <div className="mt-1 flex flex-wrap gap-1">{s.status !== 'ACTIVE' && <Badge tone="DRAFT">{s.status.toLowerCase()}</Badge>}{s.isDemo && <Badge tone="info">demo</Badge>}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1.5 text-center text-[11px] leading-tight text-slate-500">
                {[['Admins', s.admins], ['Teachers', s.teachers], ['Students', s.students], ['Parents', s.parents]].map(([l, n]) => (
                  <div key={l as string} className="min-w-0 truncate rounded-lg bg-slate-50 px-0.5 py-1.5"><b className="block text-base text-slate-800">{n}</b>{l}</div>))}
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {!list.length && <Card className="p-8 text-center text-slate-500">{q.data.length ? 'No school matches.' : 'No schools yet. Add one under Schools.'}</Card>}
    </div>
  );
}
