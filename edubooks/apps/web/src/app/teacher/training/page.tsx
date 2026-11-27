'use client';
import { PageHeader } from '@/components/common';
import { TrainingCourses } from '@/components/training';

export default function Page() {
  return <div className="space-y-6"><PageHeader title="Training" sub="Short courses on teaching with your books and this platform. Finish a course to print your certificate." /><TrainingCourses base="/teacher/training" /></div>;
}
