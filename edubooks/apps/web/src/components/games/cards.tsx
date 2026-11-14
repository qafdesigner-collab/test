'use client';
import Link from 'next/link';
import { ENGINE_INFO, Engine } from './engines';

export function GameCard({ g }: { g: any }) {
  const info = ENGINE_INFO[g.engine as Engine];
  return (
    <Link href={`/learn/games/${g.id}`} className="group relative flex flex-col items-center rounded-[2rem] bg-white p-5 text-center shadow-sm ring-4 ring-white transition hover:-rotate-1 hover:scale-105 motion-reduce:transform-none">
      {g.assignmentId && <span className="absolute -top-3 left-3 rounded-full bg-pink-600 px-3 py-1 text-xs font-black text-white shadow">From teacher</span>}
      <span className="grid size-20 place-items-center rounded-3xl text-5xl shadow-inner" style={{ background: `${info.color}33` }}>{info.icon}</span>
      <span className="mt-3 line-clamp-2 text-lg font-black leading-tight text-slate-800">{g.title}</span>
      <span className="mt-1 text-xs font-bold text-slate-500">{g.bookTitle ?? info.label}</span>
      <span className="mt-2 text-2xl" aria-label={`${g.best ?? 0} of 3 stars`}>{[1, 2, 3].map((n) => <span key={n} className={n <= (g.best ?? 0) ? '' : 'opacity-20 grayscale'}>⭐</span>)}</span>
    </Link>
  );
}
