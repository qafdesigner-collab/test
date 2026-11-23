'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { cn } from '@/components/ui';
import { PanoramaBuilder, recordClip } from '@/lib/panorama';

export type Proctor = { camera?: boolean; roomScan?: boolean; screen?: boolean };
export const watched = (p?: Proctor | null) => !!(p?.camera || p?.roomScan || p?.screen);
export type Streams = { cam: MediaStream | null; scr: MediaStream | null; room: string[]; panorama?: string | null; roomVideo?: string | null; screenPart: boolean; noScreen: boolean };

const canShare = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
/** A picture of a video stream as a small JPEG data URL. */
const players = new WeakMap<MediaStream, HTMLVideoElement>();
/** A picture of a stream, from a video kept playing for that stream (quick, no waiting for a new video to start). */
async function snap(stream: MediaStream, maxW: number, quality: number): Promise<string | null> {
  let v = players.get(stream);
  if (!v) { v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream; players.set(stream, v); await v.play().catch(() => undefined); }
  if (v.readyState < 2) return grab(stream, maxW, quality);
  try {
    const k = Math.min(1, maxW / (v.videoWidth || maxW)); const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((v.videoWidth || maxW) * k)); c.height = Math.max(1, Math.round((v.videoHeight || maxW * 0.75) * k));
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', quality);
  } catch { return null; }
}
function grab(stream: MediaStream, maxW: number, quality: number): Promise<string | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream;
    const done = (x: string | null) => { v.srcObject = null; resolve(x); };
    v.onloadeddata = () => {
      try {
        const k = Math.min(1, maxW / (v.videoWidth || maxW)); const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round((v.videoWidth || maxW) * k)); c.height = Math.max(1, Math.round((v.videoHeight || maxW * 0.75) * k));
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height); done(c.toDataURL('image/jpeg', quality));
      } catch { done(null); }
    };
    v.play().catch(() => done(null)); setTimeout(() => done(null), 4000);
  });
}
const shareScreen = () => navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor' } as any, audio: false } as any);
const isWhole = (s: MediaStream) => { const ds = (s.getVideoTracks()[0]?.getSettings() as any)?.displaySurface; return !ds || ds === 'monitor'; };

/**
 * Before a watched test: the student allows the camera, turns it slowly around the room, and shares the whole screen.
 * Everything that will be recorded is said plainly first.
 */
export function ProctorGate({ p, resume, onReady }: { p: Proctor; resume: boolean; onReady: (s: Streams) => void }) {
  const { t } = useT();
  const needCam = !!(p.camera || (p.roomScan && !resume));
  const [cam, setCam] = useState<MediaStream | null>(null); const [scr, setScr] = useState<MediaStream | null>(null);
  const [room, setRoom] = useState<string[]>([]); const [scan, setScan] = useState<number | null>(null); const [err, setErr] = useState('');
  const [part, setPart] = useState(false); const [noScreen, setNoScreen] = useState(false);
  const attach = (stream: MediaStream | null) => (el: HTMLVideoElement | null) => { if (el && stream && el.srcObject !== stream) { el.srcObject = stream; el.play().catch(() => undefined); } };
  const askCam = async () => {
    setErr('');
    try { setCam(await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, facingMode: 'user' }, audio: false })); }
    catch { setErr(t('The camera is blocked. Allow the camera for this website (the camera icon in the address bar), then try again. If you have no camera, tell your teacher.')); }
  };
  // the room scan: a panorama while the student turns slowly all around, and a short video of it
  const [pano, setPano] = useState<string | null>(null); const [roomVideo, setRoomVideo] = useState<string | null>(null);
  const [scanInfo, setScanInfo] = useState({ covered: 0, fast: false, secs: 0 });
  const strip = useRef<HTMLCanvasElement>(null); const scanVideo = useRef<HTMLVideoElement | null>(null); const stopScan = useRef<(() => void) | null>(null);
  const TARGET = 6; // camera-widths: about all the way around
  const doScan = async () => {
    if (!cam) return;
    setPano(null); setRoomVideo(null); setRoom([]); setScan(0);
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = cam; await v.play().catch(() => undefined); scanVideo.current = v;
    for (let i = 0; i < 20 && v.readyState < 2; i++) await new Promise((r) => setTimeout(r, 100));
    const b = new PanoramaBuilder(v); const clip = recordClip(cam); const t0 = Date.now();
    let done = false; const finish = async () => {
      if (done) return; done = true; clearInterval(timer);
      const img = b.result(); const vid = clip ? await clip.stop() : null;
      setPano(img); setRoomVideo(vid); setScan(null); v.srcObject = null; stopScan.current = null;
    };
    stopScan.current = () => void finish();
    const timer = setInterval(() => {
      b.add(); const secs = Math.round((Date.now() - t0) / 1000);
      setScanInfo({ covered: b.covered, fast: b.tooFast, secs }); if (strip.current) b.preview(strip.current);
      if ((b.covered >= TARGET && secs >= 8) || secs >= 40) void finish();
    }, 220);
  };
  useEffect(() => () => stopScan.current?.(), []);
  const scanning = scan !== null;
  const scanTip = scanInfo.fast ? 'Slower please — turn very slowly.' : scanInfo.covered < 1.6 ? 'Hold the camera (or the laptop) and turn slowly to your left…' : scanInfo.covered < 4 ? 'Keep turning slowly — show the walls…' : 'Almost there — keep turning until you are back at the start.';
  const askScreen = async () => {
    setErr('');
    if (!canShare()) { setNoScreen(true); return; }
    try {
      const s = await shareScreen();
      if (!isWhole(s)) { s.getTracks().forEach((x) => x.stop()); setPart(true); setErr(t('Please choose “Entire screen” (your whole screen), not one window or tab.')); return; }
      setPart(false); setScr(s);
    } catch { setErr(t('Screen sharing was not allowed. Press the button again and choose “Entire screen”.')); }
  };
  const camOk = !needCam || !!cam; const roomOk = !p.roomScan || resume || !!pano; const scrOk = !p.screen || !!scr || noScreen;
  const step = (ok: boolean, n: number, title: string, body: React.ReactNode) => (
    <li className={cn('rounded-2xl border-2 p-4', ok ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white')}>
      <p className="font-bold text-slate-800">{ok ? '✅' : `${n}.`} {title}</p><div className="mt-2">{body}</div></li>);
  let n = 0;
  return (
    <div className="mt-6 space-y-4 rounded-3xl bg-white p-6 shadow-sm">
      <div className="text-center"><div className="text-5xl">🛡️</div>
        <p className="mt-2 text-xl font-bold text-slate-800">{t('This test is watched')}</p>
        <p className="mt-1 text-slate-600">{t('Your teacher will see:')}</p>
        <ul className="mx-auto mt-1 w-fit list-disc text-left text-slate-600 ps-5">
          {p.roomScan && !resume && <li>{t('a panorama picture and a short video of your room')}</li>}
          {p.camera && <li>{t('photos from your camera at random times')}</li>}
          {p.screen && <li>{t('pictures of your whole screen at random times')}</li>}
          {(p.camera || p.screen) && <li>{t('your camera and screen live, during the test')}</li>}
          <li>{t('when you leave this page or open another app')}</li>
        </ul>
        <p className="mt-2 text-sm text-slate-500">{t('Nothing is recorded before you press Start, and recording stops when you hand in.')}</p></div>
      {/* the live camera picture (like a mirror) — it stays on during the room scan, with what to do next */}
      {(cam || scr) && <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        {cam ? <div className="relative overflow-hidden rounded-2xl bg-black shadow-inner">
          <video ref={attach(cam)} autoPlay muted playsInline className="aspect-video w-full -scale-x-100 object-cover" aria-label={t('Your camera')} />
          <span className="absolute start-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">● {t('Camera')}</span>
          {scanning && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-center">
            <p className={cn('text-lg font-black drop-shadow sm:text-xl', scanInfo.fast ? 'text-amber-300' : 'text-white')}>{scanInfo.fast ? '🐢' : '⟵'} {t(scanTip)}</p>
            <div className="mx-auto mt-2 h-2.5 w-3/4 overflow-hidden rounded-full bg-white/30"><div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${Math.min(100, (scanInfo.covered / TARGET) * 100)}%` }} /></div></div>}
          {scanning && <span className="absolute end-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white">● REC {scanInfo.secs}s</span>}
        </div> : <div />}
        {scr && <div className="relative overflow-hidden rounded-2xl bg-slate-900">
          <video ref={attach(scr)} autoPlay muted playsInline className="aspect-video w-full object-contain" aria-label={t('Your shared screen')} />
          <span className="absolute start-2 top-2 rounded bg-sky-600 px-1.5 py-0.5 text-xs font-bold text-white">🖥️ {t('Your screen')}</span></div>}
      </div>}
      <ol className="space-y-3">
        {needCam && step(!!cam, ++n, t('Allow the camera'), cam ? <p className="text-emerald-800">{t('Your camera is on — you can see yourself above.')}</p>
          : <button type="button" onClick={askCam} className="rounded-xl bg-sky-700 px-4 py-2 font-bold text-white">📷 {t('Turn on the camera')}</button>)}
        {p.roomScan && !resume && step(!!pano, ++n, t('Show your room (panorama)'), scanning
          ? <div className="space-y-2"><canvas ref={strip} width={900} height={150} className="h-24 w-full rounded-lg bg-slate-900" aria-label={t('Your room panorama, growing')} />
              <div className="flex items-center gap-2 text-sm text-slate-600"><span className="flex-1">{t('Turn slowly all the way around. The picture of your room grows here.')}</span>
                <button type="button" disabled={scanInfo.covered < 2} onClick={() => stopScan.current?.()} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white disabled:opacity-40">✓ {t('Done')}</button></div></div>
          : pano ? <div className="space-y-1"><div className="overflow-x-auto rounded-lg bg-slate-900"><img src={pano} alt={t('Your room panorama')} className="h-28 max-w-none" /></div>
              <button type="button" onClick={doScan} className="text-xs text-sky-700 underline">{t('Scan again')}</button></div>
          : <div className="space-y-2"><p className="text-sm text-slate-600">{t('Hold your camera (or turn your laptop) and turn slowly all the way around your room. We make one wide picture of it.')}</p>
              <button type="button" disabled={!cam} onClick={doScan} className="rounded-xl bg-sky-700 px-4 py-2 font-bold text-white disabled:opacity-40">🔄 {t('Start the room panorama')}</button></div>)}
        {p.screen && step(!!scr || noScreen, ++n, t('Share your whole screen'), scr ? <p className="text-emerald-800">{t('Your screen is shared — you can see it above.')}</p>
          : noScreen ? <p className="text-amber-800">{t('This device cannot share its screen. Your teacher will see this. Use a computer next time if you can.')}</p>
          : <button type="button" onClick={askScreen} className="rounded-xl bg-sky-700 px-4 py-2 font-bold text-white">🖥️ {t('Share the screen')}</button>)}
      </ol>
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{err}</p>}
      <div className="text-center"><button type="button" disabled={!(camOk && roomOk && scrOk) || scanning}
        onClick={() => onReady({ cam, scr, room, panorama: pano, roomVideo, screenPart: part, noScreen })}
        className="rounded-2xl bg-emerald-700 px-8 py-3 text-xl font-bold text-white shadow disabled:opacity-40">▶ {t(resume ? 'Go on' : 'Start')}</button></div>
    </div>
  );
}

/** During a watched test: photos and screen pictures at random times, leaving the page, sharing stopped. */
export function useProctor(id: string, p: Proctor | null, s: Streams | null, active: boolean, where?: () => { q: number; answered: number }) {
  const [lost, setLost] = useState<'' | 'screen' | 'camera'>('');
  const scr = useRef<MediaStream | null>(s?.scr ?? null); const cam = useRef<MediaStream | null>(s?.cam ?? null);
  useEffect(() => { if (s) { scr.current = s.scr; cam.current = s.cam; } }, [s]);
  const send = (kind: string, extra: Record<string, unknown> = {}, keepalive = false) =>
    keepalive ? fetch(`/api/student/homework/${id}/watch`, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ...extra }) }).catch(() => undefined)
      : api.post(`/student/homework/${id}/watch`, { kind, ...extra }).catch(() => undefined);
  useEffect(() => {
    if (!active || !p || !s || !watched(p)) return;
    let stop = false; const timers: ReturnType<typeof setTimeout>[] = [];
    // what happened at the start
    s.room.forEach((img) => void send('ROOM', { image: img }));
    if (s.panorama) void send('PANORAMA', { image: s.panorama });
    if (s.roomVideo) void send('ROOM_VIDEO', { video: s.roomVideo });
    if (p.screen && s.noScreen) void send('NO_SCREEN');
    if (p.screen && s.screenPart) void send('SCREEN_PART');
    const rand = (a: number, b: number) => (a + Math.random() * (b - a)) * 1000;
    const loop = (kind: 'CAMERA' | 'SCREEN', ref: React.MutableRefObject<MediaStream | null>, a: number, b: number, w: number, q: number) => {
      const tick = async () => {
        if (stop) return;
        const st = ref.current; if (st && st.getVideoTracks()[0]?.readyState === 'live') { const img = await snap(st, w, q); if (img && !stop) void send(kind, { image: img }); }
        timers.push(setTimeout(tick, rand(a, b)));
      };
      timers.push(setTimeout(tick, rand(5, Math.min(a, 30))));
    };
    // the live view for the teacher: the newest camera and screen picture every few seconds (only the latest is kept)
    const live = async () => {
      if (stop) return;
      const c = p.camera && cam.current?.getVideoTracks()[0]?.readyState === 'live' ? await snap(cam.current, 320, 0.5) : null;
      const sc = p.screen && scr.current?.getVideoTracks()[0]?.readyState === 'live' ? await snap(scr.current, 960, 0.5) : null;
      if (!stop && (c || sc || where)) await api.post(`/student/homework/${id}/live`, { ...(c ? { cam: c } : {}), ...(sc ? { screen: sc } : {}), ...(where ? where() : {}) }).catch(() => undefined);
      timers.push(setTimeout(live, 4000));
    };
    if (p.camera || p.screen) timers.push(setTimeout(live, 1500));
    if (p.camera && cam.current) loop('CAMERA', cam, 35, 100, 480, 0.6);
    if (p.screen && scr.current) loop('SCREEN', scr, 45, 120, 1280, 0.55);
    // sharing stopped by the student
    const onEnd = (what: 'screen' | 'camera') => () => { if (stop) return; void send(what === 'screen' ? 'SCREEN_OFF' : 'CAMERA_OFF'); setLost(what); };
    const st = scr.current?.getVideoTracks()[0]; const ct = cam.current?.getVideoTracks()[0];
    const es = onEnd('screen'), ec = onEnd('camera'); st?.addEventListener('ended', es); ct?.addEventListener('ended', ec);
    // leaving the page or the app
    let away: number | null = null;
    const leave = () => { if (away === null) away = Date.now(); };
    const back = () => { if (away === null || document.hidden) return; const sec = Math.round((Date.now() - away) / 1000); away = null; if (sec >= 1) void send('AWAY', { seconds: Math.min(86400, sec) }); };
    const vis = () => (document.hidden ? leave() : back());
    const gone = () => { if (away !== null) void send('AWAY', { seconds: Math.min(86400, Math.round((Date.now() - away) / 1000)) }, true); };
    document.addEventListener('visibilitychange', vis); window.addEventListener('blur', leave); window.addEventListener('focus', back); window.addEventListener('pagehide', gone);
    return () => {
      stop = true; timers.forEach(clearTimeout); st?.removeEventListener('ended', es); ct?.removeEventListener('ended', ec);
      document.removeEventListener('visibilitychange', vis); window.removeEventListener('blur', leave); window.removeEventListener('focus', back); window.removeEventListener('pagehide', gone);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const stopAll = () => { [scr.current, cam.current].forEach((m) => m?.getTracks().forEach((x) => x.stop())); };
  useEffect(() => () => stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const reshare = async () => {
    try {
      if (lost === 'screen') { const n = await shareScreen(); if (!isWhole(n)) { n.getTracks().forEach((x) => x.stop()); void send('SCREEN_PART'); return; } scr.current = n; n.getVideoTracks()[0].addEventListener('ended', () => { void send('SCREEN_OFF'); setLost('screen'); }); }
      else if (lost === 'camera') { const n = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 } } }); cam.current = n; n.getVideoTracks()[0].addEventListener('ended', () => { void send('CAMERA_OFF'); setLost('camera'); }); }
      setLost('');
    } catch { /* still lost */ }
  };
  return { lost, reshare, stopAll, cam };
}

/** The little camera picture in the corner: the student can see that the camera is on. */
export function CamBadge({ stream }: { stream: MediaStream | null }) {
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (v.current && stream) { v.current.srcObject = stream; v.current.play().catch(() => undefined); } }, [stream]);
  if (!stream) return null;
  return <div className="fixed bottom-3 end-3 z-20 overflow-hidden rounded-xl shadow-lg ring-2 ring-red-500" aria-label="Camera is on">
    <video ref={v} muted playsInline className="h-20 w-28 bg-black object-cover" /><span className="absolute start-1 top-1 rounded bg-red-600 px-1 text-[10px] font-bold text-white">● REC</span></div>;
}
