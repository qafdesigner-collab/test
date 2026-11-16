'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, Share, Smartphone, SquarePlus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/lib/branding';
import { offlineSupported, saveBook, savedEditionIds, warmPages } from '@/lib/offline';
import { cn } from '@/components/ui';
import { useT } from '@/lib/i18n';

// The browser offers installation once, early; keep that offer for when the user taps "Install app".
let deferred: any = null; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('kg-installed', '1'); } catch { /* ignore */ } emit(); });
}
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };

/** Is the app installed / running as an app, can the browser install it with one tap, and is this an iPhone or iPad? */
export function useInstall() {
  const canPrompt = useSyncExternalStore(subscribe, () => !!deferred, () => false);
  const [env, setEnv] = useState({ standalone: false, ios: false, macSafari: false, device: 'computer' as 'phone' | 'tablet' | 'computer', ready: false });
  useEffect(() => {
    const ua = navigator.userAgent;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    const ipadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const ios = /iphone|ipad|ipod/i.test(ua) || ipadOs;
    const device = /ipad|tablet|playbook|silk/i.test(ua) || ipadOs || (/android/i.test(ua) && !/mobile/i.test(ua)) ? 'tablet' : /iphone|ipod|android|mobile/i.test(ua) ? 'phone' : 'computer';
    const macSafari = !ios && /macintosh/i.test(ua) && /safari/i.test(ua) && !/chrome|chromium|edg|firefox/i.test(ua);
    setEnv({ standalone, ios, macSafari, device, ready: true });
  }, []);
  const prompt = async () => { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; emit(); return r?.outcome === 'accepted'; };
  return { ...env, canPrompt, prompt };
}

/** Keeps the iPhone home-screen name and icon in step with the company branding. */
export function AppMeta() {
  const b = useBranding() as any;
  useEffect(() => {
    const set = (sel: string, make: () => HTMLElement, attr: string, val: string) => { let el = document.head.querySelector(sel) as HTMLElement | null; if (!el) { el = make(); document.head.appendChild(el); } el.setAttribute(attr, val); };
    set('meta[name="apple-mobile-web-app-title"]', () => Object.assign(document.createElement('meta'), { name: 'apple-mobile-web-app-title' }), 'content', b.name);
    set('meta[name="application-name"]', () => Object.assign(document.createElement('meta'), { name: 'application-name' }), 'content', b.name);
    if (b.appIcon) {
      set('link[rel="apple-touch-icon"]', () => Object.assign(document.createElement('link'), { rel: 'apple-touch-icon' }), 'href', b.appIcon.replace('/192', '/180'));
      // the browser-tab icon follows an icon made under Branding too
      document.head.querySelectorAll('link[rel="icon"]').forEach((l) => l.setAttribute('href', b.appIcon));
    }
  }, [b.name, b.appIcon]);
  return null;
}

/** "Install app" button: shown until the app is installed. `variant` matches the portal's header style. */
export function InstallAppButton({ variant = 'plain', className, canSaveBooks }: { variant?: 'plain' | 'playful' | 'hero'; className?: string; canSaveBooks?: boolean }) {
  const { t } = useT(); const ins = useInstall(); const [open, setOpen] = useState(false);
  if (!ins.ready || ins.standalone) return null;
  const cls = variant === 'playful' ? 'rounded-full bg-white px-3 py-2 text-sm font-bold text-violet-700 shadow'
    : variant === 'hero' ? 'rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/25'
    : 'rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:text-slate-900';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('focus-ring inline-flex items-center gap-1.5', cls, className)} title={t('Install the app on this device')}>
        <Smartphone className="size-4" /><span className="hidden sm:inline">{t('Install app')}</span>
      </button>
      {/* drawn on <body>: headers with a blur effect would otherwise trap the window inside the header */}
      {open && createPortal(<InstallDialog onClose={() => setOpen(false)} canSaveBooks={canSaveBooks} />, document.body)}
    </>
  );
}

function InstallDialog({ onClose, canSaveBooks }: { onClose: () => void; canSaveBooks?: boolean }) {
  const { t } = useT(); const b = useBranding() as any; const ins = useInstall();
  const [done, setDone] = useState(false); const [save, setSave] = useState<{ state: 'idle' | 'busy' | 'done' | 'error'; text?: string }>({ state: 'idle' });
  const install = async () => { if (await ins.prompt()) setDone(true); };
  const saveAll = async () => {
    setSave({ state: 'busy', text: t('Getting your books…') });
    try {
      const lib = await api.get<any[]>('/library');
      const eds = [...new Set(lib.map((x) => x.editionId).filter(Boolean))] as string[];
      const already = await savedEditionIds(); let n = 0;
      for (const [i, id] of eds.entries()) {
        setSave({ state: 'busy', text: `${t('Saving book')} ${i + 1} / ${eds.length}…` });
        if (!already.includes(id)) { await saveBook(id); n++; }
      }
      await warmPages(['/portal', '/learn', '/learn/books', '/teacher', '/teacher/books']);
      const where = ins.device === 'phone' ? t('this phone') : ins.device === 'tablet' ? t('this tablet') : t('this computer');
      setSave({ state: 'done', text: eds.length ? t('{n} book(s) are on {where} — they open even without internet.', { n: eds.length, where }) : t('You have no books yet.') });
      void n;
    } catch (e: any) { setSave({ state: 'error', text: e?.message || t('Could not save the books') }); }
  };
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label={t('Install the app')} onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center gap-4 bg-gradient-to-br from-violet-600 to-indigo-600 p-5 text-white">
          <img src={b.appIcon ?? '/icon-192.png'} alt="" className="size-16 rounded-2xl bg-white shadow-lg" />
          <div><p className="text-lg font-bold">{t('Install {name}', { name: b.name })}</p><p className="text-sm text-white/85">{ins.device === 'computer' ? t('Opens like a program from your desktop — with your books ready offline.') : t('Opens like an app from your home screen — with your books ready offline.')}</p></div>
          <button onClick={onClose} aria-label={t('Close')} className="absolute end-3 top-3 rounded-full p-1 text-white/80 hover:bg-white/15"><X className="size-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          {done ? <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800"><CheckCircle2 className="size-5" />{t('Installed! Look for the icon on your home screen.')}</p>
            : ins.canPrompt ? <button onClick={install} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3 text-base font-bold text-white shadow hover:bg-violet-700"><Download className="size-5" />{t('Install now')}</button>
            : ins.ios ? (
              <ol className="space-y-2 text-sm text-slate-700">
                <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">1</span>{t('Open this site in Safari.')}</li>
                <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">2</span>{t('Tap the Share button')} <Share className="size-4 text-sky-600" /></li>
                <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">3</span>{t('Choose “Add to Home Screen”')} <SquarePlus className="size-4" /></li>
              </ol>)
            : ins.macSafari ? <p className="text-sm text-slate-700">{t('In Safari on a Mac: open the File menu and choose “Add to Dock”.')}</p>
            : ins.device === 'computer' ? <p className="text-sm text-slate-700">{t('Use Chrome or Edge: click the install icon at the right of the address bar, or open the menu (⋮ or ⋯) → “Install {name}” / “Apps → Install this site as an app”. It then opens from your desktop and Start menu or Dock.', { name: b.name })}</p>
            : <p className="text-sm text-slate-700">{t('Open your browser menu (⋮ or ⋯) and choose “Install app” or “Add to Home screen”.')}</p>}
          {canSaveBooks && offlineSupported() && (
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-800">📚 {ins.device === 'phone' ? t('Save my books on this phone') : ins.device === 'tablet' ? t('Save my books on this tablet') : t('Save my books on this computer')}</p>
              <p className="mt-0.5 text-xs text-slate-600">{t('Your books are kept (encrypted) on this device, so they open without internet. Save them on each phone, tablet or computer you use. Signing out removes them.')}</p>
              {save.text && <p className={cn('mt-2 text-sm', save.state === 'error' ? 'text-red-600' : save.state === 'done' ? 'text-emerald-700' : 'text-slate-600')}>{save.text}</p>}
              {save.state !== 'done' && <button onClick={saveAll} disabled={save.state === 'busy'} className="mt-3 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{save.state === 'busy' ? t('Saving…') : t('Save my books')}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
