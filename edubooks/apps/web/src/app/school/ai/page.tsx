'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Card, PageLoader } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { AiConnectForm } from '@/components/ai-connect';

/** School admin: the school's AI — what the publisher allows, usage this month, and the school's own AI connection. */
export default function SchoolAi() {
  const q = useQuery({ queryKey: ['schoolAi'], queryFn: () => api.get<any>('/school/ai') });
  if (!q.data) return <PageLoader />;
  const d = q.data; const pct = d.monthlyLimit ? Math.min(100, Math.round((d.usedThisMonth / d.monthlyLimit) * 100)) : 0;
  return (
    <div className="space-y-6">
      <PageHeader title="AI" sub="The AI assistant for your teachers (lesson plans, question papers, research) and Ask Owl for students (explains their book only, never does homework)." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-slate-500">AI for this school</p>
          <p className="mt-1 text-lg font-semibold">{d.access === 'OFF' ? '⛔ Off' : d.access === 'OWN' ? '🔑 Your own AI' : '✨ Provided by your publisher'}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-slate-500">Requests this month</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{d.usedThisMonth} / {d.monthlyLimit ?? '∞'}</p>
          {d.monthlyLimit ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} /></div> : null}</Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-slate-500">Model in use</p>
          <p className="mt-1 text-lg font-semibold">{d.using ? d.using.model : 'None (offline drafts)'}</p></Card>
      </div>
      {d.access === 'OWN' ? (
        <Card className="space-y-4 p-5">
          <div><h2 className="font-semibold text-slate-900">Connect your school’s AI service</h2>
            <p className="text-sm text-slate-500">Your publisher lets your school use its own AI. Free plans need only a free API key from the service’s website. {d.own ? '' : 'Until you connect one, your publisher’s AI is used.'}</p></div>
          <AiConnectForm presets={d.presets} endpoint="/school/ai" invalidate={['schoolAi', 'aiStatus']}
            saved={d.own ? { ...d.own, connected: true } : null} />
          <p className="text-xs text-slate-500">The key is stored encrypted and is never shown again (only its last 4 characters). Book text and the teacher’s or student’s question are sent to the service you choose.</p>
        </Card>
      ) : (
        <Card className="p-5 text-sm text-slate-600">{d.access === 'OFF'
          ? <>AI is switched off for your school. Contact your publisher to switch it on — the free page-question maker still works for teachers.</>
          : <>Your publisher provides the AI for your school. <Badge>Want to use your own AI key?</Badge> Ask your publisher to allow “School’s own AI”.</>}</Card>
      )}
    </div>
  );
}
