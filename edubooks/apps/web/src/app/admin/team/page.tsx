'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, UserPlus } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/lib/session';

const ROLE: Record<string, string> = { PUBLISHER_ADMIN: 'Super admin', PUBLISHER_EDITOR: 'Editor', PUBLISHER_SALES: 'Sales' };

/** The publisher's own team: sales people, editors and super admins, each with their own username and password. */
export default function TeamPage() {
  const q = useQuery({ queryKey: ['team'], queryFn: () => api.get<any[]>('/admin/team') });
  const qc = useQueryClient(); const toast = useToast(); const { data: me } = useMe();
  const [adding, setAdding] = useState(false); const [shown, setShown] = useState<{ username: string; password: string } | null>(null);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const reset = async (u: any) => { const r = await api.post<any>(`/admin/team/${u.id}/reset-password`); setShown(r); qc.invalidateQueries({ queryKey: ['team'] }); };
  const status = async (u: any, s: string) => { await api.post(`/admin/team/${u.id}/status`, { status: s }); qc.invalidateQueries({ queryKey: ['team'] }); toast(s === 'ACTIVE' ? 'Reactivated' : 'Suspended'); };
  return (
    <div className="space-y-6">
      <PageHeader title="Team" sub="Your sales team, editors and super admins. Each has their own username and password. Sales people get their own demo school with a teacher, students and a parent to give demos." />
      <div><Button onClick={() => setAdding(true)}><UserPlus className="size-4" />Add a team member</Button></div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Username</th><th className="px-4 py-2">First password</th><th className="px-4 py-2">Demo school</th><th className="px-4 py-2">Last sign-in</th><th className="px-4 py-2" /></tr></thead>
          <tbody className="divide-y divide-slate-100">{q.data.map((u) => (
            <tr key={u.id} className={u.status !== 'ACTIVE' ? 'opacity-60' : ''}>
              <td className="px-4 py-2 font-medium text-slate-900">{u.displayName}{u.email && <div className="text-xs text-slate-500">{u.email}</div>}</td>
              <td className="px-4 py-2">{(u.roles ?? []).map((r: string) => <Badge key={r} tone={r === 'PUBLISHER_SALES' ? 'info' : 'neutral'}>{ROLE[r] ?? r}</Badge>)}{u.status !== 'ACTIVE' && <Badge tone="SUSPENDED">Suspended</Badge>}</td>
              <td className="px-4 py-2 font-mono">{u.username}</td>
              <td className="px-4 py-2 font-mono text-xs">{u.password ?? <span className="text-slate-400">changed by them</span>}</td>
              <td className="px-4 py-2 text-xs">{u.demo ? <>{u.demo.name} · <span className="font-mono">{u.demo.code}</span><div className="text-slate-500">until {fmtDate(u.demo.expiresAt)}</div></> : <span className="text-slate-400">—</span>}</td>
              <td className="px-4 py-2 text-xs text-slate-600">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'never'}</td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                <Button size="sm" variant="secondary" onClick={() => reset(u)}><KeyRound className="size-3.5" />New password</Button>{' '}
                {u.id !== me?.id && (u.status === 'ACTIVE' ? <Button size="sm" variant="secondary" className="text-red-700" onClick={() => status(u, 'SUSPENDED')}>Suspend</Button>
                  : <Button size="sm" variant="secondary" onClick={() => status(u, 'ACTIVE')}>Reactivate</Button>)}
              </td>
            </tr>))}</tbody>
        </table>
      </Card>
      {adding && <AddDialog onClose={() => setAdding(false)} onDone={(r) => { setAdding(false); setShown(r); qc.invalidateQueries({ queryKey: ['team'] }); }} />}
      {shown && <Dialog open onOpenChange={() => setShown(null)} title="Sign-in details" description="Give these to the team member. They sign in on the “Publisher staff” tab and choose their own password the first time.">
        <div className="space-y-2 rounded-xl bg-slate-50 p-4 font-mono text-lg"><div>Username: <b>{shown.username}</b></div><div>Password: <b>{shown.password}</b></div></div>
        <div className="mt-4 flex justify-end"><Button onClick={() => { navigator.clipboard?.writeText(`Username: ${shown.username}\nPassword: ${shown.password}`).catch(() => undefined); toast('Copied'); }}>Copy</Button></div>
      </Dialog>}
    </div>
  );
}

function AddDialog({ onClose, onDone }: { onClose: () => void; onDone: (r: any) => void }) {
  const [f, setF] = useState({ displayName: '', username: '', email: '', role: 'PUBLISHER_SALES', password: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { onDone(await api.post('/admin/team', { ...f, email: f.email || undefined, password: f.password || undefined })); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose} title="Add a team member">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <Field label="Name"><Input autoFocus required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value, username: f.username || '' })} /></Field>
        <Field label="Username" hint="Small letters, digits, dot or dash — e.g. sara.sales"><Input required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })} /></Field>
        <Field label="Email (optional)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="PUBLISHER_SALES">Sales — schools, orders, demos (own demo school)</option>
          <option value="PUBLISHER_EDITOR">Editor — books and content</option>
          <option value="PUBLISHER_ADMIN">Super admin — everything</option></Select></Field>
        <Field label="Password (optional)" hint="Leave empty to make one. At least 8 characters."><Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {err ? <ErrorBox error={err} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>Add</Button></div>
      </form>
    </Dialog>
  );
}
