'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Building2, KeyRound, School } from 'lucide-react';
import { api } from '@/lib/api';
import { homeFor, Me } from '@/lib/session';
import { BrandMark, useBranding } from '@/lib/branding';
import { InstallAppButton } from '@/components/install-app';
import { Button, ErrorBox, Field, Input } from '@/components/ui';
import { LangScope, LangSwitch, useT } from '@/lib/i18n';
import { LoginContact } from '@/components/company-card';

function LoginForm() {
  const { t } = useT();
  const router = useRouter(); const params = useSearchParams(); const qc = useQueryClient();
  // Publisher staff sign in through a small, quiet button (or /login?staff=1); schools see only the school login.
  const [staff, setStaff] = useState(params.get('staff') === '1');
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
      {!staff ? (
        <div className="mb-2 flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white shadow"><School className="size-7" /></span>
          <div><h2 className="text-3xl font-bold text-slate-900">{t('School login')}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{t('Students, parents, teachers and school admins')}</p></div>
        </div>
      ) : (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-800"><KeyRound className="size-5" />{t('Publisher staff')}</h2>
          <button type="button" onClick={() => setStaff(false)} className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="size-3.5 rtl:rotate-180" />{t('School login')}</button>
        </div>)}
      {!staff && <Field label={t('School code')}><Input required dir="ltr" value={form.schoolCode} onChange={set('schoolCode')} placeholder={t('e.g. SUN01')} autoComplete="organization" /></Field>}
      <Field label={t('Login ID or email')}><Input required dir="ltr" value={form.username} onChange={set('username')} autoComplete="username" /></Field>
      <Field label={t('Password')}><Input required dir="ltr" type="password" value={form.password} onChange={set('password')} autoComplete="current-password" /></Field>
      {error ? <ErrorBox error={error} /> : null}
      <Button type="submit" loading={busy} className="w-full">{t('Sign in')}</Button>
      {!staff && <div className="flex justify-end"><button type="button" onClick={() => setStaff(true)} title={t('Publisher staff')} aria-label={t('Publisher staff')}
        className="rounded-full p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500"><KeyRound className="size-3.5" /></button></div>}
    </form>
  );
}

export default function LoginPage() { return <LangScope><LoginScreen /></LangScope>; }

function LoginScreen() {
  const { t } = useT();
  return (
    <main className="relative grid min-h-screen lg:grid-cols-2">
      <LangSwitch className="absolute end-4 top-4 z-10 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" />
      <BrandPanel />
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Suspense><LoginForm /></Suspense>
          <RegisterLink />
          <div className="mt-5 flex justify-center"><InstallAppButton className="ring-1 ring-slate-200" /></div>
          <div className="mt-8 lg:hidden"><LoginContact /></div>
        </div>
      </div>
    </main>
  );
}

function BrandPanel() {
  const b = useBranding(); const { t } = useT();
  return (
    <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-12 text-white">
      <BrandMark className="text-lg font-semibold" iconClass="size-6" logoClass="h-12 w-auto max-w-[14rem] rounded-xl bg-white/95 object-contain p-1.5" />
      <div>
        <h1 className="text-4xl font-bold leading-tight">{b.tagline}</h1>
        <p className="mt-4 max-w-md text-white/85">{t('Complete book packages, school licences, and a joyful digital classroom for teachers, children and parents.')}</p>
      </div>
      <div className="space-y-3"><LoginContact dark /><p className="flex items-center gap-2 text-sm text-white/85"><Building2 className="size-4" /> {t('Multi-school · secure · AI-assisted')}</p></div>
    </div>
  );
}


/** “Register your school” — shown when the publisher has school registration open. */
function RegisterLink() {
  const { t } = useT(); const [on, setOn] = useState(false);
  useEffect(() => { api.get<any>('/public/school-registration').then((r) => setOn(!!r.enabled)).catch(() => undefined); }, []);
  if (!on) return null;
  return (
    <div className="mt-5 rounded-xl border border-slate-200 p-4 text-center">
      <p className="text-sm text-slate-600">{t('New school?')}</p>
      <Link href="/register" className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-600 px-4 py-2 font-medium text-brand-700 hover:bg-brand-50"><Building2 className="size-4" />{t('Register your school')}</Link>
    </div>
  );
}
