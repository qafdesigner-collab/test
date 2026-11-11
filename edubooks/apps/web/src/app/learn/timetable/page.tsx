'use client';
import { MyTimetable } from '@/components/timetable';

export default function KidTimetable() {
  return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-slate-900">🗓️ My timetable</h1><MyTimetable title="This week" /></div>;
}
