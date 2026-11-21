'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, downloadCsv, fmtDay } from '@/lib/api';
import { Badge, Card, ErrorBox, PageLoader } from '@/components/ui';
import { LineChart, PctBar, SERIES_COLORS } from '@/components/charts';

const Tile = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
  <Card className="p-5"><div className="text-sm text-slate-600">{label}</div><div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>{sub && <div className="mt-1 text-xs text-slate-600">{sub}</div>}</Card>);
export const Section = ({ title, children, csv }: { title: string; children: React.ReactNode; csv?: () => void }) => (
  <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="font-semibold text-slate-900">{title}</h2>
    {csv && <button onClick={csv} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><Download className="size-4" />CSV</button>}</div>{children}</Card>);
const TH = ({ children }: { children?: React.ReactNode }) => <th className="px-4 py-2 font-medium">{children}</th>;

/** One class: who needs help, hardest lessons and questions, activity. */
export function ClassInsights({ classId }: { classId: string }) {
  const q = useQuery({ queryKey: ['insights', classId], queryFn: () => api.get<any>(`/analytics/classes/${classId}`) });
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const d = q.data; const s = d.summary;
  const list = (d.students as any[]).filter((x) => !onlyFlagged || x.flags.length);
  return (
    <div className="space-y-6">
      {s && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Average score" value={s.average === null ? '—' : `${s.average}%`} sub="marked homework and tests" />
        <Tile label="Homework handed in" value={s.homeworkRate === null ? '—' : `${s.homeworkRate}%`} sub="of work that is due" />
        <Tile label="Active this week" value={`${s.activeThisWeek} / ${s.students}`} sub="signed in, read, played or handed in" />
        <Tile label="Need attention" value={s.needAttention} sub="low scores, missing work or inactive" /></div>}
      <Section title="Students active each day (last 30 days)"><div className="p-4"><LineChart title="Active students per day" data={d.trend} series={[{ key: 'active', label: 'Active students', color: SERIES_COLORS[0] }]} /></div></Section>
      <Section title="Students" csv={() => downloadCsv('class-insights.csv', d.students.map((x: any) => ({ student: x.displayName, average: x.average ?? '', handedIn: x.handed, due: x.due, missing: x.missing, lastActive: x.lastActive ?? '', activeDays14: x.activeDays14, pagesRead: x.pagesRead, stars: x.stars, attention: x.flags.join('; ') })))}>
        <label className="flex items-center gap-2 border-b border-slate-100 px-5 py-2 text-sm text-slate-700"><input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />Only students who need attention</label>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><TH>Student</TH><TH>Average</TH><TH>Homework</TH><TH>Last active</TH><TH>Days active (14)</TH><TH>Pages read</TH><TH>Stars</TH><TH>Attention</TH></tr></thead>
          <tbody className="divide-y divide-slate-100">{list.map((x: any) => (
            <tr key={x.id}><td className="px-4 py-2 font-medium">{x.displayName}</td><td className="px-4 py-2"><PctBar value={x.average} /></td>
              <td className="px-4 py-2">{x.handed} / {x.due}{x.missing ? <span className="ml-1 text-red-700">({x.missing} missing)</span> : ''}</td>
              <td className="px-4 py-2">{x.lastActive ? fmtDay(x.lastActive) : 'never'}</td><td className="px-4 py-2">{x.activeDays14}</td><td className="px-4 py-2">{x.pagesRead}</td><td className="px-4 py-2">{x.stars}</td>
              <td className="px-4 py-2"><div className="flex flex-wrap gap-1">{x.flags.map((f: string) => <Badge key={f} tone="danger">{f}</Badge>)}</div></td></tr>))}
            {!list.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-600">{onlyFlagged ? 'Nobody needs attention right now. 🎉' : 'No students in this class.'}</td></tr>}</tbody>
        </table></div>
      </Section>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Lessons to revisit (lowest scores first)">{!d.lessons.length ? <p className="p-5 text-sm text-slate-600">No marked work linked to book lessons yet.</p> : (
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><TH>Lesson</TH><TH>Average</TH><TH>Marked</TH></tr></thead>
            <tbody className="divide-y divide-slate-100">{d.lessons.map((l: any) => <tr key={l.id}><td className="px-4 py-2"><b>Unit {l.unit} · Lesson {l.lesson}</b> {l.title}<span className="block text-xs text-slate-600">{l.book}</span></td><td className="px-4 py-2"><PctBar value={l.average} /></td><td className="px-4 py-2">{l.marked}</td></tr>)}</tbody></table>)}</Section>
        <Section title="Hardest questions">{!d.questions.length ? <p className="p-5 text-sm text-slate-600">Appears once auto-marked questions have at least two answers.</p> : (
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><TH>Question</TH><TH>Answered right</TH><TH>Answers</TH></tr></thead>
            <tbody className="divide-y divide-slate-100">{d.questions.map((x: any) => <tr key={x.id}><td className="px-4 py-2">{x.prompt}<span className="block text-xs text-slate-600">{x.assessment}</span></td><td className="px-4 py-2"><PctBar value={x.correct} /></td><td className="px-4 py-2">{x.answers}</td></tr>)}</tbody></table>)}</Section>
      </div>
      {d.games.length > 0 && <Section title="Games played by this class">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><TH>Game</TH><TH>Players</TH><TH>Plays</TH><TH>Average score</TH><TH>Stars</TH></tr></thead>
          <tbody className="divide-y divide-slate-100">{d.games.map((g: any) => <tr key={g.id}><td className="px-4 py-2 font-medium">{g.title}</td><td className="px-4 py-2">{g.players}</td><td className="px-4 py-2">{g.plays}</td><td className="px-4 py-2"><PctBar value={g.average} /></td><td className="px-4 py-2">{g.stars} ★</td></tr>)}</tbody></table></Section>}
    </div>
  );
}

export function SchoolInsights() {
  const q = useQuery({ queryKey: ['insights', 'school'], queryFn: () => api.get<any>('/analytics/school') });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <Section title="People active each day (last 30 days)"><div className="p-4"><LineChart title="Active students and teachers per day" data={d.trend}
        series={[{ key: 'students', label: 'Students', color: SERIES_COLORS[0] }, { key: 'teachers', label: 'Teachers', color: SERIES_COLORS[1] }]} /></div></Section>
      <Section title="Classes" csv={() => downloadCsv('school-insights.csv', d.classes.map((c: any) => ({ class: `${c.name} ${c.section}`.trim(), students: c.students, activeThisWeek: c.active7, average: c.average ?? '', homeworkRate: c.homeworkRate ?? '', pagesRead: c.pagesRead, gamePlays30: c.gamePlays30 })))}>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><TH>Class</TH><TH>Students</TH><TH>Active this week</TH><TH>Average score</TH><TH>Homework handed in</TH><TH>Pages read</TH><TH>Game plays (30 days)</TH></tr></thead>
          <tbody className="divide-y divide-slate-100">{d.classes.map((c: any) => <tr key={c.id}><td className="px-4 py-2 font-medium">{c.name}{c.section && ` — ${c.section}`}</td><td className="px-4 py-2">{c.students}</td>
            <td className="px-4 py-2"><PctBar value={c.students ? Math.round((c.active7 / c.students) * 100) : null} /> <span className="text-xs text-slate-600">({c.active7})</span></td>
            <td className="px-4 py-2"><PctBar value={c.average} /></td><td className="px-4 py-2"><PctBar value={c.homeworkRate} /></td><td className="px-4 py-2">{c.pagesRead}</td><td className="px-4 py-2">{c.gamePlays30}</td></tr>)}</tbody></table></div></Section>
    </div>
  );
}

export function PublisherInsights() {
  const q = useQuery({ queryKey: ['insights', 'publisher'], queryFn: () => api.get<any>('/analytics/publisher') });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <Section title="People active each day, all schools (last 60 days)"><div className="p-4"><LineChart title="Active students and teachers per day" data={d.trend}
        series={[{ key: 'students', label: 'Students', color: SERIES_COLORS[0] }, { key: 'teachers', label: 'Teachers', color: SERIES_COLORS[1] }]} /></div></Section>
      <Section title="Schools" csv={() => downloadCsv('school-engagement.csv', d.schools.map((s: any) => ({ school: s.name, city: s.city ?? '', demo: s.isDemo ? 'yes' : '', students: s.students, activeThisWeek: s.active7, active30Days: s.active30, teachersActive30: s.teachers30, reading30: s.reading30, games30: s.games30, homework30: s.homework30, lastActive: s.lastActive ?? '' })))}>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><TH>School</TH><TH>Students</TH><TH>Active this week</TH><TH>Active (30 days)</TH><TH>Teachers active</TH><TH>Reading · games · homework (30 days)</TH><TH>Last activity</TH></tr></thead>
          <tbody className="divide-y divide-slate-100">{d.schools.map((s: any) => <tr key={s.id}><td className="px-4 py-2 font-medium">{s.name}{s.isDemo && <Badge className="ml-2">demo</Badge>}<span className="block text-xs font-normal text-slate-600">{s.city}</span></td>
            <td className="px-4 py-2">{s.students}</td><td className="px-4 py-2"><PctBar value={s.engagement} good={50} warn={25} /></td><td className="px-4 py-2">{s.active30}</td><td className="px-4 py-2">{s.teachers30}</td>
            <td className="px-4 py-2 tabular-nums">{s.reading30} · {s.games30} · {s.homework30}</td><td className="px-4 py-2">{s.lastActive ? fmtDay(s.lastActive) : 'never'}</td></tr>)}</tbody></table></div></Section>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Most-read books">{!d.books.length ? <p className="p-5 text-sm text-slate-600">No reading yet.</p> : (
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><TH>Book</TH><TH>Readers</TH><TH>Schools</TH><TH>Pages read</TH></tr></thead>
            <tbody className="divide-y divide-slate-100">{d.books.map((b: any) => <tr key={b.id}><td className="px-4 py-2 font-medium">{b.title}</td><td className="px-4 py-2">{b.readers}</td><td className="px-4 py-2">{b.schools}</td><td className="px-4 py-2">{b.pages}</td></tr>)}</tbody></table>)}</Section>
        <Section title="Most-played games (90 days)">{!d.games.length ? <p className="p-5 text-sm text-slate-600">No games played yet.</p> : (
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><TH>Game</TH><TH>Players</TH><TH>Plays</TH><TH>Stars</TH></tr></thead>
            <tbody className="divide-y divide-slate-100">{d.games.map((g: any) => <tr key={g.id}><td className="px-4 py-2 font-medium">{g.title}</td><td className="px-4 py-2">{g.players}</td><td className="px-4 py-2">{g.plays}</td><td className="px-4 py-2">{g.stars} ★</td></tr>)}</tbody></table>)}</Section>
      </div>
    </div>
  );
}
