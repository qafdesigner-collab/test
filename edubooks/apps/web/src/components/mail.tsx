'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, AtSign, CalendarDays, Inbox as InboxIcon, Mail, Megaphone, Settings2, MapPin, PenSquare, Reply, Search, Send, Users, Video, X } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Textarea, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { Campaigns, EmailAccountDialog, EmailInbox } from '@/components/mailbox';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const RSVP: Record<string, { label: string; cls: string }> = { YES: { label: 'Going', cls: 'bg-emerald-100 text-emerald-800' }, MAYBE: { label: 'Maybe', cls: 'bg-amber-100 text-amber-800' }, NO: { label: 'Not going', cls: 'bg-red-100 text-red-700' } };

/** Inbox / Sent / Archived with a reading pane. Staff can write new mail and meeting invites; pupils and parents read and reply. */
export function MailCenter({ canCompose, playful }: { canCompose?: boolean; playful?: boolean }) {
  const { t } = useT(); const params = useSearchParams();
  const [folder, setFolder] = useState<'inbox' | 'sent' | 'archived' | 'email' | 'campaigns'>('inbox'); const [setup, setSetup] = useState(false); const [q, setQ] = useState(''); const [sel, setSel] = useState<string | null>(params.get('m'));
  const [compose, setCompose] = useState(false);
  const own = folder === 'email' || folder === 'campaigns';
  const list = useQuery({ queryKey: ['mail', folder, q], queryFn: () => api.get<any[]>(`/mail?folder=${folder}${q ? `&q=${encodeURIComponent(q)}` : ''}`), refetchInterval: 30_000, enabled: !own });
  const folders = [['inbox', t('Inbox'), InboxIcon], ...(canCompose ? [['sent', t('Sent'), Send]] : []), ['archived', t('Archived'), Archive],
    ...(canCompose ? [['email', t('My email'), AtSign], ['campaigns', t('Campaigns'), Megaphone]] : [])] as [typeof folder, string, any][];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canCompose && <Button onClick={() => setCompose(true)}><PenSquare className="size-4" />{t('New mail')}</Button>}
        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm" role="tablist">
          {folders.map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={folder === k} onClick={() => { setFolder(k); setSel(null); }}
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', folder === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50')}><Icon className="size-4" />{label}</button>))}
        </div>
        {canCompose && <Button variant="ghost" size="sm" onClick={() => setSetup(true)}><Settings2 className="size-4" />{t('My email account')}</Button>}
        {!own && <div className="relative ms-auto w-full sm:w-64"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="ps-9" placeholder={t('Search mail…')} aria-label={t('Search mail')} value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      </div>
      {setup && <EmailAccountDialog onClose={() => setSetup(false)} />}
      {folder === 'email' ? <EmailInbox onSetup={() => setSetup(true)} /> : folder === 'campaigns' ? <Campaigns /> : <Card className={cn('grid min-h-[520px] overflow-hidden md:grid-cols-[340px_1fr]', playful && 'rounded-[2rem]')}>
        <ul className={cn('max-h-[72vh] divide-y divide-slate-100 overflow-y-auto border-slate-100 md:border-e', sel && 'hidden md:block')} aria-label={t('Mail')}>
          {list.data?.map((m) => (
            <li key={m.id}><button onClick={() => setSel(m.id)} aria-current={sel === m.id ? 'true' : undefined}
              className={cn('flex w-full gap-3 px-4 py-3 text-start', sel === m.id ? 'bg-brand-50' : 'hover:bg-slate-50')}>
              <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl', m.kind === 'MEETING' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700')}>{m.kind === 'MEETING' ? <CalendarDays className="size-4" /> : <Mail className="size-4" />}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><b className={cn('min-w-0 flex-1 truncate text-sm', folder === 'inbox' && !m.read ? 'text-slate-900' : 'font-medium text-slate-700')}>{folder === 'sent' ? `${t('To')}: ${m.toLabel}` : m.senderName}</b>
                  <span className="shrink-0 text-[11px] text-slate-500">{fmtDate(m.createdAt)}</span></span>
                <span className={cn('block truncate text-sm', folder === 'inbox' && !m.read ? 'font-semibold text-slate-900' : 'text-slate-700')}>{folder === 'inbox' && !m.read && <i className="me-1.5 inline-block size-2 rounded-full bg-brand-600" />}{m.subject}</span>
                <span className="block truncate text-xs text-slate-500">{m.kind === 'MEETING' && m.meeting ? `📅 ${when(m.meeting.startsAt)} · ` : ''}{folder === 'sent' ? `${m.readBy}/${m.recipients} ${t('read')}` : m.snippet}</span>
                {m.rsvp && <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', RSVP[m.rsvp].cls)}>{t(RSVP[m.rsvp].label)}</span>}
              </span></button></li>))}
          {list.data && !list.data.length && <li className="p-8 text-center text-sm text-slate-500">{folder === 'inbox' ? t('No mail yet.') : t('Nothing here.')}</li>}
          {!list.data && <li className="p-6"><PageLoader /></li>}
        </ul>
        {sel ? <Reader id={sel} onBack={() => setSel(null)} /> : <div className="hidden place-items-center p-6 text-sm text-slate-500 md:grid"><span className="text-center"><Mail className="mx-auto mb-2 size-10 text-slate-300" />{t('Choose a mail to read.')}</span></div>}
      </Card>}
      {compose && <Compose onClose={() => setCompose(false)} onSent={(id) => { setCompose(false); setFolder('sent'); setSel(id); }} />}
    </div>
  );
}

function Reader({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useT(); const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['mailItem', id], queryFn: () => api.get<any>(`/mail/${id}`) });
  const [reply, setReply] = useState(''); const [busy, setBusy] = useState(false); const [showAll, setShowAll] = useState(false);
  useEffect(() => { if (q.data) { qc.invalidateQueries({ queryKey: ['mail', 'inbox'] }); qc.invalidateQueries({ queryKey: ['mailUnread'] }); } }, [q.data?.id]); // eslint-disable-line
  if (q.error) return <div className="p-4"><ErrorBox error={q.error} /></div>;
  if (!q.data) return <PageLoader />;
  const m = q.data;
  const act = async (fn: () => Promise<any>, ok?: string) => { setBusy(true); try { await fn(); if (ok) toast(ok); qc.invalidateQueries({ queryKey: ['mailItem', id] }); qc.invalidateQueries({ queryKey: ['mail'] }); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); } };
  return (
    <article className="flex min-h-0 flex-col">
      <header className="space-y-1 border-b border-slate-100 p-4">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800 md:hidden">← {t('Back')}</button>
        <div className="flex flex-wrap items-start gap-2"><h2 className="min-w-0 flex-1 text-lg font-semibold text-slate-900">{m.subject}</h2>
          {!m.mine && (m.archived ? <Button size="sm" variant="ghost" onClick={() => act(() => api.post(`/mail/${id}/unarchive`), t('Moved to the inbox'))}><ArchiveRestore className="size-4" />{t('Move to inbox')}</Button>
            : <Button size="sm" variant="ghost" onClick={() => act(() => api.post(`/mail/${id}/archive`), t('Archived'))}><Archive className="size-4" />{t('Archive')}</Button>)}</div>
        <p className="text-sm text-slate-600">{m.mine ? <>{t('To')}: <b>{m.toLabel}</b></> : <>{t('From')}: <b>{m.senderName}</b></>} · {fmtDate(m.createdAt)}</p>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {m.kind === 'MEETING' && m.meeting && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 font-semibold text-amber-900"><CalendarDays className="size-5" />{when(m.meeting.startsAt)} · {m.meeting.durationMin} {t('min')}</p>
            {m.meeting.location && <p className="mt-1 flex items-center gap-2 text-sm text-amber-900"><MapPin className="size-4" />{m.meeting.location}</p>}
            {m.meeting.url && <a href={m.meeting.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-violet-700 shadow-sm hover:bg-violet-50"><Video className="size-4" />{t('Join online')}</a>}
            {!m.mine && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-sm text-amber-900">{t('Will you come?')}</span>
              {(['YES', 'MAYBE', 'NO'] as const).map((k) => <button key={k} disabled={busy} onClick={() => act(() => api.post(`/mail/${id}/rsvp`, { answer: k }), t('Thank you — your answer was sent'))} aria-pressed={m.rsvp === k}
                className={cn('rounded-full px-3 py-1 text-sm font-semibold ring-1', m.rsvp === k ? `${RSVP[k].cls} ring-transparent` : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50')}>{t(RSVP[k].label)}</button>)}</div>}
          </div>
        )}
        {m.body && <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800">{m.body}</div>}
        {m.related?.filter((r: any) => r.id !== m.id).length > 0 && (
          <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('In this conversation')}</p>
            {m.related.filter((r: any) => r.id !== m.id).map((r: any) => <div key={r.id} className="rounded-xl bg-slate-50 p-3 text-sm"><b>{r.senderName}</b> <span className="text-xs text-slate-500">· {fmtDate(r.createdAt)}</span><p className="mt-1 whitespace-pre-wrap text-slate-700">{r.body}</p></div>)}</div>
        )}
        {m.mine && m.recipients && (
          <div className="rounded-2xl border border-slate-200 p-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1"><Users className="me-1 inline size-3.5" />{m.recipients.total} {t('recipients')}</span>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-800">{m.recipients.read} {t('read')}</span>
              {m.recipients.emailed > 0 && <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-800">✉️ {m.recipients.emailed} {t('emailed')}</span>}
              {m.kind === 'MEETING' && (['YES', 'MAYBE', 'NO'] as const).map((k) => <span key={k} className={cn('rounded-full px-3 py-1', RSVP[k].cls)}>{t(RSVP[k].label)}: {m.recipients.rsvp[k]}</span>)}
            </div>
            <button className="mt-3 text-sm font-medium text-brand-700 hover:underline" onClick={() => setShowAll(!showAll)}>{showAll ? t('Hide the list') : t('Who has read it?')}</button>
            {showAll && <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">{m.recipients.list.map((r: any) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-1.5"><span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.rsvp && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', RSVP[r.rsvp].cls)}>{t(RSVP[r.rsvp].label)}</span>}
                <span className="text-xs text-slate-500">{r.readAt ? `✓ ${fmtDate(r.readAt)}` : t('not read')}</span></li>))}</ul>}
          </div>
        )}
      </div>
      {m.canReply && (
        <form className="flex items-end gap-2 border-t border-slate-100 p-3" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) act(async () => { await api.post(`/mail/${id}/reply`, { body: reply }); setReply(''); }, t('Reply sent')); }}>
          <Textarea rows={2} className="flex-1" aria-label={t('Reply')} placeholder={t('Write a reply to {name}…', { name: m.senderName })} value={reply} onChange={(e) => setReply(e.target.value)} />
          <Button loading={busy} disabled={!reply.trim()}><Reply className="size-4" />{t('Reply')}</Button>
        </form>
      )}
    </article>
  );
}

function Compose({ onClose, onSent }: { onClose: () => void; onSent: (id: string) => void }) {
  const toast = useToast(); const qc = useQueryClient();
  const groups = useQuery({ queryKey: ['mailGroups'], queryFn: () => api.get<any[]>('/mail/groups') });
  const [search, setSearch] = useState(''); const people = useQuery({ queryKey: ['mailPeople', search], queryFn: () => api.get<any[]>(`/mail/people?q=${encodeURIComponent(search)}`), enabled: search.trim().length >= 2 });
  const [to, setTo] = useState<{ key: string; label: string }[]>([]);
  const [ext, setExt] = useState('');
  const external = ext.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const [f, setF] = useState({ subject: '', body: '', meeting: false, date: '', time: '09:00', durationMin: 45, location: '', url: '' });
  const [busy, setBusy] = useState(false);
  const add = (key: string, label: string) => { if (!to.some((x) => x.key === key)) setTo([...to, { key, label }]); };
  const reach = useMemo(() => to.reduce((n, x) => n + (groups.data?.find((g) => g.key === x.key)?.count ?? (x.key.startsWith('u:') ? 1 : 0)), 0), [to, groups.data]);
  const send = async () => {
    setBusy(true);
    try {
      const meeting = f.meeting ? { startsAt: new Date(`${f.date}T${f.time}`).toISOString(), durationMin: f.durationMin, location: f.location || undefined, url: f.url || undefined } : undefined;
      const r = await api.post<any>('/mail', { to: to.map((x) => x.key), external: external.length ? external : undefined, subject: f.subject, body: f.body, meeting });
      const n = r.recipients + external.length; toast(`Sent to ${n} ${n === 1 ? 'person' : 'people'}`); qc.invalidateQueries({ queryKey: ['mail'] }); onSent(r.id);
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const valid = (to.length || external.length) && f.subject.trim() && (!f.meeting || f.date);
  return (
    <Dialog open onOpenChange={onClose} wide title={f.meeting ? 'New meeting invitation' : 'New mail'} description="Everyone gets it in their inbox here (and a notification). People with an email address also get a copy by email.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) send(); }}>
        <Field label="To">
          <div className="space-y-2">
            <div className="flex min-h-11 flex-wrap gap-1.5 rounded-lg border border-slate-300 p-2">
              {to.map((x) => <span key={x.key} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-sm text-brand-800">{x.label}
                <button type="button" onClick={() => setTo(to.filter((y) => y.key !== x.key))} aria-label={`Remove ${x.label}`} className="rounded-full hover:bg-brand-100"><X className="size-3.5" /></button></span>)}
              {!to.length && <span className="text-sm text-slate-400">Pick groups below, or search for a person</span>}
            </div>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              {groups.data?.map((g) => <button type="button" key={g.key} disabled={!g.count || to.some((x) => x.key === g.key)} onClick={() => add(g.key, g.label)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50 disabled:opacity-40"><Users className="me-1 inline size-3" />{g.label} <span className="text-slate-400">({g.count})</span></button>)}
              {!groups.data && <span className="text-xs text-slate-500">Loading groups…</span>}
            </div>
            <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input className="ps-9" placeholder="Search a person by name, login ID or email" aria-label="Search a person" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            {search.trim().length >= 2 && <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {(people.data ?? []).map((p) => <li key={p.id}><button type="button" onClick={() => { add(`u:${p.id}`, p.name); setSearch(''); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm hover:bg-slate-50">
                <b className="min-w-0 flex-1 truncate">{p.name}</b><span className="text-xs text-slate-500">{[p.role, p.school].filter(Boolean).join(' · ')}</span></button></li>)}
              {people.data && !people.data.length && <li className="px-3 py-2 text-sm text-slate-500">Nobody found.</li>}</ul>}
            <Input value={ext} onChange={(e) => setExt(e.target.value)} aria-label="Outside email addresses" placeholder="Outside email addresses (optional): parent@gmail.com, office@supplier.ae" />
            {(to.length > 0 || external.length > 0) && <p className="text-xs text-slate-500">Reaches about {reach + external.length} {reach + external.length === 1 ? 'person' : 'people'}.{external.length > 0 && ' Outside addresses get it by email, from your own email account when connected.'}</p>}
          </div>
        </Field>
        <Field label="Subject"><Input required maxLength={200} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder={f.meeting ? 'e.g. Staff meeting — exams week' : 'e.g. Sports day on Thursday'} /></Field>
        <label className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900"><input type="checkbox" checked={f.meeting} onChange={(e) => setF({ ...f, meeting: e.target.checked })} />📅 This is a meeting invitation (people answer Going / Maybe / Not going)</label>
        {f.meeting && (
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Date"><Input required type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Time"><Input required type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
            <Field label="Minutes"><Input type="number" min={5} max={600} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) || 45 })} /></Field>
            <Field label="Where"><Input value={f.location} maxLength={200} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="e.g. Library" /></Field>
            <Field label="Online meeting link (optional)" className="sm:col-span-4"><Input type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://meet.google.com/… or https://zoom.us/j/…" /></Field>
          </div>
        )}
        <Field label="Message"><Textarea rows={7} maxLength={20000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Write your message…" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!valid}><Send className="size-4" />{f.meeting ? 'Send invitation' : 'Send'}</Button></div>
      </form>
    </Dialog>
  );
}

/** Unread mail count (for menu badges). */
export const useMailUnread = () => useQuery({ queryKey: ['mailUnread'], queryFn: () => api.get<{ unread: number }>('/mail/unread'), refetchInterval: 60_000 });
