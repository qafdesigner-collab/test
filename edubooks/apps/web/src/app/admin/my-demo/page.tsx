'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, KeyRound, RefreshCw, Sparkles } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { Badge, Button, Card, ErrorBox, PageLoader } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const WHO: Record<string, { label: string; icon: string; color: string }> = {
  SCHOOL_ADMIN: { label: 'School admin', icon: '🏫', color: 'bg-teal-50 ring-teal-200' },
  TEACHER: { label: 'Teacher', icon: '👩‍🏫', color: 'bg-violet-50 ring-violet-200' },
  STUDENT: { label: 'Student', icon: '🧒', color: 'bg-amber-50 ring-amber-200' },
  PARENT: { label: 'Parent', icon: '👪', color: 'bg-sky-50 ring-sky-200' },
};

/** A sales person's own demo school: ready teacher, student, parent and school-admin accounts to show customers. */
export default function MyDemoPage() {
  const q = useQuery({ queryKey: ['myDemo'], queryFn: () => api.get<any>('/sales/my-demo') });
  const qc = useQueryClient(); const toast = useToast();
  const [busy, setBusy] = useState(''); const [err, setErr] = useState<unknown>(null);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const d = q.data;
  const act = async (name: string, path: string, ok: string) => {
    setBusy(name); setErr(null);
    try { qc.setQueryData(['myDemo'], await api.post(path)); toast(ok); } catch (e) { setErr(e); } finally { setBusy(''); }
  };
  const open = async (id: string) => {
    setBusy(id); setErr(null);
    try { const r = await api.post<{ home: string }>(`/admin/users/${id}/login-as`); qc.clear(); window.location.assign(r.home); } catch (e) { setErr(e); setBusy(''); }
  };
  const copy = (l: any) => { navigator.clipboard?.writeText(`School code: ${d.school.code}\nUsername: ${l.username}\nPassword: ${l.password}`).catch(() => undefined); toast('Copied'); };
  return (
    <div className="space-y-6">
      <PageHeader title="My demo accounts" sub="Your own demo school for giving demos: open any account with one click, or give the sign-in details to a customer to try it themselves." />
      {err ? <ErrorBox error={err} /> : null}
      {!d.school ? (
        <Card className="p-8 text-center">
          <div className="text-5xl">🎁</div>
          <h2 className="mt-3 text-xl font-bold text-slate-900">Get your demo school</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-600">One click makes your own demo school with a school admin, a teacher, two students and a parent — in a ready class, with trial licences for the books — valid for a year.</p>
          <Button className="mt-5" loading={busy === 'make'} onClick={() => act('make', '/sales/my-demo', 'Your demo school is ready')}><Sparkles className="size-4" />Make my demo school</Button>
        </Card>
      ) : <>
        <Card className="flex flex-wrap items-center gap-4 p-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900">{d.school.name}</h2>
            <p className="text-sm text-slate-600">School code <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-bold text-slate-900">{d.school.code}</span> · valid until {fmtDate(d.school.expiresAt)}</p>
          </div>
          <Button variant="secondary" loading={busy === 'renew'} onClick={() => act('renew', '/sales/my-demo/renew', 'Renewed for a year')}><RefreshCw className="size-4" />Renew for a year</Button>
          <Button variant="secondary" loading={busy === 'reset'} onClick={() => act('reset', '/sales/my-demo/reset-passwords', 'New passwords made')}><KeyRound className="size-4" />New passwords</Button>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {d.logins.map((l: any) => { const w = WHO[l.role] ?? { label: l.role, icon: '👤', color: 'bg-slate-50 ring-slate-200' }; return (
            <Card key={l.id} className={`space-y-3 p-5 ring-1 ${w.color}`}>
              <div className="flex items-center gap-3"><span className="text-4xl">{w.icon}</span>
                <div className="min-w-0"><div className="font-bold text-slate-900">{l.displayName}</div><Badge tone="info">{w.label}</Badge></div></div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm"><dt className="text-slate-500">Username</dt><dd className="font-mono font-semibold">{l.username}</dd>
                <dt className="text-slate-500">Password</dt><dd className="font-mono font-semibold">{l.password ?? '—'}</dd></dl>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={busy === l.id} onClick={() => open(l.id)}><ExternalLink className="size-3.5" />Open as {w.label.toLowerCase()}</Button>
                <Button size="sm" variant="secondary" onClick={() => copy(l)}><Copy className="size-3.5" />Copy sign-in</Button>
              </div>
            </Card>); })}
        </div>
        <p className="text-xs text-slate-500">“Open as …” signs you in as that account for up to 2 hours; a bar at the top takes you back. Use “New passwords” after a customer has tried the accounts.</p>
      </>}
      {d.others?.length > 0 && <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3"><h2 className="font-semibold text-slate-900">Demo schools you made for customers</h2></div>
        <ul className="divide-y divide-slate-100 text-sm">{d.others.map((s: any) => <li key={s.id} className="flex items-center justify-between px-5 py-2"><span>{s.name} · <span className="font-mono">{s.code}</span></span><span className="text-slate-500">until {fmtDate(s.expiresAt)}</span></li>)}</ul>
      </Card>}
    </div>
  );
}
