'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, School } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { byStage } from '@/lib/catalog';
import { Button, Dialog, EmptyState, Field, Input, PageLoader, Select } from '@/components/ui';
import { PageHeader, Table, Td } from '@/components/common';

export default function SchoolClasses() {
  const overview = useQuery({ queryKey: ['schoolOverview'], queryFn: () => api.get('/school/overview') });
  const [ay, setAy] = useState('');
  const years = overview.data?.academicYears ?? [];
  const year = ay || years.find((y: any) => new Date(y.startsOn) <= new Date() && new Date(y.endsOn) > new Date())?.id || years[0]?.id || '';
  const q = useQuery({ queryKey: ['classes', 'school', year], queryFn: () => api.get(`/classes?academicYearId=${year}`), enabled: !!year });
  const [add, setAdd] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader title="Classes" sub="Grades, classes and sections for each academic year. Assign teachers and enrol students.">
        <Select className="w-44" aria-label="Academic year" value={year} onChange={(e) => setAy(e.target.value)}>{years.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select>
        <Button onClick={() => setAdd(true)} disabled={!year}><Plus className="size-4" />New class</Button>
      </PageHeader>
      {!years.length && overview.data ? <EmptyState icon={<School className="size-10" />} title="No academic year yet">Your publisher sets up academic years for your school.</EmptyState>
        : !q.data ? <PageLoader /> : !q.data.length ? <EmptyState icon={<School className="size-10" />} title="No classes for this year">Create e.g. “KG — Rose”.</EmptyState> : (
          <Table head={['Class', 'Section', 'Grade', 'Teachers', 'Students']}>
            {q.data.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-50"><Td><Link href={`/school/classes/${c.id}`} className="font-medium hover:text-emerald-700">{c.name}</Link></Td><Td>{c.section || '—'}</Td><Td>{c.gradeName ?? '—'}</Td>
                <Td className="text-slate-600">{c.teachers.map((t: any) => `${t.displayName}${t.subject ? ` (${t.subject})` : ''}`).join(', ') || <span className="text-amber-600">none yet</span>}</Td><Td>{c.students}</Td></tr>))}
          </Table>
        )}
      {add && <NewClass yearId={year} onClose={() => setAdd(false)} />}
    </div>
  );
}

const SECTION_IDEAS = ['A', 'B', 'C', 'D', 'E', 'F', 'Red', 'Blue', 'Green', 'Yellow', 'Rose', 'Lily', 'Tulip', 'Jasmine'];

function NewClass({ yearId, onClose }: { yearId: string; onClose: () => void }) {
  const opts = useQuery({ queryKey: ['classOptions'], queryFn: () => api.get('/classes/options') });
  const [f, setF] = useState({ name: '', section: '', gradeId: '' });
  const [many, setMany] = useState(false); const [sections, setSections] = useState('A, B, C');
  const grades: any[] = opts.data?.grades ?? [];
  const mine = grades.filter((g) => g.isSchoolCurriculum);
  const others = grades.filter((g) => !g.isSchoolCurriculum);
  const groups = (list: any[], prefix = '') => byStage(list.map((g) => ({ ...g, stage: `${prefix}${g.stage || 'Grades'}` })));
  const list = many ? sections.split(',').map((x) => x.trim()).filter(Boolean) : [f.section.trim()];
  const m = useAction(async () => {
    for (const section of list) await api.post('/classes', { ...f, section, gradeId: f.gradeId || undefined, academicYearId: yearId });
    return list.length;
  }, { ok: (n: number) => (n > 1 ? `${n} classes created` : 'Class created'), keys: ['classes'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title="New class">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Grade" hint={mine.length ? `${mine[0].curriculumName} (your school's curriculum) is listed first` : 'Tip: your publisher can set your school\'s curriculum so only its grades are shown first'}>
          <Select value={f.gradeId} onChange={(e) => setF({ ...f, gradeId: e.target.value, name: f.name || grades.find((g) => g.id === e.target.value)?.name || '' })}>
            <option value="">—</option>
            {groups(mine).map((s, i) => <optgroup key={`m${i}`} label={s.stage}>{s.items.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>)}
            {groups(others).map((s, i) => <optgroup key={`o${i}`} label={`${s.items[0].curriculumName} · ${s.items[0].stage}`}>{s.items.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>)}
          </Select></Field>
        <Field label="Class name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Grade 1" /></Field>
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={!many} onChange={() => setMany(false)} />One section</label>
            <label className="flex items-center gap-2"><input type="radio" checked={many} onChange={() => setMany(true)} />Several sections at once</label>
          </div>
          {!many ? (
            <Field label="Section"><Input list="section-ideas" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} placeholder="A" />
              <datalist id="section-ideas">{SECTION_IDEAS.map((x) => <option key={x} value={x} />)}</datalist></Field>
          ) : (
            <Field label="Sections (separated by commas)" hint={list.length ? `Creates ${list.map((x) => `${f.name || 'Class'} — ${x}`).join(', ')}` : undefined}>
              <Input value={sections} onChange={(e) => setSections(e.target.value)} placeholder="A, B, C" /></Field>
          )}
          <div className="flex flex-wrap gap-1.5">{SECTION_IDEAS.slice(0, 6).map((x) => (
            <button key={x} type="button" className="rounded-md border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-50"
              onClick={() => (many ? setSections(sections ? `${sections}, ${x}` : x) : setF({ ...f, section: x }))}>{x}</button>))}</div>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={many && !list.length}>{many && list.length > 1 ? `Create ${list.length} classes` : 'Create'}</Button></div>
      </form>
    </Dialog>
  );
}
