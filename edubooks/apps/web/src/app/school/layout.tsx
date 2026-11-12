'use client';
import { ArrowLeftRight, School, GraduationCap, KeyRound, LayoutDashboard, Users, CalendarDays, HeartHandshake, UserCheck, Clock, Award, LineChart, FileText, MessagesSquare, Bird, Building } from 'lucide-react';
import { Shell } from '@/components/shell';

const NAV = [
  { href: '/school', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/school/insights', label: 'Insights', icon: LineChart },
  { href: '/school/messages', label: 'Messages', icon: MessagesSquare },
  { href: '/school/tutor', label: 'Ask Owl (AI tutor)', icon: Bird },
  { href: '/school/classes', label: 'Classes', icon: School },
  { href: '/school/attendance', label: 'Attendance', icon: UserCheck },
  { href: '/school/timetable', label: 'Timetable', icon: Clock },
  { href: '/school/exams', label: 'Exams', icon: FileText },
  { href: '/school/calendar', label: 'Academic calendar', icon: CalendarDays },
  { href: '/school/teachers', label: 'Teachers', icon: GraduationCap },
  { href: '/school/training', label: 'Teacher training', icon: Award },
  { href: '/school/students', label: 'Students', icon: Users },
  { href: '/school/parents', label: 'Parents', icon: HeartHandshake },
  { href: '/school/licences', label: 'Book licences', icon: KeyRound },
  { href: '/school/transfers', label: 'Transfer requests', icon: ArrowLeftRight },
  { href: '/school/publisher', label: 'Our publisher', icon: Building },
];

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  return <Shell role="SCHOOL_ADMIN" roleLabel="School admin" nav={NAV} deny="This area is for school administrators.">{children}</Shell>;
}
