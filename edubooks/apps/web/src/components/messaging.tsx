'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Pin, Plus, Send, Trash2, Video } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { className as clsName } from '@/lib/lms';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader, Select, Textarea, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';

const time = (d: string) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Two-pane inbox. Parents talk to their children's teachers; staff to their pupils' parents. */
export function Inbox({ parent, canOversee }: { parent?: boolean; canOversee?: boolean }) {
  const { t } = useT(); const params = useSearchParams();
  const [all, setAll] = useState(false); const [sel, setSel] = useState<string | null>(params.get('c')); const [starting, setStarting] = useState(false);
  const list = useQuery({ queryKey: ['convs', all], queryFn: () => api.get<any[]>(`/messages/conversations${all ? '?all=1' : ''}`), refetchInterval: 20_000 });
  const other = (c: any) => (parent ? c.staffName : all ? `${c.staffName} ↔ ${c.parentName}` : c.parentName);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => setStarting(true)}><Plus className="size-4" />{t('New message')}</Button>
        {canOversee && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={all} onChange={(e) => { setAll(e.target.checked); setSel(null); }} />All conversations in the school (read only)</label>}
      </div>
      <Card className="grid min-h-[480px] overflow-hidden md:grid-cols-[300px_1fr]">
        <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto border-slate-100 md:border-e" aria-label={t('Conversations')}>
          {list.data?.map((c) => (
            <li key={c.id}><button onClick={() => setSel(c.id)} aria-current={sel === c.id ? 'true' : undefined}
              className={cn('flex w-full flex-col items-start px-4 py-3 text-start text-sm', sel === c.id ? 'bg-brand-50' : 'hover:bg-slate-50')}>
              <span className="flex w-full items-center gap-2"><b className="min-w-0 flex-1 truncate text-slate-900">{other(c)}</b>{c.unread > 0 && <span className="rounded-full bg-brand-600 px-2 text-xs font-bold text-white">{c.unread}</span>}</span>
              <span className="text-xs text-slate-600">{t('About {name}', { name: c.studentName })} · {time(c.lastMessageAt)}</span>
              <span className="w-full truncate text-xs text-slate-600">{c.lastMessage ?? '—'}</span></button></li>))}
          {list.data && !list.data.length && <li className="p-6 text-center text-sm text-slate-600">{t('No messages yet.')}</li>}
        </ul>
        {sel ? <Thread id={sel} parent={parent} /> : <div className="hidden place-items-center p-6 text-sm text-slate-600 md:grid">{t('Choose a conversation.')}</div>}
      </Card>
      {starting && <StartDialog parent={parent} onClose={() => setStarting(false)} onStarted={(id) => { setSel(id); setStarting(false); }} />}
    </div>
  );
}

function Thread({ id, parent }: { id: string; parent?: boolean }) {
  const { t } = useT(); const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['conv', id], queryFn: () => api.get<any>(`/messages/conversations/${id}`), refetchInterval: 10_000 });
  const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); qc.invalidateQueries({ queryKey: ['convs'] }); }, [q.data?.messages?.length]); // eslint-disable-line
  if (q.error) return <div className="p-4"><ErrorBox error={q.error} /></div>;
  if (!q.data) return <PageLoader />;
  const d = q.data;
  const send = async () => { if (!body.trim()) return; setBusy(true); try { qc.setQueryData(['conv', id], await api.post(`/messages/conversations/${id}`, { body })); setBody(''); qc.invalidateQueries({ queryKey: ['convs'] }); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); } };
  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-slate-100 px-4 py-3 text-sm"><b>{parent ? d.staffName : d.readOnly ? `${d.staffName} ↔ ${d.parentName}` : d.parentName}</b> <span className="text-slate-600">· {t('About {name}', { name: d.studentName })}</span></div>
      <div className="max-h-[55vh] min-h-64 flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4" aria-live="polite">
        {d.messages.map((m: any) => { const mine = m.senderId === d.me; return (
          <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm', mine ? 'bg-brand-600 text-white' : 'bg-white text-slate-900')}>
              {!mine && <div className="text-xs font-semibold text-slate-600">{m.senderName}</div>}
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              <div className={cn('mt-0.5 text-[10px]', mine ? 'text-white/80' : 'text-slate-500')}>{time(m.createdAt)}</div></div></div>); })}
        {!d.messages.length && <p className="text-center text-sm text-slate-600">{t('Say hello 👋')}</p>}
        <div ref={end} />
      </div>
      {d.readOnly ? <p className="border-t border-slate-100 p-3 text-xs text-slate-600">Read only: you are viewing this conversation as the school admin.</p> : (
        <form className="flex items-end gap-2 border-t border-slate-100 p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <Textarea aria-label={t('Message')} rows={2} maxLength={2000} className="flex-1" placeholder={t('Write a message…')} value={body} onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <Button loading={busy} disabled={!body.trim()} aria-label={t('Send')}><Send className="size-4 rtl:-scale-x-100" /></Button>
        </form>)}
    </div>
  );
}

function StartDialog({ parent, onClose, onStarted }: { parent?: boolean; onClose: () => void; onStarted: (id: string) => void }) {
  const { t } = useT(); const toast = useToast();
  const q = useQuery({ queryKey: ['contacts'], queryFn: () => api.get<any[]>('/messages/contacts') });
  const [filter, setFilter] = useState('');
  const go = async (c: any) => { try { const r = await api.post<any>('/messages/conversations', { studentId: c.studentId, withId: c.id }); onStarted(r.id); } catch (e: any) { toast(e.message, 'err'); } };
  const list = (q.data ?? []).filter((c) => !filter || `${c.displayName} ${c.studentName}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Dialog open onOpenChange={onClose} title={t('New message')} description={parent ? t('Your child’s teachers and the school office.') : 'Parents of the pupils in your classes.'}>
      {!parent && <Input aria-label="Search" placeholder="Search a parent or pupil" className="mb-2" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      {!q.data ? <PageLoader /> : !list.length ? <p className="text-sm text-slate-600">{parent ? t('No teachers found for your child yet.') : 'No parent accounts are linked to your pupils yet.'}</p> : (
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{list.map((c, i) => (
          <li key={i}><button onClick={() => go(c)} className="flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-slate-50">
            <span className="min-w-0 flex-1"><b className="block text-slate-900">{c.displayName}</b><span className="text-xs text-slate-600">{c.role} · {t('About {name}', { name: c.studentName })}</span></span>
            <Send className="size-4 text-brand-600 rtl:-scale-x-100" /></button></li>))}</ul>)}
    </Dialog>
  );
}

/** Announcements: everyone reads; teachers post to their classes, the school admin to the whole school. */
export function Announcements({ canPost, classes, playful, limit }: { canPost?: boolean; classes?: { id: string; label: string }[]; playful?: boolean; limit?: number }) {
  const { t } = useT(); const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['announcements'], queryFn: () => api.get<any[]>('/announcements') });
  const [adding, setAdding] = useState(false);
  const items = (q.data ?? []).slice(0, limit ?? 50);
  if (!canPost && !items.length) return null;
  return (
    <section className={playful ? 'rounded-[2rem] bg-white p-5 shadow-sm' : ''}>
      <div className="mb-3 flex items-center gap-2"><h2 className={playful ? 'text-2xl font-black text-slate-800' : 'text-lg font-semibold text-slate-900'}>📣 {t('Announcements')}</h2>
        {canPost && <Button size="sm" className="ms-auto" onClick={() => setAdding(true)}><Megaphone className="size-4" />New announcement</Button>}</div>
      <div className="space-y-2">{items.map((a) => (
        <Card key={a.id} className={cn('p-4', a.pinned && 'border-amber-300 bg-amber-50')}>
          <div className="flex items-start gap-2"><div className="min-w-0 flex-1">
            <div className={cn('font-semibold text-slate-900', playful && 'text-lg')}>{a.pinned && <Pin className="me-1 inline size-4 text-amber-600" />}{a.title}</div>
            {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{a.body}</p>}
            <p className="mt-1 text-xs text-slate-600">{[a.author, a.classId ? clsName({ name: a.className, section: a.section }) : t('Whole school'), fmtDate(a.createdAt)].filter(Boolean).join(' · ')}
              {canPost && <> · {{ BOTH: 'pupils and parents', STUDENTS: 'pupils', PARENTS: 'parents' }[a.audience as string]}</>}</p></div>
            {canPost && a.mine && <button aria-label={`Remove ${a.title}`} onClick={async () => { await api.del(`/announcements/${a.id}`); qc.invalidateQueries({ queryKey: ['announcements'] }); toast('Removed'); }} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" /></button>}</div>
        </Card>))}
        {canPost && !items.length && <p className="text-sm text-slate-600">No announcements yet.</p>}</div>
      {adding && <AnnounceDialog classes={classes ?? []} onClose={() => setAdding(false)} />}
    </section>
  );
}

function AnnounceDialog({ classes, onClose }: { classes: { id: string; label: string; all?: boolean }[]; onClose: () => void }) {
  const [f, setF] = useState({ classId: classes[0]?.id ?? '', title: '', body: '', audience: 'BOTH', pinned: false });
  const qc = useQueryClient(); const toast = useToast(); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  const save = async () => { setBusy(true); setErr(null); try { await api.post('/announcements', { ...f, classId: f.classId || null }); qc.invalidateQueries({ queryKey: ['announcements'] }); toast('Announcement sent'); onClose(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <Dialog open onOpenChange={onClose} title="New announcement" description="Pupils see it in their portal; parents also get it on WhatsApp/SMS when that is set up.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="To"><Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>{classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
          <Field label="Who"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="BOTH">Pupils and parents</option><option value="PARENTS">Parents only</option><option value="STUDENTS">Pupils only</option></Select></Field>
        </div>
        <Field label="Title"><Input required minLength={2} maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Message"><Textarea rows={4} maxLength={4000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />Pin to the top</label>
        {err ? <ErrorBox error={err} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>Send</Button></div>
      </form>
    </Dialog>
  );
}

/** Upcoming live lessons with a Join button from 10 minutes before the start. */
export function LiveLessons({ canSchedule, classes, playful }: { canSchedule?: boolean; classes?: { id: string; label: string }[]; playful?: boolean }) {
  const { t } = useT(); const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['live'], queryFn: () => api.get<any[]>('/live'), refetchInterval: 60_000 });
  const [adding, setAdding] = useState(false);
  if (!canSchedule && !q.data?.length) return null;
  return (
    <section className={playful ? 'rounded-[2rem] bg-white p-5 shadow-sm' : ''}>
      <div className="mb-3 flex items-center gap-2"><h2 className={playful ? 'text-2xl font-black text-slate-800' : 'text-lg font-semibold text-slate-900'}>🎥 {t('Live lessons')}</h2>
        {canSchedule && <Button size="sm" className="ms-auto" onClick={() => setAdding(true)}><Video className="size-4" />Schedule</Button>}</div>
      <div className="space-y-2">{(q.data ?? []).map((l) => (
        <Card key={l.id} className={cn('flex flex-wrap items-center gap-3 p-4', l.joinable && 'border-emerald-300 bg-emerald-50')}>
          <div className="min-w-0 flex-1"><div className={cn('font-semibold text-slate-900', playful && 'text-lg')}>{l.title}</div>
            <div className="text-xs text-slate-600">{time(l.startsAt)} · {l.durationMin} min · {clsName({ name: l.className, section: l.section })}{l.teacher ? ` · ${l.teacher}` : ''}</div>
            {l.notes && <div className="text-xs text-slate-700">{l.notes}</div>}</div>
          {l.joinable ? <a href={l.url} target="_blank" rel="noopener noreferrer" className={cn('rounded-full bg-emerald-600 font-bold text-white hover:bg-emerald-700', playful ? 'px-6 py-3 text-xl' : 'px-4 py-2 text-sm')}>▶ {t('Join')}</a>
            : <Badge>{t('Opens 10 minutes before')}</Badge>}
          {canSchedule && l.mine && <button aria-label={`Cancel ${l.title}`} onClick={async () => { await api.del(`/live/${l.id}`); qc.invalidateQueries({ queryKey: ['live'] }); toast('Cancelled'); }} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" /></button>}
        </Card>))}
        {canSchedule && !q.data?.length && <p className="text-sm text-slate-600">No live lessons planned.</p>}</div>
      {adding && <LiveDialog classes={classes ?? []} onClose={() => setAdding(false)} />}
    </section>
  );
}

function LiveDialog({ classes, onClose }: { classes: { id: string; label: string }[]; onClose: () => void }) {
  const soon = new Date(Date.now() + 3600_000); soon.setMinutes(0, 0, 0);
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [f, setF] = useState({ classId: classes[0]?.id ?? '', title: '', startsAt: local(soon), durationMin: 40, url: '', notes: '' });
  const qc = useQueryClient(); const toast = useToast(); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  const save = async () => { setBusy(true); setErr(null); try { await api.post('/live', { ...f, startsAt: new Date(f.startsAt).toISOString(), durationMin: Number(f.durationMin) }); qc.invalidateQueries({ queryKey: ['live'] }); toast('Live lesson scheduled — pupils and parents have been told'); onClose(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <Dialog open onOpenChange={onClose} title="Schedule a live lesson" description="Create the meeting in Zoom, Google Meet or Teams first, then paste its link here.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Class"><Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>{classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
        <Field label="Title"><Input required minLength={2} maxLength={160} value={f.title} placeholder="Phonics: the letter B" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts"><Input type="datetime-local" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
          <Field label="Minutes"><Input type="number" min={5} max={300} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></Field></div>
        <Field label="Meeting link (https://…)"><Input required value={f.url} placeholder="https://meet.google.com/…" onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
        <Field label="Notes (optional)"><Textarea rows={2} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {err ? <ErrorBox error={err} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>Schedule</Button></div>
      </form>
    </Dialog>
  );
}
