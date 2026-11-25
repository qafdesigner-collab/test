'use client';
import { PageHeader } from '@/components/common';
import { Timeline } from '@/components/timeline';

export default function SchoolTimeline() {
  return <div className="space-y-6"><PageHeader title="Timeline" sub="Share news, photos and events with the whole school or one class. Students and parents see them." /><Timeline canPost /></div>;
}
