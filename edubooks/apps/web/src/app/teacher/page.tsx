'use client';
import Link from 'next/link';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api, fmtDay } from '@/lib/api';
import { className, KIND_LABEL, useMyBooks, useMyClasses } from '@/lib/lms';
import { useMe } from '@/lib/session';
import { PageLoader } from '@/components/ui';
import { UpcomingEvents } from '@/components/calendar';
import { Book3D, Shelf } from '@/components/kid-ui';
import { ActionTile, Bar, Doodles, Faces, GRADIENTS, GradientCard, greeting, Hero, Panel, Pill, Ring, StatTile, TipNote, WeekStrip } from '@/components/vivid';

const HEX = ['#6366f1', '#ec4899', '#0ea5e9', '#f43f5e', '#10b981', '#a855f7', '#2563eb', '#ef4444'];
const today = () => new Date().toISOString().slice(0, 10);
const nowHm = () => new Date().toTimeString().slice(0, 5);

export default function TeacherHome() {
  const { data: me } = useMe(); const classes = useMyClasses(); const books = useMyBooks();
  const work = useQuery({ queryKey: ['assessments', 'all'], queryFn: () => api.get<any[]>('/teacher/assessments') });
  const tt = useQuery({ queryKey: ['timetable', 'me'], queryFn: () => api.get<any>('/timetable/me') });
  const ids: string[] = (classes.data ?? []).map((c) => c.id);
  const insights = useQueries({ queries: ids.map((id) => ({ queryKey: ['insights', 'class', id], queryFn: () => api.get<any>(`/analytics/classes/${id}`) })) });
  const registers = useQueries({ queries: ids.map((id) => ({ queryKey: ['attendance', id, today()], queryFn: () => api.get<any>(`/attendance/classes/${id}`) })) });
  if (!classes.data || !books.data) return <PageLoader />;

  const g = greeting();
  const firstName = (me?.displayName ?? '').trim();
  const pupils = classes.data.reduce((n, c) => n + (c.students ?? 0), 0);
  const toMark = (work.data ?? []).filter((a) => a.toGrade > 0);
  const toMarkCount = toMark.reduce((n, a) => n + a.toGrade, 0);
  const ins = insights.map((q) => q.data).filter(Boolean);
  const stars = ins.reduce((n, x) => n + x.students.reduce((m: number, s: any) => m + (s.stars ?? 0), 0), 0);
  const regs = registers.map((q) => q.data).filter((r) => r?.marked);
  const present = regs.reduce((n, r) => n + r.summary.PRESENT + r.summary.LATE, 0);
  const counted = regs.reduce((n, r) => n + r.summary.total, 0);
  const attendance = counted ? `${Math.round((present / counted) * 100)}%` : '—';

  // Today's lessons from the timetable
  const wd = new Date().getDay() || 7;
  const periods: any[] = tt.data?.periods ?? [];
  const slots = (tt.data?.slots ?? []).filter((s: any) => s.weekday === wd).map((s: any) => ({ ...s, p: periods.find((p) => p.number === s.period) })).filter((s: any) => s.p)
    .sort((a: any, b: any) => a.p.startsAt.localeCompare(b.p.startsAt));
  const t = nowHm();
  const state = (s: any) => (s.p.endsAt <= t ? 'done' : s.p.startsAt <= t ? 'now' : 'next');
  const next = slots.find((s: any) => state(s) !== 'done');

  const needHelp = ins.flatMap((x) => x.students.filter((s: any) => s.flags.length).map((s: any) => ({ ...s, cls: className(x.class) })))
    .sort((a: any, b: any) => b.flags.length - a.flags.length || (a.average ?? 101) - (b.average ?? 101)).slice(0, 5);

  return (
    <div className="space-y-6">
      <Hero>
        <Doodles />
        <p className="font-medium opacity-95">{g.icon} {g.text}</p>
        <h1 className="mb-1.5 mt-1 text-3xl font-extrabold sm:text-[32px]">{firstName} 👋</h1>
        <p className="font-medium opacity-95">
          {slots.length ? `You have ${slots.length} lesson${slots.length === 1 ? '' : 's'} today` : 'No lessons on your timetable today'}
          {toMarkCount ? ` and ${toMarkCount} piece${toMarkCount === 1 ? '' : 's'} of work to mark.` : ' and nothing waiting to be marked. 🎉'}</p>
        {slots.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2.5">
            {slots.map((s: any) => {
              const st = state(s);
              return (
                <Link key={s.id} href={`/teacher/classes/${s.classId}`} className={st === 'now' ? 'min-w-[150px] rounded-2xl bg-white px-3.5 py-2.5 text-violet-700 shadow' : 'min-w-[150px] rounded-2xl bg-white/20 px-3.5 py-2.5 backdrop-blur-sm hover:bg-white/30'}>
                  <small className={st === 'now' ? 'font-semibold text-slate-500' : 'opacity-85'}>
                    {st === 'now' ? `NOW · ${s.p.startsAt} – ${s.p.endsAt}` : s.p.startsAt}{st === 'done' && ' · done ✓'}{s.onlineUrl && ' · 🎥 live'}</small>
                  <b className="block text-[15px]">{className({ name: s.className, section: s.section })}{s.subject ? ` · ${s.subject}` : ''}</b>
                </Link>
              );
            })}
          </div>
        )}
      </Hero>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon="👥" bg="#ede9fe" value={pupils} label={`students in ${classes.data.length} class${classes.data.length === 1 ? '' : 'es'}`} href="/teacher/classes" />
        <StatTile icon="✏️" bg="#fce7f3" value={toMarkCount} label="to mark" href="/teacher/assessments" />
        <StatTile icon="✅" bg="#dcfce7" value={attendance} label={regs.length ? 'attendance today' : 'register not taken yet'} href="/teacher/attendance" />
        <StatTile icon="⭐" bg="#fef3c7" value={stars} label="stars earned by my students" href="/teacher/insights" />
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <ActionTile href="/teacher/attendance" icon="✅" label="Take register" gradient="from-[#45b483] to-[#2f9468]" />
        <ActionTile href="/teacher/assessments/new" icon="✏️" label="Set homework" gradient="from-[#ec9a5c] to-[#cf7840]" />
        <ActionTile href="/teacher/plans/new" icon="📝" label="Plan a lesson" gradient="from-[#8b7be0] to-[#6a5acb]" />
        <ActionTile href="/teacher/ai" icon="✨" label="Ask the AI" gradient="from-[#e07aa3] to-[#c45886]" />
        <ActionTile href="/teacher/games" icon="🎮" label="Assign a game" gradient="from-[#4fa9dc] to-[#3486bf]" />
        <ActionTile href="/teacher/exams" icon="🧾" label="Make an exam" gradient="from-[#e27c7c] to-[#c55c5c]" />
      </div>

      <div className="grid gap-5 md:grid-cols-[1.45fr_1fr]">
        <Panel title="My week" link={{ href: '/teacher/timetable', label: 'Timetable' }}>
          {(tt.data?.slots ?? []).length ? <WeekStrip slots={tt.data.slots} />
            : <p className="py-4 text-center text-sm text-slate-500">Your lessons appear here once your school admin fills in the timetable.</p>}
        </Panel>
        <div className="flex items-center px-2 py-1"><div className="w-full"><TipNote /></div></div>
      </div>

      {!books.data.length && <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">You don&apos;t have a teacher seat for any book yet. Ask your school admin to give you one under “Book licences”.</div>}

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-5">
          <Panel title="My classes" link={{ href: '/teacher/classes', label: 'All classes' }}>
            <div className="grid gap-3.5 sm:grid-cols-2">
              {classes.data.map((c, i) => {
                const x = insights[i]?.data;
                const avg = x?.summary?.average ?? null; const help = x?.summary?.needAttention ?? 0;
                return (
                  <GradientCard key={c.id} href={`/teacher/classes/${c.id}`} gradient={GRADIENTS[i % GRADIENTS.length]}>
                    <b className="text-xl">{className(c)}</b>
                    <small className="block opacity-90">{c.students} student{c.students === 1 ? '' : 's'} · {c.academicYear}</small>
                    <Faces n={c.students ?? 0} color={HEX[i % HEX.length]} />
                    <Bar pct={avg} />
                    <small className="mt-1 block opacity-90">{avg === null ? 'No marked work yet' : `Average ${avg}%`}{help ? ` · ${help} need${help === 1 ? 's' : ''} help` : ' · everyone on track'}</small>
                  </GradientCard>
                );
              })}
              <div className="grid min-h-[140px] place-items-center rounded-[20px] border-2 border-dashed border-violet-300 bg-slate-50 p-4 text-center text-violet-700">
                <div><b className="text-2xl">＋</b><small className="block text-slate-500">Your school admin<br />adds classes</small></div></div>
            </div>
          </Panel>

          <Panel title="To mark" link={{ href: '/teacher/assessments', label: 'Open marking' }}>
            {toMark.slice(0, 6).map((a) => {
              const overdue = a.dueAt && new Date(a.dueAt) < new Date();
              return (
                <Link key={a.id} href={`/teacher/assessments/${a.id}`} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0 hover:bg-slate-50/60">
                  <Ring tone="pink">{a.toGrade}</Ring>
                  <span className="min-w-0 flex-1"><b className="block truncate text-slate-900">{a.title}</b>
                    <small className="text-slate-500">{KIND_LABEL[a.kind]} · {a.className}{a.dueAt && ` · due ${fmtDay(a.dueAt)}`}</small></span>
                  <Pill tone={overdue ? 'amber' : 'violet'}>{overdue ? 'past due' : `${a.submitted}/${a.assigned} handed in`}</Pill>
                </Link>
              );
            })}
            {!toMark.length && <p className="py-4 text-center text-sm text-slate-500">🎉 All marked. Nothing is waiting for you.</p>}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Students who need a little help" link={{ href: '/teacher/insights', label: 'Insights' }}>
            {needHelp.map((s: any) => (
              <div key={`${s.cls}-${s.id}`} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
                <Ring tone={s.average === null ? 'amber' : 'red'}>{s.average === null ? '—' : `${s.average}%`}</Ring>
                <span className="min-w-0 flex-1"><b className="block truncate text-slate-900">{s.displayName}</b>
                  <small className="text-slate-500">{s.cls} · {s.flags.join(', ').toLowerCase()}{s.missing ? ` (${s.missing})` : ''}</small></span>
                <Link href="/teacher/messages" className="focus-ring rounded-full"><Pill>Message parent</Pill></Link>
              </div>
            ))}
            {!needHelp.length && <p className="py-4 text-center text-sm text-slate-500">{insights.some((q) => q.isLoading) ? 'Looking at your classes…' : '🌟 Everyone is doing well this week.'}</p>}
          </Panel>

          <Panel title="My books" link={{ href: '/teacher/books', label: 'All books' }}>
            {books.data.length > 0 && <>
              <div className="flex items-end gap-4 overflow-x-auto px-1.5 pb-1 pt-1.5">
                {books.data.slice(0, 5).map((b) => (
                  <Link key={b.editionId} href={`/read/${b.editionId}`} title={b.title} className="focus-ring w-[72px] shrink-0 rounded"><Book3D url={b.coverUrl} color={b.coverColor} title={b.title} /></Link>
                ))}
              </div>
              <Shelf />
            </>}
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-100 to-pink-100 p-3.5">
              <span className="text-3xl" aria-hidden>✨</span>
              <div className="text-sm">
                {next ? <><b className="text-slate-900">{state(next) === 'now' ? 'Now' : 'Next lesson'}: {className({ name: next.className, section: next.section })}{next.subject ? ` · ${next.subject}` : ''}</b>
                  <small className="block text-slate-600">{next.p.startsAt}{next.room ? ` · ${next.room}` : ''} — <Link className="font-semibold text-violet-700 hover:underline" href="/teacher/plans/new">open a plan</Link>, or <Link className="font-semibold text-violet-700 hover:underline" href="/teacher/ai">ask the AI</Link> for a warm-up game.</small></>
                  : <><b className="text-slate-900">Plan ahead</b><small className="block text-slate-600">No more lessons today. <Link className="font-semibold text-violet-700 hover:underline" href="/teacher/plans/new">Plan tomorrow</Link> or <Link className="font-semibold text-violet-700 hover:underline" href="/teacher/ai">ask the AI</Link> for ideas.</small></>}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <UpcomingEvents />
    </div>
  );
}
