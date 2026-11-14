'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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

export default function SchoolsPage() {
  const [f, setF] = useState({ search: '', status: '', demo: '', page: 1 });
  const [dlg, setDlg] = useState<'' | 'new' | 'demo'>('');
  const q = useQuery({ queryKey: ['schools', f], queryFn: () => api.get(`/schools${qs({ ...f, pageSize: 25 })}`), placeholderData: keepPreviousData });
  return (
    <div className="space-y-6">
      <PageHeader title="Schools" sub="Customer schools, their codes, accounts and licence usage.">
        <Button variant="secondary" onClick={() => setDlg('demo')}><Sparkles className="size-4" />Demo school</Button>
        <Button onClick={() => setDlg('new')}><Plus className="size-4" />Register school</Button>
      </PageHeader>
      <div className="flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder="Search name, code or city…" aria-label="Search" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value, page: 1 })} />
        <Select className="w-40" aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">Any status</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></Select>
        <Select className="w-44" aria-label="Type" value={f.demo} onChange={(e) => setF({ ...f, demo: e.target.value, page: 1 })}><option value="">Customers & demos</option><option value="false">Customers</option><option value="true">Demos</option></Select>
      </div>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : q.data.items.length === 0 ? <EmptyState icon={<Building2 className="size-10" />} title="No schools found" /> : (
        <>
          <Table head={['School', 'Code', 'People', 'Student seats in use', 'Status']}>
            {q.data.items.map((s: any) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td><Link className="font-medium text-slate-900 hover:text-brand-700" href={`/admin/schools/${s.id}`}>{s.name}</Link><div className="text-xs text-slate-600">{[s.city, s.curriculumName].filter(Boolean).join(' · ')}</div></Td>
                <Td className="font-mono">{s.code}</Td><Td className="text-slate-600">{s.teachers} teacher{s.teachers === 1 ? "" : "s"} · {s.students} student{s.students === 1 ? "" : "s"}</Td>
                <Td className="min-w-44">{s.seats ? <SeatBar assigned={s.assigned} total={s.seats} /> : <span className="text-xs text-slate-500">No active licences</span>}</Td>
                <Td><Status s={s.status} />{s.isDemo && <Badge tone={daysLeft(s.demoExpiresAt) < 0 ? 'danger' : 'info'} className="ml-1">{daysLeft(s.demoExpiresAt) < 0 ? 'demo expired' : `demo · ${daysLeft(s.demoExpiresAt)}d left`}</Badge>}</Td>
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
