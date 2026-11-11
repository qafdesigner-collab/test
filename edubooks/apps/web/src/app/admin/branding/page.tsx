'use client';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { palette, useBranding } from '@/lib/branding';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { useToast } from '@/components/ui/toast';

const PRESETS = ['#4f46e5', '#2563eb', '#0f766e', '#15803d', '#b91c1c', '#c2410c', '#7c3aed', '#be185d', '#0e7490', '#334155'];

export default function BrandingPage() {
  const b = useBranding(); const qc = useQueryClient(); const toast = useToast(); const file = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ name: b.name, tagline: b.tagline, primaryColor: b.primaryColor });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  useEffect(() => setF({ name: b.name, tagline: b.tagline, primaryColor: b.primaryColor }), [b.name, b.tagline, b.primaryColor]);
  const refresh = (data: any) => qc.setQueryData(['branding'], data);
  const save = async () => { setBusy(true); setErr(null); try { refresh(await api.patch('/branding', f)); toast('Branding saved'); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const upload = async (fl?: File) => {
    if (!fl) return; setErr(null);
    const fd = new FormData(); fd.append('file', fl);
    try { refresh(await api.upload('/branding/logo', fd)); toast('Logo updated'); } catch (e) { setErr(e); }
  };
  const p = palette(f.primaryColor);
  return (
    <div className="space-y-6">
      <PageHeader title="Branding" sub="Your logo, name and colour appear on the sign-in page, in every portal, on login cards and on report cards." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-5 p-5">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Logo <span className="font-normal text-slate-600">(PNG, JPG or WebP, up to 2 MB; a wide logo on a transparent background works best)</span></p>
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-48 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50">{b.logoUrl ? <img src={b.logoUrl} alt="Current logo" className="max-h-16 max-w-44 object-contain" /> : <span className="text-xs text-slate-600">No logo</span>}</div>
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
              <div className="flex flex-col gap-2"><Button size="sm" variant="secondary" onClick={() => file.current?.click()}><ImagePlus className="size-4" />{b.logoUrl ? 'Replace' : 'Upload'}</Button>
                {b.logoUrl && <Button size="sm" variant="ghost" onClick={async () => refresh(await api.del('/branding/logo'))}><Trash2 className="size-4" />Remove</Button>}</div>
            </div>
          </div>
          <Field label="Name"><Input maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Tagline (sign-in page)"><Input maxLength={140} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></Field>
          <Field label="Main colour">
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={f.primaryColor === c} onClick={() => setF({ ...f, primaryColor: c })}
                className={`size-8 rounded-full ring-offset-2 ${f.primaryColor === c ? 'ring-2 ring-slate-900' : ''}`} style={{ background: c }} />)}
              <Input type="color" aria-label="Custom colour" className="h-9 w-14 p-1" value={f.primaryColor} onChange={(e) => setF({ ...f, primaryColor: e.target.value })} />
            </div>
          </Field>
          {p[600].toLowerCase() !== f.primaryColor.toLowerCase() && <p className="text-xs text-slate-700">This colour is made a little darker (<span className="font-mono">{p[600]}</span>) where white text sits on it, so everything stays easy to read.</p>}
          {err ? <ErrorBox error={err} /> : null}
          <div className="flex justify-end"><Button onClick={save} loading={busy}>Save</Button></div>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">Preview</div>
          <div className="space-y-4 p-5">
            <div className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(135deg, ${p[800]}, ${p[600]})` }}>
              <div className="flex items-center gap-2 font-semibold">{b.logoUrl ? <img src={b.logoUrl} alt="" className="h-9 rounded-lg bg-white/95 p-1" /> : '📚'} {f.name}</div>
              <div className="mt-6 text-2xl font-bold">{f.tagline}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: p[600] }}>Button</span>
              <span className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: p[50], color: p[700] }}>Selected menu item</span>
              <span className="rounded-lg border px-4 py-2 text-sm font-medium" style={{ borderColor: p[500], color: p[700] }}>Link</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
