'use client';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, KeyRound, Printer } from 'lucide-react';
import { showPrintPreview } from '@/lib/print-preview';
import { api, downloadCsv } from '@/lib/api';
import { Button, Dialog, ErrorBox, PageLoader, Select } from '@/components/ui';
import { Credential, CredentialsDialog } from '@/components/common';
import { useToast } from '@/components/ui/toast';

const NOUN: Record<string, string> = { STUDENT: 'students', TEACHER: 'teachers', SCHOOL_ADMIN: 'school admins', PARENT: 'parents' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

type Role = 'STUDENT' | 'TEACHER' | 'SCHOOL_ADMIN' | 'PARENT' | 'ALL';
const CHOICES: [Role, string][] = [['ALL', 'Whole school'], ['SCHOOL_ADMIN', 'School admins'], ['TEACHER', 'Teachers'], ['STUDENT', 'Students'], ['PARENT', 'Parents']];

/**
 * Login details for the whole school or one role: login IDs and the passwords that were given out
 * (kept encrypted; a password the user chose themself is never readable), plus new passwords + login cards.
 * `base` is "/school" for the school admin or "/schools/<id>" for the super admin.
 */
export function LoginsDialog({ base, role: startRole, onClose }: { base: string; role: Role; onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient(); const [role, setRole] = useState<Role>(startRole);
  const q = useQuery({ queryKey: ['logins', base, role], queryFn: () => api.get<any>(`${base}/logins?role=${role}`) });
  const [cls, setCls] = useState(''); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState<null | 'missing' | 'all'>(null); const [creds, setCreds] = useState<Credential[] | null>(null);
  const items: any[] = q.data?.items ?? [];
  const classes = useMemo(() => [...new Set(items.map((u) => u.className).filter(Boolean))].sort() as string[], [items]);
  const shown = items.filter((u) => !cls || u.className === cls);
  const noun = role === 'ALL' ? 'whole school' : NOUN[role];
  const school = q.data?.school;
  const active = shown.filter((u) => u.status === 'ACTIVE'); const missing = active.filter((u) => !u.password);
  const pw = (u: any) => u.password ?? (u.status === 'ACTIVE' ? 'not on file' : '—');
  const extra = (u: any) => (u.roleKey === 'STUDENT' ? u.className : u.designation) || '';
  const save = () => downloadCsv(`${school?.code ?? 'school'} ${noun} logins${cls ? ` - ${cls}` : ''}.csv`, shown.map((u, i) => ({ no: i + 1, role: u.role, name: u.displayName, classOrDesignation: extra(u), schoolCode: school?.code ?? '', loginId: u.username, password: pw(u), email: u.email ?? '', status: u.status.toLowerCase() })));
  const print = () => {
    showPrintPreview(`${school?.name ?? 'School'} — ${noun} logins`, `<!doctype html><html><head><meta charset="utf-8"><title>${esc(school?.name)} — ${noun} logins</title><style>body{font-family:Arial,sans-serif;margin:14mm;font-size:12px;background:#fff}h1{font-size:18px;margin:0}p{color:#475569}table{width:100%;border-collapse:collapse;margin-top:5mm}th,td{border-bottom:1px solid #e2e8f0;padding:1.8mm;text-align:left}th{background:#f1f5f9}td.m{font-family:monospace;font-size:12.5px}tr.g td{background:#eef2ff;font-weight:bold}</style></head><body>
      <h1>${esc(school?.name)}</h1><p>School code <b>${esc(school?.code)}</b> · ${esc(noun)}${cls ? ` · ${esc(cls)}` : ''} · sign in at ${esc(location.host)} with the school code, login ID (or email) and password</p>
      <table><thead><tr><th>#</th><th>Name</th><th>Role</th><th>Class / designation</th><th>Login ID</th><th>Password</th></tr></thead><tbody>${shown.map((u, i) => `${i === 0 || shown[i - 1].role !== u.role ? `<tr class="g"><td colspan="6">${esc(u.role)}s</td></tr>` : ''}<tr><td>${i + 1}</td><td>${esc(u.displayName)}</td><td>${esc(u.role)}</td><td>${esc(extra(u))}</td><td class="m">${esc(u.username)}</td><td class="m">${esc(pw(u))}</td></tr>`).join('')}</tbody></table>
      </body></html>`);
  };
  const reset = async (which: 'missing' | 'all') => {
    setBusy(true);
    try {
      const r = await api.post<any[]>(`${base}/logins/reset`, { role, onlyMissing: which === 'missing', userIds: (which === 'missing' ? missing : active).map((u) => u.id) });
      setCreds(r.map((c) => ({ displayName: c.displayName, username: c.username, password: c.password, role: c.role, className: c.className }))); setAsk(null);
      qc.invalidateQueries({ queryKey: ['logins'] }); // the list now shows the new passwords
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  if (creds) return <CredentialsDialog title={`New ${noun} logins`} schoolCode={school?.code} schoolName={school?.name} creds={creds} onClose={onClose}
    note="Print the login cards or save the file. These passwords also appear in the login list from now on (until each person chooses their own). The old passwords no longer work." />;
  return (
    <Dialog open onOpenChange={onClose} wide title="Download logins with passwords" description={school ? `${school.name} · school code ${school.code}` : undefined}>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
        {CHOICES.map(([k, l]) => <button key={k} role="tab" aria-selected={role === k} onClick={() => { setRole(k); setCls(''); setAsk(null); }}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${role === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'}`}>{l}</button>)}
      </div>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <div className="space-y-4">
          {(role === 'STUDENT' || role === 'ALL') && classes.length > 0 && (
            <label className="flex items-center gap-2 text-sm">Class <Select className="w-56" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">All classes</option>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</Select></label>
          )}
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 text-sm">
            <table className="w-full"><thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-3 py-2">Name</th>{role === 'ALL' && <th className="px-3 py-2">Role</th>}<th className="px-3 py-2">Class / designation</th><th className="px-3 py-2">Login ID</th><th className="px-3 py-2">Password</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{shown.map((u) => <tr key={u.id} className={u.status !== 'ACTIVE' ? 'text-slate-400' : ''}><td className="px-3 py-1.5">{u.displayName}</td>{role === 'ALL' && <td className="px-3 py-1.5">{u.role}</td>}<td className="px-3 py-1.5">{extra(u) || '—'}</td>
                <td className="px-3 py-1.5 font-mono">{u.username}</td><td className={`px-3 py-1.5 ${u.password ? 'font-mono font-semibold text-slate-900' : 'text-xs text-amber-700'}`}>{pw(u)}</td></tr>)}
                {!shown.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nobody yet.</td></tr>}</tbody></table>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="font-medium text-slate-900">1. Download the list <span className="font-normal text-slate-500">({shown.length} people)</span></p>
            <p className="mt-0.5 text-sm text-slate-600">Name, role, class, login ID and password, with the school code. {missing.length > 0 && <>“Not on file” means the person chose their own password (nobody can see it), or the account was made before passwords were kept. Give them a new one below — it will then appear here.</>}</p>
            <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={save} disabled={!shown.length}><Download className="size-4" />Save (Excel / CSV)</Button>
              <Button variant="secondary" onClick={print} disabled={!shown.length}><Printer className="size-4" />Print / PDF</Button></div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-medium text-amber-900">2. New passwords and login cards</p>
            <p className="mt-0.5 text-sm text-amber-900">Makes a new simple password and printable login cards (with QR codes). <b>Their old password stops working.</b> Teachers and school admins choose their own password at their next sign-in.</p>
            {!ask ? <div className="mt-3 flex flex-wrap gap-2">
                {missing.length > 0 && <Button variant="secondary" onClick={() => setAsk('missing')}><KeyRound className="size-4" />New passwords for the {missing.length} without one…</Button>}
                <Button variant="ghost" onClick={() => setAsk('all')} disabled={!active.length}>New passwords for everyone shown ({active.length})…</Button></div>
              : <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-amber-900">Sure? {(ask === 'missing' ? missing : active).length} people get a new password.</span>
                <Button variant="danger" loading={busy} onClick={() => reset(ask)}>Yes, make new passwords</Button><Button variant="ghost" onClick={() => setAsk(null)}>Cancel</Button></div>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
