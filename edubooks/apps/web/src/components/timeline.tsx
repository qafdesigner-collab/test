'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, ImagePlus, MapPin, MoreHorizontal, Pin, Send, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/session';
import { useT } from '@/lib/i18n';
import { cn } from '@/components/ui';
import { Avatar } from '@/components/welcome';

const REACTIONS = ['❤️', '👏', '😊', '🎉', '⭐'];
const MAX_PHOTOS = 8;

/** Makes a photo at most 1600 px wide/high as a JPEG, so posting from a phone is quick. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.82; let out = c.toDataURL('image/jpeg', q);
    while (out.length > 1_300_000 && q > 0.4) { q -= 0.12; out = c.toDataURL('image/jpeg', q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

function when(d: string, lang: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000; const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  if (s < 60) return rtf.format(0, 'second');
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 7 * 86400) return rtf.format(-Math.round(s / 86400), 'day');
  return new Date(d).toLocaleDateString(lang === 'ar' ? 'ar' : undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
const eventDate = (d: string, lang: string) => new Date(d).toLocaleString(lang === 'ar' ? 'ar' : undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * The school timeline. Teachers and the school admin (`canPost`) write posts and events, for the whole school or a class,
 * with photos; everyone reacts. `playful` = the children's style.
 */
export function Timeline({ canPost, playful }: { canPost?: boolean; playful?: boolean }) {
  const { t, lang } = useT();
  const feed = useInfiniteQuery({
    queryKey: ['timeline'], initialPageParam: '' as string,
    queryFn: ({ pageParam }) => api.get<any>(`/timeline${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const events = useQuery({ queryKey: ['timelineEvents'], queryFn: () => api.get<any[]>('/timeline/events') });
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {!!events.data?.length && (
        <section className={cn('overflow-hidden rounded-3xl bg-gradient-to-r from-amber-100 via-rose-100 to-violet-100 p-4', playful && 'shadow')}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-600"><CalendarDays className="size-4" />{t('Coming up')}</h2>
          <ul className="flex gap-3 overflow-x-auto pb-1">{events.data.map((e) => (
            <li key={e.id} className="min-w-52 shrink-0 rounded-2xl bg-white/90 p-3 shadow-sm">
              <div className="text-xs font-bold text-rose-600">{eventDate(e.eventAt, lang)}</div>
              <div className="font-extrabold text-slate-900">{e.title}</div>
              <div className="text-xs text-slate-500">{[e.place, e.className].filter(Boolean).join(' · ')}</div>
            </li>))}</ul>
        </section>
      )}
      {canPost && <Composer />}
      {feed.isLoading ? <p className="p-6 text-center text-slate-500">{t('Loading…')}</p>
        : !posts.length ? <div className={cn('rounded-3xl bg-white p-10 text-center shadow-sm', playful && 'text-xl font-bold')}><div className="text-5xl">📰</div><p className="mt-2 text-slate-600">{t('Nothing on the timeline yet.')}</p></div>
        : posts.map((p) => <PostCard key={p.id} p={p} playful={playful} />)}
      {feed.hasNextPage && <div className="text-center"><button type="button" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}
        className="rounded-full bg-white px-5 py-2 font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">{feed.isFetchingNextPage ? t('Loading…') : t('Show older posts')}</button></div>}
    </div>
  );
}

function Composer() {
  const { t } = useT(); const { data: me } = useMe(); const qc = useQueryClient();
  const aud = useQuery({ queryKey: ['timelineAudiences'], queryFn: () => api.get<any[]>('/timeline/audiences') });
  const [open, setOpen] = useState(false); const [kind, setKind] = useState<'POST' | 'EVENT'>('POST');
  const [f, setF] = useState({ classId: '', title: '', body: '', eventAt: '', place: '' });
  const [photos, setPhotos] = useState<{ key: string; preview: string }[]>([]); const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const add = async (list: FileList | null) => {
    if (!list) return; setErr('');
    const files = [...list].filter((x) => x.type.startsWith('image/')).slice(0, MAX_PHOTOS - photos.length);
    setUploading((n) => n + files.length);
    for (const fl of files) {
      try { const img = await shrink(fl); const r = await api.post<{ key: string }>('/timeline/uploads', { image: img }); setPhotos((p) => [...p, { key: r.key, preview: img }]); }
      catch (e: any) { setErr(e?.message ?? String(e)); } finally { setUploading((n) => n - 1); }
    }
    if (file.current) file.current.value = '';
  };
  const reset = () => { setF({ classId: '', title: '', body: '', eventAt: '', place: '' }); setPhotos([]); setKind('POST'); setOpen(false); };
  const post = async () => {
    setBusy(true); setErr('');
    try {
      await api.post('/timeline', { classId: f.classId || null, kind, title: f.title, body: f.body, place: f.place, eventAt: kind === 'EVENT' && f.eventAt ? new Date(f.eventAt).toISOString() : null, images: photos.map((p) => p.key) });
      reset(); qc.invalidateQueries({ queryKey: ['timeline'] }); qc.invalidateQueries({ queryKey: ['timelineEvents'] });
    } catch (e: any) { setErr(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  if (!me) return null;
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-start shadow-sm ring-1 ring-slate-200 hover:ring-violet-300">
      <Avatar name={me.displayName} photoUrl={me.photoUrl} size={44} />
      <span className="flex-1 rounded-full bg-slate-100 px-4 py-3 text-slate-500">{t('Share news, photos or an event…')}</span>
      <ImagePlus className="size-6 text-violet-600" />
    </button>
  );
  return (
    <div className="space-y-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-violet-200">
      <div className="flex flex-wrap items-center gap-2">
        <Avatar name={me.displayName} photoUrl={me.photoUrl} size={40} />
        <div className="flex rounded-full bg-slate-100 p-1 text-sm font-bold">
          {(['POST', 'EVENT'] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={cn('rounded-full px-3 py-1', kind === k ? 'bg-white text-violet-700 shadow' : 'text-slate-500')}>{k === 'POST' ? `📰 ${t('Post')}` : `📅 ${t('Event')}`}</button>)}
        </div>
        <select aria-label={t('Who can see it')} value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })} className="ms-auto rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm">
          <option value="">🏫 {t('Whole school')}</option>{aud.data?.map((c) => <option key={c.id} value={c.id}>👥 {c.name}</option>)}
        </select>
      </div>
      {(kind === 'EVENT' || f.title) && <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} placeholder={kind === 'EVENT' ? t('Event name, e.g. Sports Day') : t('Title (optional)')}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold" />}
      <textarea autoFocus value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={3} maxLength={5000} placeholder={t('What happened today? Share it with the students and parents…')}
        className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2" />
      {kind === 'EVENT' && <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">{t('Date and time')}<input type="datetime-local" value={f.eventAt} onChange={(e) => setF({ ...f, eventAt: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700">{t('Place')}<input value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder={t('e.g. Playground')} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
      </div>}
      {(photos.length > 0 || uploading > 0) && <div className="grid grid-cols-4 gap-2">
        {photos.map((p) => <div key={p.key} className="relative"><img src={p.preview} alt="" className="aspect-square w-full rounded-xl object-cover" />
          <button type="button" onClick={() => setPhotos(photos.filter((x) => x.key !== p.key))} className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white" aria-label={t('Remove')}><X className="size-3.5" /></button></div>)}
        {Array.from({ length: uploading }).map((_, i) => <div key={i} className="grid aspect-square animate-pulse place-items-center rounded-xl bg-slate-100 text-xs text-slate-500">{t('Uploading…')}</div>)}
      </div>}
      <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      {err && <p role="alert" className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={photos.length + uploading >= MAX_PHOTOS} onClick={() => file.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-40"><ImagePlus className="size-4" />{t('Photos')} ({photos.length}/{MAX_PHOTOS})</button>
        <span className="flex-1" />
        <button type="button" onClick={reset} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">{t('Cancel')}</button>
        <button type="button" disabled={busy || uploading > 0 || (!f.body.trim() && !f.title.trim() && !photos.length)} onClick={post} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 font-bold text-white disabled:opacity-50"><Send className="size-4" />{t('Post')}</button>
      </div>
    </div>
  );
}

function PostCard({ p, playful }: { p: any; playful?: boolean }) {
  const { t, lang } = useT(); const qc = useQueryClient();
  const [r, setR] = useState({ reactions: p.reactions as Record<string, number>, mine: p.myReaction as string | null });
  const [menu, setMenu] = useState(false); const [editing, setEditing] = useState(false); const [text, setText] = useState(p.body);
  const [view, setView] = useState<number | null>(null);
  useEffect(() => setR({ reactions: p.reactions, mine: p.myReaction }), [p.reactions, p.myReaction]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['timeline'] }); qc.invalidateQueries({ queryKey: ['timelineEvents'] }); };
  const react = async (emoji: string) => { const x = await api.post<any>(`/timeline/${p.id}/react`, { emoji }); setR({ reactions: x.reactions, mine: x.myReaction }); };
  const save = async () => { await api.patch(`/timeline/${p.id}`, { body: text }); setEditing(false); refresh(); };
  const pin = async () => { await api.patch(`/timeline/${p.id}`, { pinned: !p.pinned }); setMenu(false); refresh(); };
  const del = async () => { if (!confirm(t('Delete this post?'))) return; await api.del(`/timeline/${p.id}`); refresh(); };
  const n = p.images.length;
  return (
    <article className={cn('overflow-hidden bg-white shadow-sm ring-1 ring-slate-200', playful ? 'rounded-[2rem]' : 'rounded-3xl', p.pinned && 'ring-2 ring-amber-300')}>
      <header className="flex items-center gap-3 p-4 pb-2">
        <Avatar name={p.authorName} photoUrl={p.authorPhoto} size={44} open />
        <div className="min-w-0 flex-1">
          <div className="truncate font-extrabold text-slate-900">{p.authorName}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span>{t(p.authorRole)}</span><span>·</span><span>{when(p.createdAt, lang)}</span><span>·</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{p.className ? `👥 ${p.className}` : `🏫 ${t('Whole school')}`}</span>
            {p.pinned && <span className="inline-flex items-center gap-0.5 font-bold text-amber-600"><Pin className="size-3" />{t('Pinned')}</span>}
          </div>
        </div>
        {p.canEdit && <div className="relative"><button type="button" onClick={() => setMenu(!menu)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label={t('More')}><MoreHorizontal className="size-5" /></button>
          {menu && <div className="absolute end-0 z-10 mt-1 w-40 overflow-hidden rounded-xl bg-white text-sm shadow-xl ring-1 ring-slate-200">
            <button type="button" onClick={() => { setEditing(true); setMenu(false); }} className="block w-full px-3 py-2 text-start hover:bg-slate-50">✏️ {t('Edit')}</button>
            {p.canPin && <button type="button" onClick={pin} className="block w-full px-3 py-2 text-start hover:bg-slate-50">📌 {p.pinned ? t('Unpin') : t('Pin to the top')}</button>}
            <button type="button" onClick={del} className="flex w-full items-center gap-1 px-3 py-2 text-start text-red-700 hover:bg-red-50"><Trash2 className="size-4" />{t('Delete')}</button></div>}</div>}
      </header>
      <div className="space-y-2 px-4 pb-3">
        {p.kind === 'EVENT' && <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-center leading-none shadow-sm"><div><div className="text-[10px] font-bold uppercase text-rose-600">{new Date(p.eventAt).toLocaleDateString(lang === 'ar' ? 'ar' : undefined, { month: 'short' })}</div><div className="text-lg font-black text-slate-800">{new Date(p.eventAt).getDate()}</div></div></div>
          <div className="min-w-0"><div className="font-extrabold text-slate-900">📅 {p.title}</div><div className="text-sm text-slate-700">{eventDate(p.eventAt, lang)}</div>{p.place && <div className="flex items-center gap-1 text-sm text-slate-600"><MapPin className="size-3.5" />{p.place}</div>}</div>
        </div>}
        {p.kind !== 'EVENT' && p.title && <h3 className={cn('font-extrabold text-slate-900', playful ? 'text-2xl' : 'text-lg')}>{p.title}</h3>}
        {editing ? <div className="space-y-2"><textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">{t('Cancel')}</button><button type="button" onClick={save} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-bold text-white">{t('Save')}</button></div></div>
          : p.body && <p className={cn('whitespace-pre-line text-slate-800', playful && 'text-lg')} dir="auto">{p.body}</p>}
      </div>
      {n > 0 && <div className={cn('grid gap-0.5', n === 1 ? 'grid-cols-1' : n <= 4 ? 'grid-cols-2' : 'grid-cols-3')}>
        {p.images.slice(0, 6).map((src: string, i: number) => (
          <button key={i} type="button" onClick={() => setView(i)} className={cn('relative overflow-hidden bg-slate-100',
            n === 1 ? 'max-h-[28rem]' : n === 3 && i === 0 ? 'col-span-2 aspect-[2/1]' : n === 3 ? 'aspect-[4/3]' : 'aspect-square')}>
            <img src={src} alt="" loading="lazy" className="size-full object-cover transition hover:scale-[1.02]" />
            {i === 5 && n > 6 && <span className="absolute inset-0 grid place-items-center bg-black/50 text-3xl font-black text-white">+{n - 6}</span>}
          </button>))}
      </div>}
      <footer className="flex flex-wrap items-center gap-1.5 p-3">
        {REACTIONS.map((e) => { const c = r.reactions?.[e] ?? 0; const on = r.mine === e; return (
          <button key={e} type="button" onClick={() => react(e)} aria-pressed={on} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm transition', on ? 'bg-violet-100 font-bold text-violet-800 ring-1 ring-violet-300' : 'bg-slate-50 text-slate-600 hover:bg-slate-100', playful && 'px-3 py-1.5 text-lg')}>
            <span>{e}</span>{c > 0 && <span className="tabular-nums">{c}</span>}</button>); })}
      </footer>
      {view !== null && <Viewer images={p.images} at={view} onClose={() => setView(null)} />}
    </article>
  );
}

function Viewer({ images, at, onClose }: { images: string[]; at: number; onClose: () => void }) {
  const [i, setI] = useState(at); const n = images.length;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => (x + 1) % n); if (e.key === 'ArrowLeft') setI((x) => (x - 1 + n) % n); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [n, onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] grid place-items-center bg-black/90 p-4" onClick={onClose}>
      <img src={images[i]} alt="" className="max-h-[88vh] max-w-[94vw] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
      {n > 1 && <>
        <button type="button" onClick={(e) => { e.stopPropagation(); setI((i - 1 + n) % n); }} className="absolute start-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2" aria-label="Previous"><ChevronLeft className="size-6" /></button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setI((i + 1) % n); }} className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2" aria-label="Next"><ChevronRight className="size-6" /></button>
        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-3 py-1 text-sm font-bold">{i + 1} / {n}</span></>}
      <button type="button" onClick={onClose} className="absolute end-4 top-4 rounded-full bg-white/90 p-2" aria-label="Close"><X className="size-5" /></button>
    </div>, document.body,
  );
}

/** The newest posts, small, for a home page. */
export function TimelinePeek({ href, playful }: { href: string; playful?: boolean }) {
  const { t, lang } = useT();
  const q = useQuery({ queryKey: ['timeline', 'peek'], queryFn: () => api.get<any>('/timeline?limit=3') });
  const items = q.data?.items ?? [];
  if (!items.length) return null;
  return (
    <section className={cn('rounded-3xl bg-white p-4 shadow-sm', playful && 'rounded-[2rem]')}>
      <div className="mb-3 flex items-center justify-between"><h2 className={cn('font-black text-slate-800', playful ? 'text-2xl' : 'text-lg')}>📰 {t('School news')}</h2>
        <a href={href} className="text-sm font-bold text-violet-700 hover:underline">{t('See all ▶')}</a></div>
      <ul className="space-y-2">{items.map((p: any) => (
        <li key={p.id}><a href={href} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-slate-50">
          {p.images[0] ? <img src={p.images[0]} alt="" className="size-14 shrink-0 rounded-xl object-cover" /> : <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-violet-50 text-2xl">{p.kind === 'EVENT' ? '📅' : '📰'}</span>}
          <span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-900">{p.title || p.body}</span>
            <span className="block truncate text-xs text-slate-500">{p.authorName} · {when(p.createdAt, lang)}</span></span></a></li>))}</ul>
    </section>
  );
}
