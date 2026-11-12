'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Trash2 } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, PageLoader } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const LABELS: Record<string, string> = { school: 'schools', book_packages: 'book packages', products: 'products', game_activities: 'games', training_courses: 'training course', digital_assets: 'sample files' };

export default function DemoDataPage() {
  const q = useQuery({ queryKey: ['demo'], queryFn: () => api.get<any>('/system/demo') });
  const qc = useQueryClient(); const toast = useToast();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const [removing, setRemoving] = useState(false);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const d = q.data;
  const load = async () => {
    setBusy(true); setErr(null);
    try { qc.setQueryData(['demo'], await api.post('/system/demo/load', {})); qc.invalidateQueries(); toast('Demo data loaded'); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Demo data" sub="Fill the system with sample schools, books, pupils and activity to try everything out — then remove it all with one click before you go live." />
      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 size-6 text-brand-600" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h2 className="font-semibold text-slate-900">Status</h2><Badge tone={d.loaded ? 'info' : 'neutral'}>{d.loaded ? 'Demo data is loaded' : 'No demo data'}</Badge></div>
            {d.loaded ? <p className="mt-1 text-sm text-slate-700">Loaded {fmtDate(d.loadedAt)}: {Object.entries(d.counts).map(([k, n]) => `${n} ${LABELS[k] ?? k}`).join(', ')}, plus everything inside the demo schools (classes, pupils, parents, homework, attendance, exams, messages…).</p>
              : <p className="mt-1 text-sm text-slate-700">Loading adds 3 demo schools (codes <b>DEMO1</b>, <b>DEMO2</b>, <b>DEMO3</b>) with teachers, pupils and a parent, 5 sample books marked “(Demo)”, products and licences, games, a class with homework, attendance, a timetable, an exam with results, messages, announcements, a live lesson and a training course. Your real schools, books and settings are not changed.</p>}
          </div>
        </div>
        {err ? <ErrorBox error={err} /> : null}
        <div className="flex flex-wrap gap-2">
          {!d.loaded ? <Button loading={busy} onClick={load}><FlaskConical className="size-4" />Load demo data</Button>
            : <Button variant="secondary" className="text-red-700" onClick={() => setRemoving(true)}><Trash2 className="size-4" />Remove all demo data</Button>}
        </div>
      </Card>
      {d.loaded && <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3"><h2 className="font-semibold text-slate-900">Demo sign-ins</h2><p className="text-xs text-slate-600">Use these on the sign-in page (tab “School”) to see each portal. Your own publisher sign-in shows the demo books, schools and sales too.</p></div>
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">Who</th><th className="px-4 py-2">School code</th><th className="px-4 py-2">Username</th><th className="px-4 py-2">Password</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{d.logins.map((l: any) => <tr key={l.who}><td className="px-4 py-2 font-medium">{l.who}</td><td className="px-4 py-2 font-mono">{l.school}</td><td className="px-4 py-2 font-mono">{l.username}</td><td className="px-4 py-2 font-mono">{l.password}</td></tr>)}</tbody></table>
      </Card>}
      {removing && <RemoveDialog onClose={() => setRemoving(false)} onDone={(r) => { qc.invalidateQueries(); qc.setQueryData(['demo'], r); setRemoving(false); toast('All demo data has been removed'); }} />}
    </div>
  );
}

function RemoveDialog({ onClose, onDone }: { onClose: () => void; onDone: (r: any) => void }) {
  const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  const go = async () => { setBusy(true); setErr(null); try { onDone(await api.post('/system/demo/remove', { confirm })); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <Dialog open onOpenChange={onClose} title="Remove all demo data?" description="This deletes the demo schools and everything in them (users, classes, homework, marks, messages…), the demo books, products, games and training course. Your real data stays as it is. This cannot be undone.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <Field label="Type REMOVE to confirm"><Input autoFocus value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        <p className="text-xs text-slate-600">If a real school has started using a demo item (for example, ordered a demo product), nothing is removed and you are told which school, so you can fix that first.</p>
        {err ? <ErrorBox error={err} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={confirm !== 'REMOVE'} className="bg-red-600 hover:bg-red-700">Remove demo data</Button></div>
      </form>
    </Dialog>
  );
}
