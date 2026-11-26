'use client';
import { PageHeader } from '@/components/common';
import { useT } from '@/lib/i18n';
import { CompetitionList } from '@/components/competitions';

export default function Competitions() {
  const { t } = useT(); void t;
  return <div className="space-y-6"><PageHeader title="Competitions" sub="Singing, art, poetry and more: start a competition, see who takes part, open the voting and announce the winners." /><CompetitionList base="/school/competitions" admin /></div>;
}
