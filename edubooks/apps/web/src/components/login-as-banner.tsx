'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftCircle, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/session';

const ROLE: Record<string, string> = { SCHOOL_ADMIN: 'school admin', TEACHER: 'teacher', STUDENT: 'student', PARENT: 'parent' };

/** Shown on every page while the super admin is signed in as a school user. */
export function LoginAsBanner() {
  const { data: me } = useMe(); const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  if (!me?.impersonatedBy) return null;
  const role = me.roles.map((r) => ROLE[r]).filter(Boolean).join(', ');
  const back = async () => {
    setBusy(true);
    try { const r = await api.post<{ home: string }>('/auth/return'); qc.clear(); window.location.assign(r.home); }
    catch { setBusy(false); }
  };
  return (
    <div role="status" className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-sm font-semibold text-slate-900 shadow">
      <span className="flex items-center gap-2"><Eye className="size-4" />You are signed in as <b>{me.displayName}</b> ({role}{me.school ? `, ${me.school.name}` : ''}). Everything you do is done as them.</span>
      <button onClick={back} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-white hover:bg-slate-700 disabled:opacity-60">
        <ArrowLeftCircle className="size-4" />{busy ? 'Going back…' : `Back to ${me.impersonatedBy.name}`}</button>
    </div>
  );
}
