'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { api, fmtDate } from '@/lib/api';
import { Badge, Card, Dialog, EmptyState, ErrorBox, PageLoader } from '@/components/ui';
import { PageHeader, Table, Td } from '@/components/common';

const ROLE: Record<string, string> = { STUDENT: 'Student', TEACHER: 'Teacher', SCHOOL_ADMIN: 'School admin' };

/** Super admin only: every school's competitions, and who voted for which entry (schools see only the number of votes). */
export default function AdminCompetitions() {
  const q = useQuery({ queryKey: ['allCompetitions'], queryFn: () => api.get<any[]>('/competitions/publisher/all') });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader title="Competitions" sub="Competitions in all schools. Only you (super admin) can see who voted — schools, teachers, students and parents only see how many votes each entry has." />
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : !q.data.length ? <EmptyState title="No competitions yet">School admins start them from their portal.</EmptyState> : (
        <Card>
          <Table head={['Competition', 'School', 'Status', 'Entries', 'Votes', '']} empty={!q.data.length}>
            {q.data.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td><span className="me-1">{c.emoji}</span><b>{c.title}</b><div className="text-xs text-slate-500">{fmtDate(c.createdAt)}</div></Td>
                <Td>{c.school}<div className="font-mono text-xs text-slate-500">{c.schoolCode}</div></Td>
                <Td><Badge>{c.status}</Badge></Td>
                <Td>{c.entries}</Td><Td>{c.votes}</Td>
                <Td className="text-right"><button className="text-sm font-semibold text-brand-700 hover:underline" onClick={() => setOpen(c.id)}>Who voted</button></Td>
              </tr>))}
          </Table>
        </Card>)}
      {open && <Voters id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Voters({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['voters', id], queryFn: () => api.get<any>(`/competitions/publisher/${id}/voters`) });
  const d = q.data;
  return (
    <Dialog open onOpenChange={onClose} wide title={d ? `${d.emoji ?? ''} ${d.title} — who voted` : 'Who voted'} description={d?.school}>
      {q.error ? <ErrorBox error={q.error} /> : !d ? <PageLoader /> : (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-xs text-slate-500"><Lock className="size-3.5" />Private: shown to the super admin only. Viewing is recorded in the audit log.</p>
          {!d.entries.length && <p className="text-sm text-slate-500">No entries.</p>}
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {d.entries.map((e: any) => (
              <div key={e.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-semibold">{e.place ? `🏆 ${e.place}. ` : ''}{e.name} <span className="font-normal text-slate-500">· {e.title || '—'}</span> <span className="ms-2 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700">🗳️ {e.voters.length}</span></p>
                {e.voters.length ? (
                  <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    {e.voters.map((v: any, i: number) => <li key={i} className="flex justify-between gap-2 rounded bg-slate-50 px-2 py-1"><span>{v.name} <span className="font-mono text-xs text-slate-500">{v.username}</span></span>
                      <span className="text-xs text-slate-500">{(v.roles ?? '').split(',').map((r: string) => ROLE[r] ?? r).join(', ')}</span></li>)}
                  </ul>) : <p className="mt-1 text-xs text-slate-500">No votes.</p>}
              </div>))}
          </div>
        </div>)}
    </Dialog>
  );
}
