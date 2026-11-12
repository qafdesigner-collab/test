'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play, Square, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/components/ui';
import { useT } from '@/lib/i18n';

const fmt = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const MAX_MS = 5 * 60_000;

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return '';
}

export type Clip = { id: string; durationMs: number };

/** Records from the microphone and uploads the clip. `kind` MESSAGE (chat) or READING (read-aloud homework). */
export function useRecorder(kind: 'MESSAGE' | 'READING') {
  const [state, setState] = useState<'idle' | 'recording' | 'uploading'>('idle'); const [ms, setMs] = useState(0); const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const started = useRef(0); const timer = useRef<any>(null); const stream = useRef<MediaStream | null>(null);
  const resolver = useRef<((c: Clip | null) => void) | null>(null);
  useEffect(() => () => { clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop()); }, []);
  const start = async () => {
    setError(null);
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) { setError('Recording is not supported on this browser.'); return; }
    try { stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { setError('Please allow the microphone to record.'); return; }
    chunks.current = [];
    const r = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined); rec.current = r;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = async () => {
      clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop());
      const dur = Date.now() - started.current; const type = r.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunks.current, { type });
      if (dur < 700 || !blob.size) { setState('idle'); setMs(0); resolver.current?.(null); return; }
      setState('uploading');
      try {
        const f = new FormData(); f.append('kind', kind); f.append('durationMs', String(dur));
        f.append('file', blob, `voice.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`);
        const c = await api.upload<{ id: string; durationMs: number }>('/messages/audio', f);
        resolver.current?.({ id: c.id, durationMs: dur });
      } catch (e: any) { setError(e.message); resolver.current?.(null); }
      finally { setState('idle'); setMs(0); }
    };
    started.current = Date.now(); r.start(1000); setState('recording');
    timer.current = setInterval(() => { const d = Date.now() - started.current; setMs(d); if (d >= MAX_MS) r.stop(); }, 200);
  };
  /** Stops and uploads; resolves with the saved clip (or null if cancelled / too short). */
  const stop = () => new Promise<Clip | null>((res) => { resolver.current = res; if (rec.current?.state === 'recording') rec.current.stop(); else res(null); });
  const cancel = () => { chunks.current = []; resolver.current = null; if (rec.current?.state === 'recording') { rec.current.onstop = () => { clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop()); }; rec.current.stop(); } setState('idle'); setMs(0); };
  return { state, ms, error, start, stop, cancel };
}

/** Compact player for a recorded clip (streams from the API with range requests). */
export function VoicePlayer({ id, ms, light, big }: { id: string; ms?: number | null; light?: boolean; big?: boolean }) {
  const a = useRef<HTMLAudioElement>(null); const [playing, setPlaying] = useState(false); const [pos, setPos] = useState(0); const [dur, setDur] = useState((ms ?? 0) / 1000);
  const { t } = useT();
  const toggle = () => { const el = a.current; if (!el) return; if (el.paused) el.play().catch(() => undefined); else el.pause(); };
  return (
    <div className={cn('flex items-center gap-2', big ? 'min-w-[16rem]' : 'min-w-[12rem]')}>
      <button type="button" onClick={toggle} aria-label={playing ? t('Pause') : t('Play recording')}
        className={cn('grid shrink-0 place-items-center rounded-full', big ? 'size-12' : 'size-9', light ? 'bg-white/25 text-white hover:bg-white/35' : 'bg-violet-100 text-violet-700 hover:bg-violet-200')}>
        {playing ? <Pause className={big ? 'size-6' : 'size-4'} /> : <Play className={cn(big ? 'size-6' : 'size-4', 'ms-0.5')} />}</button>
      <div className={cn('h-1.5 flex-1 overflow-hidden rounded-full', light ? 'bg-white/30' : 'bg-slate-200')}>
        <div className={cn('h-full rounded-full', light ? 'bg-white' : 'bg-violet-500')} style={{ width: `${dur ? Math.min(100, (pos / dur) * 100) : 0}%` }} /></div>
      <span className={cn('text-xs tabular-nums', light ? 'text-white/85' : 'text-slate-500')}>{fmt((playing || pos ? pos : dur) * 1000)}</span>
      <audio ref={a} src={`/api/messages/audio/${id}`} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPos(0); }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d); }} />
    </div>
  );
}

/** Mic button for the chat box: tap to record, tap again to send. */
export function VoiceButton({ onClip, disabled }: { onClip: (c: Clip) => void; disabled?: boolean }) {
  const r = useRecorder('MESSAGE'); const { t } = useT();
  if (r.state === 'recording') return (
    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-2 py-1">
      <span className="size-2.5 rounded-full bg-red-500 motion-safe:animate-pulse" /><span className="text-sm font-semibold tabular-nums text-red-700">{fmt(r.ms)}</span>
      <button type="button" onClick={r.cancel} aria-label={t('Cancel recording')} className="rounded-lg p-1.5 text-slate-500 hover:bg-white"><Trash2 className="size-4" /></button>
      <button type="button" onClick={async () => { const c = await r.stop(); if (c) onClip(c); }} aria-label={t('Stop and send')} className="grid size-9 place-items-center rounded-full bg-red-500 text-white hover:bg-red-600"><Square className="size-4" /></button>
    </div>
  );
  return (
    <div className="flex flex-col items-center">
      <button type="button" disabled={disabled || r.state === 'uploading'} onClick={r.start} aria-label={t('Record a voice message')} title={t('Record a voice message')}
        className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-violet-700 hover:bg-violet-50 disabled:opacity-50">
        {r.state === 'uploading' ? <span className="size-4 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" /> : <Mic className="size-5" />}</button>
      {r.error && <span className="mt-1 max-w-[10rem] text-center text-[11px] text-red-600">{r.error}</span>}
    </div>
  );
}

/** Big friendly recorder for read-aloud homework: record, listen back, record again. */
export function ReadAloud({ value, onChange, playful }: { value: Clip | null; onChange: (c: Clip | null) => void; playful?: boolean }) {
  const r = useRecorder('READING'); const { t } = useT();
  return (
    <div className={cn('space-y-3 rounded-2xl p-4', playful ? 'bg-violet-50' : 'border border-slate-200 bg-white')}>
      {r.state === 'recording' ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-lg font-bold text-red-600"><span className="size-3 rounded-full bg-red-500 motion-safe:animate-pulse" />{t('Recording…')} {fmt(r.ms)}</span>
          <button type="button" onClick={async () => { const c = await r.stop(); if (c) onChange(c); }} className="ms-auto inline-flex items-center gap-2 rounded-full bg-red-500 px-5 py-2.5 font-bold text-white hover:bg-red-600"><Square className="size-4" />{t('Stop')}</button>
        </div>
      ) : value ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl" aria-hidden>✅</span><span className="font-semibold text-slate-800">{t('Your reading is saved')}</span>
          <VoicePlayer id={value.id} ms={value.durationMs} big={playful} />
          <button type="button" onClick={() => { onChange(null); r.start(); }} className="ms-auto inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Mic className="size-4" />{t('Record again')}</button>
        </div>
      ) : (
        <button type="button" onClick={r.start} disabled={r.state === 'uploading'}
          className={cn('inline-flex items-center gap-3 rounded-full px-6 py-3 font-black text-white shadow-[0_5px_0_rgba(0,0,0,.15)] transition hover:-translate-y-0.5 disabled:opacity-60', playful ? 'bg-gradient-to-r from-[#e47aa5] to-[#8f7fe3] text-xl' : 'bg-violet-600 text-base')}>
          {r.state === 'uploading' ? <span className="size-5 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : <Mic className="size-6" />}
          {r.state === 'uploading' ? t('Saving…') : t('🎤 Tap to start reading')}</button>
      )}
      {r.error && <p className="text-sm font-semibold text-red-600">{r.error}</p>}
    </div>
  );
}
