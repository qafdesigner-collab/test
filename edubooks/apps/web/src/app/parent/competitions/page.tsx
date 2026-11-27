'use client';
import { useT } from '@/lib/i18n';
import { CompetitionList } from '@/components/competitions';

export default function Competitions() {
  const { t } = useT(); void t;
  return <div className="space-y-6"><h1 className="text-3xl font-black text-slate-800">🏆 {t('Competitions')}</h1><CompetitionList base="/parent/competitions" /></div>;
}
