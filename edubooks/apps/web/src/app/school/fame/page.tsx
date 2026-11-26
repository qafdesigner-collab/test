'use client';
import { PageHeader } from '@/components/common';
import { FameAdmin } from '@/components/fame';

export default function SchoolFame() {
  return <div className="space-y-6"><PageHeader title="Hall of Fame" sub="Celebrate brilliant students and your school's leadership — principal, vice principal, honoured teachers. You decide who sees it: teachers, students, parents." /><FameAdmin /></div>;
}
