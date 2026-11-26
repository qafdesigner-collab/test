'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/session';
import { useT } from '@/lib/i18n';
import { cn } from '@/components/ui';

const initials = (n?: string) => (n ?? '').split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '🙂';

/** A person's photo, or their initials when they have none. With `open`, a click shows the photo large. */
export function Avatar({ name, photoUrl, size = 40, className, style, open }: { name?: string; photoUrl?: string | null; size?: number; className?: string; style?: React.CSSProperties; open?: boolean }) {
  const [big, setBig] = useState(false);
  const pic = photoUrl?.startsWith('/avatars/');
  const face = photoUrl
    ? <img src={photoUrl} alt={name ?? ''} className={cn('shrink-0 rounded-full shadow', pic ? 'bg-gradient-to-br from-sky-100 via-violet-100 to-amber-100 object-contain' : 'object-cover', className)}
        style={{ width: size, height: size, ...style, ...(pic ? { background: undefined, padding: Math.round(size * 0.08) } : {}) }} />
    : <span className={cn('grid shrink-0 place-items-center rounded-full font-extrabold text-white shadow', className)} style={{ width: size, height: size, fontSize: size * 0.36, background: 'linear-gradient(115deg,#6857cf,#d9847a)', ...style }} aria-hidden={!name}>{initials(name)}</span>;
  if (!open || !photoUrl) return face;
  return <>
    <button type="button" onClick={() => setBig(true)} className="focus-ring rounded-full" aria-label={`Open the photo of ${name ?? ''}`}>{face}</button>
    {big && <PhotoViewer src={photoUrl} name={name} onClose={() => setBig(false)} />}
  </>;
}

function PhotoViewer({ src, name, onClose }: { src: string; name?: string; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={name} className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/80 p-4" onClick={onClose}>
      <figure className="text-center" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={name ?? ''} className="mx-auto max-h-[75vh] max-w-[90vw] rounded-3xl object-contain shadow-2xl" />
        {name && <figcaption className="mt-3 text-lg font-bold text-white">{name}</figcaption>}
      </figure>
      <button type="button" onClick={onClose} className="absolute end-4 top-4 rounded-full bg-white/90 p-2 text-slate-700" aria-label="Close"><X className="size-5" /></button>
    </div>, document.body,
  );
}

/** Makes a square picture (at most 400×400) from a chosen file, so photos are small and quick to load. */
async function squareJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight); const out = Math.min(400, side);
    const c = document.createElement('canvas'); c.width = out; c.height = out;
    c.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    return c.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

/** The signed-in person's own photo: shows it, opens it large, and lets them change or remove it. */
export function MyPhoto({ size = 40, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  const { t } = useT(); const { data: me } = useMe(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  if (!me) return null;
  const done = () => { qc.invalidateQueries({ queryKey: ['me'] }); qc.invalidateQueries({ queryKey: ['welcome'] }); };
  const pick = async (f?: File) => {
    if (!f) return; setErr('');
    if (!f.type.startsWith('image/')) { setErr(t('Please choose a picture.')); return; }
    setBusy(true);
    try { await api.post('/me/photo', { image: await squareJpeg(f) }); done(); } catch (e: any) { setErr(e?.message ?? String(e)); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  const remove = async () => { setBusy(true); try { await api.del('/me/photo'); await api.post('/me/avatar', { avatar: null }); done(); } finally { setBusy(false); } };
  const choose = async (a: string) => { setBusy(true); setErr(''); try { await api.post('/me/avatar', { avatar: a }); done(); } catch (e: any) { setErr(e?.message ?? String(e)); } finally { setBusy(false); } };
  const current = me.photoUrl?.startsWith('/avatars/') ? me.photoUrl.slice(9, -5) : null;
  return <>
    <button type="button" onClick={() => setOpen(true)} className="focus-ring shrink-0 rounded-full" aria-label={t('My photo')} title={t('My photo')}>
      <Avatar name={me.displayName} photoUrl={me.photoUrl} size={size} className={className} style={style} />
    </button>
    {open && createPortal(
      <div role="dialog" aria-modal="true" aria-label={t('My photo')} className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/60 p-4" onClick={() => setOpen(false)}>
        <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex justify-end"><button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label={t('Close')}><X className="size-5" /></button></div>
          <div className="mx-auto w-fit"><Avatar name={me.displayName} photoUrl={me.photoUrl} size={176} open /></div>
          <p className="mt-3 text-xl font-extrabold text-slate-800">{me.displayName}</p>
          <p className="text-sm text-slate-500">{me.school?.name ?? ''}</p>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" disabled={busy || !!me.impersonatedBy} onClick={() => file.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 font-bold text-white disabled:opacity-50">
              <Camera className="size-4" />{me.photoUrl ? t('Change photo') : t('Add a photo')}</button>
            {me.photoUrl && <button type="button" disabled={busy || !!me.impersonatedBy} onClick={remove} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 disabled:opacity-50"><Trash2 className="size-4" />{t('Remove')}</button>}
          </div>
          <div className="mt-5 text-start">
            <p className="mb-2 text-sm font-extrabold text-slate-700">{t('…or choose a picture')}</p>
            {AVATAR_GROUPS.map((g) => <div key={g.label} className="mb-3">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t(g.label)}</p>
              <div className="grid grid-cols-6 gap-1.5">{g.items.map((a) => (
                <button key={a} type="button" disabled={busy || !!me.impersonatedBy} onClick={() => choose(a)} aria-label={a.replace(/-/g, ' ')} aria-pressed={current === a}
                  className={cn('aspect-square rounded-2xl p-1 transition hover:scale-110 disabled:opacity-50', current === a ? 'bg-violet-100 ring-2 ring-violet-500' : 'bg-slate-50 hover:bg-violet-50')}>
                  <img src={`/avatars/${a}.webp`} alt="" className="size-full object-contain" loading="lazy" /></button>))}</div>
            </div>)}
          </div>
          {me.impersonatedBy && <p className="mt-3 text-xs text-amber-700">{t('Only this person can change their photo.')}</p>}
          {err && <p role="alert" className="mt-3 text-sm text-red-700">{err}</p>}
          <p className="mt-4 text-xs text-slate-500">{t('Your photo is seen only by people in your school (and the publisher’s team).')}</p>
        </div>
      </div>, document.body,
    )}
  </>;
}

/** Ready-made 3D pictures (Fluent Emoji 3D, MIT — see /avatars/LICENSE.txt). */
const AVATAR_GROUPS = [
  { label: 'Teachers', items: ['teacher-woman', 'teacher-man', 'teacher', 'teacher-woman-2', 'teacher-man-2', 'graduate'] },
  { label: 'Students', items: ['girl', 'boy', 'girl-2', 'boy-2', 'girl-3', 'boy-3', 'girl-hijab', 'girl-hijab-2', 'boy-turban', 'child', 'graduate-girl', 'graduate-boy'] },
  { label: 'Animals', items: ['owl', 'panda', 'fox', 'tiger', 'koala', 'rabbit', 'bear', 'lion', 'frog', 'monkey', 'cat', 'dog', 'penguin', 'unicorn', 'turtle', 'elephant'] },
  { label: 'Study', items: ['books', 'pencil', 'backpack', 'rocket', 'star', 'palette', 'football', 'microscope', 'brain', 'bulb'] },
];

/** Good morning / noon / afternoon / evening / night, from the clock of the device the person is using. */
export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return { text: 'Good morning', icon: '☀️', period: 'morning' };
  if (h === 12) return { text: 'Good noon', icon: '🌞', period: 'noon' };
  if (h > 12 && h < 17) return { text: 'Good afternoon', icon: '🌤️', period: 'afternoon' };
  if (h >= 17 && h < 22) return { text: 'Good evening', icon: '🌆', period: 'evening' };
  return { text: 'Good night', icon: '🌙', period: 'night' };
}

const TODO: Record<string, { icon: string; text: string }> = {
  homework: { icon: '📝', text: 'You have {n} homework to do' },
  dueSoon: { icon: '⏰', text: '{n} homework due in the next 2 days' },
  posts: { icon: '📰', text: 'You have {n} new posts on the timeline' },
  toMark: { icon: '✅', text: '{n} answers are waiting for your marking' },
  licences: { icon: '🔑', text: '{n} book licences end within 30 days' },
  demos: { icon: '⏳', text: '{n} demo schools end within 7 days' },
};
const ICON: Record<string, string> = { HOMEWORK: '📝', RESULT: '✅', LICENCE_EXPIRY: '🔑', DEMO_EXPIRY: '⏳', CALENDAR: '📅', ATTENDANCE: '🗓️', REPORT: '📊', TEST: '💬', TIMELINE: '📰', COMPETITION: '🏆', FEEDBACK: '🏅', GOAL: '🎉', WEEKLY: '📅', DATA: '🛡️' };

/**
 * The welcome window after signing in: a greeting for the time of day where the person is, their photo, today's date
 * and the important things — what to do, and unread important notices. Shown once per part of the day.
 */
export function WelcomePopup() {
  const { t, lang } = useT(); const { data: me } = useMe(); const path = usePathname(); const router = useRouter(); const qc = useQueryClient();
  const [show, setShow] = useState(false); const [now, setNow] = useState(() => new Date());
  const g = greeting(now);
  const key = me ? `kg-welcome-${me.id}` : '';
  const stamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${g.period}`;
  useEffect(() => {
    if (!me || path.startsWith('/room-scan') || path.startsWith('/homework')) return;
    let seen = ''; try { seen = localStorage.getItem(key) ?? ''; } catch { /* private mode */ }
    if (seen !== stamp) setShow(true);
  }, [me, key, stamp, path]);
  useEffect(() => { if (!show) return; const i = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(i); }, [show]);
  const w = useQuery({ queryKey: ['welcome'], queryFn: () => api.get<any>('/me/welcome'), enabled: show && !!me });
  if (!show || !me) return null;
  const close = () => { try { localStorage.setItem(key, stamp); } catch { /* private mode */ } setShow(false); };
  const go = async (link?: string, id?: string) => {
    if (id) { await api.post(`/notifications/${id}/read`).catch(() => undefined); qc.invalidateQueries({ queryKey: ['notifCount'] }); qc.invalidateQueries({ queryKey: ['notifs'] }); }
    close(); if (link) router.push(link);
  };
  const locale = lang === 'ar' ? 'ar' : undefined;
  const date = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone?.replace(/_/g, ' ');
  const first = me.displayName.split(/\s+/)[0];
  const items = w.data ? [...w.data.todo.map((x: any) => ({ k: `t-${x.key}`, icon: TODO[x.key]?.icon ?? '•', title: t(TODO[x.key]?.text ?? x.key, { n: x.n }), link: x.link })),
    ...w.data.notifications.slice(0, Math.max(2, 5 - w.data.todo.length)).map((x: any) => ({ k: x.id, id: x.id, icon: ICON[x.kind] ?? '🔔', title: x.title, body: x.body, link: x.link }))] : [];
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="fixed inset-0 z-[60] flex flex-col items-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-[2px]" onClick={close}>
      <div className="relative my-auto w-full max-w-md shrink-0 overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative px-6 pb-5 pt-6 text-center text-white" style={{ background: g.period === 'night' ? 'linear-gradient(135deg,#1e1b4b,#4338ca)' : g.period === 'evening' ? 'linear-gradient(135deg,#7c3aed,#f97316)' : 'linear-gradient(135deg,#0ea5e9,#8b5cf6 60%,#f59e0b)' }}>
          <button type="button" onClick={close} className="absolute end-3 top-3 rounded-full bg-white/20 p-1.5 hover:bg-white/30" aria-label={t('Close')}><X className="size-4" /></button>
          <div className="mx-auto w-fit rounded-full ring-4 ring-white/70"><Avatar name={me.displayName} photoUrl={me.photoUrl} size={88} open /></div>
          <h2 id="welcome-title" className="mt-3 text-2xl font-black drop-shadow">{g.icon} {t(g.text)}, {first}!</h2>
          <p className="mt-1 text-sm text-white/90">{date} · {time}{zone ? ` · ${zone}` : ''}</p>
        </div>
        <div className="space-y-3 px-5 py-5">
          {!me.photoUrl && !me.impersonatedBy && <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900">📷 {t('Add your photo: click your picture at the top of the page.')}</p>}
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">{t('Important today')}</h3>
          {!w.data ? <p className="text-sm text-slate-500">{t('Loading…')}</p>
            : !items.length ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">🎉 {t('Nothing important is waiting — have a great day!')}</p>
            : <ul className="space-y-2">{items.map((x) => (
              <li key={x.k}><button type="button" onClick={() => go(x.link, x.id)} className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-start hover:bg-slate-50">
                <span className="text-xl" aria-hidden>{x.icon}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{x.title}</span>
                  {x.body && <span className="block overflow-hidden text-xs text-slate-600" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{x.body}</span>}</span></button></li>))}
            </ul>}
          {w.data?.unread > items.filter((x) => x.id).length && <p className="text-xs text-slate-500">{t('{n} unread notifications in total — see the bell 🔔.', { n: w.data.unread })}</p>}
          <button type="button" onClick={close} className="w-full rounded-2xl bg-violet-600 py-3 text-lg font-black text-white shadow hover:bg-violet-700">{t("Let's go")} ▶</button>
        </div>
      </div>
    </div>, document.body,
  );
}

