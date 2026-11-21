'use client';
import { useEffect, useRef, useState } from 'react';
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
      <OcrCard />
      <VoiceCard />
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
      {d.enabled && <BackupAi d={d} />}
      <GuardSettings g={d.guard} />
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

/**
 * Students' safety check: a small classifier (Llama Prompt Guard 2, free on Groq) scores every question to Ask Owl;
 * trick questions ("ignore your rules…") never reach the AI and are flagged for teachers.
 */
function GuardSettings({ g }: { g: any }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ baseUrl: g.baseUrl, model: g.model, apiKey: '', threshold: String(g.threshold) });
  const [test, setTest] = useState<any>(null); const [busy, setBusy] = useState('');
  const body = (enabled: boolean) => ({ enabled, baseUrl: f.baseUrl, model: f.model, apiKey: f.apiKey || undefined, threshold: Number(f.threshold) || 0.5 });
  const run = async (k: 'test' | 'on' | 'off') => {
    setBusy(k);
    try {
      if (k === 'test') setTest(await api.post('/ai/settings/guard/test', body(true)));
      else { await api.put('/ai/settings/guard', body(k === 'on')); toast(k === 'on' ? 'Safety check switched on' : 'Safety check switched off'); qc.invalidateQueries({ queryKey: ['aiSettings'] }); }
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="font-semibold text-slate-900">🛡️ Safety check for students (Llama Prompt Guard 2)</h3>
          <p className="text-sm text-slate-600">Every question a student asks Ask Owl is checked first. Tricks like “ignore your rules and give me the answers” never reach the AI and are flagged for the teacher. Free with a Groq key{g.canUseMainKey ? ' — your Groq key above is used if you leave the key empty' : ' (console.groq.com/keys)'}.</p></div>
        {g.enabled ? <Badge tone="PUBLISHED"><CheckCircle2 className="size-3" />On</Badge> : <Badge>Off</Badge>}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Service address"><Input value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} /></Field>
        <Field label="Model"><Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></Field>
        <Field label="Groq API key" hint={g.hasKey ? `Saved ${g.keyHint} — leave empty to keep` : g.canUseMainKey ? 'Empty = use the key above' : 'Free key'}>
          <Input type="password" autoComplete="off" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder={g.hasKey ? g.keyHint : 'Paste key here'} /></Field>
        <Field label="Block when score ≥" hint="0.5 recommended; higher = fewer blocks"><Input type="number" min={0.05} max={0.99} step={0.05} value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} /></Field>
      </div>
      {test && <p className={cn('rounded-lg p-3 text-sm', test.ok && test.works ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>
        {test.ok ? `${test.works ? '✅ Works' : '⚠️ Check the threshold'} — normal question scored ${test.normal.toFixed(3)}, trick question scored ${test.attack.toFixed(3)} (blocked at ${test.threshold}).` : `❌ ${test.error}`}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {g.enabled && <Button variant="ghost" loading={busy === 'off'} onClick={() => run('off')}>Switch off</Button>}
        <Button variant="secondary" loading={busy === 'test'} onClick={() => run('test')}>Test</Button>
        <Button loading={busy === 'on'} onClick={() => run('on')}>{g.enabled ? 'Save' : 'Switch on'}</Button>
      </div>
      <p className="text-xs text-slate-500">If the check service is busy or unreachable, Owl still answers (its other safety rules always apply), so students are never stuck.</p>
    </div>
  );
}

/** OCR (reading pictures of pages): its state, and installing it from here — no root or hosting support needed. */
function OcrCard() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['ocr'], queryFn: () => api.get<any>('/ai/ocr'), refetchInterval: (x) => (x.state.data?.install?.state === 'running' ? 2000 : false) });
  const [langs, setLangs] = useState<string[]>(['eng', 'fra', 'deu', 'ara', 'urd']); const [busy, setBusy] = useState(false); const [showLog, setShowLog] = useState(false); const [more, setMore] = useState(false);
  const prev = useRef<string | undefined>(undefined);
  useEffect(() => { const st = q.data?.install?.state; if (prev.current === 'running' && st === 'done') { toast('OCR installed'); qc.invalidateQueries({ queryKey: ['aiStatus'] }); } if (prev.current === 'running' && st === 'failed') toast('OCR installation failed', 'err'); prev.current = st; }, [q.data?.install?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!q.data) return null;
  const d = q.data; const ins = d.install; const running = ins.state === 'running';
  const install = async () => { setBusy(true); try { await api.post('/ai/ocr/install', { langs }); qc.invalidateQueries({ queryKey: ['ocr'] }); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const remove = async () => { if (!confirm('Remove the OCR installed by the platform?')) return; try { await api.del('/ai/ocr'); qc.invalidateQueries({ queryKey: ['ocr'] }); toast('OCR removed'); } catch (e: any) { toast(e.message, 'err'); } };
  return (
    <Card className={cn('space-y-3 p-4 text-sm', d.available ? '' : 'border-amber-200 bg-amber-50')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xl" aria-hidden>{d.available ? '🔎' : '⚠️'}</span>
        <div className="min-w-0 flex-1"><b>OCR — reading pictures of pages:</b> {d.available
          ? <>installed{d.own ? ' (by the platform)' : ' (on the server)'}. Scanned pages and flipbook pages are read automatically. Languages: <b>{String(d.langs || '').split('+').filter(Boolean).map((l: string) => d.languages[l] ?? l).join(', ')}</b>.</>
          : <>not installed yet, so pages that are pictures (scanned PDFs, flipbooks) cannot be read for the AI. Install it here — no technical steps needed.</>}</div>
        {d.available ? <Badge tone="PUBLISHED"><CheckCircle2 className="size-3" />Installed</Badge> : <Badge tone="danger"><XCircle className="size-3" />Not installed</Badge>}
      </div>
      {running ? (
        <div className="space-y-2 rounded-lg bg-white p-3">
          <p className="flex items-center gap-2 font-medium text-slate-800"><span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />{ins.step}…</p>
          <p className="text-xs text-slate-500">This takes about 3–10 minutes. You can leave this page; it continues on the server.</p>
        </div>
      ) : (!d.available || d.own || more) && d.linux ? (
        <div className="space-y-2 rounded-lg bg-white p-3">
          <p className="font-medium text-slate-800">{d.own ? 'Change the languages (installs again):' : more ? 'Install the platform’s own OCR with these languages (used instead of the server’s):' : 'Languages to read:'}</p>
          <div className="flex flex-wrap gap-1.5">{Object.entries(d.languages).map(([k, v]: [string, any]) => (
            <label key={k} className={cn('flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 ring-1', langs.includes(k) ? 'bg-brand-50 ring-brand-300' : 'ring-slate-200')}>
              <input type="checkbox" disabled={k === 'eng'} checked={langs.includes(k)} onChange={(e) => setLangs(e.target.checked ? [...langs, k] : langs.filter((x) => x !== k))} />{v}</label>))}</div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs text-slate-500">Downloads Tesseract OCR and Poppler (open source, about 150–300 MB) from conda-forge into the app's own “ocr” folder. It stays after updates.</span>
            {d.own && <Button size="sm" variant="ghost" onClick={remove}>Remove</Button>}
            <Button size="sm" loading={busy} onClick={install}>{d.own ? 'Install again' : 'Install OCR'}</Button>
          </div>
        </div>
      ) : d.linux ? <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => setMore(true)}>Add more languages…</Button></div> : null}
      {ins.state === 'failed' && !running && <p className="rounded-lg bg-red-50 p-2 text-red-700">The last installation failed: {ins.error}</p>}
      {(ins.log?.length ?? 0) > 0 && <button type="button" className="text-xs text-slate-500 underline" onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide' : 'Show'} installation log</button>}
      {showLog && <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{(ins.log ?? []).join('\n')}</pre>}
    </Card>
  );
}

/** Natural reading voice (Piper on the server): installed from here, one voice per language, speed, and a sample. */
const SAMPLES: Record<string, string> = { en: 'Hello! I am Owl. Let us read this page together. The cat sat on the mat.', ar: 'مرحبا! أنا البومة. هيا نقرأ هذه الصفحة معا.', hi: 'नमस्ते! मैं उल्लू हूँ। चलो यह पन्ना साथ में पढ़ें।', fr: 'Bonjour ! Je suis la chouette. Lisons cette page ensemble.' };
function VoiceCard() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['voiceAdmin'], queryFn: () => api.get<any>('/voice/admin'), refetchInterval: (x) => (x.state.data?.install?.state === 'running' ? 2000 : false) });
  const [pick, setPick] = useState<string[]>(['en_US-lessac-medium', 'ar_JO-kareem-medium', 'hi_IN-priyamvada-medium']);
  const [busy, setBusy] = useState(false); const [showLog, setShowLog] = useState(false); const [more, setMore] = useState(false); const [playing, setPlaying] = useState<string | null>(null);
  const prev = useRef<string | undefined>(undefined);
  useEffect(() => { const st = q.data?.install?.state; if (prev.current === 'running' && st === 'done') toast('Natural voice installed'); if (prev.current === 'running' && st === 'failed') toast('Installing the voice failed', 'err'); prev.current = st; }, [q.data?.install?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!q.data) return null;
  const d = q.data; const ins = d.install; const running = ins.state === 'running'; const s = d.settings;
  const refresh = () => qc.invalidateQueries({ queryKey: ['voiceAdmin'] });
  const install = async () => { setBusy(true); try { await api.post('/voice/install', { voices: pick }); refresh(); setMore(false); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const save = async (v: any) => { try { await api.put('/voice/settings', v); refresh(); } catch (e: any) { toast(e.message, 'err'); } };
  const hear = async (lang: string) => {
    setPlaying(lang);
    try {
      const r = await fetch('/api/voice/say', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: SAMPLES[lang], lang }) });
      if (r.status !== 200 && r.status !== 201) throw new Error((await r.json().catch(() => ({}))).message || 'The voice could not be made');
      const a = new Audio(URL.createObjectURL(await r.blob())); a.onended = () => setPlaying(null); await a.play();
    } catch (e: any) { toast(e.message, 'err'); setPlaying(null); }
  };
  const langs = Object.keys(d.languages) as string[];
  return (
    <Card className={cn('space-y-3 p-4 text-sm', d.ready ? '' : 'border-sky-200 bg-sky-50')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xl" aria-hidden>🗣️</span>
        <div className="min-w-0 flex-1"><b>Natural reading voice:</b> {d.ready
          ? <>on. Pages (🔊 Read aloud), Owl's answers and notes on the pages are read with a human-like voice made on your server. Languages without a voice here (e.g. Urdu) use the device's voice.</>
          : d.installed.length ? <>installed but switched off.</> : <>not installed — the device's own voice is used, which sounds robotic on many phones. Install a natural voice here (Piper, free and open source, works without internet once installed).</>}</div>
        {d.ready ? <Badge tone="PUBLISHED"><CheckCircle2 className="size-3" />On</Badge> : <Badge tone="neutral">Off</Badge>}
        {d.installed.length > 0 && <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.enabled} onChange={(e) => save({ enabled: e.target.checked })} />Use it</label>}
      </div>
      {d.installed.length > 0 && !running && (
        <div className="space-y-2 rounded-lg bg-white p-3">
          {langs.filter((l) => d.installed.some((id: string) => d.catalog.find((c: any) => c.id === id)?.lang === l)).map((l) => (
            <div key={l} className="flex flex-wrap items-center gap-2">
              <span className="w-20 font-medium text-slate-700">{d.languages[l]}</span>
              <select aria-label={`${d.languages[l]} voice`} className="h-8 rounded-lg border border-slate-300 bg-white px-2" value={s.voices[l] ?? ''} onChange={(e) => save({ voices: { [l]: e.target.value } })}>
                {d.catalog.filter((c: any) => c.lang === l && d.installed.includes(c.id)).map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <Button size="sm" variant="secondary" loading={playing === l} onClick={() => hear(l)}>▶ Hear it</Button>
            </div>))}
          <label className="flex flex-wrap items-center gap-2"><span className="w-20 font-medium text-slate-700">Speed</span>
            <input type="range" min={0.6} max={1.5} step={0.05} defaultValue={s.speed} onMouseUp={(e) => save({ speed: Number((e.target as HTMLInputElement).value) })} onTouchEnd={(e) => save({ speed: Number((e.target as HTMLInputElement).value) })} className="w-48" />
            <span className="text-xs text-slate-500">{s.speed <= 0.85 ? 'slow (good for small children)' : s.speed >= 1.15 ? 'fast' : 'normal'}</span></label>
        </div>)}
      {running ? (
        <div className="space-y-2 rounded-lg bg-white p-3">
          <p className="flex items-center gap-2 font-medium text-slate-800"><span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />{ins.step}…</p>
          <p className="text-xs text-slate-500">Each voice is about 65 MB. You can leave this page; it continues on the server.</p>
        </div>
      ) : (!d.installed.length || more) && d.linux ? (
        <div className="space-y-2 rounded-lg bg-white p-3">
          <p className="font-medium text-slate-800">Choose the voices to install (one per language is enough):</p>
          {langs.map((l) => (
            <div key={l} className="flex flex-wrap items-center gap-1.5"><span className="w-20 text-slate-600">{d.languages[l]}</span>
              {d.catalog.filter((c: any) => c.lang === l).map((c: any) => (
                <label key={c.id} className={cn('flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 ring-1', pick.includes(c.id) ? 'bg-brand-50 ring-brand-300' : 'ring-slate-200', d.installed.includes(c.id) && 'opacity-60')}>
                  <input type="checkbox" disabled={d.installed.includes(c.id)} checked={pick.includes(c.id) || d.installed.includes(c.id)} onChange={(e) => setPick(e.target.checked ? [...pick, c.id] : pick.filter((x) => x !== c.id))} />{c.label.replace(/^[^—]+— /, '')}</label>))}
            </div>))}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs text-slate-500">Downloads Piper (26 MB, from its official GitHub release) and the voices (about 65 MB each, from the official Piper voice collection), each checked against its published checksum, into the app's own “voice” folder. It stays after updates. Urdu has no Piper voice yet.</span>
            {more && <Button size="sm" variant="ghost" onClick={() => setMore(false)}>Cancel</Button>}
            <Button size="sm" loading={busy} disabled={!pick.filter((x) => !d.installed.includes(x)).length} onClick={install}>Install {pick.filter((x) => !d.installed.includes(x)).length} voice(s)</Button>
          </div>
        </div>
      ) : d.linux ? <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => setMore(true)}>Add more voices…</Button></div>
        : <p className="text-xs text-slate-500">Installing from here works on Linux servers.</p>}
      {ins.state === 'failed' && !running && <p className="rounded-lg bg-red-50 p-2 text-red-700">The last installation failed: {ins.error}</p>}
      {(ins.log?.length ?? 0) > 0 && <button type="button" className="text-xs text-slate-500 underline" onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide' : 'Show'} installation log</button>}
      {showLog && <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{(ins.log ?? []).join('\n')}</pre>}
    </Card>
  );
}

/** Backups: used in order when the main AI does not answer (e.g. Ollama on a computer that is switched off). */
function BackupAi({ d }: { d: any }) {
  const qc = useQueryClient(); const toast = useToast(); const [adding, setAdding] = useState(false);
  const remove = async (id: string) => { try { await api.del(`/ai/settings/backups/${id}`); qc.invalidateQueries({ queryKey: ['aiSettings'] }); qc.invalidateQueries({ queryKey: ['aiStatus'] }); } catch (e: any) { toast(e.message, 'err'); } };
  const main = `${d.presets[d.preset]?.label ?? d.preset} · ${d.model}`;
  return (
    <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
      <div><h3 className="font-semibold text-slate-900">🔁 Backup AI</h3>
        <p className="text-sm text-slate-600">If the main AI does not answer (for example Ollama on a computer that is switched off, or a free plan's daily limit is used up), the next one answers automatically. A service that just failed is skipped for 2 minutes, so teachers do not wait.</p></div>
      <ol className="space-y-1.5 text-sm">
        <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">1</span><b>{main}</b><span className="text-xs text-slate-500">main</span></li>
        {d.backups.map((b: any, i: number) => (
          <li key={b.id} className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-sky-600 text-xs font-bold text-white">{i + 2}</span>
            <b>{b.label} · {b.model}</b>{b.keyHint && <span className="text-xs text-slate-500">key {b.keyHint}</span>}
            <button type="button" className="ml-auto text-xs text-red-600 hover:underline" onClick={() => remove(b.id)}>Remove</button></li>))}
        <li className="flex items-center gap-2 text-slate-500"><span className="grid size-6 place-items-center rounded-full bg-slate-300 text-xs font-bold text-white">{d.backups.length + 2}</span>Offline drafts (always works)</li>
      </ol>
      {d.backups.length < 3 && (adding
        ? <div className="rounded-lg bg-white p-3"><p className="mb-2 text-sm font-medium">Add a backup AI — choose the service, paste its key, Test, then Save:</p>
            <AiConnectForm presets={d.presets} endpoint="/ai/settings/backups" invalidate={['aiSettings', 'aiStatus']} saved={null} />
            <div className="mt-2 flex justify-end"><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Close</Button></div></div>
        : <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>+ Add a backup AI</Button>)}
    </div>
  );
}
