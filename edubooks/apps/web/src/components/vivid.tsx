'use client';
import Link from 'next/link';
import { cn } from '@/components/ui';

/** Shared building blocks for the colourful teacher and school-admin dashboards. */

export const GRADIENTS = [
  'from-[#7b74e0] to-[#5d6bd6]', 'from-[#e0739b] to-[#ec9a6c]', 'from-[#2fa59b] to-[#4b9ad6]', 'from-[#e0a04a] to-[#df7a85]',
  'from-[#3fae7f] to-[#83b84e]', 'from-[#b26ad1] to-[#7d63d0]', 'from-[#4b9ad6] to-[#5871d4]', 'from-[#df7a85] to-[#c96a9f]',
];

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? { icon: '☀️', text: 'Good morning' } : h < 17 ? { icon: '🌤️', text: 'Good afternoon' } : { icon: '🌙', text: 'Good evening' };
};

export function Hero({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('relative overflow-hidden rounded-[28px] p-6 text-white shadow-[0_18px_40px_-20px_rgba(60,50,140,.55)] sm:p-7', className)} style={{ background: 'var(--hero, linear-gradient(115deg,#6857cf,#9a5cc3 50%,#d9847a))' }}>
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
      <span className="min-w-0"><b className="block break-words text-xl font-extrabold leading-tight text-slate-900">{value}</b><span className="block text-[13px] font-semibold text-slate-500">{label}</span></span>
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

/** Gently floating doodles for a hero banner (decorative, still when motion is reduced). */
export function Doodles({ items = ['📚', '✏️', '⭐', '🎨', '🔤', '🧮'] }: { items?: string[] }) {
  const spots = [[78, 12], [90, 48], [70, 62], [84, 80], [62, 22], [95, 18]];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden sm:block">
      {items.slice(0, spots.length).map((e, i) => (
        <span key={i} className="absolute text-2xl opacity-80 motion-safe:animate-[float-y_5s_ease-in-out_infinite]"
          style={{ left: `${spots[i][0]}%`, top: `${spots[i][1]}%`, animationDelay: `${i * 0.6}s`, transform: `rotate(${(i % 2 ? 1 : -1) * 12}deg)` }}>{e}</span>
      ))}
    </div>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Mon–Fri (plus weekend days that have lessons) with how many lessons each day; today highlighted. */
export function WeekStrip({ slots }: { slots: { weekday: number }[] }) {
  const today = new Date().getDay() || 7;
  const days = [...new Set([1, 2, 3, 4, 5, ...slots.map((s) => s.weekday)])].sort();
  const max = Math.max(1, ...days.map((d) => slots.filter((s) => s.weekday === d).length));
  return (
    <div className="flex items-end gap-2">
      {days.map((d) => {
        const n = slots.filter((s) => s.weekday === d).length; const on = d === today;
        return (
          <div key={d} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">{n || ''}</span>
            <span className={cn('w-full rounded-xl transition', on ? 'bg-gradient-to-t from-[#6857cf] to-[#b07ad6]' : 'bg-violet-100')} style={{ height: `${14 + (n / max) * 56}px` }} />
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', on ? 'bg-violet-600 text-white' : 'text-slate-500')}>{DAYS[d - 1]}</span>
          </div>
        );
      })}
    </div>
  );
}

const TIPS = [
  'Start the lesson with a 2-minute “what do you remember?” game — it wakes up yesterday’s learning.',
  'Praise the effort, not just the answer: “You kept trying — great!”',
  'Ask one child to explain an answer to a friend. Teaching is the best way to learn.',
  'Use the book’s pictures: “What do you see? What might happen next?”',
  'End with an exit ticket: one thing they learned, one question they still have.',
  'Give thinking time — count to five in your head before taking answers.',
  'Turn a worksheet into a game: assign it in Games and watch the stars roll in.',
  'Mix movement into phonics: jump for vowels, clap for consonants.',
  'Call parents with good news too — a quick message makes a big difference.',
  'Let pupils choose between two tasks. A little choice brings a lot of energy.',
  'Model your thinking out loud: “First I look at…, then I…”.',
  'Use the AI assistant for three warm-up questions on today’s lesson.',
  'Pair a confident reader with a shy one for buddy reading.',
  'Celebrate mistakes: “Good mistake! What can we learn from it?”',
];
/** A sticky note with a different teaching tip each day. */
export function TipNote() {
  const day = Math.floor(Date.now() / 864e5);
  return (
    <div className="relative rotate-[-1.5deg] rounded-md bg-[#fff6c9] p-4 pt-6 text-sm text-amber-950 shadow-[0_10px_20px_-12px_rgba(120,90,0,.6)] transition hover:rotate-0">
      <span aria-hidden className="absolute -top-2 left-1/2 h-5 w-16 -translate-x-1/2 rotate-2 rounded-sm bg-amber-200/80" />
      <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-amber-700">💡 Tip of the day</p>
      <p className="font-medium leading-relaxed">{TIPS[day % TIPS.length]}</p>
    </div>
  );
}
