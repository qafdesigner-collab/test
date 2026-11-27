'use client';
import { AcademicCalendar } from '@/components/calendar';
import { PageHeader } from '@/components/common';
import { hasRole, useMe } from '@/lib/session';

export default function AdminCalendar() {
  const { data: me } = useMe();
  return (
    <div className="space-y-6">
      <PageHeader title="Academic calendar" sub="🇦🇪 The UAE school calendar (Ministry of Education terms and breaks) and UAE public holidays, for all schools. Add your own entries; schools add their own events too." />
      <AcademicCalendar publisher canEdit={hasRole(me, 'PUBLISHER_ADMIN', 'PUBLISHER_EDITOR')} />
    </div>
  );
}
