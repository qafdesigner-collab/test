'use client';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Eraser, FileSpreadsheet, FileUp, KeyRound, Pencil, Plus, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import { ParentsDialog } from '@/components/parents';
import { readFile, StudentImport } from '@/components/student-import';
import { LoginsDialog } from '@/components/logins-download';
import { api, fmtDay, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useMe } from '@/lib/session';
import { Badge, Button, Dialog, ErrorBox, Field, Input, PageLoader, Pagination } from '@/components/ui';
import { Credential, CredentialsDialog, PageHeader, Status, Table, Td } from '@/components/common';

/** Teachers or students of the signed-in school admin's school. */
export function PeoplePage({ role }: { role: 'TEACHER' | 'STUDENT' }) {
  const { data: me } = useMe();
  const noun = role === 'TEACHER' ? 'teacher' : 'student';
  const [f, setF] = useState({ search: '', page: 1 });
  const q = useQuery({ queryKey: ['people', role, f], queryFn: () => api.get(`/school/users${qs({ role, ...f, pageSize: 50 })}`), placeholderData: keepPreviousData });
  const [dlg, setDlg] = useState<'' | 'add' | 'import'>(''); const [creds, setCreds] = useState<Credential[] | null>(null);
  const [parentsFor, setParentsFor] = useState<any>(null); const [eraseFor, setEraseFor] = useState<any>(null); const [editFor, setEditFor] = useState<any>(null); const [logins, setLogins] = useState(false);
  const keys = ['people', 'schoolOverview', 'eligible'];
  const status = useAction((v: { id: string; status: string }) => api.patch(`/school/users/${v.id}`, { status: v.status }), { ok: 'Saved', keys });
  const reset = useAction((id: string) => api.post(`/school/users/${id}/reset-password`), { after: (r) => setCreds([{ displayName: r.username, username: r.username, password: r.password }]) });
  return (
    <div className="space-y-6">
      <PageHeader title={role === 'TEACHER' ? 'Teachers' : 'Students'} sub={`Only a name is needed: each ${noun} gets a login ID and password. If you add an email, they can sign in with that too.`}>
        <Button variant="secondary" onClick={() => setLogins(true)}><KeyRound className="size-4" />Download logins</Button>
        <Button variant="secondary" onClick={() => setDlg('import')}><FileUp className="size-4" />Bulk import (Excel)</Button>
        <Button onClick={() => setDlg('add')}><Plus className="size-4" />Add {noun}s</Button>
      </PageHeader>
      <Input className="max-w-xs" placeholder="Search name or login ID…" aria-label="Search" value={f.search} onChange={(e) => setF({ search: e.target.value, page: 1 })} />
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <>
          <Table head={['Name', 'Login ID', role === 'TEACHER' ? 'Designation / email' : 'Email', 'Book licences', 'Last sign-in', 'Status', '']} empty={!q.data.items.length}>
            {q.data.items.map((u: any) => (
              <tr key={u.id}><Td className="font-medium">{u.displayName}</Td><Td className="font-mono">{u.username}</Td>
                <Td className="text-slate-600">{u.designation && <span className="block">{u.designation}</span>}{u.email ? <span className="block text-xs">{u.email}</span> : !u.designation && <span className="text-xs text-slate-400">—</span>}</Td>
                <Td>{u.seats ? <Badge tone="PUBLISHED">{u.seats} active</Badge> : <span className="text-xs text-slate-500">none</span>}</Td>
                <Td className="text-slate-500">{u.lastLoginAt ? fmtDay(u.lastLoginAt) : 'never'}</Td><Td><Status s={u.status} /></Td>
                <Td className="whitespace-nowrap text-right">
                  {role === 'STUDENT' && <Button size="sm" variant="ghost" onClick={() => setParentsFor(u)} title="Parents"><Users className="size-4" /></Button>}
                  {role === 'STUDENT' && u.displayName !== 'Deleted student' && <Button size="sm" variant="ghost" onClick={() => setEraseFor(u)} title="Erase this child's data"><Eraser className="size-4 text-red-500" /></Button>}
                  <Button size="sm" variant="ghost" onClick={() => setEditFor(u)} title="Edit details"><Pencil className="size-4" /></Button>
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
      {dlg === 'import' && (role === 'STUDENT' ? <StudentImport onClose={() => setDlg('')} onCreated={setCreds} /> : <ImportPeople role={role} onClose={() => setDlg('')} onCreated={setCreds} />)}
      {logins && <LoginsDialog base="/school" role={role} onClose={() => setLogins(false)} />}
      {editFor && <EditPerson role={role} person={editFor} onClose={() => setEditFor(null)} />}
      {eraseFor && <EraseDialog student={eraseFor} onClose={() => setEraseFor(null)} />}
      {parentsFor && <ParentsDialog student={parentsFor} onClose={() => setParentsFor(null)} />}
      {creds && <CredentialsDialog title={`New ${noun} logins`} schoolCode={me?.school?.code} creds={creds} onClose={() => setCreds(null)} />}
    </div>
  );
}

type Person = { displayName: string; designation: string; email: string; phone: string; username: string; password?: string };
const blank = (): Person => ({ displayName: '', designation: '', email: '', phone: '', username: '' });
const clean = (r: Person) => ({ displayName: r.displayName.trim(), designation: r.designation.trim() || undefined, email: r.email.trim() || undefined, phone: r.phone.trim() || undefined, username: r.username.trim() || undefined, password: r.password || undefined });

function AddPeople({ role, onClose, onCreated }: { role: 'TEACHER' | 'STUDENT'; onClose: () => void; onCreated: (c: Credential[]) => void }) {
  const [rows, setRows] = useState<Person[]>([blank()]);
  const m = useAction(() => api.post('/school/users', { role, users: rows.filter((r) => r.displayName.trim()).map(clean) }),
    { ok: (r) => `${r.length} account(s) created`, keys: ['people', 'schoolOverview', 'eligible'], after: (r) => { onClose(); onCreated(r); } });
  const set = (i: number, k: keyof Person, v: string) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const teacher = role === 'TEACHER';
  return (
    <Dialog open onOpenChange={onClose} wide title={`Add ${teacher ? 'teachers' : 'students'}`} description="Only the name is required. A login ID and a simple password are made automatically and shown once. Add an email if they have one: they can then sign in with it too.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className={`hidden gap-2 text-xs font-semibold text-slate-500 sm:grid ${teacher ? 'sm:grid-cols-[1.3fr_1fr_1.3fr_1fr_32px]' : 'sm:grid-cols-[1.3fr_1.3fr_1fr_32px]'}`}>
          <span>Name *</span>{teacher && <span>Designation</span>}<span>Email (optional)</span><span>Login ID (optional)</span><span /></div>
        {rows.map((r, i) => (
          <div key={i} className={`grid gap-2 ${teacher ? 'sm:grid-cols-[1.3fr_1fr_1.3fr_1fr_32px]' : 'sm:grid-cols-[1.3fr_1.3fr_1fr_32px]'}`}>
            <Input aria-label="Full name" placeholder="Full name" value={r.displayName} onChange={(e) => set(i, 'displayName', e.target.value)} autoFocus={i === rows.length - 1} />
            {teacher && <Input aria-label="Designation" placeholder="e.g. Class teacher" value={r.designation} onChange={(e) => set(i, 'designation', e.target.value)} />}
            <Input aria-label="Email" type="email" placeholder="name@school.ae" value={r.email} onChange={(e) => set(i, 'email', e.target.value)} />
            <Input aria-label="Login ID" placeholder="auto" value={r.username} onChange={(e) => set(i, 'username', e.target.value.toLowerCase())} />
            <button type="button" aria-label="Remove row" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded p-1.5 text-slate-500 hover:text-red-600 disabled:opacity-30"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => setRows([...rows, blank()])}><Plus className="size-4" />Another</Button>
        {m.error ? <ErrorBox error={m.error} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!rows.some((r) => r.displayName.trim())}>Create accounts</Button></div>
      </form>
    </Dialog>
  );
}

const HEAD: Record<keyof Person, RegExp> = {
  displayName: /^(teacher'?s?\s*|staff\s*)?(full\s*)?name$|^teacher$/i,
  designation: /^designation$|^position$|^job\s*title$|^title$|^role$|^subject$/i,
  email: /^e-?mail(\s*address)?$/i,
  phone: /^(mobile|phone|whatsapp|cell)(\s*(no\.?|number))?$/i,
  username: /^user\s*name$|^login(\s*id)?$|^user\s*id$/i,
  password: /^password$/i,
};
const TEACHER_TEMPLATE = 'Name,Designation,Email,Mobile,Login ID,Password\nAyesha Khan,Class teacher,ayesha@school.ae,050 555 0101,,\nBilal Ahmed,Arabic teacher,,,,\n';

/** Bulk teachers from an Excel (.xlsx) or CSV file: only Name is required. */
function ImportPeople({ role, onClose, onCreated }: { role: 'TEACHER' | 'STUDENT'; onClose: () => void; onCreated: (c: Credential[]) => void }) {
  const [rows, setRows] = useState<Person[]>([]); const [err, setErr] = useState<string | null>(null); const [unknown, setUnknown] = useState<string[]>([]);
  const m = useAction(() => api.post('/school/users', { role, users: rows.map(clean) }), { ok: (r) => `${r.length} account(s) imported`, keys: ['people', 'schoolOverview', 'eligible'], after: (r) => { onClose(); onCreated(r); } });
  const load = async (file?: File) => {
    if (!file) return; setErr(null);
    try {
      const table = await readFile(file);
      if (table.length < 2) throw new Error('The file needs a heading row and at least one person.');
      const heads = table[0].map((h) => String(h).trim());
      const map = heads.map((h) => (Object.keys(HEAD) as (keyof Person)[]).find((k) => HEAD[k].test(h)) ?? null);
      if (!map.includes('displayName')) throw new Error('No “Name” column found. Use the template headings.');
      setUnknown(heads.filter((h, i) => h && !map[i]));
      const data = table.slice(1).map((r) => { const o: any = blank(); map.forEach((k, i) => { if (k) o[k] = String(r[i] ?? '').trim(); }); return o as Person; }).filter((r) => r.displayName);
      if (!data.length) throw new Error('No names found under the “Name” heading.');
      if (data.length > 1000) throw new Error('At most 1000 people per file. Split the file.');
      setRows(data);
    } catch (e: any) { setErr(e.message); setRows([]); }
  };
  const noun = role === 'TEACHER' ? 'teachers' : 'students';
  return (
    <Dialog open onOpenChange={onClose} wide title={`Import ${noun} from Excel`} description="One person per row. Only Name is required. Optional columns: Designation, Email, Mobile, Login ID, Password. Missing login IDs and passwords are made automatically.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Excel (.xlsx) or CSV file" className="min-w-64 flex-1"><Input type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => load(e.target.files?.[0])} /></Field>
          <Button type="button" variant="ghost" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + TEACHER_TEMPLATE], { type: 'text/csv' })); a.download = `${noun}-template.csv`; a.click(); }}><Download className="size-4" />Template</Button>
        </div>
        {err && <ErrorBox error={new Error(err)} />}
        {unknown.length > 0 && <p className="text-xs text-amber-800">Ignored columns: {unknown.join(', ')}</p>}
        {rows.length > 0 && (
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 text-xs">
            <table className="w-full"><thead className="sticky top-0 bg-slate-50 text-left text-slate-600"><tr>{['#', 'Name', 'Designation', 'Email', 'Mobile', 'Login ID'].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{rows.slice(0, 100).map((r, i) => (
                <tr key={i}><td className="px-2 py-1 text-slate-500">{i + 1}</td><td className="px-2 py-1 font-medium">{r.displayName}</td><td className="px-2 py-1">{r.designation}</td>
                  <td className="px-2 py-1">{r.email}</td><td className="px-2 py-1 font-mono">{r.phone}</td><td className="px-2 py-1 font-mono text-slate-500">{r.username || 'auto'}</td></tr>))}</tbody></table>
            {rows.length > 100 && <p className="p-2 text-slate-600">…and {rows.length - 100} more</p>}
          </div>)}
        {m.error ? <ErrorBox error={m.error} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} loading={m.isPending} disabled={!rows.length}><FileSpreadsheet className="size-4" />Import {rows.length || ''} {noun}</Button></div>
      </div>
    </Dialog>
  );
}

function EditPerson({ role, person, onClose }: { role: 'TEACHER' | 'STUDENT'; person: any; onClose: () => void }) {
  const [f, setF] = useState({ displayName: person.displayName ?? '', designation: person.designation ?? '', email: person.email ?? '', phone: person.phone ?? '' });
  const m = useAction(() => api.patch(`/school/users/${person.id}`, { ...f, email: f.email.trim() || null }), { ok: 'Saved', keys: ['people'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title={`Edit ${person.displayName}`} description={`Login ID: ${person.username} (does not change).`}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Name"><Input required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
        {role === 'TEACHER' && <Field label="Designation" hint="Optional"><Input value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} placeholder="e.g. Class teacher" /></Field>}
        <Field label="Email" hint="Optional — they can sign in with it"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Mobile" hint="Optional"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        {m.error ? <ErrorBox error={m.error} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Save</Button></div>
      </form>
    </Dialog>
  );
}

/** Right to erasure: removes the child's personal data and learning records; their book seat is freed. */
function EraseDialog({ student, onClose }: { student: any; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const m = useAction(() => api.post<any>(`/school/students/${student.id}/erase`, { confirmUsername: typed }),
    { ok: (r: any) => `Data erased${r.seatsFreed ? ` — ${r.seatsFreed} book seat(s) freed` : ''}`, keys: ['people', 'schoolOverview', 'eligible', 'schoolParents'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title={`Erase ${student.displayName}'s data?`}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          <p><b>This cannot be undone.</b> Use it when a parent asks for their child's data to be deleted, or the child has left.</p>
          <ul className="list-disc pl-5">
            <li>Deleted: homework answers and marks, reading progress, bookmarks, games, stars, badges, teacher comments, messages and parent links.</li>
            <li>The account is anonymised (“Deleted student”) and can no longer sign in; the name is removed from earlier log entries.</li>
            <li>The child's book seats are freed for another pupil.</li>
          </ul>
        </div>
        <Field label={`Type the username “${student.username}” to confirm`}><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus /></Field>
        {m.error ? <ErrorBox error={m.error} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={m.isPending} disabled={typed.trim().toLowerCase() !== String(student.username).toLowerCase()}>Erase data</Button></div>
      </form>
    </Dialog>
  );
}

