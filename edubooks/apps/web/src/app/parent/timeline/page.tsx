'use client';
import { Timeline } from '@/components/timeline';
import { useT } from '@/lib/i18n';

export default function ParentTimeline() {
  const { t } = useT();
  return <div className="space-y-6"><h1 className="text-2xl font-bold text-slate-900">📰 {t('School news')}</h1><p className="text-sm text-slate-600">{t('News, photos and events from the school and your children’s classes.')}</p><Timeline /></div>;
}
