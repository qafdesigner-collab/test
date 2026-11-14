'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, KeyRound, Printer } from 'lucide-react';
import { api, downloadCsv } from '@/lib/api';
import { Button, Dialog, ErrorBox, PageLoader, Select } from '@/components/ui';
import { Credential, CredentialsDialog } from '@/components/common';
import { useToast } from '@/components/ui/toast';

const NOUN: Record<string, string> = { STUDENT: 'students', TEACHER: 'teachers', SCHOOL_ADMIN: 'school admins', PARENT: 'parents' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Login details for a whole role: a list (login IDs, emails, classes — passwords are never stored readable),
 * and new passwords + printable login cards for everyone shown.
 * `base` is "/school" for the school admin or "/schools/<id>" for the super admin.
 */
export function LoginsDialog({ base, role, onClose }: { base: string; role: 'STUDENT' | 'TEACHER' | 'SCHOOL_ADMIN' | 'PARENT'; onClose: () => void }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ['logins', base, role], queryFn: () => api.get<any>(`${base}/logins?role=${role}`) });
  const [cls, setCls] = useState(''); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(false); const [creds, setCreds] = useState<Credential[] | null>(null);
  const items: any[] = q.data?.items ?? [];
  const classes = useMemo(() => [...new Set(items.map((u) => u.className).filter(Boolean))].sort() as string[], [items]);
  const shown = items.filter((u) => !cls || u.className === cls);
  const noun = NOUN[role];
  const school = q.data?.school;
  const save = () => downloadCsv(`${school?.code ?? 'school'} ${noun} logins${cls ? ` - ${cls}` : ''}.csv`, shown.map((u, i) => ({ no: i + 1, name: u.displayName, class: u.className ?? '', designation: u.designation ?? '', schoolCode: school?.code ?? '', loginId: u.username, email: u.email ?? '', status: u.status.toLowerCase() })));
  const print = () => {
    const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to print', 'err'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(school?.name)} — ${noun} logins</title><style>body{font-family:Arial,sans-serif;margin:16mm;font-size:12px}h1{font-size:18px;margin:0}p{color:#475569}table{width:100%;border-collapse:collapse;margin-top:6mm}th,td{border-bottom:1px solid #e2e8f0;padding:2mm;text-align:left}th{background:#f1f5f9}td.m{font-family:monospace}</style></head><body>
      <h1>${esc(school?.name)}</h1><p>School code <b>${esc(school?.code)}</b> · ${esc(noun)}${cls ? ` · ${esc(cls)}` : ''} · sign in with the login ID (or email) and password</p>
      <table><thead><tr><th>#</th><th>Name</th><th>${role === 'STUDENT' ? 'Class' : 'Designation'}</th><th>Login ID</th><th>Email</th></tr></thead><tbody>${shown.map((u, i) => `<tr><td>${i + 1}</td><td>${esc(u.displayName)}</td><td>${esc(role === 'STUDENT' ? u.className : u.designation)}</td><td class="m">${esc(u.username)}</td><td>${esc(u.email)}</td></tr>`).join('')}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
  const reset = async () => {
    setBusy(true);
    try {
      const r = await api.post<any[]>(`${base}/logins/reset`, { role, userIds: shown.filter((u) => u.status === 'ACTIVE').map((u) => u.id) });
      setCreds(r.map((c) => ({ displayName: c.displayName, username: c.username, password: c.password, role: c.role, className: c.className }))); setAsk(false);
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  if (creds) return <CredentialsDialog title={`New ${noun} logins`} schoolCode={school?.code} schoolName={school?.name} creds={creds} onClose={onClose}
    note="These new passwords are shown only now — print the login cards or save the file before closing. The old passwords no longer work." />;
  const canReset = role === 'STUDENT' || role === 'TEACHER';
  return (
    <Dialog open onOpenChange={onClose} wide title={`Download ${noun} logins`} description={school ? `${school.name} · school code ${school.code}` : undefined}>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <div className="space-y-4">
          {role === 'STUDENT' && classes.length > 0 && (
            <label className="flex items-center gap-2 text-sm">Class <Select className="w-56" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">All classes</option>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</Select></label>
          )}
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 text-sm">
            <table className="w-full"><thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">{role === 'STUDENT' ? 'Class' : 'Designation'}</th><th className="px-3 py-2">Login ID</th><th className="px-3 py-2">Email</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{shown.map((u) => <tr key={u.id} className={u.status !== 'ACTIVE' ? 'text-slate-400' : ''}><td className="px-3 py-1.5">{u.displayName}</td><td className="px-3 py-1.5">{(role === 'STUDENT' ? u.className : u.designation) || '—'}</td>
                <td className="px-3 py-1.5 font-mono">{u.username}</td><td className="px-3 py-1.5">{u.email ?? '—'}</td></tr>)}
                {!shown.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Nobody yet.</td></tr>}</tbody></table>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="font-medium text-slate-900">1. Login list <span className="font-normal text-slate-500">({shown.length})</span></p>
            <p className="mt-0.5 text-sm text-slate-600">Names, login IDs, emails and the school code. Passwords are kept secret (stored scrambled), so they are not in this list.</p>
            <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={save} disabled={!shown.length}><Download className="size-4" />Save (Excel / CSV)</Button>
              <Button variant="secondary" onClick={print} disabled={!shown.length}><Printer className="size-4" />Print list</Button></div>
          </div>
          {canReset && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-medium text-amber-900">2. New passwords and login cards</p>
              <p className="mt-0.5 text-sm text-amber-900">Makes a new simple password for {cls ? `everyone in ${cls}` : `all ${shown.length} ${noun}`} and gives you printable login cards (with QR codes) and a file. <b>Their old passwords stop working.</b>{role === 'TEACHER' && ' Teachers choose their own password at their next sign-in.'}</p>
              {!ask ? <Button className="mt-3" variant="secondary" onClick={() => setAsk(true)} disabled={!shown.some((u) => u.status === 'ACTIVE')}><KeyRound className="size-4" />Make new passwords…</Button>
                : <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-amber-900">Sure? {shown.filter((u) => u.status === 'ACTIVE').length} people get a new password.</span>
                  <Button variant="danger" loading={busy} onClick={reset}>Yes, make new passwords</Button><Button variant="ghost" onClick={() => setAsk(false)}>Cancel</Button></div>}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
