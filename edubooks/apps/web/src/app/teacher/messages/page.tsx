'use client';
import { StaffMessages } from '@/components/messages-page';
import { className, useMyClasses } from '@/lib/lms';

export default function Page() { const q = useMyClasses(); return <StaffMessages classes={q.data?.map((c) => ({ id: c.id, label: `${className(c)} · ${c.academicYear}` }))} />; }
