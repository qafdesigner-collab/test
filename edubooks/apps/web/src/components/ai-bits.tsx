'use client';
import Link from 'next/link';
import { AlertTriangle, BookOpen, Cpu } from 'lucide-react';
import { Badge } from '@/components/ui';

export interface AiSource { n: number; page: number; component: string; componentId: string; lesson?: string | null; snippet: string }

/** Page citations that open the digital book exactly at the cited page. */
export function SourceChips({ editionId, sources, ids }: { editionId: string; sources: AiSource[]; ids?: number[] }) {
  const list = ids ? sources.filter((s) => ids.includes(s.n)) : sources;
  if (!list.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">{list.map((s) => (
      <Link key={s.n} href={`/read/${editionId}?component=${s.componentId}&page=${s.page}`} target="_blank" title={s.snippet}
        className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-100"><BookOpen className="size-3" />p.{s.page}</Link>))}</span>
  );
}

export function AiNotices({ r }: { r: { live: boolean; grounded: boolean; provider: string; model: string; warnings: string[] } }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={r.live ? 'info' : 'DRAFT'}><Cpu className="size-3" />{r.live ? `${r.model}` : 'Offline draft'}</Badge>
        <Badge tone={r.grounded ? 'PUBLISHED' : 'danger'}>{r.grounded ? 'Grounded in the book pages' : 'Not grounded — no book text'}</Badge>
        <span className="text-slate-500">AI drafts can be wrong. Review and edit before using with children.</span>
      </div>
      {r.warnings.map((w, i) => <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{w}</div>)}
    </div>
  );
}
