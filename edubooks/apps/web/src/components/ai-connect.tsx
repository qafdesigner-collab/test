'use client';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge, Button, Field, Input, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

/**
 * Connect an AI service: choose a free plan (Google Gemini, Groq, OpenRouter), own server or other, paste the key,
 * Test, Save. Used by the super admin (the publisher's AI) and by school admins (the school's own AI, when allowed).
 */
export function AiConnectForm({ presets, saved, endpoint, invalidate, onDisconnect }: {
  presets: Record<string, any>; endpoint: string; invalidate: string[];
  saved: { preset?: string; baseUrl?: string; model?: string; hasKey?: boolean; keyHint?: string; connected: boolean; label?: string } | null;
  onDisconnect?: () => Promise<unknown>;
}) {
  const qc = useQueryClient(); const toast = useToast();
  const first = saved?.preset && presets[saved.preset] ? saved.preset : 'gemini';
  const [f, setF] = useState({ preset: first, baseUrl: saved?.baseUrl ?? '', model: saved?.model || presets[first]?.model || '', apiKey: '' });
  useEffect(() => { const p = saved?.preset && presets[saved.preset] ? saved.preset : 'gemini'; setF({ preset: p, baseUrl: saved?.baseUrl ?? '', model: saved?.model || presets[p]?.model || '', apiKey: '' }); }, [saved?.preset, saved?.model, saved?.baseUrl]); // eslint-disable-line
  const [test, setTest] = useState<any>(null); const [busy, setBusy] = useState<'' | 'test' | 'save' | 'off' | 'models'>('');
  const [models, setModels] = useState<string[] | null>(null);
  const cur = presets[f.preset]; const own = f.preset === 'custom' || f.preset === 'ollama';
  const keySaved = saved?.hasKey && saved.preset === f.preset;
  const body = { preset: f.preset, baseUrl: own ? f.baseUrl : undefined, model: f.model, apiKey: f.apiKey || undefined };
  const listModels = async () => {
    setBusy('models'); setTest(null);
    try { const r = await api.post<any>(`${endpoint}/models`, body); if (r.ok) { setModels(r.models); if (!r.models.length) toast('The service did not list any models', 'err'); } else setTest({ ok: false, error: r.error }); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  const run = async (kind: 'test' | 'save' | 'off') => {
    setBusy(kind); if (kind !== 'off') setTest(null);
    try {
      if (kind === 'test') setTest(await api.post(`${endpoint}/test`, body));
      else if (kind === 'save') { await api.put(endpoint, body); toast('AI connected'); }
      else { await (onDisconnect ? onDisconnect() : api.del(endpoint)); toast('AI service disconnected'); }
      if (kind !== 'test') invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-4">
      {saved?.connected && <Badge tone="PUBLISHED"><CheckCircle2 className="size-3" />Connected: {saved.label ?? presets[saved.preset ?? '']?.label} · {saved.model}</Badge>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="AI service">
        {Object.entries(presets).map(([k, p]: [string, any]) => (
          <button key={k} type="button" role="radio" aria-checked={f.preset === k} onClick={() => { setF({ preset: k, model: k === saved?.preset ? saved.model ?? p.model : p.model, baseUrl: k === saved?.preset ? saved.baseUrl ?? '' : p.baseUrl, apiKey: '' }); setTest(null); setModels(null); }}
            className={cn('rounded-xl border p-3 text-left text-sm transition', f.preset === k ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:bg-slate-50')}>
            <b className="block text-slate-900">{p.label}</b><span className="text-xs text-slate-500">{k === 'ollama' ? 'free · needs own server' : k === 'custom' ? 'any compatible service' : 'free API key'}</span>
          </button>))}
      </div>
      <p className="text-sm font-medium text-slate-700">Selected: <span className="text-brand-700">{cur.label}</span></p>
      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{cur.note}{cur.keyUrl && <> Get the key: <a className="font-medium text-brand-700 underline" href={cur.keyUrl} target="_blank" rel="noopener noreferrer">{cur.keyUrl.replace('https://', '')}</a></>}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {own && <Field label="Server address"><Input value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder={cur.baseUrl || 'https://…/v1'} /></Field>}
        <Field label="Model" hint={models ? `${models.length} models available for your key — pick one` : 'Change only if the service renamed it'}>
          {models && models.length ? <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={models.includes(f.model) ? f.model : ''} onChange={(e) => setF({ ...f, model: e.target.value })}>
            {!models.includes(f.model) && <option value="">Choose a model…</option>}{models.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            : <Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder={cur.model} />}</Field>
        <Field label="API key" hint={keySaved ? `Saved key ${saved!.keyHint} — leave empty to keep it` : own ? 'Only if your server needs one' : 'Paste the free key'}>
          <Input type="password" autoComplete="off" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder={keySaved ? saved!.keyHint : 'Paste key here'} /></Field>
      </div>
      {test && <p className={cn('rounded-lg p-3 text-sm', test.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>{test.ok ? `✅ Works — the AI answered “${test.reply}” in ${(test.ms / 1000).toFixed(1)} s. Press Save to use it.` : `❌ ${test.error}`}</p>}
      {test && !test.ok && test.suggestions?.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-2 font-medium">Models your key can use — click one, then Test again:</p>
          <div className="flex flex-wrap gap-1.5">{test.suggestions.map((m: string) => (
            <button key={m} type="button" onClick={() => { setF({ ...f, model: m }); setTest(null); }} className="rounded-full bg-white px-2.5 py-1 font-mono text-xs ring-1 ring-amber-300 hover:bg-amber-100">{m}</button>))}</div>
        </div>)}
      <div className="flex flex-wrap justify-end gap-2">
        {saved?.connected && <Button variant="ghost" loading={busy === 'off'} onClick={() => run('off')}>Disconnect</Button>}
        <Button variant="ghost" loading={busy === 'models'} onClick={listModels}>Show available models</Button>
        <Button variant="secondary" loading={busy === 'test'} onClick={() => run('test')}>Test connection</Button>
        <Button loading={busy === 'save'} onClick={() => run('save')}>Save and use</Button>
      </div>
    </div>
  );
}
