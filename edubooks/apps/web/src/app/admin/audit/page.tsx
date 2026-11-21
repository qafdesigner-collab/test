'use client';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, fmtDate, qs } from '@/lib/api';
import { Badge, Card, ErrorBox, PageLoader, Pagination, Select } from '@/components/ui';

const TYPES = ['book_package', 'book_edition', 'book_component', 'book_unit', 'book_lesson', 'teaching_resource', 'grade', 'subject', 'user'];
export default function AuditPage() {
  const [f, setF] = useState({ entityType: '', page: 1 });
  const q = useQuery({ queryKey: ['audit', f], queryFn: () => api.get(`/audit${qs({ ...f, pageSize: 25 })}`), placeholderData: keepPreviousData });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-slate-900">Audit log</h1><p className="text-sm text-slate-500">Every change is recorded in the same database transaction as the change itself, and the log can't be edited.</p></div>
        <Select aria-label="Filter by type" className="w-56" value={f.entityType} onChange={(e) => setF({ entityType: e.target.value, page: 1 })}>
          <option value="">All entity types</option>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </Select>
      </div>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Details</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {q.data.items.map((a: any) => (
                <tr key={a.id}><td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDate(a.createdAt)}</td><td className="px-4 py-3">{a.actor ?? '—'}</td>
                  <td className="px-4 py-3"><Badge>{a.action}</Badge></td><td className="px-4 py-3 text-slate-700">{a.summary}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 p-4"><Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setF({ ...f, page })} /></div>
        </Card>
      )}
    </div>
  );
}
