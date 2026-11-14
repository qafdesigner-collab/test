'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { api, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Badge, Button, Card, Confirm, Dialog, ErrorBox, Field, Input, Select, Textarea, cn } from '@/components/ui';
import { CurriculumSelect } from '@/components/curriculum';

export const KINDS: Record<string, { label: string; emoji: string; cls: string; dot: string }> = {
  TERM: { label: 'Term', emoji: '📘', cls: 'bg-blue-100 text-blue-900 border-blue-200', dot: 'bg-blue-600' },
  HOLIDAY: { label: 'Holiday', emoji: '🌴', cls: 'bg-emerald-100 text-emerald-900 border-emerald-200', dot: 'bg-emerald-600' },
  EXAM: { label: 'Exams', emoji: '📝', cls: 'bg-rose-100 text-rose-900 border-rose-200', dot: 'bg-rose-600' },
  EVENT: { label: 'Event', emoji: '🎉', cls: 'bg-violet-100 text-violet-900 border-violet-200', dot: 'bg-violet-600' },
  MEETING: { label: 'Meeting', emoji: '👥', cls: 'bg-amber-100 text-amber-900 border-amber-200', dot: 'bg-amber-600' },
  SPORTS: { label: 'Sports', emoji: '⚽', cls: 'bg-teal-100 text-teal-900 border-teal-200', dot: 'bg-teal-600' },
  OTHER: { label: 'Other', emoji: '📌', cls: 'bg-slate-100 text-slate-900 border-slate-200', dot: 'bg-slate-600' },
};
export interface CalEvent { id: string; title: string; kind: string; startsOn: string; endsOn: string; description: string; schoolId: string | null; curriculumId: string | null; curriculumName: string | null; isTemplate: boolean; editable: boolean }

// Dates are plain 'YYYY-MM-DD' strings; all arithmetic in UTC so no time-zone shifts.
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const today = () => iso(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
export const fmtRange = (a: string, b: string) => {
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  const y: Intl.DateTimeFormatOptions = { ...o, year: 'numeric' };
  return a === b ? utc(a).toLocaleDateString(undefined, { ...y, weekday: 'short' }) : `${utc(a).toLocaleDateString(undefined, o)} – ${utc(b).toLocaleDateString(undefined, y)}`;
};
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const span = (e: { startsOn: string; endsOn: string }) => Math.round((utc(e.endsOn).getTime() - utc(e.startsOn).getTime()) / 864e5) + 1;
/** Long entries (whole terms) appear only on their first and last day, so holidays and exams stay visible. */
const LONG = 14;
const onDay = (e: { startsOn: string; endsOn: string }, d: string) => (span(e) > LONG ? d === e.startsOn || d === e.endsOn : e.startsOn <= d && e.endsOn >= d);
const dayLabel = (e: { startsOn: string; endsOn: string; title: string }, d: string) => (span(e) > LONG ? (d === e.startsOn ? `▶ ${e.title} begins` : `■ ${e.title} ends`) : e.title);
/** What a dashboard should show as "coming up": starting soon, or short and happening now. */
const isUpcoming = (e: { startsOn: string; endsOn: string }, t: string) => e.startsOn >= t || (e.endsOn >= t && span(e) <= LONG);

export function useCalendar(from: string, to: string, curriculumId = '') {
  return useQuery<CalEvent[]>({ queryKey: ['calendar', from, to, curriculumId], queryFn: () => api.get(`/calendar${qs({ from, to, curriculumId: curriculumId || undefined })}`) });
}

/** Month grid + upcoming list. `canEdit`: publisher staff (publisher events) or school admin (school events). */
export function AcademicCalendar({ canEdit, publisher }: { canEdit: boolean; publisher?: boolean }) {
  const [month, setMonth] = useState(() => { const t = today(); return `${t.slice(0, 7)}-01`; });
  const [curriculumId, setCurriculumId] = useState('');
  const [kind, setKind] = useState('');
  const [edit, setEdit] = useState<Partial<CalEvent> | null>(null);
  // grid: Monday before the 1st … Sunday after the last day
  const first = utc(month); const lead = (first.getUTCDay() + 6) % 7;
  const gridStart = addDays(month, -lead);
  const nextMonth = (() => { const d = utc(month); d.setUTCMonth(d.getUTCMonth() + 1); return iso(d); })();
  const lastDay = addDays(nextMonth, -1);
  const trail = (7 - ((utc(lastDay).getUTCDay() + 6) % 7) - 1);
  const gridEnd = addDays(lastDay, trail);
  const q = useCalendar(gridStart, addDays(gridEnd, 120), curriculumId);
  const events = (q.data ?? []).filter((e) => !kind || e.kind === kind);
  const days = useMemo(() => { const out: string[] = []; for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) out.push(d); return out; }, [gridStart, gridEnd]);
  const t = today();
  const upcoming = events.filter((e) => isUpcoming(e, t)).slice(0, 12);
  const label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const move = (n: number) => { const d = utc(month); d.setUTCMonth(d.getUTCMonth() + n); setMonth(iso(d)); };
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button>
        <div className="min-w-40 text-center text-lg font-semibold">{label}</div>
        <Button size="sm" variant="ghost" aria-label="Next month" onClick={() => move(1)}><ChevronRight className="size-4" /></Button>
        <Button size="sm" variant="secondary" onClick={() => setMonth(`${t.slice(0, 7)}-01`)}>Today</Button>
        <div className="ml-auto flex flex-wrap gap-2">
          {publisher && <CurriculumSelect className="w-56" emptyLabel="All curricula" value={curriculumId} onChange={setCurriculumId} />}
          <Select aria-label="Type" className="w-36" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All types</option>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}</Select>
          {canEdit && <Button size="sm" onClick={() => setEdit({ title: '', kind: 'EVENT', startsOn: t, endsOn: t, description: '', curriculumId: curriculumId || null })}><Plus className="size-4" />Add</Button>}
        </div>
      </Card>
      {q.error ? <ErrorBox error={q.error} /> : null}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-semibold text-slate-600">{DOW.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const inMonth = d.slice(0, 7) === month.slice(0, 7);
              const evs = events.filter((e) => onDay(e, d));
              return (
                <div key={d} className={cn('min-h-24 border-b border-r border-slate-100 p-1', !inMonth && 'bg-slate-50/60')}>
                  <div className={cn('mb-1 text-right text-xs', d === t ? 'font-bold text-brand-700' : inMonth ? 'text-slate-700' : 'text-slate-500')}>
                    {d === t ? <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-white">{Number(d.slice(8))}</span> : Number(d.slice(8))}</div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 3).map((e) => (
                      <button key={e.id} title={`${e.title} · ${fmtRange(e.startsOn, e.endsOn)}`} onClick={() => setEdit(e)}
                        className={cn('focus-ring block w-full truncate rounded border px-1 text-left text-[11px] leading-4', KINDS[e.kind]?.cls)}>
                        {KINDS[e.kind]?.emoji} {dayLabel(e, d)}</button>))}
                    {evs.length > 3 && <div className="px-1 text-[11px] text-slate-600">+{evs.length - 3} more</div>}
                  </div>
                </div>);
            })}
          </div>
        </Card>
        <Card className="h-fit">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 font-semibold"><CalendarDays className="size-4" />Coming up</div>
          {!upcoming.length ? <p className="p-4 text-sm text-slate-600">Nothing planned yet.</p> : (
            <ul className="divide-y divide-slate-100">{upcoming.map((e) => (
              <li key={e.id}><button onClick={() => setEdit(e)} className="focus-ring flex w-full gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                <span className="text-xl" aria-hidden>{KINDS[e.kind]?.emoji}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{e.title}</span>
                  <span className="block text-xs text-slate-600">{fmtRange(e.startsOn, e.endsOn)}{e.schoolId ? ' · school' : e.curriculumName ? ` · ${e.curriculumName}` : ''}</span></span>
              </button></li>))}</ul>)}
          <div className="flex flex-wrap gap-1.5 border-t border-slate-100 p-3">{Object.entries(KINDS).map(([k, v]) => <span key={k} className={cn('rounded border px-1.5 text-[11px]', v.cls)}>{v.emoji} {v.label}</span>)}</div>
        </Card>
      </div>
      {edit && <EventDialog ev={edit} canEdit={canEdit && (!edit.id || !!edit.editable)} publisher={publisher} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EventDialog({ ev, canEdit, publisher, onClose }: { ev: Partial<CalEvent>; canEdit: boolean; publisher?: boolean; onClose: () => void }) {
  const [f, setF] = useState({ title: ev.title ?? '', kind: ev.kind ?? 'EVENT', startsOn: ev.startsOn ?? '', endsOn: ev.endsOn ?? '', description: ev.description ?? '', curriculumId: ev.curriculumId ?? '' });
  const [del, setDel] = useState(false);
  const body = () => ({ title: f.title, kind: f.kind, startsOn: f.startsOn, endsOn: f.endsOn < f.startsOn ? f.startsOn : f.endsOn, description: f.description, ...(publisher ? { curriculumId: f.curriculumId || null } : {}) });
  const save = useAction(() => (ev.id ? api.patch(`/calendar/${ev.id}`, body()) : api.post('/calendar', body())), { ok: 'Saved', keys: ['calendar'], after: onClose });
  const remove = useAction(() => api.del(`/calendar/${ev.id}`), { ok: 'Removed', keys: ['calendar'], after: onClose });
  if (!canEdit) return (
    <Dialog open onOpenChange={onClose} title={`${KINDS[ev.kind!]?.emoji ?? ''} ${ev.title}`}>
      <div className="space-y-2 text-sm">
        <p className="font-medium">{fmtRange(ev.startsOn!, ev.endsOn!)}</p>
        <div className="flex flex-wrap gap-1.5"><Badge>{KINDS[ev.kind!]?.label}</Badge>{ev.schoolId ? <Badge tone="info">Your school</Badge> : ev.curriculumName ? <Badge tone="info">{ev.curriculumName}</Badge> : <Badge tone="info">All schools</Badge>}</div>
        {ev.description && <p className="whitespace-pre-wrap text-slate-700">{ev.description}</p>}
      </div>
    </Dialog>);
  return (
    <Dialog open onOpenChange={onClose} title={ev.id ? 'Edit calendar entry' : 'Add to the calendar'}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Title"><Input required maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Sports day" autoFocus /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}</Select></Field>
          <Field label="From"><Input type="date" required value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value, endsOn: f.endsOn < e.target.value ? e.target.value : f.endsOn })} /></Field>
          <Field label="To"><Input type="date" required min={f.startsOn} value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} /></Field>
        </div>
        {publisher && <Field label="Shown to" hint="Schools see entries for all schools plus those for their own curriculum"><CurriculumSelect className="w-full" emptyLabel="All schools" value={f.curriculumId} onChange={(v) => setF({ ...f, curriculumId: v })} /></Field>}
        <Field label="Notes"><Textarea rows={3} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {ev.isTemplate && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">This is a typical date filled in automatically. Please check it against your school's real calendar.</p>}
        {save.error ? <ErrorBox error={save.error} /> : null}
        <div className="flex justify-between gap-2">
          {ev.id ? <Button type="button" variant="ghost" onClick={() => setDel(true)}><Trash2 className="size-4" />Delete</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending}>Save</Button></div>
        </div>
      </form>
      <Confirm open={del} onOpenChange={setDel} title={`Delete “${ev.title}”?`} body="It disappears from the calendar for everyone." danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </Dialog>
  );
}

/** Small "coming up" list for dashboards (teachers, school admins, children). */
export function UpcomingEvents({ days = 45, limit = 5, playful }: { days?: number; limit?: number; playful?: boolean }) {
  const { t: tr } = useT(); const t = today();
  const q = useCalendar(t, addDays(t, days));
  const list = (q.data ?? []).filter((e) => isUpcoming(e, t)).slice(0, limit);
  if (!list.length) return null;
  if (playful) return (
    <section className="rounded-[2rem] bg-white p-5 shadow-sm"><h2 className="mb-3 text-2xl font-black text-slate-800">📅 {tr('Coming up')}</h2>
      <ul className="grid gap-2 sm:grid-cols-2">{list.map((e) => (
        <li key={e.id} className={cn('flex items-center gap-3 rounded-2xl border-2 px-4 py-3', KINDS[e.kind]?.cls)}>
          <span className="text-3xl" aria-hidden>{KINDS[e.kind]?.emoji}</span>
          <span><span className="block text-lg font-black">{e.title}</span><span className="block text-sm font-bold">{fmtRange(e.startsOn, e.endsOn)}</span></span></li>))}</ul>
    </section>);
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 font-semibold"><CalendarDays className="size-4" />{tr('Coming up')}</div>
      <ul className="divide-y divide-slate-100">{list.map((e) => (
        <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm"><span aria-hidden>{KINDS[e.kind]?.emoji}</span>
          <span className="flex-1 font-medium text-slate-800">{e.title}</span><span className="text-xs text-slate-600">{fmtRange(e.startsOn, e.endsOn)}</span></li>))}</ul>
    </Card>);
}
