'use client';
import { useMyBooks, useBook } from '@/lib/lms';
import { Field, Select } from '@/components/ui';

/** Pick book → lesson (from the teacher's licensed books). */
export function BookScope({ editionId, lessonId, onChange, required, books: given, hideLesson }: { editionId?: string | null; lessonId?: string | null; onChange: (v: { editionId: string | null; lessonId: string | null }) => void; required?: boolean; hideLesson?: boolean;
  /** Optional explicit book list (publisher screens); defaults to the teacher's licensed books. */
  books?: { editionId: string; title: string; editionLabel: string }[] }) {
  const mine = useMyBooks(!given); const books = given ? { data: given } : mine; const book = useBook(editionId ?? undefined);
  return (
    <div className={hideLesson ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
      <Field label="Book"><Select required={required} value={editionId ?? ''} onChange={(e) => onChange({ editionId: e.target.value || null, lessonId: null })}>
        <option value="">— none —</option>{books.data?.map((b) => <option key={b.editionId} value={b.editionId}>{b.title} ({b.editionLabel})</option>)}
        {editionId && books.data && !books.data.some((b) => b.editionId === editionId) && <option value={editionId}>{book.data?.title ?? book.data?.packageTitle ?? 'The book chosen before'} (not on sale)</option>}</Select></Field>
      {!hideLesson && <Field label="Lesson"><Select value={lessonId ?? ''} disabled={!editionId} onChange={(e) => onChange({ editionId: editionId ?? null, lessonId: e.target.value || null })}>
        <option value="">— whole book —</option>
        {book.data?.components.map((c: any) => c.units.length > 0 && (
          <optgroup key={c.id} label={c.title}>{c.units.flatMap((u: any) => u.lessons.map((l: any) => <option key={l.id} value={l.id}>Unit {u.number} · Lesson {l.number}: {l.title}</option>))}</optgroup>
        ))}</Select></Field>}
    </div>
  );
}
