'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/components/ui';
import { ENGINE_INFO, ENGINES, Engine, maxScore } from './engines';
import { Mascot } from './mascot';

export interface PlayResult { stars: number; best?: number; starsGained?: number; totalStars?: number; newBadges?: { key: string; label: string; emoji: string }[] }

/** Wraps any engine: start screen, progress, read-aloud, finish screen with stars & badges. */
export function GamePlayer({ game, onDone, preview }: { game: { engine: Engine; title: string; instructions: string; content: any }; onDone?: (score: number, ms: number) => Promise<PlayResult | void>; preview?: boolean }) {
  const [phase, setPhase] = useState<'start' | 'play' | 'done'>('start');
  const [run, setRun] = useState(0); const [progress, setProgress] = useState([0, 1]); const [result, setResult] = useState<(PlayResult & { score: number; max: number }) | null>(null);
  const [sound, setSound] = useState(true); const started = useRef(0);
  const say = useCallback((t: string) => {
    if (!sound || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = 0.85; u.pitch = 1.1; window.speechSynthesis.speak(u);
  }, [sound]);
  const Engine = ENGINES[game.engine]; const info = ENGINE_INFO[game.engine]; const max = maxScore(game.engine, game.content);
  const start = () => { setPhase('play'); setRun(run + 1); setResult(null); started.current = Date.now(); say(game.instructions || game.title); };
  const finish = async (score: number) => {
    const local = { stars: score / max >= 0.9 ? 3 : score / max >= 0.6 ? 2 : score > 0 ? 1 : 0 };
    setPhase('done'); setResult({ ...local, score, max });
    const r = await onDone?.(score, Date.now() - started.current).catch(() => undefined);
    if (r) setResult({ ...local, ...r, score, max });
    say(local.stars === 3 ? 'Amazing! Three stars!' : local.stars ? 'Well done!' : 'Good try! Play again?');
  };
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  return (
    <div className="relative">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: info.color }}>{info.icon}</span>
        <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-extrabold text-slate-800">{game.title}</h1>
          {phase === 'play' && <div className="mt-1 h-3 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={progress[0]} aria-valuemax={progress[1]}>
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-pink-500 transition-all" style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} /></div>}</div>
        <button onClick={() => { setSound(!sound); window.speechSynthesis?.cancel(); }} aria-label={sound ? 'Sound off' : 'Sound on'} className="focus-ring rounded-2xl bg-white p-3 shadow">{sound ? <Volume2 className="size-6" /> : <VolumeX className="size-6" />}</button>
      </div>
      {phase === 'start' && (
        <div className="flex flex-col items-center gap-6 rounded-[2rem] bg-white/80 p-8 text-center shadow-sm">
          <Mascot mood="happy" say={game.instructions || 'Ready to play?'} />
          <button onClick={start} className="focus-ring rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-12 py-5 text-3xl font-extrabold text-white shadow-[0_8px_0_#0f766e] active:translate-y-1 active:shadow-none">▶ Play</button>
          {preview && <p className="text-sm text-slate-500">Preview — scores are not saved.</p>}
        </div>
      )}
      {phase === 'play' && <div key={run} className="rounded-[2rem] bg-white/60 p-4 sm:p-8"><Engine content={game.content} onFinish={finish} say={say} onProgress={(d, t) => setProgress([d, t])} /></div>}
      {phase === 'done' && result && (
        <div className="relative overflow-hidden rounded-[2rem] bg-white p-8 text-center shadow-sm">
          {result.stars > 0 && <Confetti />}
          <div className="mb-2 flex justify-center gap-2 text-7xl">{[1, 2, 3].map((n) => <span key={n} className={cn('motion-safe:animate-[pop-in_.5s_both]', n > result.stars && 'opacity-20 grayscale')} style={{ animationDelay: `${n * 0.25}s` }}>⭐</span>)}</div>
          <p className="text-3xl font-extrabold text-slate-800">{result.stars === 3 ? 'Amazing!' : result.stars === 2 ? 'Great job!' : result.stars === 1 ? 'Well done!' : 'Good try!'}</p>
          <p className="mt-1 text-lg text-slate-500">{result.score} of {result.max} right{result.starsGained ? ` · +${result.starsGained} ⭐` : ''}{result.totalStars !== undefined ? ` · ${result.totalStars} stars in total` : ''}</p>
          {!!result.newBadges?.length && <div className="mt-6 flex flex-wrap justify-center gap-4">{result.newBadges.map((b) => (
            <div key={b.key} className="rounded-3xl bg-amber-100 px-6 py-4 motion-safe:animate-[pop-in_.6s_.8s_both]"><div className="text-5xl">{b.emoji}</div><div className="font-extrabold text-amber-800">New badge: {b.label}</div></div>))}</div>}
          <button onClick={start} className="focus-ring mt-8 inline-flex items-center gap-2 rounded-full bg-sky-500 px-8 py-4 text-2xl font-extrabold text-white shadow-[0_6px_0_#0369a1] active:translate-y-1 active:shadow-none"><RotateCcw className="size-6" />Play again</button>
        </div>
      )}
    </div>
  );
}

function Confetti() {
  const bits = Array.from({ length: 40 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 0.8, color: ['#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'][i % 5], size: 8 + Math.random() * 8 }));
  return <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">{bits.map((b, i) => (
    <span key={i} className="absolute top-0 rounded-sm motion-safe:animate-[confetti-fall_2.6s_ease-in_both]" style={{ left: `${b.left}%`, width: b.size, height: b.size * 0.6, background: b.color, animationDelay: `${b.delay}s` }} />))}</div>;
}
