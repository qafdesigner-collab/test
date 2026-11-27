'use client';
import { PageHeader } from '@/components/common';
import { MyTimetable } from '@/components/timetable';

export default function TeacherTimetable() {
  return <div className="space-y-6"><PageHeader title="Timetable" sub="Your lessons this week. The school office sets the timetable." /><MyTimetable title="My week" /></div>;
}
