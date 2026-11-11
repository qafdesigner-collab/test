'use client';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileUp, KeyRound, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import { api, fmtDay, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useMe } from '@/lib/session';
import { Badge, Button, Dialog, ErrorBox, Field, Input, PageLoader, Pagination, Textarea } from '@/components/ui';
import { Credential, CredentialsDialog, PageHeader, Status, Table, Td } from '@/components/common';

/** Teachers or students of the signed-in school admin's school. */
export function PeoplePage({ role }: { role: 'TEACHER' | 'STUDENT' }) {
  const { data: me } = useMe();
  const noun = role === 'TEACHER' ? 'teacher' : 'student';
  const [f, setF] = useState({ search: '', page: 1 });
  const q = useQuery({ queryKey: ['people', role, f], queryFn: () => api.get(`/school/users${qs({ role, ...f, pageSize: 50 })}`), placeholderData: keepPreviousData });
  const [dlg, setDlg] = useState<'' | 'add' | 'import'>(''); const [creds, setCreds] = useState<Credential[] | null>(null);
  const keys = ['people', 'schoolOverview', 'eligible'];
  const status = useAction((v: { id: string; status: string }) => api.patch(`/school/users/${v.id}`, { status: v.status }), { ok: 'Saved', keys });
  const reset = useAction((id: string) => api.post(`/school/users/${id}/reset-password`), { after: (r) => setCreds([{ displayName: r.username, username: r.username, password: r.password }]) });
  return (
    <div className="space-y-6">
      <PageHeader title={role === 'TEACHER' ? 'Teachers' : 'Students'} sub={`Every ${noun} has their own login. Usernames are unique within your school.`}>
        <Button variant="secondary" onClick={() => setDlg('import')}><FileUp className="size-4" />Import CSV</Button>
        <Button onClick={() => setDlg('add')}><Plus className="size-4" />Add {noun}s</Button>
      </PageHeader>
      <Input className="max-w-xs" placeholder="Search name or username…" aria-label="Search" value={f.search} onChange={(e) => setF({ search: e.target.value, page: 1 })} />
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <>
          <Table head={['Name', 'Username', 'Book licences', 'Last sign-in', 'Status', '']} empty={!q.data.items.length}>
            {q.data.items.map((u: any) => (
              <tr key={u.id}><Td className="font-medium">{u.displayName}</Td><Td className="font-mono">{u.username}</Td>
                <Td>{u.seats ? <Badge tone="PUBLISHED">{u.seats} active</Badge> : <span className="text-xs text-slate-500">none</span>}</Td>
                <Td className="text-slate-500">{u.lastLoginAt ? fmtDay(u.lastLoginAt) : 'never'}</Td><Td><Status s={u.status} /></Td>
                <Td className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => reset.mutate(u.id)} title="New password"><KeyRound className="size-4" /></Button>
                  {u.id !== me?.id && (u.status === 'ACTIVE'
                    ? <Button size="sm" variant="ghost" onClick={() => status.mutate({ id: u.id, status: 'SUSPENDED' })} title="Suspend"><UserX className="size-4" /></Button>
                    : <Button size="sm" variant="ghost" onClick={() => status.mutate({ id: u.id, status: 'ACTIVE' })} title="Reactivate"><UserCheck className="size-4" /></Button>)}
                </Td></tr>
            ))}
          </Table>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
      {dlg === 'add' && <AddPeople role={role} onClose={() => setDlg('')} onCreated={setCreds} />}
      {dlg === 'import' && <ImportPeople role={role} onClose={() => setDlg('')} onCreated={setCreds} />}
      {creds && <CredentialsDialog title={`New ${noun} logins`} schoolCode={me?.school?.code} creds={creds} onClose={() => setCreds(null)} />}
    </div>
  );
}

function AddPeople({ role, onClose, onCreated }: { role: 'TEACHER' | 'STUDENT'; onClose: () => void; onCreated: (c: Credential[]) => void }) {
  const [rows, setRows] = useState([{ displayName: '', username: '' }]);
  const m = useAction(() => api.post('/school/users', { role, users: rows.filter((r) => r.displayName.trim()).map((r) => ({ displayName: r.displayName, username: r.username || undefined })) }),
    { ok: (r) => `${r.length} account(s) created`, keys: ['people', 'schoolOverview', 'eligible'], after: (r) => { onClose(); onCreated(r); } });
  return (
    <Dialog open onOpenChange={onClose} title={`Add ${role === 'TEACHER' ? 'teachers' : 'students'}`} description="Leave the username empty to generate one from the name. Simple passwords are generated and shown once.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_160px_32px] gap-2">
            <Input aria-label="Full name" placeholder="Full name" value={r.displayName} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, displayName: e.target.value } : x)))} autoFocus={i === rows.length - 1} />
            <Input aria-label="Username" placeholder="username (optional)" value={r.username} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, username: e.target.value.toLowerCase() } : x)))} />
            <button type="button" aria-label="Remove row" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded p-1.5 text-slate-500 hover:text-red-600 disabled:opacity-30"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => setRows([...rows, { displayName: '', username: '' }])}><Plus className="size-4" />Another</Button>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!rows.some((r) => r.displayName.trim())}>Create accounts</Button></div>
      </form>
    </Dialog>
  );
}

function ImportPeople({ role, onClose, onCreated }: { role: 'TEACHER' | 'STUDENT'; onClose: () => void; onCreated: (c: Credential[]) => void }) {
  const [csv, setCsv] = useState('');
  const m = useAction(() => api.post('/school/users/import', { role, csv }), { ok: (r) => `${r.length} account(s) imported`, keys: ['people', 'schoolOverview', 'eligible'], after: (r) => { onClose(); onCreated(r); } });
  const readFile = async (file?: File) => file && setCsv(await file.text());
  return (
    <Dialog open onOpenChange={onClose} wide title={`Import ${role === 'TEACHER' ? 'teachers' : 'students'} from CSV`} description="One person per line: name, username (optional), password (optional). Excel: File → Save As → CSV.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="CSV file"><Input type="file" accept=".csv,text/csv,.txt" onChange={(e) => readFile(e.target.files?.[0])} /></Field>
        <Field label="…or paste" hint={`${csv.split(/\r?\n/).filter((l) => l.trim()).length} line(s)`}><Textarea rows={8} className="font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'name,username\nAyesha Khan,ayesha\nBilal Ahmed,'} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!csv.trim()}>Import</Button></div>
      </form>
    </Dialog>
  );
}
