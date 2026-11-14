'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/components/ui';
import { useBranding } from '@/lib/branding';

export interface Protection { protect: boolean; watermark: string }
/** Whether this user sees book content in view-only mode (set by the publisher under Company & Currency). */
export function useProtection() {
  return useQuery({ queryKey: ['myProtection'], queryFn: () => api.get<Protection>('/company/my-protection'), staleTime: 10 * 60_000 }).data ?? { protect: false, watermark: '' };
}

/**
 * Wraps book content for protected viewers: no right-click, selecting, copying, dragging, saving, printing or developer tools;
 * one faint publisher logo in the centre with the reader's name under it; the book is covered whenever the reader
 * switches to another tab, window or app (or presses Print Screen), until they click to continue.
 * Note: no web page can fully stop a screenshot or a phone camera — the name under the logo makes a copy traceable.
 * `fixed` keeps the logo in the middle of the screen for long, scrolling content.
 */
export function ContentGuard({ children, className, fixed }: { children: React.ReactNode; className?: string; fixed?: boolean }) {
  const p = useProtection(); const brand = useBranding(); const box = useRef<HTMLDivElement>(null); const [shield, setShield] = useState(false);
  useEffect(() => {
    if (!p.protect) return;
    const stop = (e: Event) => { if (box.current?.contains(e.target as Node)) e.preventDefault(); };
    const key = (e: KeyboardEvent) => {
      const k = (e.key || '').toLowerCase(); const mod = e.ctrlKey || e.metaKey;
      if (k === 'printscreen') { e.preventDefault(); setShield(true); try { navigator.clipboard.writeText(''); } catch { /* ignore */ } return; }
      if (k === 'f12' || (mod && ['s', 'p', 'c', 'x', 'u'].includes(k)) || (mod && e.shiftKey && ['i', 'j', 'c', 's', 'k'].includes(k)) || (e.metaKey && e.altKey && ['i', 'j', 'c', 'u'].includes(k))) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    // Focus moving into the book's own frame is fine; focus leaving the page (another tab, app or a screen-capture tool) is not.
    const blur = () => setTimeout(() => { if (!document.hasFocus()) setShield(true); }, 0);
    const hidden = () => { if (document.visibilityState === 'hidden') setShield(true); };
    const ev: [string, EventListener][] = [['contextmenu', stop], ['copy', stop], ['cut', stop], ['dragstart', stop], ['selectstart', stop]];
    ev.forEach(([n, f]) => document.addEventListener(n, f, true));
    window.addEventListener('keydown', key, true); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', hidden);
    const before = () => setShield(true); window.addEventListener('beforeprint', before);
    const noPrint = window.print; window.print = () => undefined;
    return () => { ev.forEach(([n, f]) => document.removeEventListener(n, f, true)); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('beforeprint', before); window.print = noPrint; };
  }, [p.protect]);
  if (!p.protect) return <div className={className}>{children}</div>;
  return (
    <div ref={box} className={cn('kg-guard relative select-none', className)} style={{ WebkitTouchCallout: 'none' } as any} onContextMenu={(e) => e.preventDefault()}>
      {children}
      <div aria-hidden className={cn('pointer-events-none z-20 flex flex-col items-center justify-center gap-2 opacity-[0.13]', fixed ? 'fixed inset-0' : 'absolute inset-0')}>
        {brand.logoUrl ? <img src={brand.logoUrl} alt="" draggable={false} className="max-h-[32%] w-[min(34%,260px)] object-contain grayscale" />
          : <span className="text-3xl font-black tracking-tight text-slate-900">{brand.name}</span>}
        {p.watermark && <span className="whitespace-nowrap text-xs font-semibold text-slate-900">{p.watermark}</span>}
      </div>
      {shield && <button onClick={() => setShield(false)} className={cn('z-30 grid place-items-center bg-slate-900 p-6 text-center text-lg font-semibold text-white', fixed ? 'fixed inset-0' : 'absolute inset-0')}>
        <span>🔒 This book is protected.<br /><span className="text-sm font-normal text-white/80">It is hidden while you are on another page or app. Click to continue reading.</span></span></button>}
      <style>{'@media print { .kg-guard, .kg-guard * { display: none !important; } body::after { content: "Printing is not allowed for this book."; } }'}</style>
    </div>
  );
}
