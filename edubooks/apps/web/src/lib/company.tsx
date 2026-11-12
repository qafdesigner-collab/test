'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Finance { currency: string; secondaryCurrency: string | null; rate: number; vatRate: number; taxLabel: string; taxNumber: string; decimals: number; paymentDetails: string }
export interface CompanyInfo {
  name: string | null;
  company: Partial<Record<'legalName' | 'tradeName' | 'address' | 'city' | 'country' | 'phone' | 'whatsapp' | 'email' | 'website' | 'registrationNo' | 'about' | 'facebook' | 'instagram' | 'linkedin' | 'youtube', string>> & { showOnLogin?: boolean };
  finance: Finance; region: { phoneCode: string; timezone: string };
  documents: { id: string; title: string; description: string; category: string; ext: string; size: number }[];
}
const FALLBACK: CompanyInfo = { name: null, company: {}, finance: { currency: 'AED', secondaryCurrency: 'USD', rate: 0.27229408, vatRate: 5, taxLabel: 'VAT', taxNumber: '', decimals: 2, paymentDetails: '' }, region: { phoneCode: '971', timezone: 'Asia/Dubai' }, documents: [] };

/** Public company card + currency settings (cached; also works before sign-in). */
export function useCompany() {
  const q = useQuery({ queryKey: ['company'], queryFn: () => api.get<CompanyInfo>('/company'), staleTime: 5 * 60_000 });
  return q.data ?? FALLBACK;
}

export function formatMoney(minor: number | null | undefined, currency: string, decimals = 2) {
  if (minor === null || minor === undefined) return '—';
  return `${currency} ${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** Text formatters in the company currency, plus the second currency (e.g. AED 2,500.00 ≈ USD 680.75). */
export function useMoney() {
  const f = useCompany().finance;
  const main = (minor: number | null | undefined) => formatMoney(minor, f.currency, f.decimals);
  const second = (minor: number | null | undefined) => (minor === null || minor === undefined || !f.secondaryCurrency || !f.rate ? null : formatMoney(Math.round(minor * f.rate), f.secondaryCurrency, 2));
  const both = (minor: number | null | undefined) => { const s = second(minor); return s ? `${main(minor)} (≈ ${s})` : main(minor); };
  return { main, second, both, finance: f };
}

/** Amount in the main currency with the second currency underneath. */
export function Money({ v, inline }: { v: number | null | undefined; inline?: boolean }) {
  const m = useMoney(); const s = m.second(v);
  if (v === null || v === undefined) return <>—</>;
  return inline || !s ? <span className="whitespace-nowrap">{m.main(v)}{s && inline ? <span className="text-slate-500"> ≈ {s}</span> : null}</span>
    : <span className="inline-flex flex-col leading-tight"><span className="whitespace-nowrap">{m.main(v)}</span><span className="whitespace-nowrap text-xs font-normal text-slate-500">≈ {s}</span></span>;
}
