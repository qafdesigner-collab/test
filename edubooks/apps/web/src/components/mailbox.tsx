'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, CheckCircle2, Clock, Megaphone, Pause, Play, PenSquare, Plus, RefreshCw, Reply, Search, Send, Settings2, Trash2, Upload, Users, X, XCircle } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Textarea, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';

// ------------------------------------------------------------------ my email account
const PRESETS: Record<string, { label: string; smtpHost: string; smtpPort: number; smtpSecure: boolean; imapHost: string; imapPort: number; hint?: string }> = {
  domain: { label: 'School / company domain (cPanel)', smtpHost: 'mail.{domain}', smtpPort: 465, smtpSecure: true, imapHost: 'mail.{domain}', imapPort: 993, hint: 'Use the email address and password from cPanel → Email Accounts.' },
  gmail: { label: 'Gmail / Google Workspace', smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecure: true, imapHost: 'imap.gmail.com', imapPort: 993, hint: 'Gmail needs an “app password”: Google Account → Security → 2-Step Verification → App passwords.' },
  outlook: { label: 'Outlook / Microsoft 365', smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false, imapHost: 'outlook.office365.com', imapPort: 993, hint: 'Your IT admin may need to allow “SMTP AUTH” for your mailbox.' },
  zoho: { label: 'Zoho Mail', smtpHost: 'smtp.zoho.com', smtpPort: 465, smtpSecure: true, imapHost: 'imap.zoho.com', imapPort: 993 },
  other: { label: 'Other', smtpHost: '', smtpPort: 465, smtpSecure: true, imapHost: '', imapPort: 993 },
};

export const useMailAccount = () => useQuery({ queryKey: ['mailAccount'], queryFn: () => api.get<any>('/mailbox/account') });

export function EmailAccountDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient(); const acc = useMailAccount();
  const a = acc.data;
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<any>(null); const [more, setMore] = useState(false);
  if (!a) return null;
  const v = f ?? { preset: a.connected ? 'other' : 'domain', email: a.email ?? '', fromName: a.fromName ?? '', username: a.username ?? '', password: '', smtpHost: a.smtpHost ?? '', smtpPort: a.smtpPort ?? 465, smtpSecure: a.smtpSecure ?? true,
    imapHost: a.imapHost ?? '', imapPort: a.imapPort ?? 993, imapSecure: a.imapSecure ?? true, signature: a.signature ?? '', receive: a.connected ? !!a.imapHost : true };
  const set = (p: any) => setF({ ...v, ...p });
  const fill = (preset: string, email = v.email) => {
    const p = PRESETS[preset]; const domain = email.split('@')[1] ?? 'yourschool.com';
    set({ preset, email, smtpHost: p.smtpHost.replace('{domain}', domain), smtpPort: p.smtpPort, smtpSecure: p.smtpSecure, imapHost: p.imapHost.replace('{domain}', domain), imapPort: p.imapPort, imapSecure: true });
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.put('/mailbox/account', { email: v.email.trim(), fromName: v.fromName, username: v.username, password: v.password || undefined, smtpHost: v.smtpHost, smtpPort: Number(v.smtpPort), smtpSecure: v.smtpSecure,
        imapHost: v.receive ? v.imapHost : '', imapPort: Number(v.imapPort), imapSecure: v.imapSecure, signature: v.signature });
      toast('Email account connected — mail you send now comes from your own address'); qc.invalidateQueries({ queryKey: ['mailAccount'] }); onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const disconnect = async () => { await api.del('/mailbox/account'); qc.invalidateQueries({ queryKey: ['mailAccount'] }); qc.invalidateQueries({ queryKey: ['mailboxInbox'] }); toast('Email account removed'); onClose(); };
  const p = PRESETS[v.preset];
  return (
    <Dialog open onOpenChange={onClose} wide title="My email account" description="Connect your own email address. Mail you send to people (and campaigns) goes out from it, and mail that arrives in it shows under “My email”. Your password is stored encrypted and never shown again.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your email address"><Input required type="email" value={v.email} onChange={(e) => { const email = e.target.value; v.preset === 'domain' ? fill('domain', email) : set({ email }); }} placeholder="name@yourschool.com" /></Field>
          <Field label="Name people see"><Input value={v.fromName} maxLength={120} onChange={(e) => set({ fromName: e.target.value })} placeholder="e.g. Miss Sara — Sunrise School" /></Field>
        </div>
        <Field label="Email provider">
          <div className="flex flex-wrap gap-1.5">{Object.entries(PRESETS).map(([k, x]) => (
            <button type="button" key={k} onClick={() => fill(k)} aria-pressed={v.preset === k}
              className={cn('rounded-full px-3 py-1.5 text-sm font-medium ring-1', v.preset === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50')}>{x.label}</button>))}</div>
        </Field>
        {p?.hint && <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">💡 {p.hint}</p>}
        <Field label={a.hasPassword ? 'Password (leave empty to keep the saved one)' : 'Email password'}><Input type="password" autoComplete="new-password" value={v.password} onChange={(e) => set({ password: e.target.value })} required={!a.hasPassword} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.receive} onChange={(e) => set({ receive: e.target.checked })} />Also show mail I receive (incoming mail)</label>
        <button type="button" className="text-sm font-medium text-brand-700 hover:underline" onClick={() => setMore(!more)}><Settings2 className="me-1 inline size-4" />{more ? 'Hide server settings' : 'Server settings'}</button>
        {(more || v.preset === 'other') && (
          <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-6">
            <Field label="Outgoing server (SMTP)" className="sm:col-span-3"><Input required value={v.smtpHost} onChange={(e) => set({ smtpHost: e.target.value })} placeholder="mail.yourschool.com" /></Field>
            <Field label="Port" className="sm:col-span-1"><Input type="number" value={v.smtpPort} onChange={(e) => set({ smtpPort: e.target.value, smtpSecure: Number(e.target.value) === 465 })} /></Field>
            <Field label="Security" className="sm:col-span-2"><select className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" value={v.smtpSecure ? 'ssl' : 'tls'} onChange={(e) => set({ smtpSecure: e.target.value === 'ssl' })}><option value="ssl">SSL (465)</option><option value="tls">STARTTLS (587)</option></select></Field>
            {v.receive && <>
              <Field label="Incoming server (IMAP)" className="sm:col-span-3"><Input value={v.imapHost} onChange={(e) => set({ imapHost: e.target.value })} placeholder="mail.yourschool.com" /></Field>
              <Field label="Port" className="sm:col-span-1"><Input type="number" value={v.imapPort} onChange={(e) => set({ imapPort: e.target.value, imapSecure: Number(e.target.value) === 993 })} /></Field>
              <Field label="Security" className="sm:col-span-2"><select className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" value={v.imapSecure ? 'ssl' : 'tls'} onChange={(e) => set({ imapSecure: e.target.value === 'ssl' })}><option value="ssl">SSL (993)</option><option value="tls">STARTTLS (143)</option></select></Field>
            </>}
            <Field label="Login name (only if different from the email address)" className="sm:col-span-6"><Input value={v.username} onChange={(e) => set({ username: e.target.value })} /></Field>
          </div>
        )}
        <Field label="Signature (added under your emails)"><Textarea rows={2} maxLength={2000} value={v.signature} onChange={(e) => set({ signature: e.target.value })} placeholder={'e.g. Sara Khan\nKG Rose class teacher'} /></Field>
        {err && <ErrorBox error={err} />}
        <div className="flex flex-wrap items-center gap-2">
          {a.connected && <Button type="button" variant="ghost" className="text-red-600" onClick={disconnect}><Trash2 className="size-4" />Disconnect</Button>}
          <span className="ms-auto" /><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy}>{busy ? 'Checking the login…' : a.connected ? 'Save' : 'Connect'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------------ my email (incoming)
export function EmailInbox({ onSetup }: { onSetup: () => void }) {
  const { t } = useT(); const toast = useToast(); const qc = useQueryClient(); const acc = useMailAccount();
  const [q, setQ] = useState(''); const [sel, setSel] = useState<string | null>(null); const [write, setWrite] = useState(false); const [syncing, setSyncing] = useState(false);
  const list = useQuery({ queryKey: ['mailboxInbox', q], queryFn: () => api.get<any[]>(`/mailbox/inbox${q ? `?q=${encodeURIComponent(q)}` : ''}`), enabled: !!acc.data?.connected });
  const sync = async (quiet = false) => {
    setSyncing(true);
    try { const r = await api.post<any>('/mailbox/inbox/sync'); if (!quiet) toast(r.added ? `${r.added} new email${r.added === 1 ? '' : 's'}` : 'No new email'); qc.invalidateQueries({ queryKey: ['mailboxInbox'] }); qc.invalidateQueries({ queryKey: ['mailAccount'] }); }
    catch (e: any) { if (!quiet) toast(e.message, 'err'); } finally { setSyncing(false); }
  };
  const canReceive = !!(acc.data?.connected && acc.data.canReceive);
  useEffect(() => { if (canReceive) sync(true); }, [canReceive]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!acc.data) return <Card className="p-6"><PageLoader /></Card>;
  if (!acc.data.connected) return (
    <Card className="grid place-items-center gap-3 p-10 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-violet-100 text-violet-700"><AtSign className="size-7" /></span>
      <h3 className="text-lg font-semibold">{t('Connect your own email')}</h3>
      <p className="max-w-md text-sm text-slate-600">{t('Send from your own address (e.g. sara@yourschool.com), read the email you receive, and send campaigns — all from here.')}</p>
      <Button onClick={onSetup}><Plus className="size-4" />{t('Connect my email account')}</Button>
    </Card>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 text-sm shadow-sm">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 font-medium text-violet-800"><AtSign className="size-4" />{acc.data.email}</span>
        <Button size="sm" onClick={() => setWrite(true)}><PenSquare className="size-4" />{t('Write email')}</Button>
        {acc.data.canReceive && <Button size="sm" variant="secondary" loading={syncing} onClick={() => sync()}><RefreshCw className="size-4" />{t('Check for new email')}</Button>}
        <Button size="sm" variant="ghost" onClick={onSetup}><Settings2 className="size-4" />{t('Account settings')}</Button>
        {acc.data.lastError && <span className="text-xs text-red-600">⚠ {acc.data.lastError}</span>}
        <div className="relative ms-auto w-full sm:w-56"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="ps-9" placeholder={t('Search email…')} aria-label={t('Search email')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {!acc.data.canReceive ? <Card className="p-6 text-sm text-slate-600">{t('Incoming mail is off for this account. Turn it on in Account settings to read your email here.')}</Card> : (
        <Card className="grid min-h-[480px] overflow-hidden md:grid-cols-[340px_1fr]">
          <ul className={cn('max-h-[70vh] divide-y divide-slate-100 overflow-y-auto md:border-e md:border-slate-100', sel && 'hidden md:block')}>
            {list.data?.map((m) => (
              <li key={m.id}><button onClick={() => setSel(m.id)} className={cn('w-full px-4 py-3 text-start', sel === m.id ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                <span className="flex items-center gap-2"><b className={cn('min-w-0 flex-1 truncate text-sm', !m.read ? 'text-slate-900' : 'font-medium text-slate-700')}>{m.fromName || m.fromEmail}</b><span className="text-[11px] text-slate-500">{fmtDate(m.createdAt)}</span></span>
                <span className={cn('block truncate text-sm', !m.read ? 'font-semibold' : 'text-slate-700')}>{!m.read && <i className="me-1.5 inline-block size-2 rounded-full bg-brand-600" />}{m.subject}</span>
                <span className="block truncate text-xs text-slate-500">{m.snippet}</span></button></li>))}
            {list.data && !list.data.length && <li className="p-8 text-center text-sm text-slate-500">{syncing ? t('Checking your mailbox…') : t('No email yet.')}</li>}
            {!list.data && <li className="p-6"><PageLoader /></li>}
          </ul>
          {sel ? <EmailReader id={sel} onBack={() => setSel(null)} /> : <div className="hidden place-items-center text-sm text-slate-500 md:grid">{t('Choose an email to read.')}</div>}
        </Card>
      )}
      {write && <WriteEmail onClose={() => setWrite(false)} />}
    </div>
  );
}

function EmailReader({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useT(); const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mailboxItem', id], queryFn: () => api.get<any>(`/mailbox/inbox/${id}`) });
  const [reply, setReply] = useState(''); const [busy, setBusy] = useState(false);
  if (q.error) return <div className="p-4"><ErrorBox error={q.error} /></div>;
  if (!q.data) return <PageLoader />;
  const m = q.data;
  const send = async () => { setBusy(true); try { await api.post(`/mailbox/inbox/${id}/reply`, { body: reply }); setReply(''); toast(t('Reply sent from your email')); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const del = async () => { await api.del(`/mailbox/inbox/${id}`); qc.invalidateQueries({ queryKey: ['mailboxInbox'] }); onBack(); };
  return (
    <article className="flex min-h-0 flex-col">
      <header className="space-y-1 border-b border-slate-100 p-4">
        <button onClick={onBack} className="text-sm text-slate-500 md:hidden">← {t('Back')}</button>
        <div className="flex items-start gap-2"><h2 className="min-w-0 flex-1 text-lg font-semibold">{m.subject}</h2><Button size="sm" variant="ghost" onClick={del} aria-label={t('Remove from this list')}><Trash2 className="size-4" /></Button></div>
        <p className="text-sm text-slate-600">{t('From')}: <b>{m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail}</b> · {fmtDate(m.createdAt)}</p>
      </header>
      <div className="flex-1 overflow-y-auto whitespace-pre-wrap break-words p-4 text-[15px] leading-relaxed text-slate-800">{m.body || <i className="text-slate-400">{t('(no text)')}</i>}</div>
      <form className="flex items-end gap-2 border-t border-slate-100 p-3" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) send(); }}>
        <Textarea rows={2} className="flex-1" aria-label={t('Reply')} placeholder={t('Reply to {name}…', { name: m.fromName || m.fromEmail })} value={reply} onChange={(e) => setReply(e.target.value)} />
        <Button loading={busy} disabled={!reply.trim()}><Reply className="size-4" />{t('Reply')}</Button>
      </form>
    </article>
  );
}

function WriteEmail({ onClose }: { onClose: () => void }) {
  const toast = useToast(); const [f, setF] = useState({ to: '', subject: '', body: '' }); const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { const r = await api.post<any>('/mailbox/inbox/send', { to: f.to.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean), subject: f.subject, body: f.body }); toast(`Sent to ${r.sent}`); onClose(); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose} title="Write email" description="Sent from your own email address to anyone (up to 50 addresses). For more, use a campaign.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <Field label="To"><Input required value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} placeholder="parent@gmail.com, office@supplier.ae" /></Field>
        <Field label="Subject"><Input required maxLength={200} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label="Message"><Textarea rows={8} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}><Send className="size-4" />Send</Button></div>
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------------ campaigns
const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-slate-100 text-slate-700' }, SCHEDULED: { label: 'Scheduled', cls: 'bg-sky-100 text-sky-800' }, SENDING: { label: 'Sending', cls: 'bg-violet-100 text-violet-800' },
  PAUSED: { label: 'Paused', cls: 'bg-amber-100 text-amber-800' }, DONE: { label: 'Finished', cls: 'bg-emerald-100 text-emerald-800' }, CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};
const dt = (iso?: string | null) => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function Campaigns() {
  const { t } = useT(); const [create, setCreate] = useState(false); const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['campaigns'], queryFn: () => api.get<any[]>('/mailbox/campaigns'), refetchInterval: 20_000 });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 shadow-sm">
        <Button size="sm" onClick={() => setCreate(true)}><Megaphone className="size-4" />{t('New campaign')}</Button>
        <p className="text-sm text-slate-600">{t('Send one email to many people in small batches — e.g. 50 emails every 10 minutes — now or at a time you choose.')}</p>
      </div>
      {list.error && <ErrorBox error={list.error} />}
      {!list.data ? <Card className="p-6"><PageLoader /></Card> : !list.data.length ? (
        <Card className="grid place-items-center gap-2 p-10 text-center"><Megaphone className="size-10 text-violet-300" /><p className="text-sm text-slate-600">{t('No campaigns yet.')}</p></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{list.data.map((c) => {
          const pct = c.total ? Math.round(((c.sent + c.failed) / c.total) * 100) : 0;
          return (
            <Card key={c.id} className="cursor-pointer p-4 transition hover:shadow-md" onClick={() => setOpen(c.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(c.id)}>
              <div className="flex items-start gap-2"><b className="min-w-0 flex-1 truncate">{c.name}</b><span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS[c.status].cls)}>{t(STATUS[c.status].label)}</span></div>
              <p className="truncate text-sm text-slate-600">{c.subject}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-500"><span>✅ {c.sent}/{c.total} {t('sent')}</span>{c.failed > 0 && <span className="text-red-600">✕ {c.failed} {t('failed')}</span>}
                <span>{c.batchSize} {t('every')} {c.intervalMin} {t('min')}</span>{['SCHEDULED', 'SENDING'].includes(c.status) && <span><Clock className="me-0.5 inline size-3" />{t('next')}: {dt(c.nextAt)}</span>}</p>
              {c.lastError && <p className="mt-1 text-xs text-red-600">⚠ {c.lastError}</p>}
            </Card>);
        })}</div>
      )}
      {create && <NewCampaign onClose={() => setCreate(false)} onDone={(id) => { setCreate(false); setOpen(id); }} />}
      {open && <CampaignDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function NewCampaign({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast(); const qc = useQueryClient(); const acc = useMailAccount();
  const groups = useQuery({ queryKey: ['mailGroups'], queryFn: () => api.get<any[]>('/mail/groups') });
  const [to, setTo] = useState<{ key: string; label: string }[]>([]);
  const [f, setF] = useState({ name: '', subject: '', body: '', emails: '', batchSize: 50, intervalMin: 10, when: 'now', date: '', time: '09:00', useOwnAccount: true });
  const [busy, setBusy] = useState(false); const file = useRef<HTMLInputElement>(null);
  const pasted = useMemo(() => new Set((f.emails.match(/[^\s<>,;"]+@[^\s<>,;"]+\.[^\s<>,;"]+/g) ?? []).map((x) => x.toLowerCase())).size, [f.emails]);
  const reach = to.reduce((n, x) => n + (groups.data?.find((g) => g.key === x.key)?.count ?? 0), 0) + pasted;
  const batches = Math.max(1, Math.ceil(reach / Math.max(1, f.batchSize)));
  const mins = (batches - 1) * f.intervalMin;
  const span = mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 6) / 10} hours` : `${Math.round(mins / 144) / 10} days`;
  const readFile = async (fl?: File) => { if (!fl) return; const text = await fl.text(); setF((x) => ({ ...x, emails: `${x.emails ? `${x.emails}\n` : ''}${text}` })); };
  const save = async (start: boolean) => {
    setBusy(true);
    try {
      const startsAt = f.when === 'later' && f.date ? new Date(`${f.date}T${f.time}`).toISOString() : undefined;
      const c = await api.post<any>('/mailbox/campaigns', { name: f.name, subject: f.subject, body: f.body, to: to.map((x) => x.key), emails: f.emails, batchSize: f.batchSize, intervalMin: f.intervalMin, startsAt, start, useOwnAccount: f.useOwnAccount });
      toast(start ? (startsAt ? 'Campaign scheduled' : 'Campaign started — the first batch goes out within a minute') : 'Saved as a draft');
      qc.invalidateQueries({ queryKey: ['campaigns'] }); onDone(c.id);
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const valid = f.name.trim() && f.subject.trim() && f.body.trim() && (to.length || pasted) && (f.when === 'now' || f.date);
  return (
    <Dialog open onOpenChange={onClose} wide title="New email campaign" description="One email to many people, sent in small batches so mail servers accept it. Each person gets their own copy.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) save(true); }}>
        <Field label="Campaign name (only you see this)"><Input required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Admissions 2027 — open day" /></Field>
        <Field label="Who gets it">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">{to.map((x) => <span key={x.key} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-sm text-brand-800">{x.label}<button type="button" onClick={() => setTo(to.filter((y) => y.key !== x.key))} aria-label={`Remove ${x.label}`}><X className="size-3.5" /></button></span>)}</div>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">{groups.data?.map((g) => <button type="button" key={g.key} disabled={!g.count || to.some((x) => x.key === g.key)} onClick={() => setTo([...to, { key: g.key, label: g.label }])}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-brand-50 disabled:opacity-40"><Users className="me-1 inline size-3" />{g.label} <span className="text-slate-400">({g.count})</span></button>)}</div>
            <Textarea rows={4} value={f.emails} onChange={(e) => setF({ ...f, emails: e.target.value })} aria-label="Email addresses" placeholder={'Paste email addresses — one per line, or “Name <email>”\nahmed@gmail.com\nFatima Khan <fatima@school.ae>'} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Button type="button" size="sm" variant="secondary" onClick={() => file.current?.click()}><Upload className="size-4" />Load a CSV / text file</Button>
              <input ref={file} type="file" accept=".csv,.txt" hidden onChange={(e) => readFile(e.target.files?.[0])} />
              <span>{pasted} pasted · about <b>{reach}</b> people in total (only people with an email address are sent to)</span>
            </div>
          </div>
        </Field>
        <Field label="Subject"><Input required maxLength={200} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="e.g. You are invited to our Open Day, {first_name}!" /></Field>
        <Field label="Message"><Textarea rows={7} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder={'Dear {name},\n\n…'} />
          <span className="mt-1 block text-xs text-slate-500">Personalise with <code>{'{name}'}</code>, <code>{'{first_name}'}</code> or <code>{'{email}'}</code>.</span></Field>
        <div className="rounded-2xl bg-violet-50 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-900"><Clock className="size-4" />Sending speed and time</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Emails per batch"><Input type="number" min={1} max={500} value={f.batchSize} onChange={(e) => setF({ ...f, batchSize: Math.min(500, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
            <Field label="Every (minutes)"><Input type="number" min={1} max={1440} value={f.intervalMin} onChange={(e) => setF({ ...f, intervalMin: Math.min(1440, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
            <Field label="Start"><select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })}><option value="now">Now</option><option value="later">At a set time</option></select></Field>
            {f.when === 'later' && <div className="grid grid-cols-2 gap-2"><Field label="Date"><Input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field><Field label="Time"><Input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field></div>}
          </div>
          <p className="mt-2 text-sm text-violet-900">{reach ? <>≈ <b>{batches}</b> batch{batches === 1 ? '' : 'es'}; everyone has it in about <b>{span}</b>.</> : 'Choose who gets it to see how long it takes.'} <span className="text-violet-700">Tip: Gmail allows about 500 a day, cPanel mailboxes often 100–300 an hour.</span></p>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.useOwnAccount} onChange={(e) => setF({ ...f, useOwnAccount: e.target.checked })} />
          Send from my own email {acc.data?.connected ? <b>({acc.data.email})</b> : <span className="text-amber-700">(not connected — the platform’s email account is used)</span>}</label>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="secondary" disabled={!valid || busy} onClick={() => save(false)}>Save as draft</Button>
          <Button loading={busy} disabled={!valid}><Send className="size-4" />{f.when === 'later' ? 'Schedule' : 'Start sending'}</Button></div>
      </form>
    </Dialog>
  );
}

function CampaignDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['campaign', id], queryFn: () => api.get<any>(`/mailbox/campaigns/${id}`), refetchInterval: 10_000 });
  const [busy, setBusy] = useState(false);
  const act = async (action: string) => { setBusy(true); try { await api.post(`/mailbox/campaigns/${id}/action`, { action }); qc.invalidateQueries({ queryKey: ['campaign', id] }); qc.invalidateQueries({ queryKey: ['campaigns'] }); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const del = async () => { try { await api.del(`/mailbox/campaigns/${id}`); qc.invalidateQueries({ queryKey: ['campaigns'] }); onClose(); } catch (e: any) { toast(e.message, 'err'); } };
  const c = q.data;
  return (
    <Dialog open onOpenChange={onClose} wide title={c?.name ?? 'Campaign'} description={c ? `${c.subject} · to ${c.audience}` : undefined}>
      {!c ? <PageLoader /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['Total', c.total, 'bg-slate-50'], ['Sent', c.sent, 'bg-emerald-50 text-emerald-800'], ['Waiting', c.pending, 'bg-sky-50 text-sky-800'], ['Failed', c.failed, 'bg-red-50 text-red-700']].map(([l, n, cls]) => (
              <div key={l as string} className={cn('rounded-xl p-3 text-center', cls as string)}><b className="block text-2xl">{n as number}</b><span className="text-xs">{l as string}</span></div>))}
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-violet-500 transition-all" style={{ width: `${c.total ? ((c.sent + c.failed) / c.total) * 100 : 0}%` }} /></div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS[c.status].cls)}>{STATUS[c.status].label}</span>
            <span>{c.batchSize} emails every {c.intervalMin} min</span><span>Starts: {dt(c.startsAt)}</span>
            {['SCHEDULED', 'SENDING'].includes(c.status) && <span>Next batch: <b>{dt(c.nextAt)}</b></span>}
            {c.finishEstimate && <span>All sent by about <b>{dt(c.finishEstimate)}</b></span>}
            {c.finishedAt && <span>Finished {dt(c.finishedAt)}</span>}
          </p>
          {c.lastError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">⚠ {c.lastError}</p>}
          <div className="flex flex-wrap gap-2">
            {c.status === 'DRAFT' && <Button loading={busy} onClick={() => act('start')}><Play className="size-4" />Start</Button>}
            {['SCHEDULED', 'SENDING'].includes(c.status) && <Button variant="secondary" loading={busy} onClick={() => act('pause')}><Pause className="size-4" />Pause</Button>}
            {c.status === 'PAUSED' && <Button loading={busy} onClick={() => act('resume')}><Play className="size-4" />Resume</Button>}
            {!['DONE', 'CANCELLED'].includes(c.status) && <Button variant="ghost" className="text-red-600" onClick={() => act('cancel')}><XCircle className="size-4" />Cancel campaign</Button>}
            {!['SCHEDULED', 'SENDING'].includes(c.status) && <Button variant="ghost" className="ms-auto text-red-600" onClick={del}><Trash2 className="size-4" />Delete</Button>}
          </div>
          <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium">Message</summary><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{c.body}</p></details>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">Email</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{c.recipients.map((r: any) => (
                <tr key={r.email}><td className="px-3 py-1.5">{r.email}</td><td className="px-3 py-1.5 text-slate-600">{r.name}</td>
                  <td className="px-3 py-1.5">{r.status === 'SENT' ? <span className="text-emerald-700"><CheckCircle2 className="me-1 inline size-3.5" />{dt(r.sentAt)}</span> : r.status === 'FAILED' ? <span className="text-red-600" title={r.error}>✕ {r.error}</span> : <span className="text-slate-500">waiting</span>}</td></tr>))}</tbody></table>
            {c.total > c.recipients.length && <p className="p-2 text-center text-xs text-slate-500">Showing {c.recipients.length} of {c.total}</p>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
