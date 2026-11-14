'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MailCheck, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { hasRole, useMe } from '@/lib/session';
import { Button, Card, ErrorBox, Field, Input, PageLoader } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { useToast } from '@/components/ui/toast';

/** Super admin → Email: the outgoing mail account used for copies of mail, meeting invites and notifications. */
export default function EmailSettings() {
  const { data: me } = useMe(); const toast = useToast();
  const q = useQuery({ queryKey: ['mailSettings'], queryFn: () => api.get<any>('/admin/mail-settings'), enabled: hasRole(me, 'PUBLISHER_ADMIN') });
  const [f, setF] = useState<any>(null); const [busy, setBusy] = useState(false); const [testTo, setTestTo] = useState(''); const [testing, setTesting] = useState(false);
  useEffect(() => { if (q.data && !f) setF({ ...q.data, password: '' }); }, [q.data, f]);
  if (me && !hasRole(me, 'PUBLISHER_ADMIN')) return <Card className="p-8 text-center text-slate-600">Only the super admin can change email settings.</Card>;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!f) return <PageLoader />;
  const save = async () => { setBusy(true); try { const r = await api.put('/admin/mail-settings', { enabled: f.enabled, host: f.host, port: Number(f.port), secure: f.secure, username: f.username, password: f.password || undefined, fromName: f.fromName, fromEmail: f.fromEmail, notifyStudents: f.notifyStudents }); setF({ ...r, password: '' }); toast('Email settings saved'); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const test = async () => { setTesting(true); try { await api.post('/admin/mail-settings/test', { to: testTo }); toast(`Test email sent to ${testTo}`); } catch (e: any) { toast(e.message, 'err'); } finally { setTesting(false); } };
  return (
    <div className="space-y-6">
      <PageHeader title="Email" sub="Knowledge Gate has its own Mail for every user. To also send copies to people's real email (mail, meeting invitations and notifications), connect one email account here — for example a mailbox you create in cPanel → Email Accounts." />
      <Card className="space-y-4 p-5">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />Send email copies</label>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px_160px]">
          <Field label="Mail server (SMTP host)" hint="cPanel: mail.yourdomain.com"><Input value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="mail.wepublishingbooks.com" /></Field>
          <Field label="Port"><Input type="number" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} /></Field>
          <Field label="Security"><select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={f.secure ? 'ssl' : 'tls'} onChange={(e) => setF({ ...f, secure: e.target.value === 'ssl', port: e.target.value === 'ssl' ? 465 : 587 })}>
            <option value="ssl">SSL (port 465)</option><option value="tls">STARTTLS (port 587)</option></select></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Username" hint="Usually the full email address"><Input value={f.username} autoComplete="off" onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="noreply@wepublishingbooks.com" /></Field>
          <Field label="Password" hint={f.hasPassword ? 'Saved — leave empty to keep it' : 'The mailbox password'}><Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={f.hasPassword ? '••••••••' : ''} /></Field>
          <Field label="Sender name"><Input value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} placeholder="Knowledge Gate" /></Field>
          <Field label="Sender address" hint="Leave empty to use the username"><Input value={f.fromEmail} onChange={(e) => setF({ ...f, fromEmail: e.target.value })} placeholder="noreply@wepublishingbooks.com" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.notifyStudents} onChange={(e) => setF({ ...f, notifyStudents: e.target.checked })} />Also email notifications (homework, results, messages, announcements…) to students, parents and teachers who have an email address</label>
        {f.siteUrl && <p className="text-xs text-slate-500">Links in emails open <b>{f.siteUrl}</b> (taken from the address you are using now).</p>}
        <div className="flex justify-end"><Button onClick={save} loading={busy}><Save className="size-4" />Save</Button></div>
      </Card>
      <Card className="flex flex-wrap items-end gap-3 p-5">
        <Field label="Send a test email to" className="min-w-64 flex-1"><Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" /></Field>
        <Button variant="secondary" onClick={test} loading={testing} disabled={!testTo.includes('@')}><MailCheck className="size-4" />Send test</Button>
      </Card>
    </div>
  );
}
