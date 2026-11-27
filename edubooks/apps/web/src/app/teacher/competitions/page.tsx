'use client';
import { PageHeader } from '@/components/common';
import { useT } from '@/lib/i18n';
import { CompetitionList } from '@/components/competitions';

export default function Competitions() {
  const { t } = useT(); void t;
  return <div className="space-y-6"><PageHeader title="Competitions" sub="See who is taking part, listen and look at the entries, and vote when the voting is open." /><CompetitionList base="/teacher/competitions" /></div>;
}
