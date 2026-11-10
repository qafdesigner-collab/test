'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/components/ui';

export interface SellableEdition { id: string; label: string; packageId: string; packageTitle: string; coverColor: string; gradeName: string }
export const useSellable = () => useQuery<SellableEdition[]>({ queryKey: ['sellable'], queryFn: () => api.get('/commerce/sellable-editions') });

/** Pick published editions (one per book). `single` = radio behaviour. */
export function EditionPicker({ value, onChange, single }: { value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  const { data } = useSellable();
  const groups = Object.entries((data ?? []).reduce<Record<string, SellableEdition[]>>((m, e) => ((m[e.gradeName] ??= []).push(e), m), {}));
  const toggle = (e: SellableEdition) => {
    if (single) return onChange([e.id]);
    const others = value.filter((id) => data?.find((x) => x.id === id)?.packageId !== e.packageId);
    onChange(value.includes(e.id) ? others : [...others, e.id]);
  };
  if (!data?.length) return <p className="text-sm text-slate-500">No published editions yet — publish a book edition first.</p>;
  return (
    <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
      {groups.map(([grade, eds]) => (
        <div key={grade}><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{grade}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">{eds.map((e) => {
            const on = value.includes(e.id);
            return (
              <button type="button" key={e.id} onClick={() => toggle(e)} aria-pressed={on}
                className={cn('focus-ring flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm', on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50')}>
                <span className="size-3 shrink-0 rounded-sm" style={{ background: e.coverColor }} /><span className="flex-1 truncate font-medium">{e.packageTitle}</span>
                <span className="text-xs text-slate-500">{e.label}</span>
              </button>
            );
          })}</div></div>
      ))}
    </div>
  );
}
