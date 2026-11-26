'use client';
import { BookMarked, ClipboardList, Gamepad2, Library, LayoutDashboard, NotebookPen, Sparkles, Users, CalendarDays, UserCheck, Clock, GraduationCap, LineChart, FileText, MessagesSquare, Bird, Building, Presentation, Mail, ListChecks, BarChart3, Palette, Newspaper, Trophy, Landmark } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Shell } from '@/components/shell';

const NAV = [
  { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/teacher/mail', label: 'Mail', icon: Mail },
  { href: '/teacher/messages', label: 'Messages', icon: MessagesSquare },
  { href: '/teacher/timeline', label: 'Timeline', icon: Newspaper },
  { href: '/teacher/books', label: 'My books', icon: Library },
  { href: '/teacher/whiteboard', label: 'Whiteboard', icon: Presentation },
  { href: '/teacher/ai', label: 'AI assistant', icon: Sparkles },
  { href: '/teacher/plans', label: 'Lesson planner', icon: NotebookPen },
  { href: '/teacher/assessments', label: 'Assessments', icon: ClipboardList },
  { href: '/teacher/questions', label: 'Question bank', icon: BookMarked },
  { href: '/teacher/exams', label: 'Exams', icon: FileText },
  { href: '/teacher/checklists', label: 'Checklists', icon: ListChecks },
  { href: '/teacher/games', label: 'Games', icon: Gamepad2 },
  { href: '/teacher/book-work', label: 'Book work', icon: Palette },
  { href: '/teacher/rewards', label: 'Class rewards', icon: Trophy },
  { href: '/teacher/fame', label: 'Hall of Fame', icon: Landmark },
  { href: '/teacher/classes', label: 'Classes & reports', icon: Users },
  { href: '/teacher/insights', label: 'Insights', icon: LineChart },
  { href: '/teacher/compare', label: 'Compare classes', icon: BarChart3 },
  { href: '/teacher/tutor', label: 'Ask Owl (AI tutor)', icon: Bird },
  { href: '/teacher/attendance', label: 'Attendance', icon: UserCheck },
  { href: '/teacher/timetable', label: 'Timetable', icon: Clock },
  { href: '/teacher/training', label: 'Training', icon: GraduationCap },
  { href: '/teacher/calendar', label: 'Academic calendar', icon: CalendarDays },
  { href: '/teacher/publisher', label: 'Our publisher', icon: Building },
];
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  // the Hall of Fame is in the menu only when the school admin shows it to teachers
  const fame = useQuery({ queryKey: ['fameShown'], queryFn: () => api.get<{ shown: boolean }>('/fame/shown'), staleTime: 300_000 });
  return <Shell role="TEACHER" roleLabel="Teacher" nav={NAV.filter((n) => n.href !== '/teacher/fame' || fame.data?.shown)}>{children}</Shell>;
}
