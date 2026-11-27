'use client';
/* Sporty games: Penalty kick and Running race (answer questions), Whack-a-mole (tap the right ones fast). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { sfx } from '@/lib/sfx';
import type { EngineProps } from './engines';

const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const isPic = (s: string) => /\p{Extended_Pictographic}/u.test(s) && s.length <= 4;
const BTN = 'focus-ring select-none rounded-3xl font-extrabold shadow-[0_6px_0_rgba(0,0,0,0.15)] transition active:translate-y-1 active:shadow-none';

// ---------- ⚽ Penalty kick ----------
/** Each answer is a shot at goal: the right one flies into the net past the keeper, a wrong one is saved. */
export function PenaltyKick({ content, onFinish, say, onProgress }: EngineProps) {
  const { t } = useT();
  const qs: { prompt: string; options: string[]; answer: number }[] = content.questions;
  const [i, setI] = useState(0); const [goals, setGoals] = useState(0);
  const [shot, setShot] = useState<{ k: number; ok: boolean } | null>(null); const [log, setLog] = useState<boolean[]>([]);
  const q = qs[i];
  useEffect(() => { onProgress?.(i, qs.length); say(q.prompt); }, [i]); // eslint-disable-line
  // where each answer sits in the goal (left, right, top-left, top-right)
  const spots = [{ x: 22, y: 62 }, { x: 78, y: 62 }, { x: 25, y: 30 }, { x: 75, y: 30 }];
  const kick = (k: number) => {
    if (shot) return;
    const ok = k === q.answer; setShot({ k, ok }); sfx.whoosh();
    setTimeout(() => { if (ok) { sfx.win(); say(t('Goal!')); } else { sfx.wrong(); say(t('Saved!')); } }, 650);
    const g = goals + (ok ? 1 : 0);
    setTimeout(() => { setGoals(g); setLog([...log, ok]); setShot(null); if (i + 1 >= qs.length) onFinish(g); else setI(i + 1); }, 2100);
  };
  const target = shot ? spots[shot.k % 4] : null;
  // the keeper dives to the shot when it is wrong (a save), and the other way when it is right
  const keeperX = !shot ? 50 : shot.ok ? (target!.x < 50 ? 72 : 28) : target!.x;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-center gap-2">{qs.map((_, k) => (
        <span key={k} className={cn('grid size-8 place-items-center rounded-full text-sm font-black', k < log.length ? (log[k] ? 'bg-emerald-500 text-white' : 'bg-red-400 text-white') : 'bg-white text-slate-400 ring-1 ring-slate-200')}>{k < log.length ? (log[k] ? '⚽' : '✋') : k + 1}</span>))}
        <span className="ms-3 rounded-full bg-slate-900 px-3 py-1 text-lg font-black text-white">🥅 {goals}</span></div>
      <p className="mb-3 text-center text-2xl font-extrabold text-slate-800 sm:text-3xl" dir="auto">{q.prompt}</p>
      <div className="relative mx-auto aspect-[16/10] w-full overflow-hidden rounded-3xl shadow-inner" style={{ background: 'linear-gradient(#7dd3fc 0 38%, #22c55e 38% 100%)' }}>
        {/* stripes on the pitch */}
        {[0, 1, 2, 3].map((k) => <div key={k} className="absolute inset-x-0 bg-white/10" style={{ top: `${46 + k * 14}%`, height: '7%' }} />)}
        {/* the goal */}
        <div className="absolute left-[8%] right-[8%] top-[8%] h-[64%] rounded-t-md border-[6px] border-b-0 border-white" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,.35) 0 2px, transparent 2px 18px), repeating-linear-gradient(90deg, rgba(255,255,255,.35) 0 2px, transparent 2px 18px)' }} />
        {/* the keeper */}
        <div className="absolute top-[34%] text-[min(12vw,5.5rem)] leading-none transition-all duration-500 ease-out" style={{ left: `${keeperX}%`, transform: `translateX(-50%) rotate(${shot ? (keeperX < 50 ? -35 : keeperX > 50 ? 35 : 0) : 0}deg)` }} aria-hidden>🧤</div>
        {/* the answers, as targets in the goal */}
        {q.options.map((o, k) => (
          <button key={`${i}-${k}`} type="button" onClick={() => kick(k)} disabled={!!shot}
            className={cn(BTN, 'absolute -translate-x-1/2 -translate-y-1/2 bg-white/95 px-4 py-3 text-slate-900', isPic(o) ? 'text-4xl' : 'text-xl sm:text-2xl',
              shot && k === q.answer && 'ring-8 ring-emerald-400', shot && shot.k === k && !shot.ok && 'opacity-50')}
            style={{ left: `${spots[k % 4].x}%`, top: `${spots[k % 4].y}%` }}>{o}</button>))}
        {/* the ball */}
        <div className="absolute text-[min(9vw,3.5rem)] leading-none transition-all duration-700 ease-out" aria-hidden
          style={target ? { left: `${target.x}%`, top: `${target.y + (shot!.ok ? 0 : 6)}%`, transform: 'translate(-50%,-50%) scale(.6) rotate(720deg)' } : { left: '50%', top: '88%', transform: 'translate(-50%,-50%)' }}>⚽</div>
        {shot && <div className={cn('absolute inset-x-0 top-[40%] text-center text-5xl font-black sm:text-7xl animate-[pop-in_.4s_.65s_both]', shot.ok ? 'text-yellow-300' : 'text-white')} style={{ textShadow: '0 4px 0 #14532d, 0 0 3px #14532d, 0 0 24px rgba(0,0,0,.55)' }}>{shot.ok ? t('GOAL!') : t('Saved!')}</div>}
      </div>
      <p className="mt-3 text-center text-sm font-semibold text-slate-500">{t('Tap the right answer to shoot!')}</p>
    </div>
  );
}

// ---------- 🏃 Running race ----------
/** Every right answer is a big step towards the finish; the rival runs on a clock. Get there first! */
export function RunningRace({ content, onFinish, say, onProgress }: EngineProps) {
  const { t } = useT();
  const qs: { prompt: string; options: string[]; answer: number }[] = content.questions;
  const seconds: number = content.seconds ?? 8; const rival: string = content.rival || '🐇';
  const order = useMemo(() => qs.map((q) => shuffle(q.options.map((o, k) => ({ o, ok: k === q.answer })))), [qs]);
  const [i, setI] = useState(0); const [me, setMe] = useState(0); const [them, setThem] = useState(0); const [right, setRight] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'no' | null>(null); const [over, setOver] = useState<'win' | 'lose' | null>(null);
  const t0 = useRef(Date.now()); const total = qs.length;
  useEffect(() => { onProgress?.(i, total); if (i < total) say(qs[i].prompt); }, [i]); // eslint-disable-line
  // the rival runs the whole track in (questions × seconds)
  useEffect(() => {
    if (over) return;
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0.current) / (total * seconds * 1000)); setThem(p);
      if (p >= 1) { setOver('lose'); sfx.wrong(); }
    }, 120);
    return () => clearInterval(id);
  }, [over, total, seconds]);
  useEffect(() => { if (over) { say(over === 'win' ? t('You won the race!') : t('The rival won this time!')); setTimeout(() => onFinish(right), 1800); } }, [over]); // eslint-disable-line
  const answer = (ok: boolean) => {
    if (over || flash) return;
    setFlash(ok ? 'ok' : 'no');
    if (ok) { sfx.correct(); const m = (right + 1) / total; setRight(right + 1); setMe(m); if (m >= 1) { setOver('win'); sfx.win(); } }
    else sfx.wrong();
    setTimeout(() => { setFlash(null); if (i + 1 < total) setI(i + 1); else if (!ok || right + 1 < total) setOver(me >= them ? 'win' : 'lose'); }, 650);
  };
  const lane = (who: string, p: number, color: string, mine?: boolean) => (
    <div className={cn('relative h-16 overflow-hidden rounded-2xl sm:h-20', color)}>
      <div className="absolute inset-y-0 end-3 w-3 bg-[repeating-linear-gradient(0deg,#111_0_8px,#fff_8px_16px)]" />
      <div className="absolute top-1/2 text-4xl transition-all duration-300 ease-out sm:text-5xl" style={{ insetInlineStart: `calc(${p * 88}% + 4px)`, transform: `translateY(-50%) ${mine ? 'scaleX(-1)' : ''}` }}>{who}</div>
    </div>);
  const q = qs[Math.min(i, total - 1)];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-2 rounded-3xl bg-orange-200/70 p-3 shadow-inner">{lane('🏃', me, 'bg-orange-300', true)}{lane(rival, them, 'bg-amber-300')}</div>
      {over ? <div className="rounded-3xl bg-white p-6 text-center text-4xl font-black shadow">{over === 'win' ? `🏆 ${t('You won the race!')}` : `${rival} ${t('The rival won this time!')}`}</div> : <>
        <p className={cn('text-center text-2xl font-extrabold sm:text-3xl', flash === 'ok' ? 'text-emerald-600' : flash === 'no' ? 'text-red-500' : 'text-slate-800')} dir="auto">{q.prompt}</p>
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">{order[i].map((x, k) => (
          <button key={`${i}-${k}`} type="button" onClick={() => answer(x.ok)} className={cn(BTN, 'min-h-20 bg-white px-3 text-slate-900', isPic(x.o) ? 'text-5xl' : 'text-2xl', flash && x.ok && 'ring-8 ring-emerald-400')}>{x.o}</button>))}</div>
      </>}
    </div>
  );
}

// ---------- 🔨 Whack-a-mole ----------
/** Moles pop out of nine holes holding letters, numbers or pictures; bonk only the right ones before the time is up. */
export function WhackAMole({ content, onFinish, say, onProgress }: EngineProps) {
  const { t } = useT();
  const goal: number = content.goal; const targets: string[] = content.targets; const others: string[] = content.others?.length ? content.others : [];
  const [holes, setHoles] = useState<({ v: string; ok: boolean; id: number } | null)[]>(Array(9).fill(null));
  const [hits, setHits] = useState(0); const [left, setLeft] = useState<number>(content.seconds); const [bonk, setBonk] = useState<{ h: number; ok: boolean } | null>(null);
  const done = useRef(false); const seq = useRef(0); const hitsRef = useRef(0);
  useEffect(() => { say(content.task || t('Bonk the right ones!')); }, []); // eslint-disable-line
  const end = (n: number) => { if (done.current) return; done.current = true; setTimeout(() => onFinish(Math.min(goal, n)), 700); };
  // the clock
  useEffect(() => { const id = setInterval(() => setLeft((s) => { if (s <= 1) { clearInterval(id); end(hitsRef.current); return 0; } return s - 1; }), 1000); return () => clearInterval(id); }, []); // eslint-disable-line
  // moles come up a little faster as the game goes on
  useEffect(() => {
    let stop = false; let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (stop || done.current) return;
      setHoles((hs) => {
        const free = hs.map((h, k) => (h ? -1 : k)).filter((k) => k >= 0); if (!free.length) return hs;
        const k = free[Math.floor(Math.random() * free.length)];
        const ok = !others.length || Math.random() < 0.5; const pool = ok ? targets : others;
        const id = ++seq.current; const next = [...hs]; next[k] = { v: pool[Math.floor(Math.random() * pool.length)], ok, id };
        const stay = Math.max(900, 1700 - hitsRef.current * 60);
        setTimeout(() => setHoles((h2) => (h2[k]?.id === id ? h2.map((x, j) => (j === k ? null : x)) : h2)), stay);
        return next;
      });
      timer = setTimeout(tick, Math.max(420, 850 - hitsRef.current * 25));
    };
    tick(); return () => { stop = true; clearTimeout(timer); };
  }, []); // eslint-disable-line
  const hit = (k: number) => {
    const m = holes[k]; if (!m || done.current) return;
    setBonk({ h: k, ok: m.ok }); setTimeout(() => setBonk(null), 300);
    setHoles((hs) => hs.map((x, j) => (j === k ? null : x)));
    if (m.ok) { sfx.pop(1.2); const n = hitsRef.current + 1; hitsRef.current = n; setHits(n); onProgress?.(n, goal); if (n >= goal) { sfx.win(); end(n); } }
    else sfx.wrong();
  };
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="rounded-full bg-white px-4 py-2 text-lg font-black text-slate-800 shadow">🔨 {hits} / {goal}</span>
        <span className="min-w-0 truncate text-center text-xl font-extrabold text-slate-800" dir="auto">{content.task}</span>
        <span className={cn('rounded-full px-4 py-2 text-lg font-black shadow', left <= 10 ? 'bg-red-500 text-white' : 'bg-white text-slate-800')}>⏱ {left}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 rounded-[2rem] bg-gradient-to-b from-lime-300 to-green-500 p-4 shadow-inner sm:gap-5 sm:p-6">
        {holes.map((m, k) => (
          <button key={k} type="button" onClick={() => hit(k)} aria-label={m ? m.v : t('Empty hole')}
            className="relative aspect-square overflow-hidden rounded-full bg-[radial-gradient(circle_at_50%_70%,#3f2a1d_0_55%,#5b3b26_56%_100%)] shadow-[inset_0_10px_18px_rgba(0,0,0,.5)]">
            <span className={cn('absolute inset-x-[12%] grid place-items-center rounded-t-full bg-gradient-to-b from-amber-700 to-amber-900 transition-all duration-200 ease-out',
              m ? 'bottom-0 top-[12%]' : 'bottom-[-80%] top-[100%]', bonk?.h === k && 'scale-90')}>
              {m && <><span className="absolute top-[14%] flex gap-[18%] text-[10px]"><span className="size-2 rounded-full bg-black" /><span className="size-2 rounded-full bg-black" /></span>
                <span className={cn('mt-[18%] rounded-xl bg-white px-2 font-black text-slate-900', isPic(m.v) ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl')}>{m.v}</span></>}
            </span>
            {bonk?.h === k && <span className="absolute inset-0 grid place-items-center text-4xl">{bonk.ok ? '💥' : '❌'}</span>}
          </button>))}
      </div>
    </div>
  );
}
