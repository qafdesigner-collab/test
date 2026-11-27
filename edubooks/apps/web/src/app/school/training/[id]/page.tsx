'use client';
import { use } from 'react';
import { CoursePlayer } from '@/components/training';

export default function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <CoursePlayer id={id} back="/school/training" />; }
