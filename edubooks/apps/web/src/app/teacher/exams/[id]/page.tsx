'use client';
import { use } from 'react';
import { ExamWorkspace } from '@/components/exams';

export default function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <ExamWorkspace id={id} back="/teacher/exams" />; }
