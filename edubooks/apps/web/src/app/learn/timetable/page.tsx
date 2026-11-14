'use client';
import { MyTimetable } from '@/components/timetable';
import { useT } from '@/lib/i18n';

export default function KidTimetable() {
  const { t } = useT();
  return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-slate-900">{t('🗓️ My timetable')}</h1><MyTimetable title={t('This week')} /></div>;
}
