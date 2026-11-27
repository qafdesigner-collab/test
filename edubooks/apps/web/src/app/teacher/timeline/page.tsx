'use client';
import { PageHeader } from '@/components/common';
import { Timeline } from '@/components/timeline';

export default function TeacherTimeline() {
  return <div className="space-y-6"><PageHeader title="Timeline" sub="Share news, photos and events with your classes or the whole school. Students and parents see them." /><Timeline canPost /></div>;
}
