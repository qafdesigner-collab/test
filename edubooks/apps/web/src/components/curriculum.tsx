'use client';
import { useEffect, useMemo, useState } from 'react';
import { byStage, useCurricula, useGrades } from '@/lib/catalog';
import { Field, Select, cn } from '@/components/ui';

/** Grade <option>s grouped by stage. */
export function GradeOptions({ grades }: { grades: { id: string; name: string; stage: string }[] }) {
  return <>{byStage(grades).map((s, i) => s.stage
    ? <optgroup key={i} label={s.stage}>{s.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>
    : s.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>))}</>;
}

/**
 * Curriculum → Grade: choosing a curriculum (American, British, MOE, CBC…) limits the grade list to that curriculum.
 * `gradeId` is the value; the curriculum follows from the chosen grade.
 */
export function CurriculumGradePicker({ gradeId, onChange, required, allowEmpty, className, labels = true, compact }: {
  gradeId: string; onChange: (gradeId: string) => void; required?: boolean; allowEmpty?: boolean; className?: string; labels?: boolean; compact?: boolean;
}) {
  const cur = useCurricula(); const grades = useGrades();
  const fromGrade = useMemo(() => grades.data?.find((g) => g.id === gradeId)?.curriculumId ?? '', [grades.data, gradeId]);
  const [curriculumId, setCurriculumId] = useState(fromGrade);
  useEffect(() => { if (fromGrade) setCurriculumId(fromGrade); }, [fromGrade]);
  const list = (grades.data ?? []).filter((g) => g.curriculumId === curriculumId);
  const curSelect = (
    <Select aria-label="Curriculum" className={compact ? 'w-44' : undefined} required={required} value={curriculumId}
      onChange={(e) => { setCurriculumId(e.target.value); if (grades.data?.find((g) => g.id === gradeId)?.curriculumId !== e.target.value) onChange(''); }}>
      <option value="">{compact ? 'All curricula' : 'Select curriculum…'}</option>
      {cur.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>);
  const gradeSelect = (
    <Select aria-label="Grade" className={compact ? 'w-44' : undefined} required={required} value={gradeId} disabled={!curriculumId} onChange={(e) => onChange(e.target.value)}>
      <option value="">{!curriculumId ? 'Choose a curriculum first' : allowEmpty || compact ? 'All grades' : 'Select grade…'}</option>
      <GradeOptions grades={list} />
    </Select>);
  if (!labels) return <div className={cn('flex flex-wrap gap-2', className)}>{curSelect}{gradeSelect}</div>;
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      <Field label="Curriculum">{curSelect}</Field>
      <Field label="Grade">{gradeSelect}</Field>
    </div>
  );
}

/** Curriculum filter for lists: returns the selected curriculum id (or ''). */
export function CurriculumSelect({ value, onChange, className, emptyLabel = 'All curricula', label }: { value: string; onChange: (v: string) => void; className?: string; emptyLabel?: string; label?: string }) {
  const cur = useCurricula();
  return (
    <Select aria-label={label ?? 'Curriculum'} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {cur.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>
  );
}
