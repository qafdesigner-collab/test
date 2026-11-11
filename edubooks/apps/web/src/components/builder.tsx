'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, BookOpen, Sparkles, ChevronRight, ExternalLink, FileUp, FolderOpen, GraduationCap, Layers, Lock, Pencil, Plus, Recycle, ShieldAlert, Trash2, UploadCloud,
} from 'lucide-react';
import { api, fmtBytes, fmtDate, qs } from '@/lib/api';
import { AUDIENCES, COMPONENT_TYPES, RESOURCE_TYPES } from '@/lib/catalog';
import { Badge, Button, Card, Confirm, Dialog, EmptyState, ErrorBox, Field, Input, Select, Textarea, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

// ---------- types ----------
export interface Lesson { id: string; number: number; title: string; objectives: string; pageStart: number | null; pageEnd: number | null; unitId: string }
export interface Unit { id: string; number: number; title: string; description: string; componentId: string; lessons: Lesson[] }
export interface Component { id: string; type: string; title: string; partNumber: number | null; description: string; pageCount: number | null; units: Unit[]; bookFile: { id: string; name: string; size: number } | null; indexStatus: string; indexedPages: number; indexError: string | null }
export interface Resource {
  id: string; title: string; resourceType: string; audience: string; componentId: string | null; unitId: string | null; lessonId: string | null;
  createdAt: string; sharedWith: number; asset: { id: string; originalName: string; ext: string; sizeBytes: number; scanStatus: string };
}
export interface EditionTree {
  id: string; label: string; editionYear: number; status: string; notes: string; packageId: string; publishedAt: string | null;
  package: { id: string; title: string; status: string; coverColor: string };
  locked: { structure: boolean; all: boolean }; components: Component[]; resources: Resource[];
}
export type Sel = { kind: 'edition' } | { kind: 'component'; id: string } | { kind: 'unit'; id: string } | { kind: 'lesson'; id: string };

/** Mutation that refreshes the builder data and reports errors as toasts. */
export function useBuilderMutation<V>(fn: (v: V) => Promise<unknown>, ok?: string, after?: (r: any) => void) {
  const qc = useQueryClient(); const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      ['edition', 'package', 'packages', 'stats', 'audit'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      if (ok) toast(ok); after?.(r);
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });
}

export async function openAsset(assetId: string, download = false) {
  const w = window.open('', '_blank');
  try {
    const { url } = await api.get(`/assets/${assetId}/link${download ? '?download=1' : ''}`);
    if (w) { w.opener = null; w.location.href = url; } else location.href = url;
  } catch (e) { w?.close(); throw e; }
}

// ---------- helpers ----------
export function scopeLabel(tree: EditionTree, r: Pick<Resource, 'componentId' | 'unitId' | 'lessonId'>) {
  const c = tree.components.find((x) => x.id === r.componentId);
  if (!c) return 'Whole book';
  const u = c.units.find((x) => x.id === r.unitId);
  if (!u) return c.title;
  const l = u.lessons.find((x) => x.id === r.lessonId);
  return l ? `${c.title} › Unit ${u.number} › Lesson ${l.number}` : `${c.title} › Unit ${u.number}`;
}
const isScope = (r: Resource, s: Sel) =>
  s.kind === 'edition' ? !r.componentId : s.kind === 'component' ? r.componentId === s.id && !r.unitId : s.kind === 'unit' ? r.unitId === s.id && !r.lessonId : r.lessonId === s.id;

// ================= Structure tab =================
export function StructureTab({ tree }: { tree: EditionTree }) {
  const [sel, setSel] = useState<Sel>({ kind: 'edition' });
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(tree.components.slice(0, 1).map((c) => [c.id, true])));
  const [addComp, setAddComp] = useState(false);
  const locked = tree.locked.structure;

  const reorder = useBuilderMutation((v: { kind: string; ids: string[] }) => api.post('/publishing/reorder', v));
  const move = (kind: string, list: { id: string }[], i: number, d: -1 | 1) => {
    const ids = list.map((x) => x.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; reorder.mutate({ kind, ids });
  };
  const count = (s: Sel) => tree.resources.filter((r) => isScope(r, s)).length;

  const Row = ({ s, depth, icon, label, sub, actions, toggle, isOpen }: { s: Sel; depth: number; icon: React.ReactNode; label: string; sub?: string; actions?: React.ReactNode; toggle?: () => void; isOpen?: boolean }) => {
    const active = sel.kind === s.kind && (s.kind === 'edition' || (sel as any).id === (s as any).id);
    const n = count(s);
    return (
      <div className={cn('group flex items-center gap-1 rounded-lg pr-1 text-sm', active ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50')} style={{ paddingLeft: depth * 18 }}>
        <button onClick={toggle} className={cn('rounded p-1 text-slate-500', !toggle && 'invisible')} aria-label={isOpen ? 'Collapse' : 'Expand'}>
          <ChevronRight className={cn('size-4 transition-transform', isOpen && 'rotate-90')} />
        </button>
        <button onClick={() => setSel(s)} className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded py-2 text-left">
          {icon}<span className="truncate font-medium">{label}</span>{sub && <span className="truncate text-xs text-slate-600">{sub}</span>}
          {n > 0 && <Badge className="ml-auto">{n}</Badge>}
        </button>
        {!locked && <div className="flex opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">{actions}</div>}
      </div>
    );
  };
  const MoveBtns = ({ kind, list, i }: { kind: string; list: { id: string }[]; i: number }) => (
    <>
      <button className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30" disabled={i === 0} onClick={() => move(kind, list, i, -1)} aria-label="Move up"><ArrowUp className="size-3.5" /></button>
      <button className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30" disabled={i === list.length - 1} onClick={() => move(kind, list, i, 1)} aria-label="Move down"><ArrowDown className="size-3.5" /></button>
    </>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,380px)_1fr]">
      <Card className="h-fit p-3">
        <div className="mb-2 flex items-center justify-between px-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Book structure</span>
          {!locked && <Button size="sm" variant="ghost" onClick={() => setAddComp(true)}><Plus className="size-4" />Component</Button>}</div>
        <Row s={{ kind: 'edition' }} depth={0} icon={<BookOpen className="size-4 text-slate-500" />} label="Whole book" sub={tree.label} />
        {tree.components.map((c, ci) => (
          <div key={c.id}>
            <Row s={{ kind: 'component', id: c.id }} depth={0} isOpen={open[c.id]} toggle={() => setOpen({ ...open, [c.id]: !open[c.id] })}
              icon={<Layers className="size-4 text-brand-500" />} label={c.title} sub={COMPONENT_TYPES[c.type]}
              actions={<MoveBtns kind="component" list={tree.components} i={ci} />} />
            {open[c.id] && c.units.map((u, ui) => (
              <div key={u.id}>
                <Row s={{ kind: 'unit', id: u.id }} depth={1} isOpen={open[u.id] !== false} toggle={() => setOpen({ ...open, [u.id]: open[u.id] === false })}
                  icon={<FolderOpen className="size-4 text-amber-500" />} label={`Unit ${u.number}`} sub={u.title} actions={<MoveBtns kind="unit" list={c.units} i={ui} />} />
                {open[u.id] !== false && u.lessons.map((l, li) => (
                  <Row key={l.id} s={{ kind: 'lesson', id: l.id }} depth={2} icon={<GraduationCap className="size-4 text-emerald-500" />}
                    label={`Lesson ${l.number}`} sub={l.title} actions={<MoveBtns kind="lesson" list={u.lessons} i={li} />} />
                ))}
              </div>
            ))}
            {open[c.id] && c.units.length === 0 && <p className="py-1 pl-12 text-xs text-slate-600">No units yet</p>}
          </div>
        ))}
        {tree.components.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Add the first component, e.g. “Student Book Part 1”.</p>}
      </Card>
      <NodePanel tree={tree} sel={sel} setSel={setSel} onExpand={(id) => setOpen((o) => ({ ...o, [id]: true }))} />
      {addComp && <ComponentDialog editionId={tree.id} onClose={() => setAddComp(false)} />}
    </div>
  );
}

function ComponentDialog({ editionId, comp, onClose, locked }: { editionId: string; comp?: Component; onClose: () => void; locked?: boolean }) {
  const [f, setF] = useState({ type: comp?.type ?? 'STUDENT_BOOK', title: comp?.title ?? '', partNumber: comp?.partNumber ?? '', description: comp?.description ?? '', pageCount: comp?.pageCount ?? '' });
  const m = useBuilderMutation(() => {
    const body = { ...f, partNumber: f.partNumber === '' ? null : Number(f.partNumber), pageCount: f.pageCount === '' ? null : Number(f.pageCount) };
    if (locked) { delete (body as any).type; delete (body as any).partNumber; delete (body as any).pageCount; }
    return comp ? api.patch(`/publishing/components/${comp.id}`, body) : api.post(`/publishing/editions/${editionId}/components`, body);
  }, comp ? 'Component updated' : 'Component added', onClose);
  return (
    <Dialog open onOpenChange={onClose} title={comp ? 'Edit component' : 'Add component'} description="Components are the physical items in the package: book parts, homework book, cards, danglers…">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(undefined); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select disabled={locked} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(COMPONENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Part number" hint="Optional"><Input disabled={locked} type="number" min={1} max={20} value={f.partNumber} onChange={(e) => setF({ ...f, partNumber: e.target.value })} /></Field>
        </div>
        <Field label="Title"><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Student Book Part 1" autoFocus /></Field>
        <Field label="Pages" hint="Optional — used by the digital reader"><Input disabled={locked} type="number" min={1} value={f.pageCount} onChange={(e) => setF({ ...f, pageCount: e.target.value })} /></Field>
        <Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Save</Button></div>
      </form>
    </Dialog>
  );
}

function NodePanel({ tree, sel, setSel, onExpand }: { tree: EditionTree; sel: Sel; setSel: (s: Sel) => void; onExpand: (id: string) => void }) {
  const locked = tree.locked.structure; const readOnly = tree.locked.all;
  const [upload, setUpload] = useState(false); const [editComp, setEditComp] = useState(false); const [confirmDel, setConfirmDel] = useState(false);
  const comp = sel.kind === 'component' ? tree.components.find((c) => c.id === sel.id) : undefined;
  const unit = sel.kind === 'unit' ? tree.components.flatMap((c) => c.units).find((u) => u.id === sel.id) : undefined;
  const lesson = sel.kind === 'lesson' ? tree.components.flatMap((c) => c.units.flatMap((u) => u.lessons)).find((l) => l.id === sel.id) : undefined;
  const resources = tree.resources.filter((r) => isScope(r, sel));

  const [unitTitle, setUnitTitle] = useState(''); const [lessonTitle, setLessonTitle] = useState('');
  const addUnit = useBuilderMutation((t: string) => api.post(`/publishing/components/${comp!.id}/units`, { title: t }), 'Unit added', () => { setUnitTitle(''); onExpand(comp!.id); });
  const addLesson = useBuilderMutation((t: string) => api.post(`/publishing/units/${unit!.id}/lessons`, { title: t }), 'Lesson added', () => setLessonTitle(''));
  const delNode = useBuilderMutation(() => api.del(`/publishing/${sel.kind === 'component' ? 'components' : sel.kind === 'unit' ? 'units' : 'lessons'}/${(sel as any).id}`),
    'Removed', () => { setConfirmDel(false); setSel({ kind: 'edition' }); });

  const stale = (sel.kind === 'component' && !comp) || (sel.kind === 'unit' && !unit) || (sel.kind === 'lesson' && !lesson);
  if (stale) { setTimeout(() => setSel({ kind: 'edition' })); return null; }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        {sel.kind === 'edition' && (
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Whole book</p>
            <h3 className="mt-1 text-lg font-semibold">{tree.package.title} — {tree.label}</h3>
            <p className="mt-1 text-sm text-slate-500">Resources here apply to the whole edition (e.g. a teacher guide PDF or the complete flashcard set). Select a part, unit or lesson on the left to attach resources more precisely.</p></div>
        )}
        {comp && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{COMPONENT_TYPES[comp.type]}{comp.partNumber ? ` · Part ${comp.partNumber}` : ''}</p>
                <h3 className="mt-1 text-lg font-semibold">{comp.title}</h3>
                <p className="text-sm text-slate-500">{comp.units.length} units · {comp.units.reduce((n, u) => n + u.lessons.length, 0)} lessons{comp.pageCount ? ` · ${comp.pageCount} pages` : ''}</p></div>
              {!readOnly && <div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => setEditComp(true)}><Pencil className="size-3.5" />Edit</Button>
                {!locked && <Button size="sm" variant="ghost" onClick={() => setConfirmDel(true)} aria-label="Delete component"><Trash2 className="size-4 text-red-500" /></Button>}</div>}
            </div>
            <BookPdf comp={comp} editionStatus={tree.status} readOnly={readOnly} />
            {!locked && (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (unitTitle.trim()) addUnit.mutate(unitTitle.trim()); }}>
                <Input value={unitTitle} onChange={(e) => setUnitTitle(e.target.value)} placeholder={`New unit title, e.g. “Letters A–E”`} aria-label="New unit title" />
                <Button loading={addUnit.isPending} disabled={!unitTitle.trim()}><Plus className="size-4" />Add unit</Button>
              </form>
            )}
          </div>
        )}
        {unit && <UnitEditor key={unit.id} unit={unit} locked={locked} readOnly={readOnly} onDelete={() => setConfirmDel(true)}>
          {!locked && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (lessonTitle.trim()) addLesson.mutate(lessonTitle.trim()); }}>
              <Input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="New lesson title, e.g. “Letter B”" aria-label="New lesson title" />
              <Button loading={addLesson.isPending} disabled={!lessonTitle.trim()}><Plus className="size-4" />Add lesson</Button>
            </form>
          )}
        </UnitEditor>}
        {lesson && <LessonEditor key={lesson.id} lesson={lesson} locked={locked} readOnly={readOnly} onDelete={() => setConfirmDel(true)} />}
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h4 className="font-semibold text-slate-900">Resources here <span className="text-sm font-normal text-slate-500">({resources.length})</span></h4>
          {!readOnly && <Button size="sm" onClick={() => setUpload(true)}><FileUp className="size-4" />Upload</Button>}
        </div>
        <ResourceList tree={tree} items={resources} showScope={false} />
      </Card>
      {upload && <UploadDialog tree={tree} initial={sel} onClose={() => setUpload(false)} />}
      {editComp && comp && <ComponentDialog editionId={tree.id} comp={comp} locked={locked} onClose={() => setEditComp(false)} />}
      <Confirm open={confirmDel} onOpenChange={setConfirmDel} danger confirmLabel="Remove" loading={delNode.isPending} onConfirm={() => delNode.mutate(undefined)}
        title="Remove this item?" body={<p>Everything inside it (units, lessons) and the resource links attached to it are removed from this draft edition. Uploaded files stay available for other editions.</p>} />
    </div>
  );
}

/** The digital pages of a book part, shown in the reader. Replaceable while the edition is a draft. */
function BookPdf({ comp, editionStatus, readOnly }: { comp: Component; editionStatus: string; readOnly: boolean }) {
  const qc = useQueryClient(); const toast = useToast(); const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const remove = useBuilderMutation(() => api.del(`/publishing/components/${comp.id}/book-pdf`), 'Book PDF removed');
  const canUpload = !readOnly && (editionStatus === 'DRAFT' || !comp.bookFile);
  const upload = async (file?: File) => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file); setPct(0);
    try {
      const r = await api.upload<any>(`/publishing/components/${comp.id}/book-pdf`, fd, setPct);
      toast(`Book PDF attached${r.pages ? ` — ${r.pages} pages` : ''}`);
      ['edition', 'package', 'stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e: any) { toast(e.message, 'err'); } finally { setPct(null); }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm">
      <BookOpen className="size-5 text-slate-500" />
      <div className="min-w-0 flex-1">{comp.bookFile ? <><b>Digital pages:</b> <span className="text-slate-600">{comp.bookFile.name} · {fmtBytes(comp.bookFile.size)}{comp.pageCount ? ` · ${comp.pageCount} pages` : ''}</span></>
        : <span className="text-slate-500">No digital pages yet — upload the PDF of this part for the digital reader.</span>}</div>
      {pct !== null && <span className="text-xs text-slate-600">{pct}%</span>}
      {comp.bookFile && <Button size="sm" variant="ghost" onClick={() => openAsset(comp.bookFile!.id).catch((e) => toast(e.message, 'err'))}><ExternalLink className="size-4" />Open</Button>}
      {canUpload && <><input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        <Button size="sm" variant="secondary" loading={pct !== null} onClick={() => input.current?.click()}><UploadCloud className="size-4" />{comp.bookFile ? 'Replace PDF' : 'Upload PDF'}</Button></>}
      {comp.bookFile && editionStatus === 'DRAFT' && !readOnly && <Button size="sm" variant="ghost" onClick={() => remove.mutate(undefined)} aria-label="Remove book PDF"><Trash2 className="size-4 text-red-500" /></Button>}
      {comp.bookFile && <AiIndexStatus comp={comp} />}
    </div>
  );
}

/** Text index used by the AI assistant: status + manual re-index. Polls while running. */
function AiIndexStatus({ comp }: { comp: Component }) {
  const qc = useQueryClient();
  const reindex = useBuilderMutation(() => api.post(`/ai/index/components/${comp.id}`), 'Text extraction started');
  useEffect(() => {
    if (comp.indexStatus !== 'RUNNING') return;
    const t = setInterval(() => qc.invalidateQueries({ queryKey: ['edition'] }), 2000);
    return () => clearInterval(t);
  }, [comp.indexStatus, qc]);
  const label = { NONE: 'Not indexed for AI', RUNNING: 'Extracting text for AI…', DONE: `AI-ready · ${comp.indexedPages} pages of text`, NO_TEXT: 'No text found (scanned PDF?)', ERROR: 'Text extraction failed' }[comp.indexStatus] ?? comp.indexStatus;
  const tone = comp.indexStatus === 'DONE' ? 'PUBLISHED' : comp.indexStatus === 'RUNNING' ? 'info' : comp.indexStatus === 'NONE' ? 'neutral' : 'danger';
  return (
    <div className="flex w-full items-center gap-2 border-t border-slate-200 pt-2 text-xs">
      <Badge tone={tone}><Sparkles className="size-3" />{label}</Badge>
      {comp.indexError && <span className="truncate text-slate-500" title={comp.indexError}>{comp.indexError}</span>}
      <span className="flex-1" />
      {comp.indexStatus !== 'RUNNING' && <Button size="sm" variant="ghost" onClick={() => reindex.mutate(undefined)} loading={reindex.isPending}>Re-index</Button>}
    </div>
  );
}

function UnitEditor({ unit, locked, readOnly, onDelete, children }: { unit: Unit; locked: boolean; readOnly: boolean; onDelete: () => void; children: React.ReactNode }) {
  const [f, setF] = useState({ number: unit.number, title: unit.title, description: unit.description });
  const save = useBuilderMutation(() => api.patch(`/publishing/units/${unit.id}`, locked ? { title: f.title, description: f.description } : f), 'Unit saved');
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unit</p><h3 className="mt-1 text-lg font-semibold">Unit {unit.number}: {unit.title}</h3></div>
        {!locked && <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete unit"><Trash2 className="size-4 text-red-500" /></Button>}</div>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
        <div className="grid grid-cols-[100px_1fr] gap-3">
          <Field label="Number"><Input type="number" min={0} disabled={locked || readOnly} value={f.number} onChange={(e) => setF({ ...f, number: Number(e.target.value) })} /></Field>
          <Field label="Title"><Input required disabled={readOnly} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} disabled={readOnly} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {!readOnly && <div className="flex justify-end"><Button size="sm" loading={save.isPending}>Save unit</Button></div>}
      </form>
      {children}
      <p className="text-sm text-slate-500">{unit.lessons.length} lesson{unit.lessons.length === 1 ? '' : 's'}</p>
    </div>
  );
}

function LessonEditor({ lesson, locked, readOnly, onDelete }: { lesson: Lesson; locked: boolean; readOnly: boolean; onDelete: () => void }) {
  const [f, setF] = useState({ number: lesson.number, title: lesson.title, objectives: lesson.objectives, pageStart: lesson.pageStart ?? '', pageEnd: lesson.pageEnd ?? '' });
  const save = useBuilderMutation(() => {
    const body: any = { title: f.title, objectives: f.objectives };
    if (!locked) Object.assign(body, { number: f.number, pageStart: f.pageStart === '' ? null : Number(f.pageStart), pageEnd: f.pageEnd === '' ? null : Number(f.pageEnd) });
    return api.patch(`/publishing/lessons/${lesson.id}`, body);
  }, 'Lesson saved');
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lesson</p><h3 className="mt-1 text-lg font-semibold">Lesson {lesson.number}: {lesson.title}</h3></div>
        {!locked && <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete lesson"><Trash2 className="size-4 text-red-500" /></Button>}</div>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
        <div className="grid grid-cols-[100px_1fr] gap-3">
          <Field label="Number"><Input type="number" min={0} disabled={locked || readOnly} value={f.number} onChange={(e) => setF({ ...f, number: Number(e.target.value) })} /></Field>
          <Field label="Title"><Input required disabled={readOnly} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From page"><Input type="number" min={1} disabled={locked || readOnly} value={f.pageStart} onChange={(e) => setF({ ...f, pageStart: e.target.value })} /></Field>
          <Field label="To page"><Input type="number" min={1} disabled={locked || readOnly} value={f.pageEnd} onChange={(e) => setF({ ...f, pageEnd: e.target.value })} /></Field>
        </div>
        <Field label="Learning objectives" hint="Used later by the AI assistant to ground lesson plans."><Textarea rows={3} disabled={readOnly} value={f.objectives} onChange={(e) => setF({ ...f, objectives: e.target.value })} /></Field>
        {!readOnly && <div className="flex justify-end"><Button size="sm" loading={save.isPending}>Save lesson</Button></div>}
      </form>
    </div>
  );
}

// ================= Resources =================
export function ResourceList({ tree, items, showScope = true }: { tree: EditionTree; items: Resource[]; showScope?: boolean }) {
  const toast = useToast(); const readOnly = tree.locked.all;
  const [edit, setEdit] = useState<Resource | null>(null); const [del, setDel] = useState<Resource | null>(null);
  const remove = useBuilderMutation((id: string) => api.del(`/publishing/resources/${id}`), 'Resource removed', () => setDel(null));
  if (!items.length) return <p className="px-5 py-8 text-center text-sm text-slate-500">No resources attached here yet.</p>;
  return (
    <>
      <ul className="divide-y divide-slate-100">
        {items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="grid size-9 place-items-center rounded-lg bg-slate-100 text-[10px] font-bold uppercase text-slate-600">{r.asset.ext}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-slate-800">{r.title}</div>
              <div className="flex flex-wrap gap-x-2 text-xs text-slate-600">
                <span>{RESOURCE_TYPES[r.resourceType]}</span><span>· {fmtBytes(r.asset.sizeBytes)}</span>
                {showScope && <span>· {scopeLabel(tree, r)}</span>}
                {r.sharedWith > 0 && <span className="text-brand-600" title="This file is stored once and reused">· <Recycle className="inline size-3" /> shared ×{r.sharedWith + 1}</span>}
                {r.asset.scanStatus === 'SKIPPED' && <span title="Malware scanner not configured">· not scanned</span>}
              </div>
            </div>
            <Badge tone={r.audience === 'TEACHER' ? 'neutral' : 'info'}>{AUDIENCES[r.audience]}</Badge>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => openAsset(r.asset.id).catch((e) => toast(e.message, 'err'))} aria-label={`Open ${r.title}`}><ExternalLink className="size-4" /></Button>
              {!readOnly && <Button size="sm" variant="ghost" onClick={() => setEdit(r)} aria-label={`Edit ${r.title}`}><Pencil className="size-4" /></Button>}
              {!readOnly && <Button size="sm" variant="ghost" onClick={() => setDel(r)} aria-label={`Remove ${r.title}`}><Trash2 className="size-4 text-red-500" /></Button>}
            </div>
          </li>
        ))}
      </ul>
      {edit && <EditResourceDialog tree={tree} r={edit} onClose={() => setEdit(null)} />}
      <Confirm open={!!del} onOpenChange={() => setDel(null)} title={`Remove “${del?.title}”?`} danger confirmLabel="Remove" loading={remove.isPending}
        onConfirm={() => remove.mutate(del!.id)} body={<p>The link is removed from this edition. The file itself is kept if other editions use it.</p>} />
    </>
  );
}

function ScopeSelect({ tree, value, onChange }: { tree: EditionTree; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="edition">Whole book</option>
      {tree.components.map((c) => (
        <optgroup key={c.id} label={c.title}>
          <option value={`component:${c.id}`}>{c.title} (whole component)</option>
          {c.units.map((u) => [
            <option key={u.id} value={`unit:${u.id}`}>&nbsp;&nbsp;Unit {u.number}: {u.title}</option>,
            ...u.lessons.map((l) => <option key={l.id} value={`lesson:${l.id}`}>&nbsp;&nbsp;&nbsp;&nbsp;Lesson {l.number}: {l.title}</option>),
          ])}
        </optgroup>
      ))}
    </Select>
  );
}
const scopeToBody = (v: string) => {
  const [k, id] = v.split(':');
  return { componentId: k === 'component' ? id : undefined, unitId: k === 'unit' ? id : undefined, lessonId: k === 'lesson' ? id : undefined };
};
const selToScope = (s: Sel) => (s.kind === 'edition' ? 'edition' : `${s.kind}:${s.id}`);
const resToScope = (r: Resource) => (r.lessonId ? `lesson:${r.lessonId}` : r.unitId ? `unit:${r.unitId}` : r.componentId ? `component:${r.componentId}` : 'edition');

function EditResourceDialog({ tree, r, onClose }: { tree: EditionTree; r: Resource; onClose: () => void }) {
  const [f, setF] = useState({ title: r.title, resourceType: r.resourceType, audience: r.audience, scope: resToScope(r) });
  const m = useBuilderMutation(() => {
    const s = scopeToBody(f.scope);
    return api.patch(`/publishing/resources/${r.id}`, { title: f.title, resourceType: f.resourceType, audience: f.audience, componentId: s.componentId ?? null, unitId: s.unitId ?? null, lessonId: s.lessonId ?? null });
  }, 'Resource updated', onClose);
  return (
    <Dialog open onOpenChange={onClose} title="Edit resource" description={r.asset.originalName}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(undefined); }}>
        <Field label="Title"><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select value={f.resourceType} onChange={(e) => setF({ ...f, resourceType: e.target.value })}>{Object.entries(RESOURCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Visible to"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{Object.entries(AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <Field label="Attached to"><ScopeSelect tree={tree} value={f.scope} onChange={(scope) => setF({ ...f, scope })} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Save</Button></div>
      </form>
    </Dialog>
  );
}

export function UploadDialog({ tree, initial, onClose }: { tree: EditionTree; initial: Sel; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [files, setFiles] = useState<File[]>([]); const [drag, setDrag] = useState(false);
  const [f, setF] = useState({ scope: selToScope(initial), resourceType: '', audience: 'TEACHER', title: '' });
  const [pct, setPct] = useState<number | null>(null); const [error, setError] = useState<unknown>(null);
  const input = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => list && setFiles((x) => [...x, ...Array.from(list)].slice(0, 20));
  const submit = async () => {
    setError(null); setPct(0);
    const fd = new FormData();
    const s = scopeToBody(f.scope);
    Object.entries({ ...s, resourceType: f.resourceType || undefined, audience: f.audience, title: files.length === 1 ? f.title || undefined : undefined })
      .forEach(([k, v]) => v && fd.append(k, v));
    files.forEach((file) => fd.append('files', file));
    try {
      const r = await api.upload<any[]>(`/publishing/editions/${tree.id}/resources`, fd, setPct);
      const reused = r.filter((x) => x.reusedExistingFile).length;
      toast(`${r.length} resource${r.length === 1 ? '' : 's'} attached${reused ? ` (${reused} existing file${reused === 1 ? '' : 's'} reused — no duplicate storage)` : ''}`);
      ['edition', 'package', 'packages', 'stats', 'audit'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    } catch (e) { setError(e); setPct(null); }
  };
  return (
    <Dialog open onOpenChange={onClose} title="Upload teaching resources" description="PDF, PowerPoint, Word, Excel, HTML5, images, audio and video. Up to 20 files at once." wide>
      <div className="space-y-4">
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
          className={cn('flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center', drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300')}>
          <UploadCloud className="size-8 text-slate-500" />
          <p className="mt-2 text-sm text-slate-600">Drag files here or <button type="button" className="font-medium text-brand-600 underline" onClick={() => input.current?.click()}>browse</button></p>
          <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }}
            accept=".pdf,.ppt,.pptx,.ppsx,.doc,.docx,.xls,.xlsx,.html,.htm,.zip,.png,.jpg,.jpeg,.gif,.webp,.svg,.mp3,.wav,.m4a,.mp4,.webm,.txt" />
        </div>
        {files.length > 0 && (
          <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-sm">
            {files.map((file, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2"><span className="truncate">{file.name}</span>
                <span className="flex items-center gap-2 text-xs text-slate-600">{fmtBytes(file.size)}
                  <button aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button></span></li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Attach to" className="sm:col-span-2"><ScopeSelect tree={tree} value={f.scope} onChange={(scope) => setF({ ...f, scope })} /></Field>
          <Field label="Type" hint="Auto-detected from the file if left empty"><Select value={f.resourceType} onChange={(e) => setF({ ...f, resourceType: e.target.value })}>
            <option value="">Detect automatically</option>{Object.entries(RESOURCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Visible to"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{Object.entries(AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          {files.length === 1 && <Field label="Title" hint="Defaults to the file name" className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>}
        </div>
        {pct !== null && <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct}><div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} /></div>}
        {error ? <ErrorBox error={error} /> : null}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!files.length} loading={pct !== null}><UploadCloud className="size-4" />Upload {files.length || ''} file{files.length === 1 ? '' : 's'}</Button></div>
      </div>
    </Dialog>
  );
}

export function ResourcesTab({ tree }: { tree: EditionTree }) {
  const [filter, setFilter] = useState({ type: '', audience: '', q: '' }); const [upload, setUpload] = useState(false);
  const items = useMemo(() => tree.resources.filter((r) => (!filter.type || r.resourceType === filter.type) && (!filter.audience || r.audience === filter.audience)
    && (!filter.q || r.title.toLowerCase().includes(filter.q.toLowerCase()))), [tree.resources, filter]);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <Input className="max-w-xs" placeholder="Search resources…" aria-label="Search resources" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <Select className="w-44" aria-label="Type" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}><option value="">All types</option>{Object.entries(RESOURCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select className="w-48" aria-label="Audience" value={filter.audience} onChange={(e) => setFilter({ ...filter, audience: e.target.value })}><option value="">Any audience</option>{Object.entries(AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <div className="flex-1" />
        {!tree.locked.all && <Button onClick={() => setUpload(true)}><FileUp className="size-4" />Upload resources</Button>}
      </div>
      {tree.resources.length === 0 ? <div className="p-6"><EmptyState icon={<FileUp className="size-10" />} title="No resources yet">Upload PPTs, PDFs, Word files, HTML activities, audio or video.</EmptyState></div>
        : <ResourceList tree={tree} items={items} />}
      {upload && <UploadDialog tree={tree} initial={{ kind: 'edition' }} onClose={() => setUpload(false)} />}
    </Card>
  );
}

export function HistoryTab({ packageId, editionId }: { packageId: string; editionId: string }) {
  const pkg = useQuery({ queryKey: ['audit', 'pkg', packageId], queryFn: () => api.get(`/audit${qs({ entityType: 'book_package', entityId: packageId, pageSize: 50 })}`) });
  const ed = useQuery({ queryKey: ['audit', 'ed', editionId], queryFn: () => api.get(`/audit${qs({ entityType: 'book_edition', entityId: editionId, pageSize: 50 })}`) });
  const items = [...(pkg.data?.items ?? []), ...(ed.data?.items ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return (
    <Card>
      <ul className="divide-y divide-slate-100 text-sm">
        {items.map((a) => <li key={a.id} className="flex flex-wrap justify-between gap-2 px-5 py-3"><span className="text-slate-800">{a.summary}</span><span className="text-xs text-slate-600">{a.actor} · {fmtDate(a.createdAt)}</span></li>)}
        {!items.length && <li className="px-5 py-8 text-center text-slate-500">No history yet.</li>}
      </ul>
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-600">Changes to individual parts, units, lessons and resources are listed in the full <a className="text-brand-600 underline" href="/admin/audit">Audit Log</a>.</p>
    </Card>
  );
}

export function LockBanner({ tree }: { tree: EditionTree }) {
  if (tree.locked.all) return <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-700"><ShieldAlert className="size-5 shrink-0" />This {tree.package.status === 'ARCHIVED' ? 'package' : 'edition'} is archived and read-only.</div>;
  if (tree.locked.structure) return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      <Lock className="size-5 shrink-0" /><div><b>Published — structure locked.</b> Schools may hold licences for this edition, so parts, units, lessons and page ranges can’t change. You can still fix titles and objectives, and attach or update resources. To restructure, create a new edition.</div>
    </div>
  );
  return null;
}
