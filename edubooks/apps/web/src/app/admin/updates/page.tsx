'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CloudDownload, History, Loader2, RotateCcw, Upload, XCircle } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader } from '@/components/ui';
import { PageHeader, Table, Td } from '@/components/common';
import { hasRole, useMe } from '@/lib/session';

const short = (b?: string | null) => (b ? b.split(' ').map((p, i) => (i === 0 ? fmtDate(p) : `#${p}`)).join(' · ') : '—');
const BUSY = ['applying', 'restarting'];

export default function UpdatesPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [waiting, setWaiting] = useState(false);
  const q = useQuery({ queryKey: ['updates'], queryFn: () => api.get('/system/updates'), refetchInterval: waiting ? 2500 : false, retry: false });
  const st = q.data?.state;
  const busy = waiting || BUSY.includes(st?.state);
  const atBefore = useRef<string | null>(null);

  // While updating, the app restarts: requests fail for a while, then it answers with the final result
  // (updated, automatically rolled back, or failed) — recognised as a result written after we started (server timestamps only).
  useEffect(() => {
    if (!waiting || !st?.at) return;
    if (['done', 'rolled_back', 'failed'].includes(st.state) && st.at !== atBefore.current) setWaiting(false);
  }, [st, waiting]);

  if (!hasRole(me, 'PUBLISHER_ADMIN')) return <Card className="p-8 text-center text-slate-600">Only the super admin can install updates.</Card>;
  if (q.isLoading && !waiting) return <PageLoader />;
  if (q.data && !q.data.supported) return (
    <div className="space-y-6"><PageHeader title="Updates" />
      <Card className="p-6 text-slate-600">This server is updated by deploying a new version (Docker). Updating from the admin panel is available on cPanel installations.</Card></div>
  );
  const start = () => { atBefore.current = st?.at ?? null; setWaiting(true); };
  return (
    <div className="space-y-6">
      <PageHeader title="Updates" sub="Install a new version of EduBooks. Your data is kept, a safety backup of the database is made first, and database changes are applied automatically." />

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <div className="min-w-0 flex-1"><div className="text-sm text-slate-600">Installed version</div><div className="font-semibold">{short(q.data?.current)}</div></div>
        {q.data?.previous && !busy && <RollbackButton previous={q.data.previous} onStarted={start} />}
      </Card>

      {busy ? <Progress state={st} offline={q.isError} />
        : st?.state === 'staged' ? <Review st={st} onStarted={start} onCancel={() => api.post('/system/updates/cancel').then(() => qc.invalidateQueries({ queryKey: ['updates'] }))} />
        : <>
          <Result st={st} />
          <UploadCard onStaged={() => qc.invalidateQueries({ queryKey: ['updates'] })} />
        </>}

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 font-semibold"><History className="size-4" />Update history</div>
        <Table head={['When', 'Action', 'From', 'To', 'Result']} empty={!q.data?.history?.length}>
          {q.data?.history?.map((h: any, i: number) => (
            <tr key={i}><Td>{fmtDate(h.at)}</Td><Td>{h.action === 'rollback' ? 'Roll back' : 'Update'}{h.newDatabaseChanges ? <span className="ml-1 text-xs text-slate-600">({h.newDatabaseChanges} database change{h.newDatabaseChanges > 1 ? 's' : ''})</span> : null}</Td>
              <Td className="text-xs">{short(h.from)}</Td><Td className="text-xs">{short(h.to)}</Td>
              <Td>{h.result === 'ok' ? <Badge tone="PUBLISHED">OK</Badge> : <span title={h.message}><Badge tone="danger">Failed</Badge></span>}</Td></tr>))}
        </Table>
      </Card>
    </div>
  );
}

function UploadCard({ onStaged }: { onStaged: () => void }) {
  const [file, setFile] = useState<File | null>(null); const [url, setUrl] = useState('');
  const [pct, setPct] = useState<number | null>(null); const [checking, setChecking] = useState(false); const [err, setErr] = useState<unknown>(null);
  const upload = async () => {
    if (!file) return; setErr(null); setPct(0);
    const fd = new FormData(); fd.append('package', file);
    try { await api.upload('/system/updates/upload', fd, (p) => { setPct(p); if (p === 100) setChecking(true); }); onStaged(); }
    catch (e) { setErr(e); } finally { setPct(null); setChecking(false); }
  };
  const download = async () => {
    setErr(null); setChecking(true);
    try { await api.post('/system/updates/download', { url }); onStaged(); } catch (e) { setErr(e); } finally { setChecking(false); }
  };
  const working = pct !== null || checking;
  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-center gap-2 font-semibold"><Upload className="size-4" />Install an update</div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Update file (.zip)"><Input type="file" accept=".zip,application/zip" disabled={working} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <p className="text-xs text-slate-600">Use the small <b>edubooks-lms-update.zip</b>, or the full <b>edubooks-lms-public_html.zip</b>.</p>
          <Button onClick={upload} disabled={!file || working} loading={pct !== null && !checking}>{pct !== null && !checking ? `Uploading ${pct}%` : 'Upload and check'}</Button>
        </div>
        <div className="space-y-3">
          <Field label="…or download it from a link"><Input placeholder="https://…/edubooks-lms-update.zip" value={url} disabled={working} onChange={(e) => setUrl(e.target.value)} /></Field>
          <p className="text-xs text-slate-600">Useful for large files: the server downloads the package itself.</p>
          <Button variant="secondary" onClick={download} disabled={!url.startsWith('https://') || working}><CloudDownload className="size-4" />Download and check</Button>
        </div>
      </div>
      {checking && <div className="flex items-center gap-2 text-sm text-slate-700"><Loader2 className="size-4 animate-spin" />Unpacking and checking the package… (this can take a minute)</div>}
      {err ? <ErrorBox error={err} /> : null}
      <p className="text-xs text-slate-600">Nothing changes until you confirm on the next screen.</p>
    </Card>
  );
}

function Review({ st, onStarted, onCancel }: { st: any; onStarted: () => void; onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="space-y-4 border-brand-200 p-5">
      <div className="text-lg font-semibold">Ready to install</div>
      <ul className="space-y-2 text-sm">
        <li>📦 New version: <b>{short(st.build)}</b> (installed: {short(st.current)})</li>
        <li>🗄️ Database changes: <b>{st.newDatabaseChanges ? `${st.newDatabaseChanges} — applied automatically` : 'none'}</b></li>
        <li>🛟 A safety backup of the database is made first. If the new version cannot start, the previous version is restored automatically.</li>
        <li>⏱️ The site is unavailable for about a minute while it restarts. Best done outside school hours.</li>
      </ul>
      <div className="flex gap-2"><Button onClick={() => setOpen(true)}>Install update</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button></div>
      {open && <PasswordDialog title="Install update" action="Install now" path="/system/updates/apply" onClose={() => setOpen(false)} onDone={onStarted} />}
    </Card>
  );
}

function RollbackButton({ previous, onStarted }: { previous: string; onStarted: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="secondary" onClick={() => setOpen(true)}><RotateCcw className="size-4" />Roll back</Button>
    {open && <PasswordDialog title="Return to the previous version" action="Roll back" path="/system/updates/rollback" onClose={() => setOpen(false)} onDone={onStarted}
      note={<>Returns to <b>{short(previous)}</b>, and restores the database from the backup made just before the last update. <b>Changes made since that update are lost</b>, and everyone, including you, has to sign in again.</>} />}
  </>;
}

function PasswordDialog({ title, action, path, note, onClose, onDone }: { title: string; action: string; path: string; note?: React.ReactNode; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  const go = async () => { setBusy(true); setErr(null); try { await api.post(path, { password: pw }); onClose(); onDone(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title}>
      <div className="space-y-4">
        {note && <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="size-4 shrink-0" /><span>{note}</span></p>}
        <Field label="Your password (to confirm)"><Input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pw && go()} /></Field>
        {err ? <ErrorBox error={err} /> : null}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} loading={busy} disabled={!pw}>{action}</Button></div>
      </div>
    </Dialog>
  );
}

function Progress({ state, offline }: { state: any; offline: boolean }) {
  return (
    <Card className="flex items-center gap-4 p-6">
      <Loader2 className="size-8 animate-spin text-brand-600" />
      <div><div className="font-semibold">{offline ? 'Restarting EduBooks…' : state?.step || 'Working…'}</div>
        <div className="text-sm text-slate-600">Please keep this page open. It updates by itself, usually within a minute or two.</div></div>
    </Card>
  );
}

function Result({ st }: { st: any }) {
  if (!st) return null;
  if (st.state === 'done') return <Card className="flex items-center gap-3 border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="size-5" />Updated to {short(st.build)}{st.newDatabaseChanges ? ` · ${st.newDatabaseChanges} database change(s) applied` : ''}.</Card>;
  if (st.state === 'rolled_back') return <Card className="flex items-center gap-3 border-amber-200 bg-amber-50 p-4 text-amber-900"><RotateCcw className="size-5 shrink-0" />{st.message}</Card>;
  if (st.state === 'failed') return <Card className="flex items-center gap-3 border-red-200 bg-red-50 p-4 text-red-900"><XCircle className="size-5 shrink-0" />{st.error}</Card>;
  return null;
}
