'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, School } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { className } from '@/lib/lms';
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
          <Table head={['Class', 'Grade', 'Teachers', 'Students']}>
            {q.data.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-50"><Td><Link href={`/school/classes/${c.id}`} className="font-medium hover:text-emerald-700">{className(c)}</Link></Td><Td>{c.gradeName ?? '—'}</Td>
                <Td className="text-slate-600">{c.teachers.map((t: any) => `${t.displayName}${t.subject ? ` (${t.subject})` : ''}`).join(', ') || <span className="text-amber-600">none yet</span>}</Td><Td>{c.students}</Td></tr>))}
          </Table>
        )}
      {add && <NewClass yearId={year} onClose={() => setAdd(false)} />}
    </div>
  );
}

function NewClass({ yearId, onClose }: { yearId: string; onClose: () => void }) {
  const opts = useQuery({ queryKey: ['classOptions'], queryFn: () => api.get('/classes/options') });
  const [f, setF] = useState({ name: '', section: '', gradeId: '' });
  const m = useAction(() => api.post('/classes', { ...f, gradeId: f.gradeId || undefined, academicYearId: yearId }), { ok: 'Class created', keys: ['classes'], after: onClose });
  return (
    <Dialog open onOpenChange={onClose} title="New class">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Grade"><Select value={f.gradeId} onChange={(e) => setF({ ...f, gradeId: e.target.value, name: f.name || opts.data?.grades.find((g: any) => g.id === e.target.value)?.name || '' })}>
          <option value="">—</option>{opts.data?.grades.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Class name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="KG" /></Field>
          <Field label="Section"><Input value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} placeholder="Rose" /></Field></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending}>Create</Button></div>
      </form>
    </Dialog>
  );
}
