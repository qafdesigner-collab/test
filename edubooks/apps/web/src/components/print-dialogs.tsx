'use client';
import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Award, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/lib/branding';
import { CERTIFICATE_TEMPLATES, gradeFor, printCertificates, printReportCards } from '@/lib/print-docs';
import { Button, Dialog, Field, Input, PageLoader, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/lib/session';

const TERMS = ['Term 1', 'Term 2', 'Term 3', 'Mid-year', 'Final'];

/** Choose a term, write comments and print branded report cards for one or more students. */
export function ReportCardsDialog({ studentIds, onClose }: { studentIds: string[]; onClose: () => void }) {
  const brand = useBranding(); const toast = useToast();
  const qs = useQueries({ queries: studentIds.map((id) => ({ queryKey: ['report', id], queryFn: () => api.get<any>(`/teacher/students/${id}/report`) })) });
  const ready = qs.every((q) => q.data); const reports = qs.map((q) => q.data).filter(Boolean) as any[];
  const terms = useMemo(() => [...new Set([...reports.flatMap((r) => r.evaluations.map((e: any) => e.term).filter(Boolean)), ...TERMS])], [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const [term, setTerm] = useState('Term 1'); const [nextTerm, setNextTerm] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const print = () => { if (!printReportCards(reports, brand, { term, nextTerm, comments })) toast('Allow pop-ups for this site to print', 'err'); };
  const failed = qs.find((q) => q.error);
  return (
    <Dialog open onOpenChange={onClose} wide title={studentIds.length === 1 ? 'Print report card' : `Print ${studentIds.length} report cards`}
      description="One A4 page per student with your logo: subject scores and grades, skill ratings, homework, reading and a comment. Choose “Save as PDF” in the print window to keep a copy.">
      {failed ? <p className="text-sm text-red-600">{(failed.error as Error).message}</p> : !ready ? <PageLoader /> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Term"><Input list="report-terms" value={term} onChange={(e) => setTerm(e.target.value)} /><datalist id="report-terms">{terms.map((t) => <option key={t} value={t} />)}</datalist></Field>
            <Field label="Next term begins (optional)"><Input value={nextTerm} placeholder="e.g. 1 April 2027" onChange={(e) => setNextTerm(e.target.value)} /></Field>
          </div>
          <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
            {reports.map((r) => {
              const subj = r.bySubject.filter((b: any) => b.percent !== null);
              const overall = subj.length ? Math.round(subj.reduce((n: number, b: any) => n + b.percent, 0) / subj.length) : null;
              return (
                <div key={r.student.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-1.5 flex items-center justify-between text-sm"><b>{r.student.displayName}</b>
                    <span className="text-slate-600">{overall === null ? 'No marked work' : `Overall ${overall}% · grade ${gradeFor(overall)![1]}`}</span></div>
                  <Textarea aria-label={`Comment for ${r.student.displayName}`} rows={2} maxLength={600} placeholder="Teacher's comment (optional)"
                    value={comments[r.student.id] ?? ''} onChange={(e) => setComments({ ...comments, [r.student.id]: e.target.value })} />
                </div>);
            })}
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button disabled={!ready || !!failed} onClick={print}><Printer className="size-4" />Print</Button></div>
    </Dialog>
  );
}

/** Pick students and a certificate design, then print landscape certificates. */
export function CertificatesDialog({ students, onClose }: { students: { id: string; displayName: string }[]; onClose: () => void }) {
  const brand = useBranding(); const toast = useToast(); const me = useMe().data as any;
  const [ids, setIds] = useState<string[]>([]);
  const [tpl, setTpl] = useState(CERTIFICATE_TEMPLATES[0].id);
  const t = CERTIFICATE_TEMPLATES.find((x) => x.id === tpl)!;
  const [f, setF] = useState({ title: t.title, line: t.line, detail: '', date: new Date().toISOString().slice(0, 10), signer: me?.displayName ?? '', signer2: '' });
  const pick = (id: string) => { const n = CERTIFICATE_TEMPLATES.find((x) => x.id === id)!; setTpl(id); setF({ ...f, title: n.title, line: n.line }); };
  const print = () => {
    const names = students.filter((s) => ids.includes(s.id)).map((s) => s.displayName);
    const date = f.date ? new Date(f.date + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    if (!printCertificates(names, brand, { ...f, date, icon: t.icon, school: me?.school?.name })) toast('Allow pop-ups for this site to print', 'err');
  };
  return (
    <Dialog open onOpenChange={onClose} wide title="Print certificates" description="Landscape A4 with your logo and colour, one per student.">
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Design">{CERTIFICATE_TEMPLATES.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={tpl === c.id} onClick={() => pick(c.id)}
              className={`focus-ring rounded-lg border px-3 py-1.5 text-sm ${tpl === c.id ? 'border-brand-600 bg-brand-50 font-medium text-brand-800' : 'border-slate-200 hover:bg-slate-50'}`}>{c.icon} {c.title}</button>))}</div>
          <Field label="Title"><Input maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Reason"><Input maxLength={120} value={f.line} onChange={(e) => setF({ ...f, line: e.target.value })} /></Field>
          <Field label="Detail (optional)" hint="e.g. a book, subject or term"><Input maxLength={80} value={f.detail} placeholder="English Reader — Term 1" onChange={(e) => setF({ ...f, detail: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Teacher"><Input maxLength={50} value={f.signer} onChange={(e) => setF({ ...f, signer: e.target.value })} /></Field>
            <Field label="Principal"><Input maxLength={50} value={f.signer2} onChange={(e) => setF({ ...f, signer2: e.target.value })} /></Field>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700"><span>Students ({ids.length})</span>
            <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setIds(ids.length === students.length ? [] : students.map((s) => s.id))}>{ids.length === students.length ? 'Clear' : 'Select all'}</button></div>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{students.map((s) => (
            <li key={s.id}><label className="flex items-center gap-2 px-3 py-1.5 text-sm"><input type="checkbox" checked={ids.includes(s.id)} onChange={(e) => setIds(e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id))} />{s.displayName}</label></li>))}
            {!students.length && <li className="px-3 py-4 text-sm text-slate-600">No students in this class.</li>}</ul>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button disabled={!ids.length || !f.title.trim()} onClick={print}><Award className="size-4" />Print {ids.length || ''}</Button></div>
    </Dialog>
  );
}
