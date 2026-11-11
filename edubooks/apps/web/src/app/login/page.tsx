'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { homeFor, Me } from '@/lib/session';
import { BrandMark, useBranding } from '@/lib/branding';
import { Button, ErrorBox, Field, Input } from '@/components/ui';

function LoginForm() {
  const router = useRouter(); const params = useSearchParams(); const qc = useQueryClient();
  const [staff, setStaff] = useState(false);
  // QR login cards open /login?school=CODE&u=username with these filled in
  const [form, setForm] = useState({ schoolCode: params.get('school') ?? '', username: params.get('u') ?? '', password: '' });
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api.post('/auth/login', { ...form, schoolCode: staff ? undefined : form.schoolCode });
      const me = await api.get<Me>('/auth/me'); qc.setQueryData(['me'], me);
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(me));
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium" role="tablist">
        <button type="button" role="tab" aria-selected={!staff} onClick={() => setStaff(false)} className={`rounded-md py-2 ${!staff ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>School</button>
        <button type="button" role="tab" aria-selected={staff} onClick={() => setStaff(true)} className={`rounded-md py-2 ${staff ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>Publisher staff</button>
      </div>
      {!staff && <Field label="School code"><Input required value={form.schoolCode} onChange={set('schoolCode')} placeholder="e.g. SUN01" autoComplete="organization" /></Field>}
      <Field label="Username"><Input required value={form.username} onChange={set('username')} autoComplete="username" /></Field>
      <Field label="Password"><Input required type="password" value={form.password} onChange={set('password')} autoComplete="current-password" /></Field>
      {error ? <ErrorBox error={error} /> : null}
      <Button type="submit" loading={busy} className="w-full">Sign in</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">Use the login your school or publisher gave you.</p>
          <Suspense><LoginForm /></Suspense>
        </div>
      </div>
    </main>
  );
}

function BrandPanel() {
  const b = useBranding();
  return (
    <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-12 text-white">
      <BrandMark className="text-lg font-semibold" iconClass="size-6" logoClass="h-12 w-auto max-w-[14rem] rounded-xl bg-white/95 object-contain p-1.5" />
      <div>
        <h1 className="text-4xl font-bold leading-tight">{b.tagline}</h1>
        <p className="mt-4 max-w-md text-white/85">Complete book packages, school licences, and a joyful digital classroom for teachers, children and parents.</p>
      </div>
      <p className="flex items-center gap-2 text-sm text-white/85"><Building2 className="size-4" /> Multi-school · secure · AI-assisted</p>
    </div>
  );
}

