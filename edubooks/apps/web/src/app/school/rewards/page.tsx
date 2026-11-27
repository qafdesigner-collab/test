'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/common';
import { PageLoader } from '@/components/ui';
import { ClassGoals, RewardList } from '@/components/classroom';

/** School admin: class reward goals for every class, and the school's own list of rewards. */
export default function SchoolRewards() {
  const classes = useQuery({ queryKey: ['classes', 'all'], queryFn: () => api.get<any[]>('/classes') });
  if (!classes.data) return <PageLoader />;
  return (
    <div className="space-y-6">
      <PageHeader title="Class rewards" sub="Start a star goal for any class and choose the reward. Add your school's own rewards — teachers see them too and can add their own." />
      <RewardList />
      <ClassGoals manageRewards={false} classes={classes.data.filter((c: any) => !c.archived).map((c: any) => ({ id: c.id, name: `${c.name}${c.section ? ` ${c.section}` : ''}`, students: c.students }))} />
    </div>
  );
}
