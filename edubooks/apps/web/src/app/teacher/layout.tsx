'use client';
import { BookMarked, ClipboardList, Gamepad2, Library, LayoutDashboard, NotebookPen, Sparkles, Users, CalendarDays, UserCheck, Clock, GraduationCap, LineChart, FileText, MessagesSquare, Bird, Building, Presentation } from 'lucide-react';
import { Shell } from '@/components/shell';

const NAV = [
  { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/teacher/messages', label: 'Messages', icon: MessagesSquare },
  { href: '/teacher/books', label: 'My books', icon: Library },
  { href: '/teacher/whiteboard', label: 'Whiteboard', icon: Presentation },
  { href: '/teacher/ai', label: 'AI assistant', icon: Sparkles },
  { href: '/teacher/plans', label: 'Lesson planner', icon: NotebookPen },
  { href: '/teacher/assessments', label: 'Assessments & homework', icon: ClipboardList },
  { href: '/teacher/questions', label: 'Question bank', icon: BookMarked },
  { href: '/teacher/exams', label: 'Exams', icon: FileText },
  { href: '/teacher/games', label: 'Games', icon: Gamepad2 },
  { href: '/teacher/classes', label: 'Classes & reports', icon: Users },
  { href: '/teacher/insights', label: 'Insights', icon: LineChart },
  { href: '/teacher/tutor', label: 'Ask Owl (AI tutor)', icon: Bird },
  { href: '/teacher/attendance', label: 'Attendance', icon: UserCheck },
  { href: '/teacher/timetable', label: 'Timetable', icon: Clock },
  { href: '/teacher/training', label: 'Training', icon: GraduationCap },
  { href: '/teacher/calendar', label: 'Academic calendar', icon: CalendarDays },
  { href: '/teacher/publisher', label: 'Our publisher', icon: Building },
];
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <Shell role="TEACHER" roleLabel="Teacher" nav={NAV}>{children}</Shell>;
}
