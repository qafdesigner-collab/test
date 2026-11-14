'use client';
import { PageHeader } from '@/components/common';
import { PageLoader } from '@/components/ui';
import { AttendanceWorkspace } from '@/components/attendance';
import { className, useMyClasses } from '@/lib/lms';

export default function TeacherAttendance() {
  const q = useMyClasses();
  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" sub="Take the register for your classes. Parents are told the same day when their child is marked absent." />
      {!q.data ? <PageLoader /> : <AttendanceWorkspace classes={q.data.map((c) => ({ id: c.id, label: `${className(c)} · ${c.academicYear}` }))} />}
    </div>
  );
}
