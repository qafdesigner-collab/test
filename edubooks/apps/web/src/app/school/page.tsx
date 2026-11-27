'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { api, daysLeft, fmtDay } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSchoolBrand } from '@/lib/branding';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/lib/session';
import { Badge, Button, Dialog, ErrorBox, Field, Input, PageLoader } from '@/components/ui';
import { SeatBar } from '@/components/common';
import { UpcomingEvents } from '@/components/calendar';
import { ActionTile, Bar, Doodles, Faces, GRADIENTS, GradientCard, greeting, Hero, Panel, Pill, Ring, StatTile } from '@/components/vivid';

const HEX = ['#6366f1', '#ec4899', '#0ea5e9', '#f43f5e', '#10b981', '#a855f7', '#2563eb', '#ef4444'];
const cname = (c: { name: string; section?: string }) => `${c.name}${c.section ? ` ${c.section}` : ''}`;

export default function SchoolOverview() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['schoolOverview'], queryFn: () => api.get('/school/overview') });
  const pools = useQuery({ queryKey: ['schoolPools'], queryFn: () => api.get('/school/pools') });
  const an = useQuery({ queryKey: ['insights', 'school'], queryFn: () => api.get<any>('/analytics/school') });
  const att = useQuery({ queryKey: ['attendance', 'school', 'today'], queryFn: () => api.get<any>('/attendance/school') });
  const [edit, setEdit] = useState<any>(null);
  const save = useAction(() => api.patch('/school/profile', { name: edit.name, email: edit.email, city: edit.city, phone: edit.phone, address: edit.address }), { ok: 'School details saved', keys: ['schoolOverview', 'schoolBrand', 'me'], after: () => setEdit(null) });
  const brandQ = useSchoolBrand(); const qc = useQueryClient(); const toast = useToast(); const [logoBusy, setLogoBusy] = useState(false);
  const uploadLogo = async (file?: File) => {
    if (!file) return; setLogoBusy(true);
    try { const f = new FormData(); f.append('file', file); await api.upload('/school/logo', f); qc.invalidateQueries({ queryKey: ['schoolBrand'] }); toast('Logo saved — it now appears on everything you print'); }
    catch (e: any) { toast(e.message, 'err'); } finally { setLogoBusy(false); }
  };
  const removeLogo = async () => { try { await api.del('/school/logo'); qc.invalidateQueries({ queryKey: ['schoolBrand'] }); toast('Logo removed'); } catch (e: any) { toast(e.message, 'err'); } };
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { school: s, licences: L } = q.data;
  const g = greeting();
  const live = (pools.data ?? []).filter((p: any) => p.status === 'ACTIVE' && new Date(p.validUntil) > new Date());
  const classes: any[] = an.data?.classes ?? [];
  const T = att.data?.totals;
  const attendance = T?.marked ? `${Math.round(((T.present + T.late) / T.marked) * 100)}%` : '—';
  const unmarked = (att.data?.classes ?? []).filter((c: any) => c.students && !c.marked);
  const quiet = classes.filter((c) => c.students && c.active7 / c.students < 0.5);
  const expiring = live.filter((p: any) => daysLeft(p.validUntil) <= 45);

  return (
    <div className="space-y-6">
      <Hero>
        <Doodles items={['🏫', '📚', '🎒', '⭐', '🗓️', '✏️']} />
        <p className="font-medium opacity-95">{g.icon} {g.text}, {(me?.displayName ?? '').split(' ')[0]}</p>
        <h1 className="mb-1.5 mt-1 flex items-center gap-3 text-3xl font-extrabold sm:text-[32px]">{brandQ.data?.logoUrl && <img src={brandQ.data.logoUrl} alt="" className="size-12 rounded-xl bg-white object-contain p-1 shadow" />}{s.name}{!brandQ.data?.logoUrl && ' 🏫'}</h1>
        <p className="font-medium opacity-95">{[s.city, s.phone, s.email, s.address].filter(Boolean).join(' · ') || 'Add your contact details'}
          <button onClick={() => setEdit({ name: s.name ?? '', email: s.email ?? '', city: s.city ?? '', phone: s.phone ?? '', address: s.address ?? '' })} className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold hover:bg-white/30"><Pencil className="size-3" />Edit</button></p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link href="/school/attendance" className={unmarked.length ? 'min-w-[150px] rounded-2xl bg-white px-3.5 py-2.5 text-violet-700 shadow' : 'min-w-[150px] rounded-2xl bg-white/20 px-3.5 py-2.5 backdrop-blur-sm hover:bg-white/30'}>
            <small className={unmarked.length ? 'font-semibold text-slate-500' : 'opacity-85'}>TODAY · register</small>
            <b className="block text-[15px]">{att.isLoading ? '…' : unmarked.length ? `${unmarked.length} class${unmarked.length === 1 ? '' : 'es'} not marked yet` : 'All registers taken ✓'}</b></Link>
          <Link href="/school/classes" className="min-w-[150px] rounded-2xl bg-white/20 px-3.5 py-2.5 backdrop-blur-sm hover:bg-white/30">
            <small className="opacity-85">this year</small><b className="block text-[15px]">{classes.length} class{classes.length === 1 ? "" : "es"} · {q.data.teachers} teacher{q.data.teachers === 1 ? "" : "s"}</b></Link>
          {L.pendingTransfers > 0 && <Link href="/school/transfers" className="min-w-[150px] rounded-2xl bg-white/20 px-3.5 py-2.5 backdrop-blur-sm hover:bg-white/30">
            <small className="opacity-85">waiting for the publisher</small><b className="block text-[15px]">{L.pendingTransfers} transfer request{L.pendingTransfers === 1 ? '' : 's'}</b></Link>}
          {expiring.length > 0 && <Link href="/school/licences" className="min-w-[150px] rounded-2xl bg-white/20 px-3.5 py-2.5 backdrop-blur-sm hover:bg-white/30">
            <small className="opacity-85">⏳ renew soon</small><b className="block text-[15px]">{expiring.length} licence{expiring.length === 1 ? '' : 's'} ending</b></Link>}
        </div>
      </Hero>

      {s.isDemo && <div className="rounded-3xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">This is a <b>demo school</b>. It stops working on {fmtDay(s.demoExpiresAt)} ({daysLeft(s.demoExpiresAt)} days left).</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon="🎒" bg="#ede9fe" value={q.data.students} label={`students · ${L.students.assigned} with a book`} href="/school/students" />
        <StatTile icon="🧑‍🏫" bg="#fce7f3" value={q.data.teachers} label={`teachers · ${L.teachers.assigned} with a seat`} href="/school/teachers" />
        <StatTile icon="✅" bg="#dcfce7" value={attendance} label={T?.marked ? 'attendance today' : 'no register taken yet'} href="/school/attendance" />
        <StatTile icon="🎟️" bg="#fef3c7" value={L.students.available} label="free student seats" href="/school/licences" />
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <ActionTile href="/school/students" icon="🎒" label="Add students" gradient="from-[#45b483] to-[#2f9468]" />
        <ActionTile href="/school/teachers" icon="🧑‍🏫" label="Add teachers" gradient="from-[#ec9a5c] to-[#cf7840]" />
        <ActionTile href="/school/licences" icon="📚" label="Give books" gradient="from-[#8b7be0] to-[#6a5acb]" />
        <ActionTile href="/school/messages" icon="💬" label="Send a message" gradient="from-[#e07aa3] to-[#c45886]" />
        <ActionTile href="/school/timetable" icon="🗓️" label="Timetable" gradient="from-[#4fa9dc] to-[#3486bf]" />
        <ActionTile href="/school/exams" icon="🧾" label="Exams" gradient="from-[#e27c7c] to-[#c55c5c]" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-5">
          <Panel title="Classes" link={{ href: '/school/classes', label: 'All classes' }}>
            <div className="grid gap-3.5 sm:grid-cols-2">
              {classes.map((c, i) => (
                <GradientCard key={c.id} href={`/school/classes/${c.id}`} gradient={GRADIENTS[i % GRADIENTS.length]}>
                  <b className="text-xl">{cname(c)}</b>
                  <small className="block opacity-90">{c.students} student{c.students === 1 ? '' : 's'} · {c.active7} active this week</small>
                  <Faces n={c.students} color={HEX[i % HEX.length]} />
                  <Bar pct={c.average} />
                  <small className="mt-1 block opacity-90">{c.average === null ? 'No marked work yet' : `Average ${c.average}%`}{c.homeworkRate !== null ? ` · homework ${c.homeworkRate}%` : ''}</small>
                </GradientCard>
              ))}
              <Link href="/school/classes" className="focus-ring grid min-h-[140px] place-items-center rounded-[20px] border-2 border-dashed border-violet-300 bg-slate-50 p-4 text-center text-violet-700 hover:bg-violet-50">
                <div><b className="text-2xl">＋</b><small className="block text-slate-500">Add a class</small></div></Link>
            </div>
            {an.isLoading && <p className="py-3 text-center text-sm text-slate-500">Loading classes…</p>}
          </Panel>

          <Panel title="Your books this year" link={{ href: '/school/licences', label: 'Manage licences' }}>
            {live.map((p: any) => (
              <div key={p.id} className="grid gap-2 border-b border-slate-100 py-2.5 last:border-0 sm:grid-cols-[1fr_180px_120px] sm:items-center">
                <div className="min-w-0"><Link href={`/school/licences/${p.id}`} className="font-bold text-slate-900 hover:text-violet-700">{p.productName}</Link> <Badge tone={p.seatType === 'TEACHER' ? 'info' : 'neutral'}>{p.seatType.toLowerCase()} seats</Badge>
                  <div className="truncate text-xs text-slate-500">{p.books?.join(' · ')}</div></div>
                <SeatBar assigned={p.assigned} total={p.quantity - p.revoked} />
                <div className={`text-xs ${daysLeft(p.validUntil) <= 45 ? 'font-semibold text-amber-600' : 'text-slate-500'}`}>until {fmtDay(p.validUntil)}</div>
              </div>
            ))}
            {!live.length && <p className="py-4 text-center text-sm text-slate-500">No active book licences. Please contact your publisher.</p>}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Needs your attention">
            {unmarked.map((c: any) => (
              <Link key={c.id} href="/school/attendance" className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0 hover:bg-slate-50/60">
                <Ring tone="amber">📋</Ring><span className="min-w-0 flex-1"><b className="block truncate text-slate-900">{cname(c)}</b><small className="text-slate-500">register not taken today · {c.students} students</small></span><Pill tone="amber">today</Pill></Link>
            ))}
            {quiet.slice(0, 4).map((c) => (
              <Link key={c.id} href={`/school/classes/${c.id}`} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0 hover:bg-slate-50/60">
                <Ring tone="red">{c.students ? Math.round((c.active7 / c.students) * 100) : 0}%</Ring><span className="min-w-0 flex-1"><b className="block truncate text-slate-900">{cname(c)}</b><small className="text-slate-500">only {c.active7} of {c.students} students active this week</small></span><Pill>View</Pill></Link>
            ))}
            {expiring.map((p: any) => (
              <Link key={p.id} href={`/school/licences/${p.id}`} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0 hover:bg-slate-50/60">
                <Ring tone="pink">{daysLeft(p.validUntil)}d</Ring><span className="min-w-0 flex-1"><b className="block truncate text-slate-900">{p.productName}</b><small className="text-slate-500">licence ends {fmtDay(p.validUntil)}</small></span><Pill tone="red">renew</Pill></Link>
            ))}
            {L.students.available === 0 && L.students.assigned > 0 && (
              <Link href="/school/licences" className="flex items-center gap-3 py-2.5 hover:bg-slate-50/60"><Ring tone="violet">0</Ring><span className="flex-1"><b className="block text-slate-900">No free student seats</b><small className="text-slate-500">ask your publisher for more seats before new students join</small></span></Link>
            )}
            {!unmarked.length && !quiet.length && !expiring.length && !(L.students.available === 0 && L.students.assigned > 0) &&
              <p className="py-4 text-center text-sm text-slate-500">{att.isLoading || an.isLoading ? 'Checking…' : '🌟 All good — nothing needs you right now.'}</p>}
          </Panel>

          <Panel title="Academic years" link={{ href: '/school/calendar', label: 'Calendar' }}>
            <div className="flex flex-wrap gap-2">{q.data.academicYears.map((y: any) => <span key={y.id} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">{y.name}: {fmtDay(y.startsOn)} – {fmtDay(y.endsOn)}</span>)}</div>
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-100 to-pink-100 p-3.5 text-sm">
              <span className="text-3xl" aria-hidden>🦉</span>
              <div><b className="text-slate-900">See how students are learning</b><small className="block text-slate-600"><Link className="font-semibold text-violet-700 hover:underline" href="/school/insights">Open insights</Link> for reading, homework and games by class.</small></div>
            </div>
          </Panel>
        </div>
      </div>

      <UpcomingEvents />

      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)} title="School details" description="Your school's name, contacts and logo appear on everything printed from your school: report cards, certificates, exam papers, result sheets and login cards. The school code is set by your publisher.">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-3">
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-50">{brandQ.data?.logoUrl ? <img src={brandQ.data.logoUrl} alt="School logo" className="size-full object-contain" /> : <span className="text-3xl">🏫</span>}</span>
              <div className="flex-1 text-sm"><b className="block">School logo</b><span className="text-slate-500">PNG, JPG or WebP, up to 2 MB. A square logo looks best.</span></div>
              <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">{logoBusy ? 'Uploading…' : brandQ.data?.logoUrl ? 'Change' : 'Upload'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { uploadLogo(e.target.files?.[0]); e.target.value = ''; }} /></label>
              {brandQ.data?.logoUrl && <Button type="button" variant="ghost" size="sm" onClick={removeLogo}>Remove</Button>}
            </div>
            <Field label="School name"><Input required minLength={2} maxLength={160} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email"><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} placeholder="info@yourschool.ae" /></Field>
              <Field label="Phone"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="04 123 4567" /></Field>
            </div>
            <Field label="City"><Input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
            <Field label="Address"><Input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.isPending}>Save</Button></div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
