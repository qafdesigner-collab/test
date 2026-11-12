'use client';
import Link from 'next/link';
import { cn } from '@/components/ui';

/** Shared building blocks for the colourful teacher and school-admin dashboards. */

export const GRADIENTS = [
  'from-violet-500 to-indigo-500', 'from-pink-500 to-orange-400', 'from-teal-500 to-sky-500', 'from-amber-500 to-rose-500',
  'from-emerald-500 to-lime-500', 'from-fuchsia-500 to-purple-600', 'from-sky-500 to-blue-600', 'from-rose-500 to-red-500',
];

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? { icon: '☀️', text: 'Good morning' } : h < 17 ? { icon: '🌤️', text: 'Good afternoon' } : { icon: '🌙', text: 'Good evening' };
};

export function Hero({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('relative overflow-hidden rounded-[28px] bg-gradient-to-r from-violet-700 via-pink-600 to-amber-500 p-6 text-white shadow-[0_18px_40px_-18px_#7c3aed] sm:p-7', className)}>
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-white/10" />
      <span aria-hidden className="pointer-events-none absolute -bottom-28 left-[40%] size-44 rounded-full bg-white/10" />
      <div className="relative">{children}</div>
    </section>
  );
}

export function StatTile({ icon, bg, value, label, href }: { icon: string; bg: string; value: React.ReactNode; label: string; href?: string }) {
  const body = (
    <div className="flex h-full items-center gap-3.5 rounded-3xl bg-white p-4 shadow-sm transition hover:shadow-md">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: bg }} aria-hidden>{icon}</span>
      <span className="min-w-0"><b className="block text-2xl font-extrabold text-slate-900">{value}</b><span className="block text-[13px] font-semibold text-slate-500">{label}</span></span>
    </div>
  );
  return href ? <Link href={href} className="focus-ring rounded-3xl">{body}</Link> : body;
}

export function ActionTile({ href, icon, label, gradient }: { href: string; icon: string; label: string; gradient: string }) {
  return (
    <Link href={href} className={cn('focus-ring block rounded-[20px] bg-gradient-to-br px-3 py-4 text-center text-sm font-bold text-white shadow-[0_6px_0_rgba(0,0,0,.12)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none', gradient)}>
      <span className="mb-1.5 block text-3xl" aria-hidden>{icon}</span>{label}
    </Link>
  );
}

export function Panel({ title, link, children, className }: { title: string; link?: { href: string; label: string }; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-3xl bg-white p-5 shadow-sm', className)}>
      <h2 className="mb-3.5 flex items-center justify-between text-[17px] font-bold text-slate-900">{title}
        {link && <Link href={link.href} className="text-[13px] font-semibold text-violet-600 hover:underline">{link.label} →</Link>}</h2>
      {children}
    </section>
  );
}

export function Ring({ children, tone }: { children: React.ReactNode; tone: 'red' | 'amber' | 'violet' | 'pink' | 'green' }) {
  const c = { red: 'bg-red-100 text-red-700', amber: 'bg-amber-100 text-amber-800', violet: 'bg-violet-100 text-violet-700', pink: 'bg-pink-100 text-pink-700', green: 'bg-emerald-100 text-emerald-700' }[tone];
  return <span className={cn('grid size-11 shrink-0 place-items-center rounded-full text-xs font-extrabold', c)}>{children}</span>;
}

export function Pill({ children, tone = 'violet' }: { children: React.ReactNode; tone?: 'violet' | 'amber' | 'green' | 'red' }) {
  const c = { violet: 'bg-violet-100 text-violet-700', amber: 'bg-amber-100 text-amber-800', green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-700' }[tone];
  return <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', c)}>{children}</span>;
}

const FACES = ['🧒', '👧', '👦', '🧒🏽', '👧🏻', '👦🏾'];
export function Faces({ n, color }: { n: number; color: string }) {
  const shown = Math.min(4, n);
  return (
    <div className="mt-2.5 flex" aria-hidden>
      {Array.from({ length: shown }, (_, i) => <span key={i} className={cn('grid size-7 place-items-center rounded-full border-2 border-white bg-amber-200 text-[13px]', i && '-ml-2')}>{FACES[i % FACES.length]}</span>)}
      {n > shown && <span className="-ml-2 grid size-7 place-items-center rounded-full border-2 border-white bg-white text-[11px] font-extrabold" style={{ color }}>+{n - shown}</span>}
    </div>
  );
}

export function GradientCard({ href, gradient, children }: { href: string; gradient: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn('focus-ring relative block overflow-hidden rounded-[20px] bg-gradient-to-br p-4 text-white transition hover:-translate-y-0.5 hover:shadow-lg', gradient)}>
      <span aria-hidden className="pointer-events-none absolute -bottom-10 -right-8 size-28 rounded-full bg-white/15" />
      <div className="relative">{children}</div>
    </Link>
  );
}

export const Bar = ({ pct }: { pct: number | null }) => (
  <div className="mt-3 h-2 rounded-full bg-white/30"><i className="block h-full rounded-full bg-white" style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} /></div>
);
