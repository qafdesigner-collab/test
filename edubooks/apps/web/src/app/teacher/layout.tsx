'use client';
import { BookMarked, ClipboardList, Gamepad2, Library, LayoutDashboard, NotebookPen, Sparkles, Users, CalendarDays, UserCheck, Clock, GraduationCap, LineChart } from 'lucide-react';
import { Shell } from '@/components/shell';

const NAV = [
  { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/teacher/books', label: 'My books', icon: Library },
  { href: '/teacher/ai', label: 'AI assistant', icon: Sparkles },
  { href: '/teacher/plans', label: 'Lesson planner', icon: NotebookPen },
  { href: '/teacher/assessments', label: 'Homework & tests', icon: ClipboardList },
  { href: '/teacher/questions', label: 'Question bank', icon: BookMarked },
  { href: '/teacher/games', label: 'Games', icon: Gamepad2 },
  { href: '/teacher/classes', label: 'Classes & reports', icon: Users },
  { href: '/teacher/insights', label: 'Insights', icon: LineChart },
  { href: '/teacher/attendance', label: 'Attendance', icon: UserCheck },
  { href: '/teacher/timetable', label: 'Timetable', icon: Clock },
  { href: '/teacher/training', label: 'Training', icon: GraduationCap },
  { href: '/teacher/calendar', label: 'Academic calendar', icon: CalendarDays },
];
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <Shell role="TEACHER" roleLabel="Teacher" nav={NAV} accent="sky">{children}</Shell>;
}
