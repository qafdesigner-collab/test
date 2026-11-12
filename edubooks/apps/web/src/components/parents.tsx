'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useMe } from '@/lib/session';
import { Button, Dialog, Field, Input, Select } from '@/components/ui';
import { Credential, CredentialsDialog } from '@/components/common';

const RELATIONS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Parent'];

/** Parents of one student: list, add a new parent account, link an existing one (siblings), remove. */
export function ParentsDialog({ student, onClose }: { student: { id: string; displayName: string }; onClose: () => void }) {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['parentsOf', student.id], queryFn: () => api.get<any[]>(`/school/students/${student.id}/parents`) });
  const all = useQuery({ queryKey: ['schoolParents'], queryFn: () => api.get<any[]>('/school/parents') });
  const [mode, setMode] = useState<'' | 'new' | 'link'>('');
  const [f, setF] = useState({ displayName: '', phone: '', relation: 'Mother', parentId: '' });
  const [creds, setCreds] = useState<Credential[] | null>(null);
  const keys = ['parentsOf', 'schoolParents'];
  const add = useAction(() => api.post<any>(`/school/students/${student.id}/parents`, mode === 'link' ? { parentId: f.parentId, relation: f.relation } : { displayName: f.displayName, phone: f.phone || undefined, relation: f.relation }),
    { ok: 'Parent added', keys, after: (r: any) => { setMode(''); setF({ displayName: '', phone: '', relation: 'Mother', parentId: '' }); if (r.credentials) setCreds([r.credentials]); } });
  const remove = useAction((pid: string) => api.del(`/school/students/${student.id}/parents/${pid}`), { ok: 'Link removed', keys });
  const linked = new Set((q.data ?? []).map((p) => p.id));
  return (
    <Dialog open onOpenChange={onClose} title={`Parents of ${student.displayName}`} description="Parents sign in with your school code to follow homework, results, attendance and school news. They also receive WhatsApp/SMS messages when a phone number is set.">
      <div className="space-y-4">
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {!q.data?.length ? <li className="p-3 text-sm text-slate-600">No parent added yet.</li> : q.data.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1"><span className="block font-medium">{p.displayName} <span className="font-normal text-slate-600">· {p.relation}</span></span>
                <span className="block text-xs text-slate-600">{p.username}{p.phone ? ` · ${p.phone}` : ' · no phone'}</span></span>
              <Button size="sm" variant="ghost" aria-label={`Remove ${p.displayName}`} onClick={() => remove.mutate(p.id)}><Trash2 className="size-4 text-red-500" /></Button>
            </li>))}
        </ul>
        {!mode ? (
          <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setMode('new')}><Plus className="size-4" />New parent account</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode('link')}><Link2 className="size-4" />Link an existing parent (brother/sister)</Button></div>
        ) : (
          <form className="space-y-3 rounded-lg border border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
            {mode === 'new' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Parent's name"><Input required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} autoFocus /></Field>
                <Field label="Mobile (WhatsApp)"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="050 123 4567" /></Field>
              </div>
            ) : (
              <Field label="Parent"><Select required value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
                <option value="">Choose…</option>{all.data?.filter((p) => !linked.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.displayName}{p.children.length ? ` (parent of ${p.children.map((c: any) => c.displayName).join(', ')})` : ''}</option>)}</Select></Field>
            )}
            <Field label="Relation"><Select value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setMode('')}>Cancel</Button><Button loading={add.isPending}>Save</Button></div>
          </form>
        )}
      </div>
      {creds && <CredentialsDialog title="Parent login" schoolCode={me?.school?.code} creds={creds} onClose={() => setCreds(null)} note="Give this to the parent. They sign in with the school code, this username and password." />}
    </Dialog>
  );
}
