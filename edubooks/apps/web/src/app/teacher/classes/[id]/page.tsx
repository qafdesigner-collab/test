'use client';
import { use } from 'react';
import { Gradebook } from '@/components/gradebook';

export default function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <Gradebook classId={id} back="/teacher/classes" />; }
