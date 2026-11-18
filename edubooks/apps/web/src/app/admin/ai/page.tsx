'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Cpu, Download, XCircle } from 'lucide-react';
import { api, downloadCsv } from '@/lib/api';
import { Badge, Button, Card, Dialog, Field, Input, PageLoader, cn } from '@/components/ui';
import { AiConnectForm } from '@/components/ai-connect';
import { Money, useMoney } from '@/lib/company';
import { useToast } from '@/components/ui/toast';
import { PageHeader, Stat, Table, Td } from '@/components/common';

export default function AdminAi() {
  const status = useQuery({ queryKey: ['aiStatus'], queryFn: () => api.get('/ai/status') });
  const usage = useQuery({ queryKey: ['aiUsage'], queryFn: () => api.get('/ai/usage') });
  if (!status.data || !usage.data) return <PageLoader />;
  const s = status.data; const u = usage.data;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const cur = u.byMonth.filter((r: any) => r.month === thisMonth);
  const sum = (k: string) => cur.reduce((n: number, r: any) => n + (r[k] ?? 0), 0);
  return (
    <div className="space-y-6">
      <PageHeader title="AI assistant" sub="Model, usage by school and cost tracking. Teachers get drafts grounded in your indexed book pages; every request is logged.">
        <Button variant="secondary" onClick={() => downloadCsv('ai-usage.csv', u.byMonth)}><Download className="size-4" />Usage CSV</Button>
      </PageHeader>
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <Cpu className="size-8 text-violet-600" />
        <div className="min-w-0 flex-1"><div className="font-semibold">{s.live ? `${s.provider} · ${s.model}` : 'Offline drafts (no AI model configured)'}</div>
          <div className="text-sm text-slate-500">{s.health.detail}{s.embeddings ? ' · semantic search on' : ' · full-text search'}</div></div>
        {s.health.ok ? <Badge tone="PUBLISHED"><CheckCircle2 className="size-3" />Healthy</Badge> : <Badge tone="danger"><XCircle className="size-3" />Unavailable</Badge>}
      </Card>
      <ConnectAi />
      <SchoolsAi />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Requests this month" value={sum('requests')} /><Stat label="Approved by teachers" value={sum('approved')} tone="green" sub="used as plan / homework / bank" />
        <Stat label="Grounded in book pages" value={sum('requests') ? `${Math.round((sum('grounded') / sum('requests')) * 100)}%` : '—'} />
        <Stat label="Tokens this month" value={(sum('inputTokens') + sum('outputTokens')).toLocaleString()} sub={cur.some((r: any) => r.estimatedCost !== null) ? `≈ ${cur.reduce((n: number, r: any) => n + (r.estimatedCost ?? 0), 0).toFixed(2)} est. cost` : 'self-hosted: track GPU cost separately'} />
      </div>
      <Table head={['Month', 'School', 'Requests', 'OK', 'Approved', 'Grounded', 'Tokens in / out', 'Avg time']} empty={!u.byMonth.length}>
        {u.byMonth.map((r: any, i: number) => (
          <tr key={i}><Td>{r.month}</Td><Td>{r.school} <span className="font-mono text-xs text-slate-500">{r.code}</span></Td><Td>{r.requests} <span className="text-xs text-slate-500">/ {u.monthlyLimitPerSchool}</span></Td>
            <Td>{r.ok}</Td><Td>{r.approved}</Td><Td>{r.grounded}</Td><Td className="tabular-nums">{(r.inputTokens ?? 0).toLocaleString()} / {(r.outputTokens ?? 0).toLocaleString()}</Td><Td>{r.avgLatencyMs ? `${(r.avgLatencyMs / 1000).toFixed(1)} s` : '—'}</Td></tr>))}
      </Table>
    </div>
  );
}

/** The publisher's own AI connection (used by every school set to “Uses your AI”). */
function ConnectAi() {
  const q = useQuery({ queryKey: ['aiSettings'], queryFn: () => api.get<any>('/ai/settings') });
  if (!q.data) return null; const d = q.data;
  return (
    <Card className="space-y-4 p-5">
      <div><h2 className="font-semibold text-slate-900">Connect an AI service</h2>
        <p className="text-sm text-slate-500">Free plans need only a free API key from the service’s website. Without a service, teachers get offline drafts, and the page-question maker always works for free.</p></div>
      <AiConnectForm presets={d.presets} endpoint="/ai/settings" invalidate={['aiSettings', 'aiStatus', 'aiSchools']}
        saved={{ preset: d.preset, baseUrl: d.baseUrl, model: d.model, hasKey: d.hasKey, keyHint: d.keyHint, connected: d.enabled }} />
      <p className="text-xs text-slate-500">Used by the teacher AI assistant and Ask Owl in every school set to “Uses your AI” below. Book text and the teacher’s or student’s question are sent to the chosen service (the platform does not add names or logins).</p>
    </Card>
  );
}

const ACCESS: Record<string, { label: string; tone: string }> = { OFF: { label: '⛔ AI off', tone: 'neutral' }, PUBLISHER: { label: '✨ Uses your AI', tone: 'info' }, OWN: { label: '🔑 School’s own AI', tone: 'PUBLISHED' } };

/** AI for each school: off / your AI / the school's own AI, with a monthly request limit and a monthly AI fee (billing). */
function SchoolsAi() {
  const q = useQuery({ queryKey: ['aiSchools'], queryFn: () => api.get<any>('/ai/schools') });
  const money = useMoney(); const [edit, setEdit] = useState<any>(null); const [search, setSearch] = useState('');
  if (!q.data) return null;
  const list = q.data.schools.filter((s: any) => !search || `${s.name} ${s.code}`.toLowerCase().includes(search.toLowerCase()));
  const billed = q.data.schools.filter((s: any) => s.access !== 'OFF' && s.feeMinor);
  const total = billed.reduce((n: number, s: any) => n + Number(s.feeMinor), 0);
  const csv = () => downloadCsv(`ai-billing-${new Date().toISOString().slice(0, 7)}.csv`, q.data.schools.map((s: any) => ({ school: s.name, code: s.code, ai: ACCESS[s.access].label.replace(/^\S+ /, ''),
    requestsThisMonth: s.usedThisMonth, monthlyLimit: s.access === 'OWN' && s.monthlyLimit == null ? 'unlimited' : s.monthlyLimit ?? q.data.defaultLimit, monthlyFee: s.feeMinor == null ? '' : (s.feeMinor / 100).toFixed(2), note: s.billingNote })));
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div><h2 className="font-semibold text-slate-900">AI for schools & billing</h2>
          <p className="text-xs text-slate-500">Switch AI on or off per school, let a school use its own AI key, set a monthly request limit and a monthly AI fee. {billed.length > 0 && <>AI fees this month: <b>{money.main(total)}</b> from {billed.length} school{billed.length === 1 ? '' : 's'}.</>}</p></div>
        <div className="flex gap-2"><Input className="h-9 w-48" placeholder="Search school" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search school" />
          <Button size="sm" variant="secondary" onClick={csv}><Download className="size-4" />Billing CSV</Button></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-2">School</th><th className="px-3 py-2">AI</th><th className="px-3 py-2">Requests this month</th><th className="px-3 py-2">Monthly fee</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y divide-slate-100">{list.map((s: any) => {
          const limit = s.access === 'OWN' && s.monthlyLimit == null ? null : s.monthlyLimit ?? q.data.defaultLimit;
          return (<tr key={s.id}>
            <td className="px-5 py-2.5"><span className="font-medium text-slate-900">{s.name}</span> <span className="font-mono text-xs text-slate-500">{s.code}</span>{s.isDemo && <Badge className="ml-1">demo</Badge>}</td>
            <td className="px-3 py-2.5"><Badge tone={ACCESS[s.access].tone}>{ACCESS[s.access].label}</Badge>{s.access === 'OWN' && <span className="block text-xs text-slate-500">{s.ownConnected ? `connected · ${s.ownModel}` : 'not connected yet — uses your AI until then'}</span>}</td>
            <td className="px-3 py-2.5 tabular-nums">{s.usedThisMonth} / {limit ?? '∞'}{limit ? <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100"><div className={cn('h-full rounded-full', s.usedThisMonth >= limit ? 'bg-red-500' : 'bg-violet-500')} style={{ width: `${Math.min(100, (s.usedThisMonth / limit) * 100)}%` }} /></div> : null}</td>
            <td className="px-3 py-2.5">{s.feeMinor == null ? <span className="text-slate-400">—</span> : <Money v={s.feeMinor} inline />}{s.billingNote && <span className="block text-xs text-slate-500">{s.billingNote}</span>}</td>
            <td className="px-3 py-2.5 text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(s)}>Edit</Button></td>
          </tr>);
        })}</tbody></table></div>
      {edit && <SchoolAiDialog s={edit} defaultLimit={q.data.defaultLimit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function SchoolAiDialog({ s, defaultLimit, onClose }: { s: any; defaultLimit: number; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const money = useMoney();
  const [f, setF] = useState({ access: s.access, limit: s.monthlyLimit == null ? '' : String(s.monthlyLimit), fee: s.feeMinor == null ? '' : String(s.feeMinor / 100), note: s.billingNote ?? '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/ai/schools/${s.id}`, { access: f.access, monthlyLimit: f.limit === '' ? null : Math.max(0, Math.round(Number(f.limit))), feeMinor: f.fee === '' ? null : Math.round(Number(f.fee) * 100), billingNote: f.note });
      toast('Saved'); qc.invalidateQueries({ queryKey: ['aiSchools'] }); onClose();
    } catch (e: any) { toast(e.message, 'err'); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose} title={`AI for ${s.name}`} description="Changes apply to the school's teachers and students within a minute.">
      <div className="space-y-4">
        <div className="grid gap-2" role="radiogroup" aria-label="AI for this school">
          {[['PUBLISHER', '✨ Uses your AI', 'Teachers and students use the AI you connected. Counts against the limit below.'],
            ['OWN', '🔑 School’s own AI', 'The school admin connects the school’s own AI key (free plans available). They pay their AI service; you can still charge a fee.'],
            ['OFF', '⛔ AI off', 'No AI for this school. The free page-question maker and offline drafts still work.']].map(([k, l, h]) => (
            <button key={k} type="button" role="radio" aria-checked={f.access === k} onClick={() => setF({ ...f, access: k })}
              className={cn('rounded-xl border p-3 text-left text-sm', f.access === k ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:bg-slate-50')}>
              <b className="block">{l}</b><span className="text-xs text-slate-500">{h}</span></button>))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="AI requests per month" hint={f.access === 'OWN' ? 'Empty = unlimited (their own key)' : `Empty = default (${defaultLimit})`}><Input type="number" min={0} value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} placeholder={f.access === 'OWN' ? 'unlimited' : String(defaultLimit)} /></Field>
          <Field label={`Monthly AI fee (${money.finance.currency})`} hint="For your billing; empty = no fee"><Input type="number" min={0} step="0.01" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} placeholder="0.00" /></Field>
        </div>
        <Field label="Billing note" hint="Optional, e.g. “AI add-on, paid yearly”"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></div>
      </div>
    </Dialog>
  );
}
