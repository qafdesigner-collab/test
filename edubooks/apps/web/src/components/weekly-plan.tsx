'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useBook, useMyBooks, useMyClasses } from '@/lib/lms';
import { cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PART_ICON: Record<string, string> = { STUDENT_BOOK: '📘', HOMEWORK_BOOK: '📓', WORKBOOK: '📒', TEACHER_GUIDE: '📗', FLASHCARDS: '🃏', TEACHER_CARDS: '🎴', DANGLERS: '🎏', POSTERS: '🖼️', OTHER: '🗂️', CD: '💿', MOBILE_APP: '📱' };
export type Entry = { planId?: string | null; day: number; editionId: string | null; componentId: string | null; lessonId: string | null; pageFrom: number | null; pageTo: number | null; resourceIds: string[]; title: string; activity: string; homework: string;
  book?: string | null; part?: string | null; partType?: string | null; lesson?: string | null; resources?: { id: string; title: string; type?: string }[] };
const mondayOf = (s: string) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const dayDate = (monday: string, day: number) => { const d = new Date(`${monday}T12:00:00`); d.setDate(d.getDate() + day - 1); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** One entry: book → part → lesson (optional) → pages → resources, and what the class will do. */
function EntryForm({ initial, onSave, onCancel }: { initial: Partial<Entry> & { day: number }; onSave: (e: Entry) => void; onCancel: () => void }) {
  const books = useMyBooks();
  const [e, setE] = useState<Entry>({ editionId: null, componentId: null, lessonId: null, pageFrom: null, pageTo: null, resourceIds: [], title: '', activity: '', homework: '', ...initial } as Entry);
  const book = useBook(e.editionId ?? undefined);
  const parts: any[] = book.data?.components ?? [];
  const part = parts.find((c) => c.id === e.componentId);
  const lessons: any[] = part ? part.units.flatMap((u: any) => u.lessons.map((l: any) => ({ ...l, unit: u.number, unitTitle: u.title }))) : [];
  const resources: any[] = (book.data?.resources ?? []).filter((r: any) => (!r.componentId || r.componentId === e.componentId) && (!r.lessonId || r.lessonId === e.lessonId));
  // pick the first part when a book is chosen
  useEffect(() => { if (e.editionId && parts.length && !e.componentId) setE((x) => ({ ...x, componentId: parts[0].id })); }, [parts.length]); // eslint-disable-line
  const chooseLesson = (id: string) => { const l = lessons.find((x) => x.id === id); setE({ ...e, lessonId: id || null, pageFrom: l?.pageStart ?? e.pageFrom, pageTo: l?.pageEnd ?? l?.pageStart ?? e.pageTo, resourceIds: [] }); };
  const names = () => ({ book: books.data?.find((b: any) => b.editionId === e.editionId)?.title ?? null, part: part?.title ?? null, partType: part?.type ?? null,
    lesson: lessons.find((l) => l.id === e.lessonId) ? `Unit ${lessons.find((l) => l.id === e.lessonId).unit} · Lesson ${lessons.find((l) => l.id === e.lessonId).number}: ${lessons.find((l) => l.id === e.lessonId).title}` : null,
    resources: resources.filter((r) => e.resourceIds.includes(r.id)).map((r) => ({ id: r.id, title: r.title, type: r.resourceType })) });
  const sel = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm';
  return (
    <div className="space-y-2 rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-200">
      <label className="block text-xs font-semibold text-slate-600">📚 Book<select className={sel} value={e.editionId ?? ''} onChange={(x) => setE({ ...e, editionId: x.target.value || null, componentId: null, lessonId: null, pageFrom: null, pageTo: null, resourceIds: [] })}>
        <option value="">— no book (other activity) —</option>{books.data?.map((b: any) => <option key={b.editionId} value={b.editionId}>{b.title}{b.editionLabel ? ` (${b.editionLabel})` : ''}</option>)}</select></label>
      {e.editionId && <>
        <label className="block text-xs font-semibold text-slate-600">📑 Part of the book<select className={sel} value={e.componentId ?? ''} onChange={(x) => setE({ ...e, componentId: x.target.value || null, lessonId: null, resourceIds: [] })}>
          {!parts.length && <option value="">Loading…</option>}{parts.map((c) => <option key={c.id} value={c.id}>{PART_ICON[c.type] ?? '📄'} {c.title}{c.pageCount ? ` · ${c.pageCount} pages` : ''}</option>)}</select></label>
        {lessons.length > 0 && <label className="block text-xs font-semibold text-slate-600">📖 Lesson <span className="font-normal">(optional)</span><select className={sel} value={e.lessonId ?? ''} onChange={(x) => chooseLesson(x.target.value)}>
          <option value="">— any / pages only —</option>{lessons.map((l) => <option key={l.id} value={l.id}>Unit {l.unit} · Lesson {l.number}: {l.title}{l.pageStart ? ` (p. ${l.pageStart}${l.pageEnd && l.pageEnd !== l.pageStart ? `–${l.pageEnd}` : ''})` : ''}</option>)}</select></label>}
        <div className="flex items-end gap-2"><label className="text-xs font-semibold text-slate-600">📄 Page<input type="number" min={1} max={part?.pageCount ?? 5000} value={e.pageFrom ?? ''} onChange={(x) => setE({ ...e, pageFrom: x.target.value ? Number(x.target.value) : null })} className={cn(sel, 'w-20')} /></label>
          <label className="text-xs font-semibold text-slate-600">to<input type="number" min={1} max={part?.pageCount ?? 5000} value={e.pageTo ?? ''} onChange={(x) => setE({ ...e, pageTo: x.target.value ? Number(x.target.value) : null })} className={cn(sel, 'w-20')} /></label></div>
        {resources.length > 0 && <div><p className="text-xs font-semibold text-slate-600">🗂️ Resources</p><div className="mt-1 max-h-32 space-y-1 overflow-y-auto">{resources.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={e.resourceIds.includes(r.id)} onChange={(x) => setE({ ...e, resourceIds: x.target.checked ? [...e.resourceIds, r.id] : e.resourceIds.filter((y) => y !== r.id) })} />{r.title}<span className="text-slate-400">{r.ext ? `.${r.ext}` : ''}</span></label>))}</div></div>}
      </>}
      {!e.editionId && <input value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} maxLength={200} placeholder="Title, e.g. Library visit, Assembly, Revision" className={sel} />}
      <textarea value={e.activity} onChange={(x) => setE({ ...e, activity: x.target.value })} maxLength={1000} rows={2} placeholder="What we will do (activity, aims)…" className={sel} />
      <input value={e.homework} onChange={(x) => setE({ ...e, homework: x.target.value })} maxLength={500} placeholder="Homework (optional)" className={sel} />
      <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-white">Cancel</button>
        <button type="button" disabled={!e.editionId && !e.title.trim() && !e.activity.trim()} onClick={() => onSave({ ...e, ...names() })} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">✓ Add</button></div>
    </div>
  );
}

function EntryCard({ e, onEdit, onRemove }: { e: Entry; onEdit?: () => void; onRemove?: () => void }) {
  return (
    <div className="group space-y-1 rounded-2xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start gap-2"><span className="text-lg">{e.editionId ? PART_ICON[e.partType ?? ''] ?? '📘' : '📝'}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900">{e.editionId ? e.book : e.title}</p>
          {e.part && <p className="text-xs font-semibold text-violet-700">{e.part}{e.pageFrom ? ` · p. ${e.pageFrom}${e.pageTo && e.pageTo !== e.pageFrom ? `–${e.pageTo}` : ''}` : ''}</p>}
          {e.lesson && <p className="text-xs text-slate-600">{e.lesson}</p>}
        </div>
        {(onEdit || onRemove) && <span className="flex gap-0.5 opacity-60 group-hover:opacity-100 print:hidden">
          {onEdit && <button type="button" onClick={onEdit} className="rounded p-1 hover:bg-slate-100" aria-label="Change"><Pencil className="size-3.5" /></button>}
          {onRemove && <button type="button" onClick={onRemove} className="rounded p-1 text-red-600 hover:bg-red-50" aria-label="Remove"><Trash2 className="size-3.5" /></button>}</span>}</div>
      {e.activity && <p className="whitespace-pre-line text-slate-700" dir="auto">{e.activity}</p>}
      {!!e.resources?.length && <p className="text-xs text-slate-600">🗂️ {e.resources.map((r) => r.title).join(', ')}</p>}
      {e.homework && <p className="text-xs font-semibold text-amber-700">🏠 {e.homework}</p>}
      {e.planId && <a href={`/teacher/plans/${e.planId}`} className="me-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline print:hidden">📝 Lesson plan</a>}
      {e.editionId && e.componentId && e.pageFrom && <a href={`/read/${e.editionId}?component=${e.componentId}&page=${e.pageFrom}`} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline print:hidden"><BookOpen className="size-3.5" />Open the page</a>}
    </div>
  );
}

/** The weekly plan made by hand: days of the week, each with books, parts, lessons, pages and resources. */
export function WeeklyPlanEditor({ plan }: { plan: any | null }) {
  const router = useRouter(); const qc = useQueryClient(); const toast = useToast(); const classes = useMyClasses();
  const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };
  const [h, setH] = useState({ classId: plan?.classId ?? '', weekStart: plan?.weekStart ?? nextMonday(), title: plan?.title ?? '', notes: plan?.notes ?? '' });
  const [entries, setEntries] = useState<Entry[]>(plan?.entries ?? []); const [weekend, setWeekend] = useState((plan?.entries ?? []).some((e: Entry) => e.day > 5));
  const [form, setForm] = useState<{ day: number; index: number | null } | null>(null); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const monday = mondayOf(h.weekStart); const days = weekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
  const put = (e: Entry) => { setEntries(form?.index != null ? entries.map((x, i) => (i === form.index ? e : x)) : [...entries, e]); setForm(null); setDirty(true); };
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...h, classId: h.classId || null, entries: entries.map(({ book: _b, part: _p, partType: _t, lesson: _l, resources: _r, ...x }) => x) };
      const r = plan ? await api.put<any>(`/teacher/weekly-plans/${plan.id}`, body) : await api.post<any>('/teacher/weekly-plans', body);
      setDirty(false); toast('Weekly plan saved'); qc.invalidateQueries({ queryKey: ['weeklyPlans'] });
      if (!plan) router.replace(`/teacher/plans/weekly/${r.id}`);
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const print = () => {
    const cls = classes.data?.find((c: any) => c.id === h.classId);
    const cell = (d: number) => entries.filter((e) => e.day === d).map((e) => `<div class="e"><b>${esc(e.editionId ? e.book ?? '' : e.title)}</b>${e.part ? `<div class="p">${esc(e.part)}${e.pageFrom ? ` · p. ${e.pageFrom}${e.pageTo && e.pageTo !== e.pageFrom ? `–${e.pageTo}` : ''}` : ''}</div>` : ''}${e.lesson ? `<div>${esc(e.lesson)}</div>` : ''}${e.activity ? `<div>${esc(e.activity)}</div>` : ''}${e.resources?.length ? `<div class="r">Resources: ${esc(e.resources.map((r) => r.title).join(', '))}</div>` : ''}${e.homework ? `<div class="hw">Homework: ${esc(e.homework)}</div>` : ''}</div>`).join('') || '<span class="none">—</span>';
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Weekly plan</title><style>body{font:13px system-ui,sans-serif;margin:24px;color:#0f172a}h1{margin:0;font-size:20px}.m{color:#475569;margin:4px 0 14px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;vertical-align:top;padding:8px}th{background:#ede9fe;text-align:left;width:120px}.e{margin-bottom:8px;padding-bottom:6px;border-bottom:1px dashed #e2e8f0}.e:last-child{border:0}.p{color:#6d28d9;font-weight:600}.r{color:#475569;font-size:12px}.hw{color:#b45309;font-weight:600}.none{color:#94a3b8}</style>
      <h1>${esc(h.title || 'Weekly lesson plan')}</h1><div class="m">${esc(cls ? `${cls.name}${cls.section ? ` ${cls.section}` : ''} · ` : '')}Week of ${esc(new Date(`${monday}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
      <table>${days.map((d) => `<tr><th>${DAYS[d - 1]}<br><small>${dayDate(monday, d)}</small></th><td>${cell(d)}</td></tr>`).join('')}</table>${h.notes ? `<p><b>Notes:</b> ${esc(h.notes)}</p>` : ''}<script>print()</script>`);
    w.document.close();
  };
  const field = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-4">
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Title<input value={h.title} onChange={(e) => { setH({ ...h, title: e.target.value }); setDirty(true); }} maxLength={160} placeholder="e.g. Week 12 — Animals" className={field} /></label>
        <label className="text-sm font-medium text-slate-700">Class<select value={h.classId} onChange={(e) => { setH({ ...h, classId: e.target.value }); setDirty(true); }} className={field}><option value="">—</option>{classes.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.section ? ` ${c.section}` : ''}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Week of<input type="date" value={h.weekStart} onChange={(e) => { setH({ ...h, weekStart: e.target.value }); setDirty(true); }} className={field} /></label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-4">Notes for the week<textarea value={h.notes} onChange={(e) => { setH({ ...h, notes: e.target.value }); setDirty(true); }} maxLength={3000} rows={2} className={field} placeholder="Aims, things to bring, reminders…" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={weekend} onChange={(e) => setWeekend(e.target.checked)} />Show Saturday and Sunday</label>
        <span className="flex-1" />
        <button type="button" onClick={print} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"><Printer className="size-4" />Print</button>
        <button type="button" disabled={busy} onClick={save} className={cn('rounded-xl px-5 py-2 text-sm font-bold text-white disabled:opacity-50', dirty || !plan ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-400')}>{busy ? 'Saving…' : dirty || !plan ? '💾 Save the week' : '✓ Saved'}</button>
      </div>
      <div className={cn('grid gap-3', weekend ? 'lg:grid-cols-7' : 'sm:grid-cols-2 lg:grid-cols-5')}>{days.map((d) => (
        <section key={d} className="min-h-40 space-y-2 rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="flex items-baseline justify-between font-extrabold text-slate-900">{DAYS[d - 1]}<span className="text-xs font-semibold text-slate-500">{dayDate(monday, d)}</span></p>
          {entries.map((e, i) => e.day === d && (form?.index === i ? <EntryForm key={i} initial={e} onSave={put} onCancel={() => setForm(null)} />
            : <EntryCard key={i} e={e} onEdit={() => setForm({ day: d, index: i })} onRemove={() => { setEntries(entries.filter((_, j) => j !== i)); setDirty(true); }} />))}
          {form?.day === d && form.index === null ? <EntryForm initial={{ day: d }} onSave={put} onCancel={() => setForm(null)} />
            : <button type="button" onClick={() => setForm({ day: d, index: null })} className="flex w-full items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 py-2 text-sm font-semibold text-slate-500 hover:border-violet-400 hover:text-violet-700"><Plus className="size-4" />Add</button>}
        </section>))}</div>
    </div>
  );
}
