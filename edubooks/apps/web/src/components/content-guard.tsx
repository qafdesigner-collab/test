'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/components/ui';

export interface Protection { protect: boolean; watermark: string }
/** Whether this user sees book content in view-only mode (set by the publisher under Company & Currency). */
export function useProtection() {
  return useQuery({ queryKey: ['myProtection'], queryFn: () => api.get<Protection>('/company/my-protection'), staleTime: 10 * 60_000 }).data ?? { protect: false, watermark: '' };
}

/**
 * Wraps book content for protected viewers: no right-click, selecting, copying, dragging, saving or printing,
 * a watermark with the viewer's name, and a cover when the window loses focus or Print Screen is pressed.
 * Note: no web page can fully stop screenshots or a phone camera — the watermark makes any copy traceable.
 */
export function ContentGuard({ children, className }: { children: React.ReactNode; className?: string }) {
  const p = useProtection(); const box = useRef<HTMLDivElement>(null); const [shield, setShield] = useState(false);
  useEffect(() => {
    if (!p.protect) return;
    const stop = (e: Event) => { if (box.current?.contains(e.target as Node)) e.preventDefault(); };
    const key = (e: KeyboardEvent) => {
      const k = (e.key || '').toLowerCase(); const mod = e.ctrlKey || e.metaKey;
      if (k === 'printscreen') { e.preventDefault(); setShield(true); try { navigator.clipboard.writeText(''); } catch { /* ignore */ } return; }
      if (mod && ['s', 'p', 'c', 'x', 'u'].includes(k)) { e.preventDefault(); e.stopPropagation(); }
      if (mod && e.shiftKey && ['i', 'j', 'c', 's'].includes(k)) { e.preventDefault(); e.stopPropagation(); }
    };
    // Focus moving into the book's own frame is fine; focus leaving the page (another app, a screen-capture tool) is not.
    const blur = () => setTimeout(() => { if (document.activeElement?.tagName !== 'IFRAME') setShield(true); }, 0);
    const hidden = () => { if (document.visibilityState === 'hidden') setShield(true); };
    const ev: [string, EventListener][] = [['contextmenu', stop], ['copy', stop], ['cut', stop], ['dragstart', stop], ['selectstart', stop]];
    ev.forEach(([n, f]) => document.addEventListener(n, f, true));
    window.addEventListener('keydown', key, true); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', hidden);
    const before = () => setShield(true); window.addEventListener('beforeprint', before);
    return () => { ev.forEach(([n, f]) => document.removeEventListener(n, f, true)); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('beforeprint', before); };
  }, [p.protect]);
  if (!p.protect) return <div className={className}>{children}</div>;
  return (
    <div ref={box} className={cn('kg-guard relative select-none', className)} style={{ WebkitTouchCallout: 'none' } as any}>
      {children}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <div className="absolute -inset-1/2 flex rotate-[-24deg] flex-wrap content-start gap-x-24 gap-y-20 p-10 text-[15px] font-semibold text-slate-900 opacity-[0.09]">
          {Array.from({ length: 120 }, (_, i) => <span key={i} className="whitespace-nowrap">{p.watermark}</span>)}</div></div>
      {shield && <button onClick={() => setShield(false)} className="absolute inset-0 z-30 grid place-items-center bg-slate-900/95 p-6 text-center text-lg font-semibold text-white">
        🔒 This content is protected.<br /><span className="text-sm font-normal text-white/80">Click to continue reading.</span></button>}
      <style>{'@media print { .kg-guard { display: none !important; } }'}</style>
    </div>
  );
}
