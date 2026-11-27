'use client';
import { useQuery } from '@tanstack/react-query';
import { FileText, Globe, Mail, MapPin, Phone } from 'lucide-react';
import { api, fmtBytes } from '@/lib/api';
import { useCompany } from '@/lib/company';
import { BrandMark } from '@/lib/branding';
import { Card, PageLoader } from '@/components/ui';

const CATS: Record<string, string> = { PROFILE: 'Company profile', BROCHURE: 'Brochure', CATALOGUE: 'Catalogue', PRICE_LIST: 'Price list', CERTIFICATE: 'Certificate', OTHER: 'Document' };

/** "About the publisher" for school admins and teachers: contact details, about text and the documents shared with schools. */
export function PublisherPage() {
  const c = useCompany(); const co = c.company;
  const docs = useQuery({ queryKey: ['companyDocs', 'school'], queryFn: () => api.get<any[]>('/company/documents') });
  const socials = [['Facebook', co.facebook], ['Instagram', co.instagram], ['LinkedIn', co.linkedin], ['YouTube', co.youtube]].filter(([, u]) => u);
  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-6">
        <BrandMark className="text-xl font-semibold" logoClass="h-14 w-auto max-w-[16rem] object-contain" />
        <h1 className="text-2xl font-semibold text-slate-900">{co.legalName || c.name || 'Our publisher'}</h1>
        {co.about && <p className="max-w-3xl whitespace-pre-wrap text-slate-700">{co.about}</p>}
        <ul className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          {co.address && <li className="flex gap-2"><MapPin className="size-4 shrink-0 text-brand-600" />{co.address}{co.city ? `, ${co.city}` : ''}{co.country ? `, ${co.country}` : ''}</li>}
          {co.phone && <li className="flex gap-2"><Phone className="size-4 text-brand-600" /><a href={`tel:${co.phone.replace(/\s/g, '')}`} dir="ltr">{co.phone}</a>{co.whatsapp && <> · WhatsApp <a href={`https://wa.me/${co.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" dir="ltr">{co.whatsapp}</a></>}</li>}
          {co.email && <li className="flex gap-2"><Mail className="size-4 text-brand-600" /><a href={`mailto:${co.email}`}>{co.email}</a></li>}
          {co.website && <li className="flex gap-2"><Globe className="size-4 text-brand-600" /><a href={co.website} target="_blank" rel="noopener noreferrer">{co.website.replace(/^https?:\/\//, '')}</a></li>}
        </ul>
        {socials.length > 0 && <div className="flex flex-wrap gap-2">{socials.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noopener noreferrer" className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">{n}</a>)}</div>}
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">Documents</div>
        {!docs.data ? <PageLoader /> : !docs.data.length ? <p className="p-6 text-center text-sm text-slate-600">No documents shared yet.</p> : (
          <ul className="divide-y divide-slate-100">{docs.data.map((d) => (
            <li key={d.id}><a href={`/api/company/documents/${d.id}/file`} target="_blank" rel="noopener" className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50">
              <FileText className="size-5 text-brand-600" /><span className="min-w-0 flex-1"><b className="text-slate-900">{d.title}</b><span className="block text-xs text-slate-600">{CATS[d.category]} · {d.ext.toUpperCase()} · {fmtBytes(d.size)}</span></span></a></li>))}</ul>)}
      </Card>
    </div>
  );
}

/** Small contact block for the sign-in page (only when the publisher chose to show it). */
export function LoginContact({ dark }: { dark?: boolean }) {
  const c = useCompany(); const co = c.company;
  if (co.showOnLogin === false || (!co.phone && !co.email && !co.website && !c.documents.length)) return null;
  const cls = dark ? 'text-white/85 hover:text-white' : 'text-slate-600 hover:text-slate-900';
  return (
    <div className={`space-y-1 text-sm ${dark ? 'text-white/85' : 'text-slate-600'}`}>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {co.phone && <a className={cls} href={`tel:${co.phone.replace(/\s/g, '')}`} dir="ltr">📞 {co.phone}</a>}
        {co.email && <a className={cls} href={`mailto:${co.email}`}>✉️ {co.email}</a>}
        {co.website && <a className={cls} href={co.website} target="_blank" rel="noopener noreferrer">🌐 {co.website.replace(/^https?:\/\//, '')}</a>}
      </div>
      {c.documents.length > 0 && <div className="flex flex-wrap gap-x-4">{c.documents.slice(0, 4).map((d) => <a key={d.id} className={`${cls} underline underline-offset-2`} href={`/api/company/public-documents/${d.id}`} target="_blank" rel="noopener">📄 {d.title}</a>)}</div>}
    </div>
  );
}
