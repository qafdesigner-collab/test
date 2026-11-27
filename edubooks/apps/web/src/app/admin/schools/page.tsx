'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { hasRole, useMe } from '@/lib/session';
import { Building2, Plus, Sparkles } from 'lucide-react';
import { api, daysLeft, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { CurriculumSelect } from '@/components/curriculum';
import { Badge, Button, Dialog, EmptyState, ErrorBox, Field, Input, PageLoader, Pagination, Select } from '@/components/ui';
import { CredentialsDialog, PageHeader, SeatBar, Status, Table, Td } from '@/components/common';

function NewSchool({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', code: '', city: '', phone: '', address: '', curriculumId: '', adminName: 'Principal', adminUsername: 'principal', adminPassword: '' });
  const m = useAction(() => api.post('/schools', { ...f, curriculumId: f.curriculumId || undefined }), { ok: 'School registered', keys: ['schools'], after: (r) => router.push(`/admin/schools/${r.id}`) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={onClose} title="Register a school" description="Creates the school, its unique school code and its first School Admin account.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="School name"><Input required value={f.name} onChange={set('name')} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="School code" hint="Used at login, e.g. SUN01"><Input required pattern="[A-Za-z0-9\-]{3,20}" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="City"><Input value={f.city} onChange={set('city')} /></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field><Field label="Address"><Input value={f.address} onChange={set('address')} /></Field></div>
        <Field label="Curriculum" hint="Decides which grades the school sees for its classes"><CurriculumSelect className="w-full" emptyLabel="Not set" value={f.curriculumId} onChange={(v) => setF({ ...f, curriculumId: v })} /></Field>
        <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3"><legend className="px-1 text-sm font-medium text-slate-700">First School Admin</legend>
          <div className="grid grid-cols-2 gap-3"><Field label="Name"><Input required value={f.adminName} onChange={set('adminName')} /></Field><Field label="Username"><Input required value={f.adminUsername} onChange={(e) => setF({ ...f, adminUsername: e.target.value.toLowerCase() })} /></Field></div>
          <Field label="Temporary password" hint="At least 8 characters — they will be asked to change it."><Input required minLength={8} value={f.adminPassword} onChange={set('adminPassword')} /></Field>
        </fieldset>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Register school</Button></div>
      </form>
    </Dialog>
  );
}

function NewDemo({ onClose }: { onClose: () => void }) {
  const products = useQuery({ queryKey: ['products', 'active'], queryFn: () => api.get('/commerce/products?pageSize=100') });
  const [f, setF] = useState({ name: '', city: '', contact: '', days: 14, productVersionIds: [] as string[] });
  const [result, setResult] = useState<any>(null);
  const m = useAction(() => api.post('/schools/demo', f), { ok: 'Demo school ready', keys: ['schools'], after: setResult });
  if (result) return <CredentialsDialog title={`Demo logins — ${f.name}`} schoolCode={result.code} creds={result.logins} onClose={onClose}
    note={`Ready to use until ${new Date(result.expiresAt).toLocaleDateString()}. Passwords are shown only now.`} />;
  const sellable = (products.data?.items ?? []).filter((p: any) => p.active);
  return (
    <Dialog open onOpenChange={onClose} title="Instant demo school" description="For the sales team: a trial school with a principal, a teacher and two students, ready in seconds. It stops working at the end of the trial.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Prospect school name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="City"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <Field label="Contact"><Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field></div>
        <Field label="Products to demo"><div className="space-y-1.5">{sellable.map((p: any) => (
          <label key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input type="checkbox" checked={f.productVersionIds.includes(p.active.id)} onChange={(e) => setF({ ...f, productVersionIds: e.target.checked ? [...f.productVersionIds, p.active.id] : f.productVersionIds.filter((x) => x !== p.active.id) })} />
            {p.name} <span className="text-xs text-slate-500">{p.kind === 'BUNDLE' ? `${p.active.items} books` : '1 book'}</span></label>))}</div></Field>
        <Field label="Trial length"><Select value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })}>{[7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}</Select></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!f.productVersionIds.length}><Sparkles className="size-4" />Create demo</Button></div>
      </form>
    </Dialog>
  );
}

/** Super admin: give a school to a salesperson. The salesperson then sees only their schools and their orders. */
function SalesOwner({ school, team }: { school: any; team: any[] }) {
  const m = useAction((userId: string) => api.put('/schools/sales-owner', { schoolIds: [school.id], userId: userId || null }),
    { ok: (_r: any) => 'Salesperson saved', keys: ['schools', 'salesTeam'] });
  return (
    <Select className="w-44" aria-label={`Salesperson for ${school.name}`} value={school.salesOwnerId ?? ''} disabled={m.isPending} onChange={(e) => m.mutate(e.target.value)}>
      <option value="">— not assigned —</option>
      {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </Select>
  );
}

export default function SchoolsPage() {
  const { data: me } = useMe(); const admin = hasRole(me, 'PUBLISHER_ADMIN');
  const [f, setF] = useState({ search: '', status: '', demo: '', salesOwnerId: '', page: 1 });
  const [dlg, setDlg] = useState<'' | 'new' | 'demo'>('');
  const q = useQuery({ queryKey: ['schools', f], queryFn: () => api.get(`/schools${qs({ ...f, pageSize: 25 })}`), placeholderData: keepPreviousData });
  const team = useQuery({ queryKey: ['salesTeam'], queryFn: () => api.get<any[]>('/schools/sales-team'), enabled: admin });
  return (
    <div className="space-y-6">
      <PageHeader title="Schools" sub="Customer schools, their codes, accounts and licence usage.">
        <Button variant="secondary" onClick={() => setDlg('demo')}><Sparkles className="size-4" />Demo school</Button>
        <Button onClick={() => setDlg('new')}><Plus className="size-4" />Register school</Button>
      </PageHeader>
      <Registrations />
      <div className="flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder="Search name, code or city…" aria-label="Search" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value, page: 1 })} />
        <Select className="w-40" aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">Any status</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></Select>
        {admin && (team.data?.length ?? 0) > 0 && <Select className="w-48" aria-label="Salesperson" value={f.salesOwnerId} onChange={(e) => setF({ ...f, salesOwnerId: e.target.value, page: 1 })}>
          <option value="">Every salesperson</option><option value="none">Not assigned</option>{team.data!.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.schools})</option>)}</Select>}
        <Select className="w-44" aria-label="Type" value={f.demo} onChange={(e) => setF({ ...f, demo: e.target.value, page: 1 })}><option value="">Customers & demos</option><option value="false">Customers</option><option value="true">Demos</option></Select>
      </div>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : q.data.items.length === 0 ? <EmptyState icon={<Building2 className="size-10" />} title="No schools found" /> : (
        <>
          {!admin && hasRole(me, 'PUBLISHER_SALES') && <p className="text-sm text-slate-600">These are <b>your schools</b>: the ones the super admin assigned to you, your demo school and schools you registered.</p>}
          <Table head={['School', 'Code', 'People', 'Student seats in use', 'Status', ...(admin ? ['Salesperson'] : [])]}>
            {q.data.items.map((s: any) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td><Link className="font-medium text-slate-900 hover:text-brand-700" href={`/admin/schools/${s.id}`}>{s.name}</Link><div className="text-xs text-slate-600">{[s.city, s.curriculumName].filter(Boolean).join(' · ')}</div></Td>
                <Td className="font-mono">{s.code}</Td><Td className="text-slate-600">{s.teachers} teacher{s.teachers === 1 ? "" : "s"} · {s.students} student{s.students === 1 ? "" : "s"}</Td>
                <Td className="min-w-44">{s.seats ? <SeatBar assigned={s.assigned} total={s.seats} /> : <span className="text-xs text-slate-500">No active licences</span>}</Td>
                <Td><Status s={s.status} />{s.isDemo && <Badge tone={daysLeft(s.demoExpiresAt) < 0 ? 'danger' : 'info'} className="ml-1">{daysLeft(s.demoExpiresAt) < 0 ? 'demo expired' : `demo · ${daysLeft(s.demoExpiresAt)}d left`}</Badge>}</Td>
                {admin && <Td>{team.data?.length ? <SalesOwner school={s} team={team.data} /> : <span className="text-xs text-slate-500">Add sales people in Team</span>}</Td>}
              </tr>
            ))}
          </Table>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
      {dlg === 'new' && <NewSchool onClose={() => setDlg('')} />}
      {dlg === 'demo' && <NewDemo onClose={() => setDlg('')} />}
    </div>
  );
}

/** Schools that registered themselves from the login page: approve or reject; open / close the registration page. */
function Registrations() {
  const qc = useQueryClient(); const toast = useToast(); const { data: me } = useMe(); const isAdmin = hasRole(me, 'PUBLISHER_ADMIN');
  const q = useQuery({ queryKey: ['registrations'], queryFn: () => api.get<any>('/schools/registrations') });
  const [reject, setReject] = useState<any>(null); const [note, setNote] = useState(''); const [busy, setBusy] = useState('');
  if (!q.data) return null;
  const pending = q.data.items.filter((r: any) => r.status === 'PENDING');
  const act = async (r: any, what: 'approve' | 'reject', n = '') => {
    setBusy(r.school_id + what);
    try { await api.post(`/schools/${r.school_id}/registration/${what}`, { note: n || undefined }); toast(what === 'approve' ? `${r.name} approved — they can sign in now` : `${r.name} rejected`); setReject(null); setNote('');
      ['registrations', 'schools'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  const toggle = async () => { try { await api.put('/schools/registration-settings', { enabled: !q.data.enabled }); qc.invalidateQueries({ queryKey: ['registrations'] }); toast(q.data.enabled ? 'Registration page closed' : 'Registration page open'); } catch (e: any) { toast(e.message, 'err'); } };
  return (
    <div className={`rounded-xl border p-4 ${pending.length ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-semibold text-slate-900">🏫 School registrations {pending.length > 0 && <Badge tone="DRAFT">{pending.length} waiting</Badge>}</p>
          <p className="text-xs text-slate-600">Schools can register themselves with “Register your school” on the login page. They sign in only after you approve.</p></div>
        {isAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q.data.enabled} onChange={toggle} />Registration page open</label>}
      </div>
      {pending.length > 0 && <ul className="mt-3 divide-y divide-amber-200">{pending.map((r: any) => (
        <li key={r.school_id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{r.name} <span className="font-mono text-xs text-slate-500">{r.code}</span></p>
            <p className="text-slate-600">{[r.city, r.address, r.phone, r.school_email, r.students ? `${r.students} students` : null].filter(Boolean).join(' · ')}</p>
            <p className="text-slate-600">Admin: <b>{r.contact_name}</b> · {r.contact_email}{r.contact_phone ? ` · ${r.contact_phone}` : ''}</p>
            {r.message && <p className="mt-1 rounded bg-white/70 p-2 text-slate-700">“{r.message}”</p>}
            <p className="text-xs text-slate-500">Registered {new Date(r.created_at).toLocaleString()}</p>
          </div>
          {isAdmin && <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setReject(r)}>Reject</Button>
            <Button size="sm" variant="success" loading={busy === r.school_id + 'approve'} onClick={() => act(r, 'approve')}>Approve</Button>
            <Link href={`/admin/schools/${r.school_id}`} className="self-center text-xs text-brand-700 hover:underline">Open</Link></div>}
        </li>))}</ul>}
      {reject && <Dialog open onOpenChange={() => setReject(null)} title={`Reject ${reject.name}?`} description="The school cannot sign in. To let it in later, open the school and press Reactivate.">
        <div className="space-y-3"><Field label="Reason (optional, for your records)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. could not confirm the school" /></Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" loading={busy === reject.school_id + 'reject'} onClick={() => act(reject, 'reject', note)}>Reject</Button></div></div>
      </Dialog>}
    </div>
  );
}
