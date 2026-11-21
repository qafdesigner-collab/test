'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** Pages visited inside the app in this tab: "back" goes to the previous one, or to the portal home when there is none. */
let visited = 0; let lastPath = '';
const HOMES = ['/admin', '/school', '/teacher', '/learn', '/parent', '/portal'];

/** "← Back" for every page except a portal's home (the installed app has no browser back button). */
export function BackButton({ className, playful }: { className?: string; playful?: boolean }) {
  const path = usePathname() ?? '/'; const router = useRouter(); const { t } = useT();
  const clean = path.replace(/\/$/, '') || '/';
  useEffect(() => { if (clean !== lastPath) { visited++; lastPath = clean; } }, [clean]);
  if (HOMES.includes(clean)) return null;
  const home = HOMES.find((h) => clean.startsWith(`${h}/`)) ?? '/portal';
  const back = () => { if (visited > 1) { visited -= 2; router.back(); } else router.push(home); };
  return (
    <button type="button" onClick={back} aria-label={t('Back')}
      className={cn('focus-ring inline-flex items-center gap-1.5 shadow-sm', playful ? 'rounded-full bg-white px-4 py-2 text-base font-black text-violet-700' : 'rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900', className)}>
      <ArrowLeft className={playful ? 'size-5' : 'size-4'} /><span className="hidden sm:inline">{t('Back')}</span>
    </button>
  );
}
