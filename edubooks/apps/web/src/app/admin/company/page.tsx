'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Coins, FileUp, Globe2, Trash2 } from 'lucide-react';
import { api, fmtBytes } from '@/lib/api';
import { formatMoney } from '@/lib/company';
import { PageHeader } from '@/components/common';
import { Badge, Button, Card, ErrorBox, Field, Input, PageLoader, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const CURRENCIES = [['AED', 'UAE dirham'], ['USD', 'US dollar'], ['SAR', 'Saudi riyal'], ['OMR', 'Omani rial'], ['QAR', 'Qatari riyal'], ['KWD', 'Kuwaiti dinar'], ['BHD', 'Bahraini dinar'],
  ['EUR', 'Euro'], ['GBP', 'British pound'], ['INR', 'Indian rupee'], ['PKR', 'Pakistani rupee'], ['EGP', 'Egyptian pound']];
const ZONES = ['Asia/Dubai', 'Asia/Riyadh', 'Asia/Muscat', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Karachi', 'Asia/Kolkata', 'Africa/Cairo', 'Europe/London', 'UTC'];
const CATS: Record<string, string> = { PROFILE: 'Company profile', BROCHURE: 'Brochure', CATALOGUE: 'Catalogue', PRICE_LIST: 'Price list', CERTIFICATE: 'Certificate / licence', OTHER: 'Other' };
const VIS: Record<string, [string, string]> = { PUBLIC: ['PUBLISHED', 'Everyone (also on the sign-in page)'], SCHOOLS: ['info', 'Schools (school admins and teachers)'], STAFF: ['neutral', 'Publisher staff only'] };

export default function CompanyPage() {
  const q = useQuery({ queryKey: ['companySettings'], queryFn: () => api.get<any>('/company/settings') });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  return (
    <div className="space-y-6">
      <PageHeader title="Company & currency" sub="Your company details, documents, currency and tax. They appear on the sign-in page, for schools, and on quotations, invoices and report cards. Your logo and colours are under Branding." />
      <Profile initial={q.data.company} />
      <div className="grid gap-6 xl:grid-cols-2"><Finance initial={q.data.finance} /><Region initial={q.data.region} /></div>
      <Documents />
    </div>
  );
}

function useSave(path: string, ok: string) {
  const qc = useQueryClient(); const toast = useToast(); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  const save = async (body: any) => { setBusy(true); setErr(null); try { qc.setQueryData(['companySettings'], await api.put(path, body)); qc.invalidateQueries({ queryKey: ['company'] }); toast(ok); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return { save, busy, err };
}

function Profile({ initial }: { initial: any }) {
  const [f, setF] = useState<any>({ showOnLogin: true, ...initial }); const s = useSave('/company/profile', 'Company details saved');
  const inp = (k: string, label: string, props: any = {}) => <Field label={label}><Input maxLength={props.max ?? 160} value={f[k] ?? ''} placeholder={props.ph} type={props.type} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  return (
    <Card className="space-y-4 p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Building2 className="size-5 text-brand-600" />Company details</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {inp('legalName', 'Legal company name', { ph: 'Knowledge Gate Publishing LLC' })}{inp('tradeName', 'Trading / brand name (optional)')}
        {inp('registrationNo', 'Trade licence / registration no.', { max: 60 })}{inp('phone', 'Phone', { max: 40, ph: '+971 4 000 0000' })}
        {inp('whatsapp', 'WhatsApp (optional)', { max: 40 })}{inp('email', 'Email', { type: 'email' })}
        {inp('website', 'Website', { ph: 'https://…', max: 200 })}{inp('city', 'City', { max: 80, ph: 'Dubai' })}
        <div className="md:col-span-2"><Field label="Address"><Textarea rows={2} maxLength={400} value={f.address ?? ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field></div>
        {inp('country', 'Country', { max: 80, ph: 'United Arab Emirates' })}
        <div className="md:col-span-2"><Field label="About the company (shown to schools)"><Textarea rows={4} maxLength={4000} value={f.about ?? ''} onChange={(e) => setF({ ...f, about: e.target.value })} /></Field></div>
        {inp('facebook', 'Facebook link', { ph: 'https://…', max: 200 })}{inp('instagram', 'Instagram link', { ph: 'https://…', max: 200 })}
        {inp('linkedin', 'LinkedIn link', { ph: 'https://…', max: 200 })}{inp('youtube', 'YouTube link', { ph: 'https://…', max: 200 })}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.showOnLogin !== false} onChange={(e) => setF({ ...f, showOnLogin: e.target.checked })} />Show contact details and public documents on the sign-in page</label>
      {s.err ? <ErrorBox error={s.err} /> : null}
      <div className="flex justify-end"><Button loading={s.busy} onClick={() => s.save(f)}>Save company details</Button></div>
    </Card>
  );
}

function Finance({ initial }: { initial: any }) {
  const [f, setF] = useState<any>({ ...initial, secondaryCurrency: initial.secondaryCurrency ?? '' });
  // the rate is entered the way people quote it: 1 USD = 3.6725 AED
  const [perSecond, setPerSecond] = useState(initial.rate ? String(+(1 / initial.rate).toFixed(4)) : '');
  const s = useSave('/company/finance', 'Currency and tax saved');
  const rate = Number(perSecond) > 0 ? 1 / Number(perSecond) : 0;
  const sample = 250000;
  return (
    <Card className="space-y-4 p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Coins className="size-5 text-brand-600" />Currency & tax</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Main currency (prices are entered in this)"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}</Select></Field>
        <Field label="Also show amounts in"><Select value={f.secondaryCurrency} onChange={(e) => setF({ ...f, secondaryCurrency: e.target.value })}><option value="">— nothing —</option>{CURRENCIES.filter(([c]) => c !== f.currency).map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}</Select></Field>
        {f.secondaryCurrency && <Field label={`Exchange rate: 1 ${f.secondaryCurrency} = ? ${f.currency}`} hint={f.currency === 'AED' && f.secondaryCurrency === 'USD' ? 'The dirham is pegged: 1 USD = 3.6725 AED.' : 'Update it when the rate changes.'}>
          <Input type="number" min={0} step="0.0001" value={perSecond} onChange={(e) => setPerSecond(e.target.value)} /></Field>}
        <Field label="Decimals"><Select value={f.decimals} onChange={(e) => setF({ ...f, decimals: Number(e.target.value) })}><option value={2}>2 (2,500.00)</option><option value={0}>0 (2,500)</option><option value={3}>3 (2,500.000)</option></Select></Field>
        <Field label="Tax name"><Input maxLength={20} value={f.taxLabel} onChange={(e) => setF({ ...f, taxLabel: e.target.value })} /></Field>
        <Field label="Tax rate %" hint="UAE VAT is 5%. Use 0 if you do not charge tax."><Input type="number" min={0} max={100} step="0.01" value={f.vatRate} onChange={(e) => setF({ ...f, vatRate: Number(e.target.value) })} /></Field>
        <div className="sm:col-span-2"><Field label="Tax registration number (TRN)"><Input maxLength={40} value={f.taxNumber} onChange={(e) => setF({ ...f, taxNumber: e.target.value })} /></Field></div>
        <div className="sm:col-span-2"><Field label="Payment details on invoices (bank, IBAN…)"><Textarea rows={3} maxLength={1000} value={f.paymentDetails} onChange={(e) => setF({ ...f, paymentDetails: e.target.value })} /></Field></div>
      </div>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Example: <b>{formatMoney(sample, f.currency, f.decimals)}</b>{f.secondaryCurrency && rate ? <> ≈ {formatMoney(Math.round(sample * rate), f.secondaryCurrency)}</> : null}</p>
      {s.err ? <ErrorBox error={s.err} /> : null}
      <div className="flex justify-end"><Button loading={s.busy} onClick={() => s.save({ ...f, secondaryCurrency: f.secondaryCurrency || null, rate: f.secondaryCurrency ? +rate.toFixed(8) : 0 })}>Save currency & tax</Button></div>
    </Card>
  );
}

function Region({ initial }: { initial: any }) {
  const [f, setF] = useState<any>(initial); const s = useSave('/company/region', 'Region saved');
  return (
    <Card className="h-fit space-y-4 p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Globe2 className="size-5 text-brand-600" />Region</h2>
      <Field label="Country calling code" hint="Used to turn local numbers like 050 123 4567 into +971 50 123 4567 for WhatsApp/SMS."><div className="flex items-center gap-1"><span className="text-slate-600">+</span><Input value={f.phoneCode} maxLength={4} onChange={(e) => setF({ ...f, phoneCode: e.target.value.replace(/\D/g, '') })} /></div></Field>
      <Field label="Time zone" hint="Used for times in messages such as live lessons."><Select value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{[...new Set([f.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}</Select></Field>
      {s.err ? <ErrorBox error={s.err} /> : null}
      <div className="flex justify-end"><Button loading={s.busy} onClick={() => s.save(f)}>Save region</Button></div>
    </Card>
  );
}

function Documents() {
  const q = useQuery({ queryKey: ['companyDocs'], queryFn: () => api.get<any[]>('/company/documents') });
  const [f, setF] = useState({ title: '', category: 'PROFILE', visibility: 'PUBLIC', description: '' }); const file = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (pick && !f.title) setF((x) => ({ ...x, title: pick.name.replace(/\.[^.]+$/, '') })); }, [pick]); // eslint-disable-line
  const refresh = () => { qc.invalidateQueries({ queryKey: ['companyDocs'] }); qc.invalidateQueries({ queryKey: ['company'] }); };
  const upload = async () => {
    if (!pick) return; setBusy(true); setErr(null);
    const fd = new FormData(); fd.append('file', pick); Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    try { await api.upload('/company/documents', fd); refresh(); toast('Document uploaded'); setPick(null); setF({ title: '', category: 'OTHER', visibility: 'SCHOOLS', description: '' }); if (file.current) file.current.value = ''; } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><FileUp className="size-5 text-brand-600" />Company documents</h2>
        <p className="text-xs text-slate-600">Company profile, brochures, catalogues, price lists, certificates… PDF, Word, Excel, PowerPoint or images, up to 50 MB.</p></div>
      <div className="grid gap-3 border-b border-slate-100 p-5 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <Field label="File"><Input ref={file} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp" onChange={(e) => setPick(e.target.files?.[0] ?? null)} /></Field>
        <Field label="Title"><Input maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Who can see it"><Select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}>{Object.entries(VIS).map(([k, [, v]]) => <option key={k} value={k}>{v.split(' (')[0]}</option>)}</Select></Field></div>
        <Button loading={busy} disabled={!pick} onClick={upload}><FileUp className="size-4" />Upload</Button>
        {err ? <div className="md:col-span-4"><ErrorBox error={err} /></div> : null}
      </div>
      {!q.data ? <PageLoader /> : !q.data.length ? <p className="p-6 text-center text-sm text-slate-600">No documents yet. Start with your company profile.</p> : (
        <ul className="divide-y divide-slate-100">{q.data.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="grid size-9 place-items-center rounded bg-slate-100 text-[10px] font-bold uppercase">{d.ext}</span>
            <span className="min-w-0 flex-1"><a href={`/api/company/documents/${d.id}/file`} target="_blank" rel="noopener" className="font-medium text-brand-700 hover:underline">{d.title}</a>
              <span className="block text-xs text-slate-600">{CATS[d.category]} · {fmtBytes(d.size)} · {d.fileName}</span></span>
            <Select aria-label={`Who can see ${d.title}`} className="h-9 w-56" value={d.visibility} onChange={async (e) => { await api.patch(`/company/documents/${d.id}`, { visibility: e.target.value }); refresh(); toast('Visibility changed'); }}>
              {Object.entries(VIS).map(([k, [, v]]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Badge tone={VIS[d.visibility][0]}>{d.visibility.toLowerCase()}</Badge>
            <button aria-label={`Delete ${d.title}`} onClick={async () => { if (!confirm(`Delete “${d.title}”?`)) return; await api.del(`/company/documents/${d.id}`); refresh(); toast('Deleted'); }} className="text-slate-500 hover:text-red-600"><Trash2 className="size-4" /></button>
          </li>))}</ul>)}
    </Card>
  );
}
