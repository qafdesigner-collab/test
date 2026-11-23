'use client';
import { use, useEffect, useState } from 'react';
import { RoomScan, RoomScanResult } from '@/components/room-scan';
import { LangScope, useT } from '@/lib/i18n';

/** Room scan on a phone, opened from the QR code of a watched test (no login: the link itself is the key, once, for 20 minutes). */
export default function Page({ params }: { params: Promise<{ token: string }> }) { return <LangScope><PhoneScan token={use(params).token} /></LangScope>; }

function PhoneScan({ token }: { token: string }) {
  const { t } = useT();
  const [info, setInfo] = useState<{ title: string } | null>(null); const [err, setErr] = useState('');
  const [cam, setCam] = useState<MediaStream | null>(null); const [state, setState] = useState<'ready' | 'scan' | 'sending' | 'done'>('ready');
  useEffect(() => {
    fetch(`/api/room-scan/${encodeURIComponent(token)}`).then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.message || 'This link is not valid.'); setInfo(b); })
      .catch((e) => setErr(e.message));
  }, [token]);
  useEffect(() => () => cam?.getTracks().forEach((x) => x.stop()), [cam]);
  const start = async () => {
    setErr('');
    try { setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 } }, audio: false })); setState('scan'); }
    catch { setErr(t('The camera is blocked. Allow the camera for this website, then try again.')); }
  };
  const send = async (r: RoomScanResult) => {
    setState('sending'); cam?.getTracks().forEach((x) => x.stop());
    try {
      const res = await fetch(`/api/room-scan/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ panorama: r.panorama, video: r.video ?? undefined, coverage: r.coverage, complete: r.complete }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Could not send');
      setState('done');
    } catch (e: any) { setErr(e.message); setState('ready'); }
  };
  return (
    <main className="min-h-dvh bg-gradient-to-b from-sky-50 to-amber-50 p-4">
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-center text-2xl font-extrabold text-slate-800">🌄 {t('Room scan')}</h1>
        {info && <p className="text-center text-slate-600">{info.title}</p>}
        {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-center text-red-800">{err}</p>}
        <div className="space-y-2 rounded-2xl border-2 border-sky-200 bg-sky-50 p-3 text-sm text-slate-800">
          <p lang="en" dir="ltr">🛡️ <b>This is not hacking.</b> The camera is used only for the security of the test, so every student works on their own. Only the teacher and the school see the scan; it is deleted after 30 days.</p>
          <p lang="ar" dir="rtl">🛡️ <b>هذا ليس اختراقًا.</b> تُستخدم الكاميرا فقط لأمان الاختبار، حتى يعمل كل طالب بنفسه. لا يرى المسح إلا المعلم والمدرسة، ويُحذف بعد 30 يومًا.</p>
        </div>
        {state === 'done' ? <div className="rounded-3xl bg-white p-6 text-center shadow-sm"><div className="text-6xl">✅</div>
            <p className="mt-2 text-xl font-bold text-slate-800">{t('Done! Your room scan was sent.')}</p><p className="mt-1 text-slate-600">{t('Go back to your computer — the test continues there.')}</p></div>
          : state === 'sending' ? <p className="rounded-3xl bg-white p-6 text-center text-lg font-bold shadow-sm">⏳ {t('Sending…')}</p>
          : state === 'scan' && cam ? <div className="rounded-3xl bg-white p-3 shadow-sm"><RoomScan stream={cam} mirror={false} onDone={send} onCancel={() => { cam.getTracks().forEach((x) => x.stop()); setCam(null); setState('ready'); }} /></div>
          : info && <div className="space-y-3 rounded-3xl bg-white p-6 text-center shadow-sm">
              <div className="text-5xl">📱⟲</div>
              <p className="text-slate-700">{t('Stand in the middle of your room. Hold the phone up and turn slowly all the way around until you are back where you started.')}</p>
              <p className="text-xs text-slate-500">🔒 {t('Only the room picture and a short video go to your teacher, for this test.')}</p>
              <button type="button" onClick={start} className="rounded-2xl bg-emerald-600 px-8 py-3 text-xl font-bold text-white shadow">▶ {t('Start the scan')}</button></div>}
      </div>
    </main>
  );
}
