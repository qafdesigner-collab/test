'use client';
import { PageHeader } from '@/components/common';
import { PublisherInsights } from '@/components/insights';

export default function Page() {
  return <div className="space-y-6"><PageHeader title="Usage insights" sub="How actively each school uses your books, games and homework. Low use before renewal time is worth a call." /><PublisherInsights /></div>;
}
