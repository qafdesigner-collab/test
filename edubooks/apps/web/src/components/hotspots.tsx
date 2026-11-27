'use client';
import { FeedbackView } from '@/components/classroom';
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
import { TracingPad, cropPage } from '@/components/games/tracing';
import { ColoringBoard } from '@/components/games/coloring';
import { hasRole, useMe } from '@/lib/session';
import { Clip, ReadAloud } from '@/components/voice';

export interface Hotspot { id: string; page: number; x: number; y: number; w: number; h: number; kind: Kind; title: string; body: string; url: string | null; gameId: string | null; gameTitle?: string | null; assetId?: string | null; inline?: boolean; mime?: string | null; fileName?: string | null; data?: { paths?: number[][][] } | null }
type Kind = 'NOTE' | 'AUDIO' | 'VIDEO' | 'IMAGE' | 'LINK' | 'GAME' | 'TRACE' | 'DRAW' | 'READ';
const KINDS: Record<Kind, { icon: string; label: string }> = {
  NOTE: { icon: '💬', label: 'Note or meaning' }, AUDIO: { icon: '🔊', label: 'Audio / read aloud' }, VIDEO: { icon: '🎬', label: 'Video' }, IMAGE: { icon: '🖼️', label: 'Picture' }, LINK: { icon: '🔗', label: 'Link' }, GAME: { icon: '🎮', label: 'Game' }, TRACE: { icon: '✍️', label: 'Tracing' }, DRAW: { icon: '🖍️', label: 'Drawing area' }, READ: { icon: '🎤', label: 'Read aloud' },
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
  const pageCanvas = () => box.current?.parentElement?.querySelector('canvas') ?? null;
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
      {open && (open.kind === 'TRACE' || open.kind === 'DRAW' || open.kind === 'READ' ? <WorkView h={open} onClose={() => setOpen(null)} page={pageCanvas()} />
        : <HotspotView h={open} kid={kid} onClose={() => setOpen(null)} />)}
      {form && <HotspotForm componentId={componentId} value={form} games={games} page={pageCanvas()} onClose={() => setForm(null)} />}
    </div>
  );
}

/** A blank white picture of the box's shape (for a drawing area when the page is not ready). */
function blank(w: number, h: number) { const c = document.createElement('canvas'); c.width = 800; c.height = Math.max(100, Math.round(800 * h / w)); const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); return c; }

/**
 * Tracing or drawing on a book page. Tracing: the letters printed in this part of the page, the letters the publisher typed,
 * or the writing path the publisher drew. Drawing: colour and draw on this part of the page. Students can send it to their teacher.
 */
function WorkView({ h, onClose, page }: { h: Hotspot; onClose: () => void; page?: HTMLCanvasElement | null }) {
  const me = useMe(); const student = hasRole(me.data, 'STUDENT'); const toast = useToast(); const qc = useQueryClient();
  const paths = h.data?.paths?.length ? h.data.paths : null;
  const [crop] = useState(() => (page && (h.kind === 'DRAW' || h.kind === 'READ' || paths || !h.body?.trim()) ? cropPage(page, h) : null));
  const [drawing] = useState(() => (h.kind === 'DRAW' ? (crop ?? blank(h.w, h.h)).toDataURL('image/png') : ''));
  const [readPic] = useState(() => (h.kind === 'READ' && crop ? crop.toDataURL('image/png') : ''));
  const [clip, setClip] = useState<Clip | null>(null); const [sending, setSending] = useState(false);
  const mine = useQuery({ queryKey: ['my-work', h.id], queryFn: () => api.get<{ id: string; stars: number | null; comment: string; verdict: 'OK' | 'REDO' | null; createdAt: string } | null>(`/reader/hotspots/${h.id}/my-work`), enabled: student });
  const send = async (image: string, stars: number | null) => {
    if (!student) { toast('Students see “Send to teacher” here — their work goes to the teacher’s Book work page.'); return; }
    try { await api.post(`/reader/hotspots/${h.id}/work`, { image, ...(stars !== null ? { stars } : {}) }); toast('Sent to your teacher 📤'); qc.invalidateQueries({ queryKey: ['my-work', h.id] }); }
    catch (e: any) { toast(e.message, 'err'); throw e; }
  };
  const sendReading = async () => {
    if (!student) { toast('Students see “Send to teacher” here — their reading goes to the teacher’s Book work page.'); return; }
    if (!clip) return; setSending(true);
    try { await api.post(`/reader/hotspots/${h.id}/work`, { audioId: clip.id }); toast('Your reading was sent to your teacher 📤'); setClip(null); qc.invalidateQueries({ queryKey: ['my-work', h.id] }); }
    catch (e: any) { toast(e.message, 'err'); } finally { setSending(false); }
  };
  const last = mine.data;
  const title = h.title || (h.kind === 'DRAW' ? 'Draw and colour' : h.kind === 'READ' ? 'Read aloud' : 'Trace the letters');
  return (
    <Dialog open onOpenChange={onClose} wide title={`${KINDS[h.kind].icon} ${title}`}>
      {(h.kind === 'DRAW') && h.body?.trim() && <p className="mb-3 whitespace-pre-wrap text-lg text-slate-800">{h.body}</p>}
      {last && <div className={cn('mb-3 rounded-xl p-3 text-sm', last.verdict === 'OK' ? 'bg-emerald-50 text-emerald-900' : last.verdict === 'REDO' ? 'bg-amber-50 text-amber-900' : 'bg-violet-50 text-violet-900')}>
        📤 You sent this on {new Date(last.createdAt).toLocaleDateString()}.
        {last.verdict === 'OK' && <b> ✅ Your teacher says: well done!</b>}{last.verdict === 'REDO' && <b> 🔁 Your teacher asks you to do it again.</b>}
        {last.stars !== null && last.verdict && <span> {'⭐'.repeat(last.stars)}</span>}
        {last.comment ? <> <b>{last.verdict ? '' : 'Your teacher says:'}</b> “{last.comment}”</> : !last.verdict && ' Your teacher has not answered yet.'}</div>}
      {last?.id && student && <div className="mb-3"><FeedbackView kind="page-work" targetId={last.id} playful /></div>}
      {!student && <p className="mb-3 rounded-lg bg-sky-50 p-2 text-xs text-sky-900">👁 You see this as staff. Students also get <b>📤 Send to teacher</b>; what they send appears in <b>Teacher → Book work</b>, where the teacher listens or looks, gives stars and answers “well done” or “do it again”.</p>}
      {h.kind === 'READ' ? (
        <div className="space-y-4">
          {readPic ? <img src={readPic} alt="What to read" className="mx-auto max-h-[45vh] rounded-xl bg-white object-contain shadow ring-1 ring-slate-200" />
            : h.body?.trim() ? null : <p className="text-slate-600">This page is still loading — close and try again.</p>}
          {h.body?.trim() && <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4"><p className="flex-1 whitespace-pre-wrap text-2xl font-bold leading-relaxed text-slate-800">{h.body}</p>
            <button type="button" onClick={() => void speakText(h.body)} aria-label="Listen first" className="rounded-xl bg-amber-100 p-2 text-2xl">🔊</button></div>}
          <ReadAloud playful value={clip} onChange={setClip} />
          <div className="flex justify-center"><button type="button" disabled={(student && !clip) || sending} onClick={sendReading}
            className="rounded-2xl bg-violet-600 px-6 py-3 text-lg font-black text-white shadow disabled:opacity-50">{sending ? '⏳ Sending…' : '📤 Send to teacher'}</button></div>
        </div>
      ) : h.kind === 'DRAW' ? <ColoringBoard image={drawing} say={(t) => void speakText(t)} doneLabel="📤 Send to teacher" onDone={(img) => void send(img, null).catch(() => undefined)} />
        : crop || h.body?.trim() || paths ? <TracingPad backdrop={crop} paths={paths} text={crop ? undefined : h.body.trim()} lines={!crop} say={(t) => void speakText(t)} onSend={send} />
        : <p className="text-slate-600">This page is still loading — close and try again.</p>}
    </Dialog>
  );
}

/** The publisher draws the writing path (the way the pen should go) over this part of the page. */
function PathDrawer({ page, box, value, onChange }: { page?: HTMLCanvasElement | null; box: { x: number; y: number; w: number; h: number }; value: number[][][]; onChange: (p: number[][][]) => void }) {
  const [bgUrl] = useState(() => (page ? cropPage(page, box).toDataURL('image/png') : null));
  const ref = useRef<SVGSVGElement>(null); const [cur, setCur] = useState<number[][] | null>(null);
  const ratio = page ? (box.h * page.height) / (box.w * page.width) : box.h / box.w;
  const pt = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  const d = (p: number[][]) => p.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 1000).toFixed(1)} ${(y * 1000 * ratio).toFixed(1)}`).join(' ');
  return (
    <div className="space-y-2">
      <div className="relative w-full touch-none overflow-hidden rounded-lg bg-white ring-1 ring-slate-300" style={{ aspectRatio: `${1 / ratio}` }}>
        {bgUrl && <img src={bgUrl} alt="" className="absolute inset-0 size-full" />}
        <svg ref={ref} viewBox={`0 0 1000 ${1000 * ratio}`} className="absolute inset-0 size-full cursor-crosshair" aria-label="Draw the writing path"
          onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); setCur([pt(e)]); }}
          onPointerMove={(e) => { if (!cur) return; const p = pt(e); const l = cur[cur.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.006) setCur([...cur, p]); }}
          onPointerUp={() => { if (cur && cur.length > 1 && value.length < 40) onChange([...value, cur.slice(0, 500)]); setCur(null); }}>
          {[...value, ...(cur ? [cur] : [])].map((p, i) => <g key={i}>
            <path d={d(p)} fill="none" stroke="#2563eb" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
            <circle cx={p[0][0] * 1000} cy={p[0][1] * 1000 * ratio} r={9} fill="#16a34a" /></g>)}
        </svg>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-600"><span className="flex-1">Draw each line the way the pen should go — the green dot shows where to start. {value.length} line{value.length === 1 ? '' : 's'}.</span>
        <Button type="button" size="sm" variant="ghost" disabled={!value.length} onClick={() => onChange(value.slice(0, -1))}>↶ Undo</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!value.length} onClick={() => onChange([])}>Clear</Button></div>
    </div>
  );
}

function HotspotView({ h, kid, onClose }: { h: Hotspot; kid: boolean; onClose: () => void; page?: HTMLCanvasElement | null }) {
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

function HotspotForm({ componentId, value, games, page, onClose }: { componentId: string; value: Partial<Hotspot>; games: { id: string; title: string }[]; page?: HTMLCanvasElement | null; onClose: () => void }) {
  const [f, setF] = useState<any>({ ...value, url: value.url ?? '', gameId: value.gameId ?? '', assetId: value.assetId ?? null, inline: !!value.inline, fileName: value.fileName ?? '' });
  const [paths, setPaths] = useState<number[][][]>(value.data?.paths ?? []);
  const [trace, setTrace] = useState<'PRINTED' | 'TEXT' | 'PATH'>(value.data?.paths?.length ? 'PATH' : value.body?.trim() ? 'TEXT' : 'PRINTED');
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
      gameId: f.kind === 'GAME' ? f.gameId || null : null, assetId: own ? f.assetId : null, inline: (f.kind === 'VIDEO' || f.kind === 'IMAGE') && !!f.inline,
      data: f.kind === 'TRACE' && trace === 'PATH' ? { paths } : {} };
    if (f.kind === 'TRACE' && trace === 'PRINTED') body.body = '';
    if (f.kind === 'TRACE' && trace === 'PATH' && !paths.length) { setBusy(false); setErr(new Error('Draw the writing path first.')); return; }
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
        {f.kind === 'TRACE' && <>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What children trace">{([['PRINTED', '📄 What is printed here', 'The dotted letters or shapes printed in this box'], ['TEXT', '🔤 Letters I type', 'The app shows them dotted on writing lines'], ['PATH', '〰️ A path I draw', 'Draw the way the pen should go, over the page']] as const).map(([k, l, hint]) => (
            <button key={k} type="button" role="radio" aria-checked={trace === k} onClick={() => setTrace(k)} className={cn('rounded-lg border-2 p-2 text-left text-sm', trace === k ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:bg-slate-50')}>
              <b className="block">{l}</b><span className="text-xs text-slate-600">{hint}</span></button>))}</div>
          {trace === 'PATH' && <PathDrawer page={page} box={{ x: f.x, y: f.y, w: f.w, h: f.h }} value={paths} onChange={setPaths} />}
          <p className="rounded-lg bg-sky-50 p-2 text-xs text-sky-900">Children trace with their finger or mouse and get stars; they can send their work to their teacher (Teacher → Book work).</p></>}
        {f.kind === 'READ' && <p className="rounded-lg bg-sky-50 p-2 text-xs text-sky-900">Draw the box around the words to read on the page (or type them below). Children tap 🎤, read aloud, and send the recording to their teacher (Teacher → Book work), who listens, gives stars and answers “well done” or “do it again”.</p>}
        {f.kind === 'DRAW' && <p className="rounded-lg bg-sky-50 p-2 text-xs text-sky-900">Children draw and colour in this part of the page (what is printed here stays as lines), then send it to their teacher (Teacher → Book work).</p>}
        {!(f.kind === 'TRACE' && trace !== 'TEXT') && <Field label={f.kind === 'TRACE' ? 'Letters to trace' : f.kind === 'DRAW' ? 'What to draw (optional), e.g. Draw your family' : f.kind === 'READ' ? 'Words to read (optional — leave empty to read what is printed in the box)' : f.kind === 'AUDIO' ? (f.assetId ? 'Words (optional)' : 'Words read aloud') : f.kind === 'NOTE' ? 'Note' : f.kind === 'IMAGE' ? 'Caption (optional)' : 'Text (optional)'}><Textarea rows={3} maxLength={4000} required={(f.kind === 'AUDIO' && !f.assetId) || f.kind === 'NOTE' || f.kind === 'TRACE'} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>}
        {err ? <ErrorBox error={err} /> : null}
        <div className="flex gap-2">
          {f.id && <Button type="button" variant="ghost" onClick={async () => { try { await api.del(`/reader/hotspots/${f.id}`); done('Hotspot deleted'); } catch (e) { setErr(e); } }}><Trash2 className="size-4" />Delete</Button>}
          <span className="flex-1" /><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!!up || (f.kind === 'IMAGE' && !f.assetId)}>Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
