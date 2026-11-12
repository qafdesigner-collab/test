'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, downloadCsv, fmtDay, qs } from '@/lib/api';
import { Money, useMoney } from '@/lib/company';
import { Badge, Card, ErrorBox, Input, PageLoader } from '@/components/ui';
import { PageHeader } from '@/components/common';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const short = (minor: number) => { const v = minor / 100; return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)); };
const monthName = (m: string) => new Date(m + '-15').toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

export default function SalesPage() {
  const [range, setRange] = useState({ from: '', to: '' });
  const q = useQuery({ queryKey: ['sales', range], queryFn: () => api.get<any>(`/sales/dashboard${qs({ from: range.from || undefined, to: range.to || undefined })}`) });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <PageLoader />;
  const d = q.data; const cur = d.currency; const k = d.kpis;
  const tiles = [
    { label: 'Revenue', value: <Money v={k.revenue} />, sub: `${k.orders} confirmed order(s) · ${k.orderingSchools} school(s)` },
    { label: 'Seats sold', value: k.seatsSold.toLocaleString(), sub: 'student + teacher, in this period' },
    { label: 'Paying schools', value: k.licensedSchools, sub: `${k.activeSchools} active schools · ${k.demoSchools} on demo` },
    { label: 'Seat usage today', value: k.usage === null ? '—' : `${k.usage}%`, sub: `${k.assignedSeats.toLocaleString()} of ${k.liveSeats.toLocaleString()} student seats given out` },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Sales" sub="Revenue from confirmed orders, licences in use, and the schools to follow up.">
        <div className="flex items-end gap-2 text-sm">
          <label className="text-slate-700">From<Input type="date" className="mt-1 h-9" value={range.from || d.range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label className="text-slate-700">To<Input type="date" className="mt-1 h-9" value={range.to || d.range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        </div>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{tiles.map((t) => (
        <Card key={t.label} className="p-5"><div className="text-sm text-slate-600">{t.label}</div><div className="mt-2 text-2xl font-semibold text-slate-900">{t.value}</div><div className="mt-1 text-xs text-slate-600">{t.sub}</div></Card>))}</div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-slate-900">Revenue by month <span className="font-normal text-slate-600">({cur})</span></h2>
          <button className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline" onClick={() => downloadCsv('revenue-by-month.csv', d.monthly.map((m: any) => ({ month: m.month, orders: m.orders, revenue: m.revenue / 100 })))}><Download className="size-4" />CSV</button></div>
        {k.revenue ? <MonthChart data={d.monthly} currency={cur} /> : <p className="py-10 text-center text-sm text-slate-600">No confirmed orders between {fmtDay(d.range.from)} and {fmtDay(d.range.to)}. Change the dates above, or confirm an order under Orders.</p>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Table title="By city" csv="sales-by-city.csv" rows={d.byCity} cols={[
          ['City', (r) => r.city], ['Schools', (r) => `${r.licensed} / ${r.schools}`, 'paying / all'], ['Revenue', (r) => <Money v={r.revenue} />, '', (r) => r.revenue / 100],
          ['Seats in use', (r) => r.seats ? `${r.assigned} / ${r.seats}` : '—']]} />
        <Table title="By product" csv="sales-by-product.csv" rows={d.byProduct} empty="No confirmed orders in this period." cols={[
          ['Product', (r) => <><b>{r.product}</b><span className="block text-xs text-slate-600">{r.sku}</span></>, '', (r) => r.product], ['Schools', (r) => r.schools],
          ['Seats', (r) => `${r.studentSeats} + ${r.teacherSeats}`, 'student + teacher'], ['Revenue', (r) => <Money v={r.revenue} />, '', (r) => r.revenue / 100]]} />
      </div>

      <Table title="Top schools" csv="top-schools.csv" rows={d.topSchools} cols={[
        ['School', (r) => <Link className="font-medium text-brand-700 hover:underline" href={`/admin/schools/${r.id}`}>{r.name}</Link>, '', (r) => r.name], ['City', (r) => r.city ?? ''],
        ['Orders', (r) => r.orders], ['Revenue', (r) => <Money v={r.revenue} />, '', (r) => r.revenue / 100],
        ['Seats in use', (r) => r.seats ? <Usage a={r.assigned} b={r.seats} /> : '—', '', (r) => `${r.assigned}/${r.seats}`]]} />

      <h2 className="pt-2 text-lg font-semibold text-slate-900">Follow up</h2>
      <div className="grid gap-6 xl:grid-cols-2">
        <Table title="⏳ Licences ending in the next 60 days" csv="expiring-licences.csv" rows={d.expiring} empty="Nothing ends in the next 60 days." cols={[
          ['School', (r) => <Link className="font-medium text-brand-700 hover:underline" href={`/admin/schools/${r.schoolId}`}>{r.school}</Link>, '', (r) => r.school], ['Product', (r) => r.product],
          ['Ends', (r) => <Badge tone={r.daysLeft <= 14 ? 'danger' : 'DRAFT'}>{fmtDay(r.validUntil)} · {r.daysLeft}d</Badge>, '', (r) => r.validUntil], ['Seats in use', (r) => `${r.assigned} / ${r.seats}`]]} />
        <Table title="🔁 Not renewed (ended in the last 6 months)" csv="not-renewed.csv" rows={d.notRenewed} empty="Every licence that ended was renewed." cols={[
          ['School', (r) => <Link className="font-medium text-brand-700 hover:underline" href={`/admin/schools/${r.schoolId}`}>{r.school}</Link>, '', (r) => r.school], ['Product', (r) => r.product],
          ['Ended', (r) => fmtDay(r.expiredOn), '', (r) => r.expiredOn], ['Seats', (r) => r.seats]]} />
        <Table title="📉 Low use (under 30% of seats given out)" csv="low-usage.csv" rows={d.lowUsage} empty="All schools use most of their seats." cols={[
          ['School', (r) => <Link className="font-medium text-brand-700 hover:underline" href={`/admin/schools/${r.schoolId}`}>{r.school}</Link>, '', (r) => r.school], ['City', (r) => r.city ?? ''],
          ['Seats in use', (r) => <Usage a={r.assigned} b={r.seats} />, '', (r) => `${r.assigned}/${r.seats}`], ['Licence ends', (r) => fmtDay(r.validUntil), '', (r) => r.validUntil]]} />
        <Table title="🧪 Demo schools" csv="demo-schools.csv" rows={d.demos} empty="No demo schools at the moment." cols={[
          ['School', (r) => <Link className="font-medium text-brand-700 hover:underline" href={`/admin/schools/${r.id}`}>{r.name}</Link>, '', (r) => r.name], ['City', (r) => r.city ?? ''],
          ['Users signed in', (r) => r.usersSignedIn],
          ['Demo ends', (r) => r.expiresAt ? <Badge tone={r.daysLeft <= 3 ? 'danger' : 'neutral'}>{r.daysLeft < 0 ? 'ended' : `${fmtDay(r.expiresAt)} · ${r.daysLeft}d`}</Badge> : 'no end date', '', (r) => r.expiresAt ?? '']]} />
      </div>
    </div>
  );
}

function Usage({ a, b }: { a: number; b: number }) {
  const p = pct(a, b) ?? 0;
  return <span className="inline-flex items-center gap-2"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, p)}%` }} /></span><span className="tabular-nums">{a} / {b} ({p}%)</span></span>;
}

type Col = [string, (r: any) => React.ReactNode, string?, ((r: any) => unknown)?];
function Table({ title, rows, cols, csv, empty = 'Nothing to show.' }: { title: string; rows: any[]; cols: Col[]; csv: string; empty?: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h3 className="font-semibold text-slate-900">{title}</h3>
        {rows.length > 0 && <button className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline" onClick={() => downloadCsv(csv, rows.map((r) => Object.fromEntries(cols.map(([h, f, , raw]) => [h, raw ? raw(r) : f(r)]))))}><Download className="size-4" />CSV</button>}</div>
      {!rows.length ? <p className="px-5 py-6 text-sm text-slate-600">{empty}</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr>{cols.map(([h, , hint]) => <th key={h} className="px-4 py-2 font-medium">{h}{hint && <span className="block font-normal">{hint}</span>}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r, i) => <tr key={i}>{cols.map(([h, f]) => <td key={h} className="px-4 py-2">{f(r)}</td>)}</tr>)}</tbody>
        </table></div>)}
    </Card>
  );
}

/** One series: brand-coloured bars from a zero baseline, hover/focus tooltip, hidden table for screen readers. */
function MonthChart({ data, currency }: { data: { month: string; revenue: number; orders: number }[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((m) => m.revenue), 1);
  const nice = (() => { const raw = max / 100 / 4; const p = 10 ** Math.floor(Math.log10(raw || 1)); return Math.ceil(raw / p) * p * 100; })();
  const top = nice * 4;
  return (
    <div>
      <div className="relative flex h-56 gap-3 pl-12" aria-hidden>
        <div className="absolute inset-y-0 left-0 right-0">{[4, 3, 2, 1, 0].map((i) => (
          <div key={i} className="absolute left-0 right-0 flex items-center gap-2" style={{ bottom: `${(i / 4) * 100}%` }}>
            <span className="w-10 -translate-y-0 text-right text-[11px] text-slate-500 tabular-nums">{short(nice * i)}</span><span className={`h-px flex-1 ${i ? 'bg-slate-100' : 'bg-slate-300'}`} /></div>))}</div>
        {data.map((m, i) => (
          <div key={m.month} className="relative z-10 flex flex-1 items-end justify-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className={`w-full max-w-10 rounded-t ${hover === i ? 'bg-brand-700' : 'bg-brand-600'}`} style={{ height: `${(m.revenue / top) * 100}%`, minHeight: m.revenue ? 2 : 0 }} />
            {hover === i && <div className="pointer-events-none absolute bottom-full z-20 mb-1 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
              <b>{monthName(m.month)}</b><br />{<Money v={m.revenue} />}<br />{m.orders} order(s)</div>}
          </div>))}
      </div>
      <div className="mt-2 flex gap-3 pl-12 text-[11px] text-slate-600" aria-hidden>{data.map((m) => <span key={m.month} className="flex-1 text-center">{monthName(m.month)}</span>)}</div>
      <table className="sr-only"><caption>Revenue by month</caption><thead><tr><th>Month</th><th>Revenue</th><th>Orders</th></tr></thead>
        <tbody>{data.map((m) => <tr key={m.month}><td>{monthName(m.month)}</td><td>{<Money v={m.revenue} />}</td><td>{m.orders}</td></tr>)}</tbody></table>
    </div>
  );
}
