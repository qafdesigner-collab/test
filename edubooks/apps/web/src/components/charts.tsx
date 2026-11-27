'use client';
import { useRef, useState } from 'react';

export interface Series { key: string; label: string; color: string }
/** Validated categorical pair (reference palette slots 1–2). */
export const SERIES_COLORS = ['#2a78d6', '#eb6834'];
const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Daily line chart: 2px lines from a zero baseline, crosshair + tooltip on hover, legend for 2+ series, table for screen readers. */
export function LineChart({ data, series, height = 200, title }: { data: Record<string, any>[]; series: Series[]; height?: number; title: string }) {
  const ref = useRef<SVGSVGElement>(null); const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, L = 32, R = 8, T = 10, B = 24;
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const step = max <= 4 ? 1 : Math.ceil(max / 4);
  const top = step * Math.ceil(max / step);
  const x = (i: number) => L + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.ceil(data.length / 8);
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - L) / (W - L - R)) * (data.length - 1)))));
  };
  return (
    <figure className="m-0">
      {series.length > 1 && <figcaption className="mb-2 flex flex-wrap gap-4 text-xs text-slate-700">{series.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />{s.label}</span>)}</figcaption>}
      <div className="relative">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t ? '#f1f5f9' : '#cbd5e1'} /><text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#64748b">{t}</text></g>)}
          {data.map((d, i) => ((i % labelEvery === 0 && data.length - 1 - i >= labelEvery / 2) || i === data.length - 1) && <text key={d.day} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748b">{fmtDay(d.day)}</text>)}
          {series.map((s) => <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={data.map((d, i) => `${x(i)},${y(Number(d[s.key]) || 0)}`).join(' ')} />)}
          {hover !== null && <><line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="3 3" />
            {series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(Number(data[hover][s.key]) || 0)} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />)}</>}
        </svg>
        {hover !== null && <div className={`pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg ${x(hover) / W > 0.8 ? '-translate-x-full -ml-2' : x(hover) / W < 0.2 ? 'ml-2' : '-translate-x-1/2'}`} style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{fmtDay(data[hover].day)}</b>{series.map((s) => <div key={s.key} className="flex items-center gap-1.5"><i className="inline-block size-2 rounded-full" style={{ background: s.color }} />{s.label}: {data[hover][s.key]}</div>)}</div>}
      </div>
      <table className="sr-only"><caption>{title}</caption><thead><tr><th>Day</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{data.map((d) => <tr key={d.day}><td>{fmtDay(d.day)}</td>{series.map((s) => <td key={s.key}>{d[s.key]}</td>)}</tr>)}</tbody></table>
    </figure>
  );
}

/** Horizontal percentage bar for tables. */
export function PctBar({ value, good = 70, warn = 50 }: { value: number | null; good?: number; warn?: number }) {
  if (value === null || value === undefined) return <span className="text-slate-500">—</span>;
  const tone = value >= good ? 'text-emerald-700' : value >= warn ? 'text-amber-700' : 'text-red-700';
  return <span className="inline-flex items-center gap-2"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-slate-600" style={{ width: `${Math.min(100, value)}%` }} /></span><span className={`font-medium tabular-nums ${tone}`}>{value}%</span></span>;
}
