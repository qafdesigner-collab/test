'use client';
import { BookMarked, ClipboardList, Library, LayoutDashboard, NotebookPen, Users } from 'lucide-react';
import { Shell } from '@/components/shell';

const NAV = [
  { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/teacher/books', label: 'My books', icon: Library },
  { href: '/teacher/plans', label: 'Lesson planner', icon: NotebookPen },
  { href: '/teacher/assessments', label: 'Homework & tests', icon: ClipboardList },
  { href: '/teacher/questions', label: 'Question bank', icon: BookMarked },
  { href: '/teacher/classes', label: 'Classes & reports', icon: Users },
];
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <Shell role="TEACHER" roleLabel="Teacher" nav={NAV} accent="sky">{children}</Shell>;
}
