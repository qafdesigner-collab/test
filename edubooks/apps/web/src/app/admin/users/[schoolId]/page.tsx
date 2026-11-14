'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FolderOpen, GraduationCap, HeartHandshake, KeyRound, LogIn, ShieldCheck, Users } from 'lucide-react';
import { LoginsDialog } from '@/components/logins-download';
import { api, fmtDay, qs } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Button, Card, ErrorBox, Input, PageLoader, Pagination } from '@/components/ui';
import { Status, Table, Td } from '@/components/common';
import { cn } from '@/components/ui';

const TABS = [
  { role: 'SCHOOL_ADMIN', label: 'School admins', icon: ShieldCheck, as: 'Log in as admin' },
  { role: 'TEACHER', label: 'Teachers', icon: GraduationCap, as: 'Log in as teacher' },
  { role: 'STUDENT', label: 'Students', icon: Users, as: 'Log in as student' },
  { role: 'PARENT', label: 'Parents', icon: HeartHandshake, as: 'Log in as parent' },
] as const;

export default function SchoolUsers() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const [f, setF] = useState({ role: 'SCHOOL_ADMIN' as string, search: '', page: 1 });
  const q = useQuery({ queryKey: ['schoolUsersAdmin', schoolId, f], queryFn: () => api.get<any>(`/admin/users${qs({ schoolId, ...f, pageSize: 50 })}`), placeholderData: keepPreviousData });
  const schools = useQuery({ queryKey: ['userSchools'], queryFn: () => api.get<any[]>('/admin/users/schools') });
  const counts = schools.data?.find((s) => s.id === schoolId);
  const toast = useToast(); const qc = useQueryClient(); const [busy, setBusy] = useState<string | null>(null); const [logins, setLogins] = useState(false);
  const tab = TABS.find((t) => t.role === f.role)!;
  const loginAs = async (u: any) => {
    setBusy(u.id);
    try { const r = await api.post<{ home: string }>(`/admin/users/${u.id}/login-as`); qc.clear(); window.location.assign(r.home); }
    catch (e: any) { toast(e.message, 'err'); setBusy(null); }
  };
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const s = q.data.school;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />All schools</Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-slate-900"><FolderOpen className="size-7 fill-amber-200 text-amber-500" />{s.name}</h1>
        <p className="font-mono text-sm text-slate-500">School code {s.code}{s.status !== 'ACTIVE' && ` · ${s.status.toLowerCase()} (nobody can sign in)`}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => {
          const n = counts ? { SCHOOL_ADMIN: counts.admins, TEACHER: counts.teachers, STUDENT: counts.students, PARENT: counts.parents }[t.role] : undefined;
          return (
            <button key={t.role} role="tab" aria-selected={f.role === t.role} onClick={() => setF({ role: t.role, search: '', page: 1 })}
              className={cn('focus-ring inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium', f.role === t.role ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>
              <t.icon className="size-4" />{t.label}{n !== undefined && <span className={cn('rounded-full px-1.5 text-xs', f.role === t.role ? 'bg-white/25' : 'bg-slate-100')}>{n}</span>}</button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" onClick={() => setLogins(true)}><KeyRound className="size-4" />Download {tab.label.toLowerCase()} logins</Button></div>
      {logins && <LoginsDialog base={`/schools/${schoolId}`} role={f.role as any} onClose={() => setLogins(false)} />}
      <Input className="max-w-xs" placeholder="Search name, login ID or email…" aria-label="Search" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value, page: 1 })} />
      <Table head={['Name', 'Login ID', f.role === 'STUDENT' ? 'Class' : f.role === 'TEACHER' ? 'Designation / email' : 'Email', 'Last sign-in', 'Status', '']} empty={!q.data.items.length}>
        {q.data.items.map((u: any) => (
          <tr key={u.id}>
            <Td className="font-medium">{u.displayName}</Td><Td className="font-mono">{u.username}</Td>
            <Td className="text-slate-600">{f.role === 'STUDENT' ? (u.classes || '—') : [u.designation, u.email].filter(Boolean).join(' · ') || '—'}</Td>
            <Td className="text-slate-500">{u.lastLoginAt ? fmtDay(u.lastLoginAt) : 'never'}</Td><Td><Status s={u.status} /></Td>
            <Td className="text-right"><Button size="sm" variant="secondary" loading={busy === u.id} disabled={!!busy || u.status !== 'ACTIVE' || s.status !== 'ACTIVE'} onClick={() => loginAs(u)}><LogIn className="size-4" />{tab.as}</Button></Td>
          </tr>
        ))}
      </Table>
      <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setF({ ...f, page })} />
      <Card className="p-4 text-sm text-slate-600">
        <b>Log in as</b> opens the portal exactly as this person sees it, for up to 2 hours. A yellow bar at the top takes you back to your own account.
        Everything you do there is done as them, and each sign-in is recorded in the Audit Log. Their password is never shown or changed.
      </Card>
    </div>
  );
}
