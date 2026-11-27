'use client';
import { Timeline } from '@/components/timeline';
import { useT } from '@/lib/i18n';

export default function LearnTimeline() {
  const { t } = useT();
  return <div className="space-y-6"><h1 className="text-4xl font-black text-slate-800">📰 {t('School news')}</h1><Timeline playful /></div>;
}
