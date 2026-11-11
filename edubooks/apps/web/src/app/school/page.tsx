'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { api, daysLeft, fmtDay } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader } from '@/components/ui';
import { PageHeader, SeatBar, Stat } from '@/components/common';
import { UpcomingEvents } from '@/components/calendar';

export default function SchoolOverview() {
  const q = useQuery({ queryKey: ['schoolOverview'], queryFn: () => api.get('/school/overview') });
  const pools = useQuery({ queryKey: ['schoolPools'], queryFn: () => api.get('/school/pools') });
  const [edit, setEdit] = useState<any>(null);
  const save = useAction(() => api.patch('/school/profile', { city: edit.city, phone: edit.phone, address: edit.address }), { ok: 'Profile saved', keys: ['schoolOverview'], after: () => setEdit(null) });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { school: s, licences: L } = q.data;
  const live = (pools.data ?? []).filter((p: any) => p.status === 'ACTIVE' && new Date(p.validUntil) > new Date());
  return (
    <div className="space-y-6">
      <PageHeader title={s.name} sub={[s.city, s.phone, s.address].filter(Boolean).join(' · ') || 'Add your contact details'}>
        <Button variant="secondary" onClick={() => setEdit({ city: s.city ?? '', phone: s.phone ?? '', address: s.address ?? '' })}><Pencil className="size-4" />Edit contact details</Button>
      </PageHeader>
      <UpcomingEvents />
      {s.isDemo && <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">This is a <b>demo school</b>. It stops working on {fmtDay(s.demoExpiresAt)} ({daysLeft(s.demoExpiresAt)} days left).</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={q.data.students} sub={`${L.students.assigned} with a book licence`} />
        <Stat label="Teachers" value={q.data.teachers} sub={`${L.teachers.assigned} with a teacher seat`} />
        <Stat label="Free student seats" value={L.students.available} tone={L.students.available ? 'green' : 'amber'} />
        <Stat label="Pending transfers" value={L.pendingTransfers} tone={L.pendingTransfers ? 'amber' : 'slate'} sub="waiting for the publisher" />
      </div>
      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="font-semibold">Your books this year</h2><Link href="/school/licences" className="text-sm text-emerald-700 hover:underline">Manage licences</Link></div>
        <ul className="divide-y divide-slate-100">
          {live.map((p: any) => (
            <li key={p.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[1fr_200px_140px] sm:items-center">
              <div><Link href={`/school/licences/${p.id}`} className="font-medium hover:text-emerald-700">{p.productName}</Link> <Badge tone={p.seatType === 'TEACHER' ? 'info' : 'neutral'}>{p.seatType.toLowerCase()} seats</Badge>
                <div className="text-xs text-slate-500">{p.books?.join(' · ')}</div></div>
              <SeatBar assigned={p.assigned} total={p.quantity - p.revoked} />
              <div className={`text-xs ${daysLeft(p.validUntil) <= 45 ? 'text-amber-600' : 'text-slate-500'}`}>until {fmtDay(p.validUntil)}</div>
            </li>
          ))}
          {!live.length && <li className="px-5 py-8 text-center text-sm text-slate-500">No active book licences. Please contact your publisher.</li>}
        </ul>
      </Card>
      <Card className="p-5"><h2 className="mb-2 font-semibold">Academic years</h2>
        <div className="flex flex-wrap gap-2">{q.data.academicYears.map((y: any) => <Badge key={y.id}>{y.name}: {fmtDay(y.startsOn)} – {fmtDay(y.endsOn)}</Badge>)}</div></Card>
      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)} title="Contact details" description="The school name and code are managed by your publisher.">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <Field label="City"><Input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
            <Field label="Phone"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Address"><Input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.isPending}>Save</Button></div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
