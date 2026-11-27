'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, School } from 'lucide-react';
import { api } from '@/lib/api';
import { BrandMark } from '@/lib/branding';
import { Button, ErrorBox, Field, Input, PageLoader, Select, Textarea } from '@/components/ui';

/** "Register your school": the school's details and its first admin. The publisher approves before anyone can sign in. */
export default function RegisterSchool() {
  const [info, setInfo] = useState<{ enabled: boolean; curricula: { id: string; name: string }[] } | null>(null);
  const [f, setF] = useState({ name: '', city: '', address: '', phone: '', email: '', curriculumId: '', students: '', adminName: '', adminEmail: '', adminPhone: '', username: '', password: '', password2: '', message: '', website: '' });
  const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ code: string; username: string } | null>(null);
  useEffect(() => { api.get<any>('/public/school-registration').then(setInfo).catch(() => setInfo({ enabled: false, curricula: [] })); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (f.password !== f.password2) { setErr(new Error('The two passwords are not the same')); return; }
    setBusy(true);
    try {
      const r = await api.post<any>('/public/school-registration', {
        school: { name: f.name.trim(), city: f.city || undefined, address: f.address || undefined, phone: f.phone || undefined, email: f.email || undefined, curriculumId: f.curriculumId || undefined, students: f.students ? Number(f.students) : undefined },
        admin: { name: f.adminName.trim(), email: f.adminEmail.trim(), phone: f.adminPhone || undefined, username: f.username.trim().toLowerCase(), password: f.password },
        message: f.message || undefined, website: f.website || undefined,
      });
      setDone({ code: r.code, username: r.username }); window.scrollTo({ top: 0 });
    } catch (e2) { setErr(e2); } finally { setBusy(false); }
  };
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between"><BrandMark className="text-lg font-semibold text-slate-900" iconClass="size-6" logoClass="h-10 w-auto max-w-[12rem] object-contain" />
          <Link href="/login" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" />Back to sign in</Link></div>
        {!info ? <PageLoader /> : !info.enabled ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm"><School className="mx-auto size-10 text-slate-400" /><h1 className="mt-3 text-xl font-semibold">School registration is closed</h1><p className="mt-1 text-slate-600">Please contact the publisher to open an account for your school.</p></div>
        ) : done ? (
          <div className="space-y-4 rounded-2xl bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
            <h1 className="text-2xl font-semibold text-slate-900">Thank you — your registration was sent</h1>
            <p className="text-slate-600">The publisher will check it and approve your school. You can sign in once it is approved.</p>
            <div className="mx-auto max-w-sm rounded-xl bg-slate-50 p-4 text-left text-sm">
              <p>School code: <b className="font-mono text-lg">{done.code}</b></p><p>Login ID: <b className="font-mono">{done.username}</b></p><p>Password: the one you chose</p>
            </div>
            <p className="text-sm text-amber-700">Please write down your school code — you need it to sign in.</p>
            <Link href={`/login?school=${encodeURIComponent(done.code)}&u=${encodeURIComponent(done.username)}`} className="inline-block rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700">Go to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            <div><h1 className="text-2xl font-semibold text-slate-900">Register your school</h1>
              <p className="mt-1 text-sm text-slate-600">Fill in your school's details and the school admin's account. The publisher approves new schools before they can sign in.</p></div>
            <fieldset className="space-y-3"><legend className="mb-2 font-semibold text-slate-800">🏫 School</legend>
              <Field label="School name"><Input required minLength={2} value={f.name} onChange={set('name')} placeholder="e.g. Little Stars Academy" /></Field>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="City"><Input value={f.city} onChange={set('city')} /></Field><Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field></div>
              <Field label="Address"><Input value={f.address} onChange={set('address')} /></Field>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="School email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
                <Field label="Number of students (about)"><Input type="number" min={1} value={f.students} onChange={set('students')} /></Field></div>
              {info.curricula.length > 0 && <Field label="Curriculum"><Select value={f.curriculumId} onChange={set('curriculumId')}><option value="">Not sure</option>{info.curricula.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
            </fieldset>
            <fieldset className="space-y-3"><legend className="mb-2 font-semibold text-slate-800">👤 School admin (who will manage the school's account)</legend>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Full name"><Input required minLength={2} value={f.adminName} onChange={set('adminName')} /></Field>
                <Field label="Email"><Input required type="email" value={f.adminEmail} onChange={set('adminEmail')} /></Field></div>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Mobile"><Input value={f.adminPhone} onChange={set('adminPhone')} /></Field>
                <Field label="Login ID" hint="lowercase letters / numbers, e.g. principal"><Input required pattern="[a-z0-9._\-]{3,40}" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} /></Field></div>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Password" hint="At least 8 characters"><Input required type="password" minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
                <Field label="Password again"><Input required type="password" minLength={8} autoComplete="new-password" value={f.password2} onChange={set('password2')} /></Field></div>
            </fieldset>
            <Field label="Message to the publisher (optional)" hint="e.g. which books you use or want"><Textarea rows={3} value={f.message} onChange={set('message')} /></Field>
            {/* spam trap: hidden from people */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label></div>
            {err ? <ErrorBox error={err} /> : null}
            <Button type="submit" loading={busy} className="w-full">Send registration</Button>
          </form>
        )}
      </div>
    </main>
  );
}
