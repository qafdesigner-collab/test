'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useMe } from '@/lib/session';
import { Button, Card, PageLoader } from '@/components/ui';

const PHASE: Record<string, string> = { SCHOOL_ADMIN: 'School Admin portal — Phase 3/4', TEACHER: 'Teacher portal — Phase 4/5', STUDENT: 'Student portal — Phase 6', PUBLISHER_SALES: 'Sales & orders — Phase 3' };

export default function Portal() {
  const { data: me, isLoading } = useMe(); const router = useRouter();
  if (isLoading || !me) return <PageLoader />;
  return (
    <main className="mx-auto max-w-xl p-6 pt-24">
      <Card className="p-8 text-center">
        <h1 className="text-xl font-semibold">Welcome, {me.displayName}</h1>
        {me.school && <p className="mt-1 text-slate-500">{me.school.name} · {me.school.code}</p>}
        <p className="mt-4 text-slate-600">Your sign-in works. Your portal is next on the roadmap:</p>
        <ul className="mt-2 text-sm text-slate-700">{me.roles.map((r) => <li key={r}>{PHASE[r] ?? r}</li>)}</ul>
        <Button className="mt-6" variant="secondary" onClick={async () => { await api.post('/auth/logout'); router.replace('/login'); }}>Sign out</Button>
      </Card>
    </main>
  );
}
