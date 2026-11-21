'use client';
import { AcademicCalendar } from '@/components/calendar';
import { PageHeader } from '@/components/common';
import { hasRole, useMe } from '@/lib/session';

export default function AdminCalendar() {
  const { data: me } = useMe();
  return (
    <div className="space-y-6">
      <PageHeader title="Academic calendar" sub="Terms, holidays, exams and events. Entries for all schools, or only for schools following one curriculum. Schools add their own events too." />
      <AcademicCalendar publisher canEdit={hasRole(me, 'PUBLISHER_ADMIN', 'PUBLISHER_EDITOR')} />
    </div>
  );
}
