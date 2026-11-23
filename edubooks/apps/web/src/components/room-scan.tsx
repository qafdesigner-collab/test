'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import { cn } from '@/components/ui';
import { PanoramaBuilder, recordClip } from '@/lib/panorama';

export type RoomScanResult = { panorama: string; video: string | null; coverage: number; complete: boolean };
/** camera-widths for a full turn (a typical camera sees about 60°) */
const FULL = 6;
/** after this long the student may send an unfinished scan (the teacher sees it is unfinished) */
const GIVE_UP_AFTER = 90;

/**
 * The room panorama: the student turns the camera slowly all the way around. It does not stop by itself until the whole
 * room is scanned — the camera is back where it started, or a full turn is covered. Only after 90 seconds can an
 * unfinished scan be sent, and the teacher then sees how much of the room it shows.
 */
export function RoomScan({ stream, mirror = true, onDone, onCancel }: { stream: MediaStream; mirror?: boolean; onDone: (r: RoomScanResult) => void; onCancel?: () => void }) {
  const { t } = useT();
  const preview = useRef<HTMLVideoElement>(null); const strip = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState({ coverage: 0, fast: false, secs: 0, closed: false });
  const finishRef = useRef<((complete: boolean) => void) | null>(null);
  useEffect(() => {
    let stop = false; let timer: ReturnType<typeof setInterval> | null = null; let rec: { stop: () => Promise<string | null> } | null = null; let finished = false;
    (async () => {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream; await v.play().catch(() => undefined);
      for (let i = 0; i < 30 && v.readyState < 2; i++) await new Promise((r) => setTimeout(r, 100));
      if (stop) return;
      const b = new PanoramaBuilder(v); const clip = recordClip(stream); rec = clip; const t0 = Date.now(); let done = false;
      const finish = async (complete: boolean) => {
        if (done) return; done = true; finished = true; if (timer) clearInterval(timer);
        const panorama = b.result(); const video = clip ? await clip.stop() : null; v.srcObject = null;
        onDone({ panorama, video, coverage: complete ? 100 : Math.min(99, Math.round((b.covered / FULL) * 100)), complete });
      };
      finishRef.current = (c) => void finish(c);
      timer = setInterval(() => {
        b.add(); const secs = Math.round((Date.now() - t0) / 1000);
        const coverage = b.closed ? 100 : Math.min(100, Math.round((b.covered / FULL) * 100));
        setInfo({ coverage, fast: b.tooFast, secs, closed: b.closed }); if (strip.current) b.preview(strip.current);
        if (b.closed || b.covered >= FULL) void finish(true); // the whole room: it finishes by itself
      }, 220);
    })();
    return () => { stop = true; if (timer) clearInterval(timer); if (!finished) void rec?.stop(); };
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (preview.current) { preview.current.srcObject = stream; preview.current.play().catch(() => undefined); } }, [stream]);
  const tip = info.fast ? 'Slower please — turn very slowly.' : info.coverage < 25 ? 'Turn slowly to your left…' : info.coverage < 60 ? 'Keep turning slowly — show all the walls…' : info.coverage < 100 ? 'Keep going until you are back where you started.' : 'The whole room is scanned!';
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-black shadow-inner">
        <video ref={preview} autoPlay muted playsInline className={cn('aspect-video w-full object-cover', mirror && '-scale-x-100')} aria-label={t('Your camera')} />
        <span className="absolute end-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white">● REC {info.secs}s</span>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-center">
          <p className={cn('text-lg font-black drop-shadow sm:text-xl', info.fast ? 'text-amber-300' : 'text-white')}>{info.fast ? '🐢' : '⟲'} {t(tip)}</p>
          <div className="mx-auto mt-2 flex w-3/4 items-center gap-2"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/30"><div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${info.coverage}%` }} /></div>
            <span className="text-sm font-bold text-white tabular-nums">{info.coverage}%</span></div>
        </div>
      </div>
      <canvas ref={strip} width={900} height={150} className="h-24 w-full rounded-lg bg-slate-900" aria-label={t('Your room panorama, growing')} />
      <p className="text-center text-sm text-slate-600">🔒 {t('The scan finishes by itself when you have turned all the way around the room.')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">{t('Cancel')}</button>}
        {info.secs >= GIVE_UP_AFTER && info.coverage < 100 && <button type="button" onClick={() => finishRef.current?.(false)}
          className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-900">{t('I cannot finish — send it unfinished ({n}%)', { n: info.coverage })}</button>}
      </div>
    </div>
  );
}
