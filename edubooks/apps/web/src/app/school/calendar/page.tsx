'use client';
import { AcademicCalendar } from '@/components/calendar';
import { PageHeader } from '@/components/common';
import { hasRole, useMe } from '@/lib/session';

export default function SchoolCalendar() {
  const { data: me } = useMe();
  return (
    <div className="space-y-6">
      <PageHeader title="Academic calendar" sub="Your publisher's calendar for your curriculum, plus your school's own events. Teachers and students see it too." />
      <AcademicCalendar canEdit={hasRole(me, 'SCHOOL_ADMIN')} />
    </div>
  );
}
