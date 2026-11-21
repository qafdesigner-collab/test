'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { api, fmtBytes } from '@/lib/api';
import { ErrorBox, Spinner } from '@/components/ui';

function Qr({ url, label }: { url: string; label: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc('')); }, [url]);
  return <figure className="flex flex-col items-center gap-2 rounded-3xl bg-white p-5 shadow-lg ring-4 ring-emerald-200">
    {src ? <img src={src} alt={`QR code: ${label}`} className="size-56" /> : <Spinner className="size-8" />}<figcaption className="text-center font-bold text-slate-800">{label}</figcaption></figure>;
}

/** The book's mobile app: scan the QR code with a phone to install it. */
export function AppPanel({ componentId, title }: { componentId: string; title: string }) {
  const q = useQuery({ queryKey: ['readerApp', componentId], queryFn: () => api.get<any>(`/reader/components/${componentId}/app`), staleTime: 3600_000 });
  if (q.error) return <div className="m-auto"><ErrorBox error={q.error} /></div>;
  if (!q.data) return <Spinner className="m-auto size-8" />;
  const a = q.data; const abs = (u: string) => (u.startsWith('/') ? `${location.origin}${u}` : u);
  const codes = [a.apkUrl && { url: abs(a.apkUrl), label: '📱 Android — install the app' }, a.androidUrl && { url: a.androidUrl, label: '▶ Google Play' }, a.iosUrl && { url: a.iosUrl, label: ' App Store (iPhone)' }].filter(Boolean) as { url: string; label: string }[];
  return (
    <div className="m-auto max-w-3xl space-y-6 p-6 text-center">
      <div><div className="text-6xl">📱</div><h2 className="mt-2 text-3xl font-black text-slate-800">{title}</h2>
        <p className="mt-1 text-lg text-slate-700">Scan the code with your phone’s camera to get the app{a.version ? ` (version ${a.version})` : ''}.</p>
        {a.notes && <p className="mt-2 text-slate-700">{a.notes}</p>}</div>
      {!codes.length ? <p className="text-slate-600">The app is not available yet.</p> : <div className="flex flex-wrap justify-center gap-6">{codes.map((c) => <Qr key={c.label} {...c} />)}</div>}
      {a.apkUrl && <p className="text-sm text-slate-600">On an Android phone you can also tap <a className="font-semibold text-emerald-700 underline" href={a.apkUrl}>download the app</a>{a.apkSize ? ` (${fmtBytes(a.apkSize)})` : ''}. Android may ask you to allow installing apps from this website. The QR code works for 7 days — open this page again for a new one.</p>}
    </div>
  );
}
