'use client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Cpu, Download, XCircle } from 'lucide-react';
import { api, downloadCsv } from '@/lib/api';
import { Badge, Button, Card, PageLoader } from '@/components/ui';
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
      {!s.live && <Card className="p-4 text-sm text-slate-600">To use a real model, set <code>AI_BASE_URL</code> and <code>AI_MODEL</code> for a self-hosted server (e.g. Ollama: <code>http://gpu-server:11434/v1</code>, <code>qwen2.5:7b-instruct</code>), or <code>AI_PROVIDER=anthropic</code> with <code>ANTHROPIC_API_KEY</code>. See the README.</Card>}
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
