'use client';
import { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { api } from './api';

export interface Branding { name: string; tagline: string; primaryColor: string; logoUrl: string | null }
const DEFAULT: Branding = { name: 'Knowledge Gate', tagline: 'Books, licences and learning — in one place.', primaryColor: '#4f46e5', logoUrl: null };
const Ctx = createContext<Branding>(DEFAULT);
export const useBranding = () => useContext(Ctx);

// ---- colour helpers (sRGB)
const hexToRgb = (h: string) => { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = (c: number[]) => '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t);
const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrastWithWhite = (c: number[]) => 1.05 / (lum(c) + 0.05);

/** Shades for --color-brand-*; 600 and 700 are darkened until white text on them is readable (WCAG AA 4.5:1). */
export function palette(hex: string) {
  let base = hexToRgb(/^#[0-9a-f]{6}$/i.test(hex) ? hex : DEFAULT.primaryColor);
  for (let i = 0; i < 20 && contrastWithWhite(base) < 4.6; i++) base = mix(base, [0, 0, 0], 0.08);
  const white = [255, 255, 255];
  let darker = mix(base, [0, 0, 0], 0.15);
  return { 50: rgbToHex(mix(base, white, 0.93)), 100: rgbToHex(mix(base, white, 0.86)), 500: rgbToHex(mix(base, white, 0.18)), 600: rgbToHex(base), 700: rgbToHex(darker), 800: rgbToHex(mix(darker, [0, 0, 0], 0.15)) };
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const q = useQuery({ queryKey: ['branding'], queryFn: () => api.get<Branding>('/branding'), staleTime: 5 * 60_000, retry: 1 });
  const b = { ...DEFAULT, ...(q.data ?? {}) };
  useEffect(() => {
    const p = palette(b.primaryColor); const root = document.documentElement;
    for (const [k, v] of Object.entries(p)) root.style.setProperty(`--color-brand-${k}`, v);
  }, [b.primaryColor]);
  useEffect(() => { if (q.data?.name && document.title.includes('Knowledge Gate')) document.title = document.title.replace('Knowledge Gate', q.data.name); }, [q.data?.name]);
  return <Ctx.Provider value={b}>{children}</Ctx.Provider>;
}

/** Logo (or book icon) + name. */
export function BrandMark({ className = '', iconClass = 'size-5 text-brand-600', textClass = '', logoClass = 'h-7 w-auto max-w-[9rem] object-contain' }: { className?: string; iconClass?: string; textClass?: string; logoClass?: string }) {
  const b = useBranding();
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      {b.logoUrl ? <img src={b.logoUrl} alt="" className={logoClass} /> : <BookOpen className={`shrink-0 ${iconClass}`} />}
      <span className={`truncate ${textClass}`}>{b.name}</span>
    </span>
  );
}

export interface SchoolBrand { id: string; name: string; code: string; email: string | null; phone: string | null; address: string | null; city: string | null; logoUrl: string | null }
/** The signed-in user's school (name, logo, contacts); null for publisher staff. */
export const useSchoolBrand = () => useQuery<SchoolBrand | null>({ queryKey: ['schoolBrand'], queryFn: () => api.get<SchoolBrand | null>('/auth/school-brand'), staleTime: 5 * 60_000, retry: false });
/** Branding for printed documents: a school account prints with its school's name and logo, not the platform's. */
export function usePrintBrand(): Branding {
  const b = useBranding(); const s = useSchoolBrand().data;
  return s ? { ...b, name: s.name, logoUrl: s.logoUrl } : b;
}
