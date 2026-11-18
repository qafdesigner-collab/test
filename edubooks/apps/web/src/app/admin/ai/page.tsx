'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Cpu, Download, XCircle } from 'lucide-react';
import { api, downloadCsv } from '@/lib/api';
import { Badge, Button, Card, Field, Input, PageLoader, cn } from '@/components/ui';
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

/**
 * Connect an AI service from here: free plans (Google Gemini, Groq, OpenRouter) need only a free API key from
 * their website; or your own model server. Test first, then save. The key is stored encrypted and never shown again.
 */
function ConnectAi() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['aiSettings'], queryFn: () => api.get<any>('/ai/settings') });
  const [f, setF] = useState({ preset: 'gemini', baseUrl: '', model: '', apiKey: '' });
  const [test, setTest] = useState<any>(null); const [busy, setBusy] = useState<'' | 'test' | 'save' | 'off'>('');
  useEffect(() => { if (q.data) setF({ preset: q.data.preset, baseUrl: q.data.baseUrl, model: q.data.model || q.data.presets[q.data.preset]?.model || '', apiKey: '' }); }, [q.data]);
  if (!q.data) return null;
  const P = q.data.presets; const cur = P[f.preset]; const own = f.preset === 'custom' || f.preset === 'ollama';
  const body = { preset: f.preset, baseUrl: own ? f.baseUrl : undefined, model: f.model, apiKey: f.apiKey || undefined };
  const run = async (kind: 'test' | 'save' | 'off') => {
    setBusy(kind); if (kind !== 'off') setTest(null);
    try {
      if (kind === 'test') setTest(await api.post('/ai/settings/test', body));
      else if (kind === 'save') { await api.put('/ai/settings', body); toast('AI connected — teachers and Ask Owl now use it'); }
      else { await api.del('/ai/settings'); toast('AI service disconnected'); }
      if (kind !== 'test') ['aiSettings', 'aiStatus'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="font-semibold text-slate-900">Connect an AI service</h2>
          <p className="text-sm text-slate-500">Free plans need only a free API key from the service’s website. Without a service, teachers get offline drafts, and the page-question maker always works for free.</p></div>
        {q.data.enabled && <Badge tone="PUBLISHED"><CheckCircle2 className="size-3" />Connected: {P[q.data.preset]?.label} · {q.data.model}</Badge>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="AI service">
        {Object.entries(P).map(([k, p]: [string, any]) => (
          <button key={k} type="button" role="radio" aria-checked={f.preset === k} onClick={() => { setF({ ...f, preset: k, model: p.model, baseUrl: k === q.data.preset ? q.data.baseUrl : p.baseUrl, apiKey: '' }); setTest(null); }}
            className={cn('rounded-xl border p-3 text-left text-sm transition', f.preset === k ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:bg-slate-50')}>
            <b className="block text-slate-900">{p.label}</b><span className="text-xs text-slate-500">{k === 'ollama' ? 'free · needs own server' : k === 'custom' ? 'any compatible service' : 'free API key'}</span>
          </button>))}
      </div>
      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{cur.note}{cur.keyUrl && <> Get the key: <a className="font-medium text-brand-700 underline" href={cur.keyUrl} target="_blank" rel="noopener noreferrer">{cur.keyUrl.replace('https://', '')}</a></>}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {own && <Field label="Server address"><Input value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder={cur.baseUrl || 'https://…/v1'} /></Field>}
        <Field label="Model" hint="Change only if the service renamed it"><Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder={cur.model} /></Field>
        <Field label="API key" hint={q.data.hasKey && q.data.preset === f.preset ? `Saved key ${q.data.keyHint} — leave empty to keep it` : own ? 'Only if your server needs one' : 'Paste the free key'}>
          <Input type="password" autoComplete="off" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder={q.data.hasKey && q.data.preset === f.preset ? q.data.keyHint : 'Paste key here'} /></Field>
      </div>
      {test && <p className={cn('rounded-lg p-3 text-sm', test.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>{test.ok ? `✅ Works — the AI answered “${test.reply}” in ${(test.ms / 1000).toFixed(1)} s. Press Save to use it.` : `❌ ${test.error}`}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {q.data.enabled && <Button variant="ghost" loading={busy === 'off'} onClick={() => run('off')}>Disconnect</Button>}
        <Button variant="secondary" loading={busy === 'test'} onClick={() => run('test')}>Test connection</Button>
        <Button loading={busy === 'save'} onClick={() => run('save')}>Save and use</Button>
      </div>
      <p className="text-xs text-slate-500">Used by the teacher AI assistant (lesson plans, worksheets, questions) and Ask Owl for students. Book text and the teacher’s or student’s question are sent to the chosen service (the platform does not add names or logins). Each school’s monthly AI limit still applies.</p>
    </Card>
  );
}
