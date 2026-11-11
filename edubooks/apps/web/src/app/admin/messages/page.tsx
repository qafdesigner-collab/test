'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellRing, CheckCircle2, MessageCircle, Send, XCircle } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Badge, Button, Card, Field, Input, PageLoader } from '@/components/ui';
import { PageHeader, Table, Td } from '@/components/common';

const TONE: Record<string, string> = { SENT: 'PUBLISHED', SKIPPED: 'DRAFT', FAILED: 'danger', PENDING: 'info', SENDING: 'info' };
const KIND: Record<string, string> = { LICENCE_EXPIRY: 'Licence reminder', HOMEWORK: 'Homework', RESULT: 'Result', CALENDAR: 'Calendar', ATTENDANCE: 'Attendance', TEST: 'Test', REPORT: 'Report' };

export default function MessagesPage() {
  const ch = useQuery({ queryKey: ['channel'], queryFn: () => api.get<any>('/notifications/channel') });
  const out = useQuery({ queryKey: ['outbox'], queryFn: () => api.get<any[]>('/notifications/outbox'), refetchInterval: 15_000 });
  const [phone, setPhone] = useState('');
  const test = useAction(() => api.post('/notifications/test', { phone }), { ok: 'Test message queued. It is sent within a minute.', keys: ['outbox'] });
  const run = useAction(() => api.post<any>('/notifications/run'), { ok: (r: any) => (r.reminders ? `${r.reminders} reminder(s) sent` : 'No reminders due right now'), keys: ['outbox', 'notifs', 'notifCount'] });
  if (!ch.data) return <PageLoader />;
  const c = ch.data;
  return (
    <div className="space-y-6">
      <PageHeader title="Messages" sub="WhatsApp / SMS to schools and parents: licence reminders, homework, results, attendance and calendar news. Everyone also gets them in the app (the bell).">
        <Button variant="secondary" onClick={() => run.mutate()} loading={run.isPending}><BellRing className="size-4" />Send due reminders now</Button>
      </PageHeader>
      <Card className="flex flex-wrap items-start gap-4 p-5">
        <MessageCircle className="size-8 text-emerald-600" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-semibold">{c.configured ? `Connected: ${c.channel === 'whatsapp' ? 'WhatsApp (Meta Cloud API)' : c.channel === 'sms' ? 'SMS (Twilio)' : 'SMS/WhatsApp gateway (webhook)'}` : 'WhatsApp / SMS not connected yet'}</div>
          {c.configured ? <p className="text-sm text-slate-700">Messages go out automatically within a minute.</p> : (
            <div className="space-y-1 text-sm text-slate-700">
              <p>In-app notifications already work. To also send WhatsApp or SMS, add one of these to <code>.env</code> (File Manager → <code>edubooks-app/.env</code>) and restart the app:</p>
              <ul className="list-disc pl-5">
                <li><b>WhatsApp:</b> <code>NOTIFY_CHANNEL=whatsapp</code>, <code>WHATSAPP_TOKEN</code>, <code>WHATSAPP_PHONE_NUMBER_ID</code>, <code>WHATSAPP_TEMPLATE</code> (an approved template with one text field)</li>
                <li><b>SMS (Twilio):</b> <code>NOTIFY_CHANNEL=sms</code>, <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>, <code>TWILIO_FROM</code></li>
                <li><b>Local SMS company:</b> <code>NOTIFY_CHANNEL=webhook</code>, <code>NOTIFY_WEBHOOK_URL</code> (receives <code>{'{'}to, body, kind{'}'}</code>), optional <code>NOTIFY_WEBHOOK_TOKEN</code></li>
              </ul>
              {c.missing?.length > 0 && <p className="text-red-700">Missing: {c.missing.join(', ')}</p>}
              <p>Numbers like <code>0300 1234567</code> become <code>923001234567</code> (country code from <code>DEFAULT_COUNTRY_CODE</code>, default 92).</p>
            </div>)}
        </div>
        {c.configured ? <Badge tone="PUBLISHED"><CheckCircle2 className="size-3" />Ready</Badge> : <Badge tone="DRAFT"><XCircle className="size-3" />In-app only</Badge>}
      </Card>
      <Card className="p-5">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); test.mutate(); }}>
          <Field label="Send a test message to" className="w-64"><Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" inputMode="tel" /></Field>
          <Button loading={test.isPending}><Send className="size-4" />Send test</Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 font-semibold">Recent messages</div>
        <Table head={['When', 'Type', 'To', 'Message', 'Status']} empty={!out.data?.length}>
          {out.data?.map((m) => (
            <tr key={m.id}><Td className="whitespace-nowrap text-xs">{fmtDate(m.createdAt)}</Td><Td>{KIND[m.kind] ?? m.kind}</Td><Td className="font-mono text-xs">{m.toAddress}</Td>
              <Td className="max-w-md text-xs text-slate-700"><span className="line-clamp-2">{m.body}</span></Td>
              <Td><span title={m.lastError ?? ''}><Badge tone={TONE[m.status] as any}>{m.status === 'SKIPPED' ? 'not sent' : m.status.toLowerCase()}</Badge></span></Td></tr>))}
        </Table>
      </Card>
    </div>
  );
}
