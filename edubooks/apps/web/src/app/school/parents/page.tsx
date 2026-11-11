'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Pencil } from 'lucide-react';
import { api, fmtDay } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useMe } from '@/lib/session';
import { Button, Dialog, Field, Input, PageLoader } from '@/components/ui';
import { Credential, CredentialsDialog, PageHeader, Status, Table, Td } from '@/components/common';

export default function SchoolParents() {
  const { data: me } = useMe();
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['schoolParents', search], queryFn: () => api.get<any[]>(`/school/parents?search=${encodeURIComponent(search)}`) });
  const [creds, setCreds] = useState<Credential[] | null>(null); const [edit, setEdit] = useState<any>(null);
  const reset = useAction((id: string) => api.post<any>(`/school/users/${id}/reset-password`), { after: (r: any) => setCreds([{ displayName: r.username, username: r.username, password: r.password }]) });
  const save = useAction(() => api.patch(`/school/users/${edit.id}`, { displayName: edit.displayName, phone: edit.phone ?? '' }), { ok: 'Saved', keys: ['schoolParents'], after: () => setEdit(null) });
  return (
    <div className="space-y-6">
      <PageHeader title="Parents" sub="Parents follow homework, results, attendance and school news. Add a parent from a student's row on the Students page (👥 button)." />
      <Input className="max-w-xs" placeholder="Search name, username or phone…" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
      {!q.data ? <PageLoader /> : (
        <Table head={['Parent', 'Children', 'Mobile', 'Last sign-in', 'Status', '']} empty={!q.data.length}>
          {q.data.map((p) => (
            <tr key={p.id}><Td><div className="font-medium">{p.displayName}</div><div className="font-mono text-xs text-slate-600">{p.username}</div></Td>
              <Td className="text-sm">{p.children.map((c: any) => `${c.displayName} (${c.relation})`).join(', ') || '—'}</Td>
              <Td className="font-mono text-xs">{p.phone || <span className="font-sans text-amber-700">not set</span>}</Td>
              <Td className="text-slate-600">{p.lastLoginAt ? fmtDay(p.lastLoginAt) : 'never'}</Td><Td><Status s={p.status} /></Td>
              <Td className="whitespace-nowrap text-right">
                <Button size="sm" variant="ghost" title="Edit" onClick={() => setEdit({ ...p })}><Pencil className="size-4" /></Button>
                <Button size="sm" variant="ghost" title="New password" onClick={() => reset.mutate(p.id)}><KeyRound className="size-4" /></Button></Td></tr>))}
        </Table>)}
      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)} title={`Edit ${edit.displayName}`}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <Field label="Name"><Input required value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })} /></Field>
            <Field label="Mobile (WhatsApp)"><Input inputMode="tel" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="0300 1234567" /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.isPending}>Save</Button></div>
          </form>
        </Dialog>)}
      {creds && <CredentialsDialog title="New parent password" schoolCode={me?.school?.code} creds={creds} onClose={() => setCreds(null)} />}
    </div>
  );
}
