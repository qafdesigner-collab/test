'use client';
import { AcademicCalendar } from '@/components/calendar';
import { PageHeader } from '@/components/common';

export default function TeacherCalendar() {
  return (
    <div className="space-y-6">
      <PageHeader title="Academic calendar" sub="Terms, holidays, exams and school events." />
      <AcademicCalendar canEdit={false} />
    </div>
  );
}
