'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ListChecks, Plus, Printer, Save, Share2, Trash2 } from 'lucide-react';
import { api, downloadCsv, fmtDay } from '@/lib/api';
import { useBook, useMyBooks } from '@/lib/lms';
import { usePrintBrand } from '@/lib/branding';
import { CHECK_SCALES, printChecklists } from '@/lib/print-docs';
import { Badge, Button, Card, Confirm, Dialog, EmptyState, ErrorBox, Field, Input, PageLoader, Select, Textarea, cn } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/lib/session';

type Item = { id?: string; area: string; label: string };

/** Lines typed one per line; "Area: criterion" puts the line under that area. */
const parseLines = (t: string): Item[] => t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const m = /^([^:]{2,60}):\s*(.+)$/.exec(l); return m ? { area: m[1].trim(), label: m[2].trim() } : { area: '', label: l };
});
const toLines = (items: Item[]) => items.map((i) => (i.area ? `${i.area}: ${i.label}` : i.label)).join('\n');

/** Teacher / school admin: the checklists of their classes, and "New checklist". */
export function ChecklistsList({ base, classes }: { base: string; classes: { id: string; label: string }[] }) {
  const [classId, setClassId] = useState(''); const [create, setCreate] = useState(false);
  const q = useQuery({ queryKey: ['checklists', classId], queryFn: () => api.get<any[]>(`/checklists${classId ? `?classId=${classId}` : ''}`) });
  return (
    <div className="space-y-6">
      <PageHeader title="Checklists" sub="Evaluate students skill by skill: tick each student as achieved, developing or not yet, add a comment, print reports and share them with students and parents.">
        <Button onClick={() => setCreate(true)} disabled={!classes.length}><Plus className="size-4" />New checklist</Button>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-slate-600">Class</span>
        <Select className="h-9 w-64" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">All my classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></div>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : !q.data.length
        ? <EmptyState icon={<ListChecks className="size-8 text-slate-400" />} title="No checklists yet">Start one from a ready-made list (language, maths, motor skills, behaviour…), from a unit of your book, or type your own skills.</EmptyState>
        : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{q.data.map((c) => (
          <Link key={c.id} href={`${base}/${c.id}`} className="focus-ring rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow">
            <div className="flex items-start justify-between gap-2"><p className="font-semibold text-slate-900">{c.title}</p>{c.shared ? <Badge tone="PUBLISHED">Shared</Badge> : <Badge>Not shared</Badge>}</div>
            <p className="mt-1 text-sm text-slate-500">{c.className}{c.section ? ` ${c.section}` : ''}{c.term ? ` · ${c.term}` : ''} · {c.itemCount} skills · {CHECK_SCALES[c.scale]?.name}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.students ? Math.round((c.marked / c.students) * 100) : 0}%` }} /></div>
            <p className="mt-1 text-xs text-slate-500">{c.marked} of {c.students} students marked · updated {fmtDay(c.updatedAt)}</p>
          </Link>))}</div>}
      {create && <NewChecklistDialog base={base} classes={classes} initialClass={classId} onClose={() => setCreate(false)} />}
    </div>
  );
}

function NewChecklistDialog({ base, classes, initialClass, onClose }: { base: string; classes: { id: string; label: string }[]; initialClass: string; onClose: () => void }) {
  const router = useRouter(); const toast = useToast();
  const [f, setF] = useState({ classId: initialClass || classes[0]?.id || '', title: '', term: '', scale: 'THREE', source: 'template', template: '', editionId: '', unitId: '', lines: '' });
  const templates = useQuery({ queryKey: ['checklistTemplates'], queryFn: () => api.get<any[]>('/checklists/templates') });
  const books = useMyBooks(); const book = useBook(f.editionId || undefined);
  const units: any[] = (book.data?.components ?? []).flatMap((c: any) => c.units.map((u: any) => ({ ...u, part: c.title })));
  const [busy, setBusy] = useState(false);
  const pickTemplate = (id: string) => { const t = templates.data?.find((x) => x.id === id); setF((s) => ({ ...s, template: id, title: s.title || (t ? t.title : ''), lines: t ? toLines(t.items) : s.lines })); };
  const pickUnit = async (id: string) => {
    setF((s) => ({ ...s, unitId: id })); if (!id) return;
    try { const r = await api.get<any>(`/checklists/from-unit/${id}`); setF((s) => ({ ...s, unitId: id, title: s.title || r.title, lines: toLines(r.items) })); } catch (e: any) { toast(e.message, 'err'); }
  };
  const items = parseLines(f.lines);
  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<any>('/checklists', { classId: f.classId, title: f.title.trim(), term: f.term.trim(), scale: f.scale, items, editionId: f.editionId || undefined, unitId: f.unitId || undefined });
      router.push(`${base}/${r.id}`);
    } catch (e: any) { toast(e.message, 'err'); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose} title="New checklist" description="Choose where the skills come from — you can change every line." wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Class"><Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>{classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
          <Field label="Term / period" hint="Optional"><Input value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} placeholder="Term 1" /></Field>
          <Field label="Scale"><Select value={f.scale} onChange={(e) => setF({ ...f, scale: e.target.value })}>
            {Object.entries(CHECK_SCALES).map(([k, s]) => <option key={k} value={k}>{s.name}: {s.levels.map((l) => `${l.icon} ${l.label}`).join(' · ')}</option>)}</Select></Field>
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Start from">
          {[['template', '📋 Ready-made list'], ['book', '📖 A unit of my book'], ['blank', '✏️ My own skills']].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={f.source === k} onClick={() => setF({ ...f, source: k })}
              className={cn('rounded-full px-3 py-1.5 text-sm font-semibold ring-1', f.source === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-200')}>{l}</button>))}
        </div>
        {f.source === 'template' && <div className="flex flex-wrap gap-2">{(templates.data ?? []).map((t) => (
          <button key={t.id} type="button" onClick={() => pickTemplate(t.id)} className={cn('rounded-lg border px-3 py-2 text-left text-sm', f.template === t.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50')}>
            <b className="block">{t.title}</b><span className="text-xs text-slate-500">{t.items.length} skills</span></button>))}</div>}
        {f.source === 'book' && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Book"><Select value={f.editionId} onChange={(e) => setF({ ...f, editionId: e.target.value, unitId: '' })}><option value="">Choose a book…</option>{(books.data ?? []).map((b) => <option key={b.editionId} value={b.editionId}>{b.title}</option>)}</Select></Field>
          <Field label="Unit"><Select value={f.unitId} disabled={!f.editionId} onChange={(e) => pickUnit(e.target.value)}><option value="">Choose a unit…</option>{units.map((u) => <option key={u.id} value={u.id}>{u.part} — Unit {u.number}: {u.title}</option>)}</Select></Field>
        </div>}
        <Field label="Title"><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Term 1 — Language skills" /></Field>
        <Field label={`Skills / criteria (${items.length})`} hint="One per line. Write “Area: skill” to group lines, e.g. “Reading: Knows the letter sounds”.">
          <Textarea rows={9} value={f.lines} onChange={(e) => setF({ ...f, lines: e.target.value })} placeholder={'Reading: Recognises the letters of the alphabet\nReading: Knows the sound of each letter\nWriting: Writes own name'} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!f.classId || !f.title.trim() || !items.length}>Create and start marking</Button></div>
      </form>
    </Dialog>
  );
}

/** Marking grid: one row per student, one column per skill. Tap a cell to go through the levels. */
export function ChecklistEditor({ id, back }: { id: string; back: string }) {
  const qc = useQueryClient(); const toast = useToast(); const router = useRouter(); const brand = usePrintBrand(); const me = useMe().data as any;
  const q = useQuery({ queryKey: ['checklist', id], queryFn: () => api.get<any>(`/checklists/${id}`) });
  const [marks, setMarks] = useState<Record<string, Record<string, number>>>({}); const [comments, setComments] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set()); const [saving, setSaving] = useState(false);
  const [editItems, setEditItems] = useState(false); const [del, setDel] = useState(false); const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data) return;
    setMarks(Object.fromEntries(q.data.roster.map((r: any) => [r.id, { ...r.marks }]))); setComments(Object.fromEntries(q.data.roster.map((r: any) => [r.id, r.comment])));
    setDirty(new Set());
  }, [q.data]);
  useEffect(() => { // do not lose marks when leaving the page
    if (!dirty.size) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty.size]);
  const d = q.data; const scale = CHECK_SCALES[d?.scale ?? 'THREE'] ?? CHECK_SCALES.THREE;
  const order = useMemo(() => [...scale.levels].sort((a, b) => b.v - a.v), [scale]);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!d) return <PageLoader />;
  const touch = (sid: string) => setDirty((s) => new Set(s).add(sid));
  const cycle = (sid: string, itemId: string) => {
    const cur = marks[sid]?.[itemId]; const i = order.findIndex((l) => l.v === cur);
    const next = i === -1 ? order[0].v : i === order.length - 1 ? undefined : order[i + 1].v;
    setMarks((m) => { const x = { ...(m[sid] ?? {}) }; if (next === undefined) delete x[itemId]; else x[itemId] = next; return { ...m, [sid]: x }; }); touch(sid);
  };
  const setColumn = (itemId: string, v: number) => { setMarks((m) => Object.fromEntries(d.roster.map((r: any) => [r.id, { ...(m[r.id] ?? {}), [itemId]: v }]))); setDirty(new Set(d.roster.map((r: any) => r.id))); };
  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/checklists/${id}/marks`, { students: [...dirty].map((sid) => ({ studentId: sid, marks: marks[sid] ?? {}, comment: comments[sid] ?? '' })) });
      toast('Marks saved'); setDirty(new Set()); qc.invalidateQueries({ queryKey: ['checklists'] });
    } catch (e: any) { toast(e.message, 'err'); } finally { setSaving(false); }
  };
  const share = async (shared: boolean) => { try { await api.patch(`/checklists/${id}`, { shared }); qc.invalidateQueries({ queryKey: ['checklist', id] }); toast(shared ? 'Shared — students and parents can see their own results' : 'No longer shared'); } catch (e: any) { toast(e.message, 'err'); } };
  const remove = async () => { try { await api.del(`/checklists/${id}`); qc.invalidateQueries({ queryKey: ['checklists'] }); router.push(back); } catch (e: any) { toast(e.message, 'err'); } };
  const printData = (only?: string) => ({ title: d.title, term: d.term, scale: d.scale, className: d.className, year: d.year, teacher: me?.displayName ?? me?.user?.displayName, school: brand.name, items: d.items,
    students: d.roster.filter((r: any) => !only || r.id === only).map((r: any) => ({ name: r.displayName, username: r.username, marks: marks[r.id] ?? {}, comment: comments[r.id] ?? '' })) });
  const csv = () => downloadCsv(`${d.title.replace(/[^\w -]+/g, '')}.csv`, d.roster.map((r: any) => ({ student: r.displayName, login: r.username,
    ...Object.fromEntries(d.items.map((it: any) => [it.label.slice(0, 60), scale.levels.find((l) => l.v === marks[r.id]?.[it.id])?.label ?? ''])), comment: comments[r.id] ?? '' })));
  const done = (sid: string) => d.items.filter((it: any) => marks[sid]?.[it.id]).length;
  let lastArea = '';
  return (
    <div className="space-y-4">
      <Link href={back} className="text-sm text-slate-500 hover:text-slate-800">← Checklists</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-slate-900">{d.title}</h1>
          <p className="text-sm text-slate-500">{d.className}{d.term ? ` · ${d.term}` : ''} · {d.items.length} skills · {d.roster.length} students {d.shared ? <Badge tone="PUBLISHED">Shared with students & parents</Badge> : <Badge>Not shared yet</Badge>}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} loading={saving} disabled={!dirty.size}><Save className="size-4" />{dirty.size ? `Save (${dirty.size})` : 'Saved'}</Button>
          <Button variant="secondary" onClick={() => share(!d.shared)}><Share2 className="size-4" />{d.shared ? 'Stop sharing' : 'Share with students & parents'}</Button>
          <Button variant="secondary" onClick={() => printChecklists(printData(), brand, 'students')}><Printer className="size-4" />Student reports</Button>
          <Button variant="secondary" onClick={() => printChecklists(printData(), brand, 'class')}><Printer className="size-4" />Class sheet</Button>
          <Button variant="ghost" onClick={csv}>Excel / CSV</Button>
          <Button variant="ghost" onClick={() => setEditItems(true)}>Edit skills</Button>
          <Button variant="ghost" onClick={() => setDel(true)} aria-label="Delete checklist"><Trash2 className="size-4 text-red-500" /></Button>
        </div>
      </div>
      <Card className="p-3 text-sm text-slate-600">Tap a box to change it: {order.map((l) => <span key={l.v} className="mx-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: l.bg, color: l.color }}>{l.icon} {l.label}</span>)} → empty. Use the buttons under a skill to mark the whole class at once, then change only the exceptions.</Card>
      {!d.roster.length ? <EmptyState title="No students in this class yet" /> : (
        <Card className="overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr>
                <th className="sticky left-0 z-20 min-w-48 border-b border-slate-200 bg-white p-2 text-left align-bottom">Student</th>
                {d.items.map((it: any) => {
                  const showArea = it.area && it.area !== lastArea; lastArea = it.area || lastArea;
                  return (
                    <th key={it.id} className="min-w-24 max-w-40 border-b border-l border-slate-100 p-2 text-left align-bottom font-medium">
                      {showArea && <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-brand-700">{it.area}</span>}
                      <span className="block text-xs leading-snug text-slate-800">{it.label}</span>
                      <span className="mt-1 flex gap-0.5">{order.map((l) => <button key={l.v} type="button" title={`Everyone: ${l.label}`} aria-label={`Mark everyone ${l.label} for ${it.label}`} onClick={() => setColumn(it.id, l.v)} className="rounded px-1 text-xs hover:bg-slate-100">{l.icon}</button>)}</span>
                    </th>);
                })}
                <th className="min-w-56 border-b border-l border-slate-100 p-2 text-left align-bottom">Comment</th>
              </tr>
            </thead>
            <tbody>
              {d.roster.map((r: any) => (
                <tr key={r.id} className={cn('border-b border-slate-100', focus === r.id && 'bg-brand-50/40')}>
                  <td className="sticky left-0 z-[1] bg-white p-2">
                    <p className="font-medium text-slate-900">{r.displayName}</p>
                    <p className="text-xs text-slate-500">{done(r.id)}/{d.items.length} marked · <button type="button" className="text-brand-700 hover:underline" onClick={() => printChecklists(printData(r.id), brand, 'students')}>report</button></p>
                  </td>
                  {d.items.map((it: any) => {
                    const l = scale.levels.find((x) => x.v === marks[r.id]?.[it.id]);
                    return (
                      <td key={it.id} className="border-l border-slate-100 p-1 text-center">
                        <button type="button" onClick={() => cycle(r.id, it.id)} onFocus={() => setFocus(r.id)} aria-label={`${r.displayName} — ${it.label}: ${l?.label ?? 'not marked'}`}
                          className="focus-ring h-10 w-full min-w-12 rounded-lg border text-lg transition" style={l ? { background: l.bg, borderColor: l.bg } : { borderColor: '#e2e8f0', borderStyle: 'dashed' }}>{l?.icon ?? ''}</button>
                      </td>);
                  })}
                  <td className="border-l border-slate-100 p-1"><Textarea rows={2} className="min-w-56 text-sm" value={comments[r.id] ?? ''} onFocus={() => setFocus(r.id)} onChange={(e) => { setComments((c) => ({ ...c, [r.id]: e.target.value })); touch(r.id); }} placeholder="Comment (optional)" aria-label={`Comment for ${r.displayName}`} /></td>
                </tr>))}
            </tbody>
          </table>
        </Card>)}
      {dirty.size > 0 && <div className="sticky bottom-3 z-20 flex justify-center"><Button onClick={save} loading={saving} className="shadow-lg"><Save className="size-4" />Save changes for {dirty.size} student{dirty.size === 1 ? '' : 's'}</Button></div>}
      {editItems && <EditItemsDialog c={d} onClose={() => setEditItems(false)} />}
      <Confirm open={del} onOpenChange={setDel} danger title="Delete this checklist?" confirmLabel="Delete" onConfirm={remove} body="All marks and comments of this checklist are deleted." />
    </div>
  );
}

function EditItemsDialog({ c, onClose }: { c: any; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ title: c.title, term: c.term, scale: c.scale }); const [items, setItems] = useState<Item[]>(c.items);
  const [busy, setBusy] = useState(false);
  const move = (i: number, dd: -1 | 1) => { const j = i + dd; if (j < 0 || j >= items.length) return; const x = [...items]; [x[i], x[j]] = [x[j], x[i]]; setItems(x); };
  const save = async () => {
    setBusy(true);
    try { await api.patch(`/checklists/${c.id}`, { ...f, items: items.filter((i) => i.label.trim()) }); qc.invalidateQueries({ queryKey: ['checklist', c.id] }); toast('Checklist updated'); onClose(); }
    catch (e: any) { toast(e.message, 'err'); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose} title="Edit checklist" description="Marks stay with each skill. A removed skill's marks are no longer shown." wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Term"><Input value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} /></Field>
        </div>
        <Field label="Scale" hint="Changing the scale keeps marks that still fit it."><Select value={f.scale} onChange={(e) => setF({ ...f, scale: e.target.value })}>
          {Object.entries(CHECK_SCALES).map(([k, s]) => <option key={k} value={k}>{s.name}: {s.levels.map((l) => `${l.icon} ${l.label}`).join(' · ')}</option>)}</Select></Field>
        <ul className="max-h-80 space-y-1.5 overflow-y-auto">{items.map((it, i) => (
          <li key={it.id ?? i} className="flex items-center gap-1.5">
            <Input className="w-36" value={it.area} placeholder="Area" aria-label="Area" onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, area: e.target.value } : x)))} />
            <Input className="flex-1" value={it.label} aria-label="Skill" onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
            <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="size-4" /></button>
            <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="size-4" /></button>
            <button type="button" className="rounded p-1 text-red-500 hover:bg-red-50" onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label="Remove skill"><Trash2 className="size-4" /></button>
          </li>))}</ul>
        <Button variant="secondary" size="sm" onClick={() => setItems([...items, { area: items[items.length - 1]?.area ?? '', label: '' }])}><Plus className="size-4" />Add skill</Button>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save} disabled={!items.some((i) => i.label.trim()) || !f.title.trim()}>Save</Button></div>
      </div>
    </Dialog>
  );
}

/** Students and parents: the shared checklists with the levels reached. */
export function MyChecklists({ items, name }: { items: any[]; name?: string }) {
  const brand = usePrintBrand();
  if (!items.length) return null;
  return (
    <div className="space-y-3">
      {items.map((c) => {
        const scale = CHECK_SCALES[c.scale] ?? CHECK_SCALES.THREE; const marks = c.marks ?? {}; let area = '';
        return (
          <Card key={c.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-semibold text-slate-900">✅ {c.title}</p><p className="text-xs text-slate-500">{c.className}{c.section ? ` ${c.section}` : ''}{c.term ? ` · ${c.term}` : ''}{c.teacher ? ` · ${c.teacher}` : ''} · {fmtDay(c.updatedAt)}</p></div>
              {name && <Button size="sm" variant="ghost" onClick={() => printChecklists({ title: c.title, term: c.term, scale: c.scale, className: `${c.className}${c.section ? ` ${c.section}` : ''}`, teacher: c.teacher, school: brand.name, items: c.items, students: [{ name, marks, comment: c.comment ?? '' }] }, brand, 'students')}><Printer className="size-4" />Print</Button>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">{scale.levels.map((l) => <span key={l.v} className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: l.bg, color: l.color }}>{l.icon} {c.items.filter((it: any) => marks[it.id] === l.v).length} {l.label}</span>)}</div>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">{c.items.map((it: any) => {
              const l = scale.levels.find((x) => x.v === marks[it.id]); const head = it.area && it.area !== area ? it.area : null; area = it.area || area;
              return (<li key={it.id} className="py-1.5">{head && <p className="pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-brand-700">{head}</p>}
                <div className="flex items-center justify-between gap-3"><span className="text-slate-800">{it.label}</span>
                  {l ? <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: l.bg, color: l.color }}>{l.icon} {l.label}</span> : <span className="text-xs text-slate-400">—</span>}</div></li>);
            })}</ul>
            {c.comment && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><b>Teacher’s comment:</b> {c.comment}</p>}
          </Card>);
      })}
    </div>
  );
}
