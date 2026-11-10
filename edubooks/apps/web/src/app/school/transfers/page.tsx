'use client';
import { useQuery } from '@tanstack/react-query';
import { api, fmtDate } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, ErrorBox, PageLoader } from '@/components/ui';
import { PageHeader, Status, Table, Td } from '@/components/common';

export default function SchoolTransfers() {
  const q = useQuery({ queryKey: ['transfers', 'school'], queryFn: () => api.get('/school/transfers') });
  const cancel = useAction((id: string) => api.post(`/school/transfers/${id}/cancel`), { ok: 'Request cancelled', keys: ['transfers', 'schoolPool', 'schoolOverview'] });
  return (
    <div className="space-y-6">
      <PageHeader title="Transfer requests" sub="Moving a student's book seat to another student needs the publisher's approval. Start a transfer from a licence's seat list." />
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <PageLoader /> : (
        <Table head={['Requested', 'Licence', 'From → To', 'Reason', 'Status', '']} empty={!q.data.length}>
          {q.data.map((t: any) => (
            <tr key={t.id}><Td className="whitespace-nowrap text-slate-500">{fmtDate(t.requestedAt)}</Td><Td className="text-xs">{t.product}</Td>
              <Td><b>{t.fromUser}</b> → <b>{t.toUser}</b></Td><Td className="max-w-sm text-slate-600">{t.reason}{t.decisionNote && <div className="text-xs text-slate-400">Publisher: {t.decisionNote}</div>}</Td>
              <Td><Status s={t.status} /></Td><Td className="text-right">{t.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => cancel.mutate(t.id)}>Withdraw</Button>}</Td></tr>
          ))}
        </Table>
      )}
    </div>
  );
}
