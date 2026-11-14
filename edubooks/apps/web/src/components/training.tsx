'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, CheckCircle2, Circle, ExternalLink, FileText, HelpCircle, PlayCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/lib/branding';
import { useMe } from '@/lib/session';
import { printCertificates } from '@/lib/print-docs';
import { Button, Card, EmptyState, ErrorBox, PageLoader, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

export const KIND_ICON = { VIDEO: PlayCircle, TEXT: FileText, LINK: ExternalLink, QUIZ: HelpCircle } as const;
export const KIND_NAME = { VIDEO: 'Video', TEXT: 'Reading', LINK: 'Link', QUIZ: 'Quiz' } as const;

/** YouTube / Vimeo page link → privacy-friendly embed URL (null when unknown). */
export function embedUrl(url?: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url); const h = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (h === 'youtu.be') id = u.pathname.slice(1);
    else if (h.endsWith('youtube.com')) id = u.searchParams.get('v') ?? u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]+)/)?.[1] ?? null;
    if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
    const v = h.endsWith('vimeo.com') ? u.pathname.match(/\/(\d+)/)?.[1] : null;
    if (v) return `https://player.vimeo.com/video/${v}`;
  } catch { /* fall through */ }
  return null;
}

/** Course cards for teachers and school admins. */
export function TrainingCourses({ base }: { base: string }) {
  const q = useQuery({ queryKey: ['training', 'courses'], queryFn: () => api.get<any[]>('/training/courses') });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  if (!q.data.length) return <EmptyState icon={<span className="text-4xl">🎓</span>} title="No training courses yet">Your publisher will add short courses here.</EmptyState>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{q.data.map((c) => {
      const pct = c.lessons ? Math.round((c.done / c.lessons) * 100) : 0;
      return (
        <Link key={c.id} href={`${base}/${c.id}`} className="focus-ring group block rounded-xl">
          <Card className="h-full overflow-hidden transition group-hover:shadow-md">
            <div className="h-2" style={{ background: c.color }} />
            <div className="space-y-2 p-5">
              <h3 className="font-semibold text-slate-900">{c.title}</h3>
              <p className="line-clamp-2 text-sm text-slate-600">{c.description}</p>
              <p className="text-xs text-slate-600">{c.lessons} lesson(s) · about {c.minutes} min</p>
              <div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
                <span className="text-xs font-medium text-slate-700">{pct === 100 ? '✓ Done' : c.done ? `${pct}%` : 'Start'}</span></div>
            </div>
          </Card>
        </Link>);
    })}</div>
  );
}

/** Course player: lesson list, content, quiz and completion certificate. */
export function CoursePlayer({ id, back }: { id: string; back: string }) {
  const q = useQuery({ queryKey: ['training', 'course', id], queryFn: () => api.get<any>(`/training/courses/${id}`) });
  const [cur, setCur] = useState<string | null>(null);
  const qc = useQueryClient(); const toast = useToast(); const brand = useBranding(); const me = useMe().data as any;
  const [answers, setAnswers] = useState<Record<number, number>>({}); const [result, setResult] = useState<any>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data && !cur) setCur((q.data.lessons.find((l: any) => !l.completedAt) ?? q.data.lessons[0])?.id ?? null); }, [q.data, cur]);
  useEffect(() => { setAnswers({}); setResult(null); }, [cur]);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const c = q.data; const lessons = c.lessons as any[];
  const i = lessons.findIndex((l) => l.id === cur); const l = lessons[i];
  const done = lessons.filter((x) => x.completedAt).length;
  const finish = async () => {
    setBusy(true);
    try {
      const r = await api.post<any>(`/training/lessons/${l.id}/complete`, l.kind === 'QUIZ' ? { answers: l.quiz.map((_: any, k: number) => answers[k] ?? -1) } : {});
      setResult(r);
      if (r.passed) {
        await qc.invalidateQueries({ queryKey: ['training'] });
        toast(l.kind === 'QUIZ' ? `Passed with ${r.score}%` : 'Lesson done');
        if (l.kind !== 'QUIZ' && lessons[i + 1]) setCur(lessons[i + 1].id);
      }
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const certificate = () => printCertificates([me?.displayName ?? ''], brand, { title: 'Certificate of Completion', line: 'for successfully completing the teacher training course', detail: c.title, icon: '🎓',
    school: me?.school?.name ?? brand.name, signer: '', signer2: '', date: new Date(c.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) });
  const embed = l?.kind === 'VIDEO' ? embedUrl(l.url) : null;
  return (
    <div className="space-y-5">
      <Link href={back} className="text-sm text-slate-600 hover:text-slate-900">← All courses</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-slate-900">{c.title}</h1><p className="text-sm text-slate-600">{c.description}</p></div>
        {c.completedAt && <Button onClick={certificate}><Award className="size-4" />Print certificate</Button>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 text-sm"><b>{done}</b> of {lessons.length} done
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }} /></div></div>
          <ol className="divide-y divide-slate-100">{lessons.map((x, k) => { const Icon = KIND_ICON[x.kind as keyof typeof KIND_ICON]; return (
            <li key={x.id}><button onClick={() => setCur(x.id)} aria-current={x.id === cur ? 'step' : undefined}
              className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm', x.id === cur ? 'bg-brand-50 font-medium text-brand-800' : 'hover:bg-slate-50')}>
              {x.completedAt ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-label="done" /> : <Circle className="size-4 shrink-0 text-slate-400" aria-label="not done" />}
              <span className="min-w-0 flex-1"><span className="block truncate">{k + 1}. {x.title}</span><span className="flex items-center gap-1 text-xs font-normal text-slate-600"><Icon className="size-3" />{KIND_NAME[x.kind as keyof typeof KIND_NAME]} · {x.minutes} min</span></span>
            </button></li>); })}</ol>
        </Card>
        {l && <Card className="p-6">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">{l.title}</h2>
          {l.kind === 'VIDEO' && (embed
            ? <div className="aspect-video overflow-hidden rounded-xl bg-black"><iframe src={embed} title={l.title} className="size-full" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>
            : <a className="text-brand-700 underline" href={l.url} target="_blank" rel="noopener noreferrer">Open the video</a>)}
          {l.body && <div className="mt-4 whitespace-pre-wrap leading-relaxed text-slate-800">{l.body}</div>}
          {l.kind === 'LINK' && <a href={l.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"><ExternalLink className="size-4" />Open the resource</a>}
          {l.kind === 'QUIZ' && (
            <ol className="mt-2 space-y-5">{l.quiz.map((x: any, k: number) => (
              <li key={k}><fieldset><legend className="mb-2 font-medium text-slate-900">{k + 1}. {x.q}</legend>
                <div className="space-y-1.5">{x.options.map((o: string, j: number) => (
                  <label key={j} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm', answers[k] === j ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:bg-slate-50',
                    result && !result.passed && answers[k] === j && (result.correct[k] ? 'border-emerald-600 bg-emerald-50' : 'border-red-500 bg-red-50'))}>
                    <input type="radio" name={`q${k}`} checked={answers[k] === j} onChange={() => { setAnswers({ ...answers, [k]: j }); setResult(null); }} />{o}</label>))}</div>
                {result && !result.passed && <p className={cn('mt-1 text-xs font-medium', result.correct[k] ? 'text-emerald-700' : 'text-red-700')}>{result.correct[k] ? 'Correct' : 'Not quite — try again'}</p>}
              </fieldset></li>))}</ol>)}
          {result && !result.passed && <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">You scored {result.score}%. You need {result.pass}% to pass — change your answers and check again.</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            {l.completedAt ? <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="size-4" />Done{l.score !== null && l.score !== undefined ? ` · ${l.score}%` : ''}</span>
              : <Button loading={busy} disabled={l.kind === 'QUIZ' && Object.keys(answers).length < l.quiz.length} onClick={finish}>{l.kind === 'QUIZ' ? 'Check answers' : 'Mark as done'}</Button>}
            {lessons[i + 1] && <Button variant="secondary" className="ml-auto" onClick={() => setCur(lessons[i + 1].id)}>Next lesson →</Button>}
          </div>
        </Card>}
      </div>
    </div>
  );
}
