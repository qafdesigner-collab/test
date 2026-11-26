'use client';
import { PageHeader } from '@/components/common';
import { PageLoader } from '@/components/ui';
import { ClassGoals, RewardList } from '@/components/classroom';
import { useMyClasses } from '@/lib/lms';

export default function TeacherRewards() {
  const classes = useMyClasses();
  if (!classes.data) return <PageLoader />;
  return (
    <div className="space-y-6">
      <PageHeader title="Class rewards" sub="Start a star goal for your class and choose the reward. Add your own rewards to the school's list." />
      <RewardList />
      <ClassGoals manageRewards={false} classes={classes.data.map((c: any) => ({ id: c.id, name: `${c.name}${c.section ? ` ${c.section}` : ''}`, students: c.students }))} />
    </div>
  );
}
