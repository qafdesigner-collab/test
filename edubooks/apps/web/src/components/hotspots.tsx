'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Dialog, ErrorBox, Field, Input, Select, Textarea, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { embedUrl } from '@/components/training';
import { uploadBig } from '@/lib/big-upload';
import { speakText } from '@/lib/voice';

export interface Hotspot { id: string; page: number; x: number; y: number; w: number; h: number; kind: Kind; title: string; body: string; url: string | null; gameId: string | null; gameTitle?: string | null; assetId?: string | null; inline?: boolean; mime?: string | null; fileName?: string | null }
type Kind = 'NOTE' | 'AUDIO' | 'VIDEO' | 'IMAGE' | 'LINK' | 'GAME';
const KINDS: Record<Kind, { icon: string; label: string }> = {
  NOTE: { icon: '💬', label: 'Note or meaning' }, AUDIO: { icon: '🔊', label: 'Audio / read aloud' }, VIDEO: { icon: '🎬', label: 'Video' }, IMAGE: { icon: '🖼️', label: 'Picture' }, LINK: { icon: '🔗', label: 'Link' }, GAME: { icon: '🎮', label: 'Game' },
};
/** A short-lived link to the publisher's own video / audio / picture (checked against the reader's licence). */
export function useMedia(assetId?: string | null) {
  return useQuery({ queryKey: ['media', assetId], queryFn: () => api.get<{ url: string }>(`/assets/${assetId}/link`), enabled: !!assetId, staleTime: 120_000 }).data?.url ?? null;
}
let playing: HTMLAudioElement | null = null;
const playFile = async (assetId: string) => { const { url } = await api.get<{ url: string }>(`/assets/${assetId}/link`); playing?.pause(); playing = new Audio(url); await playing.play().catch(() => undefined); };

/** A video or picture shown on the page itself. */
function InlineMedia({ h, editing, onEdit, noFlip }: { h: Hotspot; editing: boolean; onEdit: () => void; noFlip?: boolean }) {
  const url = useMedia(h.assetId);
  const embed = h.kind === 'VIDEO' && !h.assetId ? embedUrl(h.url) : null;
  return (
    <div data-noflip={noFlip && h.kind === 'VIDEO' ? '' : undefined} className={cn('absolute overflow-hidden rounded-lg bg-black/5', editing && 'ring-2 ring-sky-600')} style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, width: `${h.w * 100}%`, height: `${h.h * 100}%` }}>
      {h.kind === 'IMAGE' ? (url ? <img src={url} alt={h.title || 'Picture'} className="size-full object-contain" draggable={false} /> : null)
        : embed ? <iframe src={embed} title={h.title || 'Video'} className="size-full" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          : url ? <video src={url} controls playsInline preload="metadata" className="size-full bg-black object-contain" controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} /> : null}
      {editing && <button onClick={onEdit} className="absolute right-1 top-1 rounded bg-white px-2 py-0.5 text-xs font-medium shadow">✏️ Edit</button>}
    </div>
  );
}

const speak = (t: string) => { void speakText(t); };

/** Tappable areas drawn over a book page. Publisher staff can draw new ones in edit mode. */
export function HotspotLayer({ componentId, page, editing, kid, games, noFlip }: { componentId: string; page: number; editing: boolean; kid: boolean; games: { id: string; title: string }[]; noFlip?: boolean }) {
  const q = useQuery({ queryKey: ['hotspots', componentId], queryFn: () => api.get<Hotspot[]>(`/reader/components/${componentId}/hotspots`) });
  const [open, setOpen] = useState<Hotspot | null>(null); const [form, setForm] = useState<Partial<Hotspot> | null>(null);
  const [draw, setDraw] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const here = (q.data ?? []).filter((h) => h.page === page);
  const pos = (e: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  const activate = (h: Hotspot) => { if (editing) return setForm(h); if (h.kind === 'AUDIO') return h.assetId ? void playFile(h.assetId) : speak(h.body); setOpen(h); };
  const rect = draw && { x: Math.min(draw.x0, draw.x), y: Math.min(draw.y0, draw.y), w: Math.abs(draw.x - draw.x0), h: Math.abs(draw.y - draw.y0) };
  return (
    <div ref={box} className={cn('absolute inset-0', editing && 'cursor-crosshair bg-sky-500/5 ring-2 ring-inset ring-sky-400')}
      onPointerDown={editing ? (e) => { if (e.target !== box.current) return; const p = pos(e); box.current!.setPointerCapture(e.pointerId); setDraw({ x0: p.x, y0: p.y, ...p }); } : undefined}
      onPointerMove={editing && draw ? (e) => setDraw({ ...draw, ...pos(e) }) : undefined}
      onPointerUp={editing && draw ? () => { if (rect && rect.w > 0.02 && rect.h > 0.02) setForm({ page, ...rect, kind: 'NOTE', title: '', body: '', url: '', gameId: null }); setDraw(null); } : undefined}>
      {here.filter((h) => h.inline).map((h) => <InlineMedia key={h.id} h={h} editing={editing} onEdit={() => setForm(h)} noFlip={noFlip} />)}
      {here.filter((h) => !h.inline).map((h) => (
        <button key={h.id} data-noflip={noFlip ? '' : undefined} onClick={() => activate(h)} aria-label={`${KINDS[h.kind].label}${h.title ? `: ${h.title}` : ''}`} title={h.title || KINDS[h.kind].label}
          className={cn('focus-ring group absolute rounded-lg border-2 transition', editing ? 'border-sky-600 bg-sky-400/25' : 'border-amber-400/70 bg-amber-300/10 hover:bg-amber-300/30 motion-safe:animate-[pulse_2.5s_ease-in-out_3]')}
          style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, width: `${h.w * 100}%`, height: `${h.h * 100}%` }}>
          <span className={cn('absolute -right-2 -top-2 grid place-items-center rounded-full bg-white shadow', kid ? 'size-8 text-lg' : 'size-6 text-sm')}>{KINDS[h.kind].icon}</span>
        </button>))}
      {rect && <div className="pointer-events-none absolute rounded-lg border-2 border-dashed border-sky-600 bg-sky-400/20" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />}
      {open && <HotspotView h={open} kid={kid} onClose={() => setOpen(null)} />}
      {form && <HotspotForm componentId={componentId} value={form} games={games} onClose={() => setForm(null)} />}
    </div>
  );
}

function HotspotView({ h, kid, onClose }: { h: Hotspot; kid: boolean; onClose: () => void }) {
  const embed = h.kind === 'VIDEO' && !h.assetId ? embedUrl(h.url) : null;
  const file = useMedia(h.assetId);
  return (
    <Dialog open onOpenChange={onClose} wide={h.kind === 'VIDEO' || h.kind === 'IMAGE'} title={`${KINDS[h.kind].icon} ${h.title || KINDS[h.kind].label}`}>
      {h.kind === 'IMAGE' && (file ? <img src={file} alt={h.title || 'Picture'} className="mx-auto max-h-[70vh] rounded-xl object-contain" /> : <p className="text-slate-500">Loading…</p>)}
      {(h.kind === 'IMAGE' || (h.kind === 'VIDEO' && h.assetId)) && h.body && <p className={cn('mt-3 whitespace-pre-wrap text-slate-700', kid && 'text-lg')}>{h.body}</p>}
      {h.kind === 'NOTE' && <div className="flex items-start gap-3"><p className={cn('flex-1 whitespace-pre-wrap leading-relaxed text-slate-800', kid && 'text-xl')}>{h.body}</p>
        <button onClick={() => speak(h.body)} aria-label="Read aloud" className="rounded-xl bg-amber-100 p-2 text-2xl">🔊</button></div>}
      {h.kind === 'VIDEO' && h.assetId && (file ? <video src={file} controls autoPlay playsInline controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} className="aspect-video w-full rounded-xl bg-black" /> : <p className="text-slate-500">Loading…</p>)}
      {h.kind === 'VIDEO' && !h.assetId && (embed ? <div className="aspect-video overflow-hidden rounded-xl bg-black"><iframe src={embed} title={h.title || 'Video'} className="size-full" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>
        : <a href={h.url!} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Open the video</a>)}
      {h.kind === 'LINK' && <>{h.body && <p className="mb-3 text-slate-700">{h.body}</p>}<a href={h.url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white"><ExternalLink className="size-4" />Open</a></>}
      {h.kind === 'GAME' && <>{h.body && <p className="mb-3 text-slate-700">{h.body}</p>}{h.gameId ? <Link href={kid ? `/learn/games/${h.gameId}` : `/teacher/games/${h.gameId}`} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-xl font-bold text-white">🎮 Play {h.gameTitle ?? ''}</Link> : <p className="text-slate-600">This game is no longer available.</p>}</>}
    </Dialog>
  );
}

function HotspotForm({ componentId, value, games, onClose }: { componentId: string; value: Partial<Hotspot>; games: { id: string; title: string }[]; onClose: () => void }) {
  const [f, setF] = useState<any>({ ...value, url: value.url ?? '', gameId: value.gameId ?? '', assetId: value.assetId ?? null, inline: !!value.inline, fileName: value.fileName ?? '' });
  const [up, setUp] = useState<string | null>(null); const fileIn = useRef<HTMLInputElement>(null);
  const media = ['VIDEO', 'AUDIO', 'IMAGE'].includes(f.kind);
  const accept = f.kind === 'VIDEO' ? 'video/mp4,video/webm' : f.kind === 'AUDIO' ? 'audio/mpeg,audio/mp4,.mp3,.m4a' : 'image/png,image/jpeg,image/gif,image/webp';
  const sendFile = async (file: File) => {
    setErr(null); setUp('0%');
    try {
      const id = await uploadBig(file, (p) => setUp(`${p.pct}%`));
      const r = await api.post<any>(`/publishing/components/${componentId}/page-media-from-upload`, { uploadId: id });
      const kind = r.kind === 'VIDEO' ? 'VIDEO' : r.kind === 'AUDIO' ? 'AUDIO' : 'IMAGE';
      setF((x: any) => ({ ...x, kind, assetId: r.assetId, fileName: r.name, url: '' }));
    } catch (e) { setErr(e); } finally { setUp(null); }
  };
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const qc = useQueryClient(); const toast = useToast();
  const done = (m: string) => { qc.invalidateQueries({ queryKey: ['hotspots', componentId] }); toast(m); onClose(); };
  const save = async () => {
    setBusy(true); setErr(null);
    const own = media && f.assetId;
    const body = { page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, kind: f.kind, title: f.title, body: f.body, url: (f.kind === 'VIDEO' && !own) || f.kind === 'LINK' ? f.url : null,
      gameId: f.kind === 'GAME' ? f.gameId || null : null, assetId: own ? f.assetId : null, inline: (f.kind === 'VIDEO' || f.kind === 'IMAGE') && !!f.inline };
    try { f.id ? await api.patch(`/reader/hotspots/${f.id}`, body) : await api.post(`/reader/components/${componentId}/hotspots`, body); done('Hotspot saved'); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose} title={f.id ? 'Edit element' : 'New element on the page'} description={`Page ${f.page}. Readers tap this area of the page, or see it on the page.`}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What happens">{(Object.keys(KINDS) as Kind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })}
            className={cn('rounded-lg border px-3 py-1.5 text-sm', f.kind === k ? 'border-brand-600 bg-brand-50 font-medium text-brand-800' : 'border-slate-200 hover:bg-slate-50')}>{KINDS[k].icon} {KINDS[k].label}</button>))}</div>
        <Field label="Title (optional)"><Input maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        {media && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm">
            <input ref={fileIn} type="file" accept={accept} className="hidden" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) void sendFile(x); }} />
            {f.assetId ? <div className="flex items-center gap-2">✅ <span className="flex-1 truncate">{f.fileName || 'Your file'}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => fileIn.current?.click()}>Change</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, assetId: null, fileName: '' })}>Remove</Button></div>
              : <Button type="button" size="sm" variant="secondary" loading={!!up} onClick={() => fileIn.current?.click()}>{up ? `Uploading ${up}` : f.kind === 'VIDEO' ? '⬆ Upload your video (MP4)' : f.kind === 'AUDIO' ? '⬆ Upload audio (MP3)' : '⬆ Upload a picture'}</Button>}
            <p className="mt-1 text-xs text-slate-500">{f.kind === 'VIDEO' ? 'Or paste a YouTube / Vimeo link below. ' : f.kind === 'AUDIO' ? 'Or type words below and the device reads them aloud. ' : ''}Only readers with this book can open it; it cannot be downloaded.</p>
          </div>)}
        {(f.kind === 'VIDEO' || f.kind === 'IMAGE') && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.inline} onChange={(e) => setF({ ...f, inline: e.target.checked })} />
          Show {f.kind === 'VIDEO' ? 'the video' : 'the picture'} on the page itself (instead of a tappable icon)</label>}
        {((f.kind === 'VIDEO' && !f.assetId) || f.kind === 'LINK') && <Field label={f.kind === 'VIDEO' ? 'YouTube or Vimeo link' : 'Link (https://…)'}><Input required value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>}
        {f.kind === 'GAME' && <Field label="Game"><Select required value={f.gameId} onChange={(e) => setF({ ...f, gameId: e.target.value })}><option value="">Choose a game…</option>{games.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select></Field>}
        <Field label={f.kind === 'AUDIO' ? (f.assetId ? 'Words (optional)' : 'Words read aloud') : f.kind === 'NOTE' ? 'Note' : f.kind === 'IMAGE' ? 'Caption (optional)' : 'Text (optional)'}><Textarea rows={3} maxLength={4000} required={(f.kind === 'AUDIO' && !f.assetId) || f.kind === 'NOTE'} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        {err ? <ErrorBox error={err} /> : null}
        <div className="flex gap-2">
          {f.id && <Button type="button" variant="ghost" onClick={async () => { try { await api.del(`/reader/hotspots/${f.id}`); done('Hotspot deleted'); } catch (e) { setErr(e); } }}><Trash2 className="size-4" />Delete</Button>}
          <span className="flex-1" /><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!!up || (f.kind === 'IMAGE' && !f.assetId)}>Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
