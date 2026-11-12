'use client';
import { BookCover } from '@/components/book-cover';
import { cn } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** Sky with drifting clouds and twinkling stars behind the pupil portal (decorative; still when motion is reduced). */
export function KidSky() {
  const stars = [[8, 12], [22, 6], [37, 18], [55, 9], [71, 15], [86, 7], [93, 22], [14, 30], [64, 28], [46, 4]];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[linear-gradient(180deg,#c7d2fe_0%,#e0e7ff_28%,#fdf2f8_62%,#fef3c7_100%)]">
      {stars.map(([x, y], i) => <span key={i} className="absolute text-lg motion-safe:animate-[twinkle_3s_ease-in-out_infinite]" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.37}s` }}>✦</span>)}
      {[{ top: '10%', d: 70, s: 1.2, delay: -10 }, { top: '24%', d: 95, s: 0.8, delay: -55 }, { top: '6%', d: 120, s: 0.6, delay: -30 }].map((c, i) => (
        <svg key={i} viewBox="0 0 200 80" className="absolute w-56 opacity-80 motion-safe:animate-[drift_linear_infinite]" style={{ top: c.top, transform: `scale(${c.s})`, animationDuration: `${c.d}s`, animationDelay: `${c.delay}s` }}>
          <path d="M40 60 a22 22 0 0 1 4-43 a30 30 0 0 1 56-8 a26 26 0 0 1 48 10 a20 20 0 0 1 12 41 z" fill="#fff" /></svg>))}
      <span className="absolute -right-16 top-24 size-56 rounded-full bg-amber-200/60 blur-2xl" />
      <span className="absolute -left-20 bottom-10 size-72 rounded-full bg-pink-200/60 blur-3xl" />
      <span className="absolute bottom-0 h-24 w-full bg-[radial-gradient(ellipse_at_50%_120%,#86efac_0%,#bbf7d0_45%,transparent_70%)]" />
    </div>
  );
}

/** Level from stars: every 10 stars is a new level. */
export const levelOf = (stars: number) => ({ level: Math.floor(stars / 10) + 1, into: stars % 10, need: 10 });

export function LevelBadge({ stars, name }: { stars: number; name?: string }) {
  const l = levelOf(stars);
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/90 py-1 pe-4 ps-1 shadow" title={`Level ${l.level}: ${l.into} of ${l.need} stars to the next level`}>
      <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-lg font-black text-white shadow-inner">{l.level}</span>
      <span className="hidden flex-col sm:flex"><span className="text-xs font-black uppercase tracking-wide text-orange-700">Level {l.level}{name ? ` · ${name}` : ''}</span>
        <span className="mt-0.5 h-2 w-28 overflow-hidden rounded-full bg-amber-100"><span className="block h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${(l.into / l.need) * 100}%` }} /></span></span>
    </div>
  );
}

/** A 3D book with its cover mockup (or a coloured cover). */
export function Book3D({ url, color, title, className }: { url?: string | null; color?: string | null; title: string; className?: string }) {
  return <div className={cn('book3d relative aspect-[3/4] overflow-visible', className)}><BookCover url={url} color={color} title={title} className="size-full rounded-[4px_10px_10px_4px] text-sm" label={!url} /></div>;
}

/** Wooden shelf under a row of books. */
export const Shelf = () => <div aria-hidden className="relative -mt-2 h-5 rounded-md bg-gradient-to-b from-amber-600 to-amber-800 shadow-[0_10px_18px_-6px_rgba(120,53,15,.6)] before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:rounded-t-md before:bg-amber-400/70" />;

/** "My star path": stepping stones to the next level, with the owl standing on today's stone. */
export function StarPath({ stars }: { stars: number }) {
  const l = levelOf(stars); const { t } = useT();
  const stones = Array.from({ length: l.need }, (_, i) => i);
  const hues = ['#f6a5c0', '#f7bd7f', '#f3d77a', '#9edc9b', '#8fd3d0', '#93bdf0', '#b6a6f0', '#e0a6e8', '#f6a5c0', '#f7bd7f'];
  return (
    <section className="kid-rise rounded-[2.5rem] bg-white/85 p-5 shadow-sm ring-4 ring-white sm:p-6" style={{ animationDelay: '.05s' }} aria-label={`Star path: ${l.into} of ${l.need} stars to level ${l.level + 1}`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-800">{t('🗺️ My star path')}</h2>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-800">{t('{n} ⭐ to level {m}', { n: l.need - l.into, m: l.level + 1 })}</span>
      </div>
      <div className="relative flex items-end justify-between gap-1 overflow-x-auto px-1 pb-2 pt-12">
        <svg aria-hidden viewBox="0 0 100 10" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-4 bottom-6 h-6 w-[calc(100%-2rem)]">
          <path d="M0 5 Q 12.5 0 25 5 T 50 5 T 75 5 T 100 5" fill="none" stroke="#e7dcc4" strokeWidth="2.5" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        </svg>
        {stones.map((i) => {
          const done = i < l.into; const here = i === l.into;
          return (
            <div key={i} className="relative z-10 flex flex-col items-center" style={{ marginBottom: i % 2 ? 10 : 0 }}>
              {here && <span className="absolute -top-11 text-3xl motion-safe:animate-[bob_2s_ease-in-out_infinite]" aria-hidden>🦉</span>}
              <span className={cn('grid size-9 place-items-center rounded-full text-base font-black shadow-[0_4px_0_rgba(0,0,0,.12)] sm:size-11', done ? 'text-white' : 'bg-slate-100 text-slate-400')}
                style={done ? { background: hues[i % hues.length] } : undefined}>{done ? '⭐' : i + 1}</span>
            </div>
          );
        })}
        <div className="relative z-10 flex flex-col items-center"><span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-400 text-2xl shadow-[0_4px_0_rgba(0,0,0,.12)] sm:size-12">🏆</span></div>
      </div>
      <p className="mt-1 text-center text-sm font-bold text-slate-500">{t('Read, play and finish homework to collect stars and walk the path!')}</p>
    </section>
  );
}
