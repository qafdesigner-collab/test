'use client';
import { BookOpenCheck, ArrowLeftRight, School, GraduationCap, KeyRound, LayoutDashboard, Users, CalendarDays, HeartHandshake, UserCheck, Clock, Award, LineChart, FileText, MessagesSquare, Bird, Building, Mail , ListChecks, Sparkles, BarChart3, Newspaper, Trophy, Landmark, Medal } from 'lucide-react';
import { Shell } from '@/components/shell';

const NAV = [
  { href: '/school', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/school/insights', label: 'Insights', icon: LineChart },
  { href: '/school/compare', label: 'Compare classes', icon: BarChart3 },
  { href: '/school/mail', label: 'Mail', icon: Mail },
  { href: '/school/messages', label: 'Messages', icon: MessagesSquare },
  { href: '/school/timeline', label: 'Timeline', icon: Newspaper },
  { href: '/school/rewards', label: 'Class rewards', icon: Trophy },
  { href: '/school/fame', label: 'Hall of Fame', icon: Landmark },
  { href: '/school/competitions', label: 'Competitions', icon: Medal },
  { href: '/school/ai', label: 'AI', icon: Sparkles },
  { href: '/school/tutor', label: 'Ask Owl (AI tutor)', icon: Bird },
  { href: '/school/classes', label: 'Classes', icon: School },
  { href: '/school/attendance', label: 'Attendance', icon: UserCheck },
  { href: '/school/timetable', label: 'Timetable', icon: Clock },
  { href: '/school/exams', label: 'Exams', icon: FileText },
  { href: '/school/checklists', label: 'Checklists', icon: ListChecks },
  { href: '/school/calendar', label: 'Academic calendar', icon: CalendarDays },
  { href: '/school/teachers', label: 'Teachers', icon: GraduationCap },
  { href: '/school/training', label: 'Teacher training', icon: Award },
  { href: '/school/students', label: 'Students', icon: Users },
  { href: '/school/parents', label: 'Parents', icon: HeartHandshake },
  { href: '/school/licences', label: 'Book licences', icon: KeyRound },
  { href: '/school/licences/give', label: 'Give books by class', icon: BookOpenCheck },
  { href: '/school/transfers', label: 'Transfer requests', icon: ArrowLeftRight },
  { href: '/school/publisher', label: 'Our publisher', icon: Building },
];

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  return <Shell role="SCHOOL_ADMIN" roleLabel="School admin" nav={NAV} theme="school" deny="This area is for school administrators.">{children}</Shell>;
}
