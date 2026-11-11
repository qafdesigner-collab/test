'use client';
/* Ten reusable, data-driven learning games. Each engine receives its content and calls onFinish(score). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/components/ui';

export type Engine = 'ALPHABET_MATCH' | 'PICTURE_WORD' | 'COUNTING' | 'SORTING' | 'MEMORY' | 'FILL_BLANK' | 'QUIZ' | 'SHAPES' | 'WORD_BUILD' | 'PUZZLE';
export interface EngineProps { content: any; onFinish: (score: number) => void; say: (t: string) => void; onProgress?: (done: number, total: number) => void }
export const ENGINE_INFO: Record<Engine, { label: string; icon: string; color: string }> = {
  ALPHABET_MATCH: { label: 'Alphabet match', icon: '🔤', color: '#f97316' }, PICTURE_WORD: { label: 'Picture & word', icon: '🖼️', color: '#ec4899' },
  COUNTING: { label: 'Counting', icon: '🔢', color: '#3b82f6' }, SORTING: { label: 'Sorting', icon: '🧺', color: '#10b981' },
  MEMORY: { label: 'Memory cards', icon: '🃏', color: '#8b5cf6' }, FILL_BLANK: { label: 'Fill the gap', icon: '✏️', color: '#f59e0b' },
  QUIZ: { label: 'Quiz', icon: '❓', color: '#06b6d4' }, SHAPES: { label: 'Shapes', icon: '🔺', color: '#ef4444' },
  WORD_BUILD: { label: 'Word building', icon: '🧩', color: '#14b8a6' }, PUZZLE: { label: 'Picture puzzle', icon: '🧸', color: '#a855f7' },
};

// ---------- helpers ----------
export const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const isPic = (s: string) => /\p{Extended_Pictographic}/u.test(s) && s.length <= 4;
const TILE = 'focus-ring select-none rounded-3xl font-extrabold shadow-[0_6px_0_rgba(0,0,0,0.12)] transition active:translate-y-1 active:shadow-none motion-reduce:transition-none';
function useShake() { const [k, setK] = useState<string | null>(null); return { shaking: k, shake: (id: string) => { setK(id); setTimeout(() => setK(null), 450); } }; }
const Big = ({ children }: { children: React.ReactNode }) => <p className="mb-6 text-center text-2xl font-extrabold text-slate-800 sm:text-3xl">{children}</p>;

// ---------- 1 & 2: matching (alphabet / picture-word) ----------
function Match({ content, onFinish, say, onProgress }: EngineProps) {
  const pairs: { a: string; b: string }[] = content.pairs;
  const right = useMemo(() => shuffle(pairs.map((p) => p.b)), [pairs]);
  const [sel, setSel] = useState<string | null>(null); const [done, setDone] = useState<string[]>([]); const [missed, setMissed] = useState<string[]>([]);
  const { shaking, shake } = useShake();
  useEffect(() => { onProgress?.(done.length, pairs.length); if (done.length === pairs.length) setTimeout(() => onFinish(pairs.length - missed.length), 500); }, [done.length]); // eslint-disable-line
  const pick = (b: string) => {
    if (!sel) return;
    const pair = pairs.find((p) => p.a === sel)!;
    if (pair.b === b) { setDone([...done, sel]); say(b); setSel(null); } else { shake(b); if (!missed.includes(sel)) setMissed([...missed, sel]); }
  };
  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-8">
      <div className="space-y-3">{pairs.map((p) => (
        <button key={p.a} disabled={done.includes(p.a)} onClick={() => { setSel(p.a); say(p.a); }} aria-pressed={sel === p.a}
          className={cn(TILE, 'flex h-20 w-full items-center justify-center text-4xl', done.includes(p.a) ? 'bg-emerald-200 text-emerald-800' : sel === p.a ? 'bg-amber-300 ring-4 ring-amber-500' : 'bg-white')}>{p.a}</button>))}</div>
      <div className="space-y-3">{right.map((b) => {
        const matched = pairs.some((p) => p.b === b && done.includes(p.a));
        return <button key={b} disabled={matched || !sel} onClick={() => pick(b)}
          className={cn(TILE, 'flex h-20 w-full items-center justify-center px-2', isPic(b) ? 'text-4xl' : 'text-2xl', matched ? 'bg-emerald-200 text-emerald-800' : 'bg-sky-100', shaking === b && 'animate-[shake_.4s]')}>{b}</button>;
      })}</div>
    </div>
  );
}

// ---------- 3: memory cards ----------
function Memory({ content, onFinish, say, onProgress }: EngineProps) {
  const pairs: { a: string; b: string }[] = content.pairs;
  const cards = useMemo(() => shuffle(pairs.flatMap((p, i) => [{ id: `${i}a`, pair: i, face: p.a }, { id: `${i}b`, pair: i, face: p.b }])), [pairs]);
  const [open, setOpen] = useState<string[]>([]); const [found, setFound] = useState<number[]>([]); const [misses, setMisses] = useState(0);
  useEffect(() => { onProgress?.(found.length, pairs.length); if (found.length === pairs.length) setTimeout(() => onFinish(misses <= pairs.length ? pairs.length : Math.max(1, pairs.length * 2 - misses)), 600); }, [found.length]); // eslint-disable-line
  const flip = (c: (typeof cards)[number]) => {
    if (open.length === 2 || open.includes(c.id) || found.includes(c.pair)) return;
    const next = [...open, c.id]; setOpen(next); if (!isPic(c.face)) say(c.face);
    if (next.length === 2) {
      const [x, y] = next.map((id) => cards.find((k) => k.id === id)!);
      if (x.pair === y.pair) { setFound([...found, x.pair]); setOpen([]); } else { setMisses(misses + 1); setTimeout(() => setOpen([]), 900); }
    }
  };
  return (
    <div className={cn('mx-auto grid max-w-2xl gap-3', cards.length > 12 ? 'grid-cols-4 sm:grid-cols-6' : 'grid-cols-3 sm:grid-cols-4')}>{cards.map((c) => {
      const up = open.includes(c.id) || found.includes(c.pair);
      return <button key={c.id} onClick={() => flip(c)} aria-label={up ? c.face : 'Hidden card'}
        className={cn(TILE, 'flex aspect-square items-center justify-center', up ? (found.includes(c.pair) ? 'bg-emerald-200' : 'bg-white') : 'bg-gradient-to-br from-violet-400 to-fuchsia-500 text-white',
          isPic(c.face) || !up ? 'text-4xl' : 'text-xl')}>{up ? c.face : '?'}</button>;
    })}</div>
  );
}

// ---------- 4: counting ----------
function Counting({ content, onFinish, say, onProgress }: EngineProps) {
  const rounds = useMemo(() => Array.from({ length: content.rounds }, () => {
    const n = rand(content.min, content.max); const thing = content.things[rand(0, content.things.length - 1)];
    const near = shuffle([n - 2, n - 1, n + 1, n + 2].filter((v) => v >= 1 && v !== n));
    return { n, thing, opts: shuffle([n, ...near.slice(0, 2)]) };
  }), [content]);
  return <Rounds rounds={rounds} onFinish={onFinish} onProgress={onProgress} render={(r, answer, shaking) => (
    <>
      <Big>How many {r.thing} can you count?</Big>
      <div className="mx-auto mb-8 flex max-w-xl flex-wrap justify-center gap-3 rounded-3xl bg-white p-6 text-5xl shadow-inner" onClick={() => say('How many can you count?')}>{Array.from({ length: r.n }, (_, i) => <span key={i}>{r.thing}</span>)}</div>
      <div className="flex justify-center gap-4">{r.opts.map((o: number) => <button key={o} onClick={() => answer(o === r.n, String(o))}
        className={cn(TILE, 'size-24 bg-sky-400 text-4xl text-white', shaking === String(o) && 'animate-[shake_.4s]')}>{o}</button>)}</div>
    </>)} />;
}

/** Generic "one question per round, first try scores" loop used by several engines. */
function Rounds<R>({ rounds, render, onFinish, onProgress }: { rounds: R[]; render: (r: R, answer: (ok: boolean, key: string) => void, shaking: string | null) => React.ReactNode; onFinish: (s: number) => void; onProgress?: (d: number, t: number) => void }) {
  const [i, setI] = useState(0); const [score, setScore] = useState(0); const [tries, setTries] = useState(0); const [flash, setFlash] = useState(false);
  const { shaking, shake } = useShake();
  useEffect(() => { onProgress?.(i, rounds.length); }, [i]); // eslint-disable-line
  const answer = (ok: boolean, key: string) => {
    if (flash) return;
    if (!ok) { setTries(tries + 1); shake(key); return; }
    const s = score + (tries === 0 ? 1 : 0); setScore(s); setFlash(true);
    setTimeout(() => { setFlash(false); setTries(0); if (i + 1 >= rounds.length) onFinish(s); else setI(i + 1); }, 650);
  };
  return <div className={cn('transition', flash && 'scale-[1.02]')}>{flash && <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center text-8xl motion-safe:animate-ping">⭐</div>}{render(rounds[i], answer, shaking)}</div>;
}

// ---------- 5: sorting (drag & drop, or tap then tap) ----------
function Sorting({ content, onFinish, say, onProgress }: EngineProps) {
  const cats: { name: string; items: string[] }[] = content.categories;
  const items = useMemo(() => shuffle(cats.flatMap((c) => c.items.map((it) => ({ it, cat: c.name })))), [cats]);
  const [placed, setPlaced] = useState<Record<string, string>>({}); const [wrong, setWrong] = useState<string[]>([]); const [held, setHeld] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ it: string; x: number; y: number } | null>(null);
  const { shaking, shake } = useShake(); const baskets = useRef<Record<string, HTMLDivElement | null>>({});
  const left = items.filter((x) => !placed[x.it]);
  useEffect(() => { onProgress?.(Object.keys(placed).length, items.length); if (items.length && !left.length) setTimeout(() => onFinish(items.length - wrong.length), 500); }, [left.length]); // eslint-disable-line
  const drop = (it: string, cat: string) => {
    const item = items.find((x) => x.it === it)!;
    if (item.cat === cat) { setPlaced({ ...placed, [it]: cat }); say(it); } else { shake(it); if (!wrong.includes(it)) setWrong([...wrong, it]); }
    setHeld(null);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const hit = Object.entries(baskets.current).find(([, el]) => { const r = el?.getBoundingClientRect(); return r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
    if (hit) drop(drag.it, hit[0]); else setHeld(drag.it);
    setDrag(null);
  };
  return (
    <div onPointerMove={(e) => drag && setDrag({ ...drag, x: e.clientX, y: e.clientY })} onPointerUp={onUp} className="touch-none">
      <Big>Put each one in the right basket</Big>
      <div className="mb-8 flex min-h-24 flex-wrap justify-center gap-3">{left.map(({ it }) => (
        <button key={it} onPointerDown={(e) => { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); setDrag({ it, x: e.clientX, y: e.clientY }); }}
          onClick={() => setHeld(it)} aria-pressed={held === it}
          className={cn(TILE, 'flex h-20 min-w-20 cursor-grab items-center justify-center bg-white px-3', isPic(it) ? 'text-5xl' : 'text-2xl', held === it && 'ring-4 ring-amber-400', drag?.it === it && 'opacity-30', shaking === it && 'animate-[shake_.4s]')}>{it}</button>))}</div>
      <div className={cn('grid gap-4', cats.length > 2 ? 'sm:grid-cols-3' : 'grid-cols-2')}>{cats.map((c, i) => (
        <div key={c.name} ref={(el) => { baskets.current[c.name] = el; }} onClick={() => held && drop(held, c.name)} role="button" aria-label={`${c.name} basket`}
          className={cn('min-h-40 rounded-3xl border-4 border-dashed p-4 text-center', ['border-pink-300 bg-pink-50', 'border-sky-300 bg-sky-50', 'border-emerald-300 bg-emerald-50', 'border-amber-300 bg-amber-50'][i])}>
          <p className="mb-3 text-2xl font-extrabold">🧺 {c.name}</p>
          <div className="flex flex-wrap justify-center gap-2 text-4xl">{Object.entries(placed).filter(([, k]) => k === c.name).map(([it]) => <span key={it}>{it}</span>)}</div>
        </div>))}</div>
      {drag && <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 text-6xl drop-shadow-lg" style={{ left: drag.x, top: drag.y }}>{drag.it}</div>}
    </div>
  );
}

// ---------- 6: fill the gap ----------
function FillBlank({ content, onFinish, say, onProgress }: EngineProps) {
  const rounds = useMemo(() => content.sentences.map((s: any) => ({ ...s, options: s.options?.length ? shuffle(s.options) : null })), [content]);
  const [typed, setTyped] = useState('');
  return <Rounds rounds={rounds} onFinish={onFinish} onProgress={onProgress} render={(r: any, answer, shaking) => {
    const [before, after] = r.text.split('___');
    return (<>
      <p className="mb-8 text-center text-4xl font-extrabold text-slate-800" onClick={() => say(r.text.replace('___', ' blank '))}>{before}<span className="mx-1 inline-block min-w-16 border-b-4 border-amber-400 text-amber-500">?</span>{after}</p>
      {r.options ? <div className="flex flex-wrap justify-center gap-4">{r.options.map((o: string) => (
        <button key={o} onClick={() => answer(o.toLowerCase() === r.answer.toLowerCase(), o)} className={cn(TILE, 'h-20 min-w-24 bg-amber-300 px-5 text-3xl', shaking === o && 'animate-[shake_.4s]')}>{o}</button>))}</div>
        : <form className="flex justify-center gap-3" onSubmit={(e) => { e.preventDefault(); answer(typed.trim().toLowerCase() === r.answer.toLowerCase(), 'typed'); setTyped(''); }}>
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Your answer" className={cn('w-56 rounded-2xl border-4 border-amber-300 px-4 py-3 text-3xl', shaking === 'typed' && 'animate-[shake_.4s]')} />
          <button className={cn(TILE, 'bg-emerald-400 px-6 text-2xl text-white')}>OK</button></form>}
    </>);
  }} />;
}

// ---------- 7: quiz ----------
function Quiz({ content, onFinish, say, onProgress }: EngineProps) {
  const [i, setI] = useState(0); const [score, setScore] = useState(0); const [picked, setPicked] = useState<number | null>(null);
  const qs = content.questions; const q = qs[i];
  useEffect(() => { onProgress?.(i, qs.length); say(q.prompt); }, [i]); // eslint-disable-line
  const choose = (k: number) => {
    if (picked !== null) return;
    setPicked(k); const s = score + (k === q.answer ? 1 : 0); setScore(s);
    setTimeout(() => { setPicked(null); if (i + 1 >= qs.length) onFinish(s); else setI(i + 1); }, 1100);
  };
  const colors = ['bg-sky-400', 'bg-pink-400', 'bg-emerald-400', 'bg-amber-400'];
  return (<>
    <Big>{q.prompt}</Big>
    <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2">{q.options.map((o: string, k: number) => (
      <button key={k} onClick={() => choose(k)} className={cn(TILE, 'min-h-20 px-4 py-4 text-2xl text-white', colors[k % 4],
        picked !== null && k === q.answer && 'ring-8 ring-emerald-600', picked === k && k !== q.answer && 'opacity-40')}>{o}{picked !== null && k === q.answer && ' ✅'}</button>))}</div>
  </>);
}

// ---------- 8: shapes ----------
const SHAPE_PATHS: Record<string, React.JSX.Element> = {
  circle: <circle cx="50" cy="50" r="40" />, square: <rect x="12" y="12" width="76" height="76" rx="4" />, triangle: <polygon points="50,8 92,88 8,88" />,
  rectangle: <rect x="5" y="25" width="90" height="50" rx="4" />, oval: <ellipse cx="50" cy="50" rx="44" ry="28" />, diamond: <polygon points="50,5 92,50 50,95 8,50" />,
  star: <polygon points="50,5 61,38 95,38 67,58 78,92 50,72 22,92 33,58 5,38 39,38" />, heart: <path d="M50 88 C10 60 5 35 25 20 C40 10 50 22 50 30 C50 22 60 10 75 20 C95 35 90 60 50 88Z" />,
};
const SHAPE_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
function Shapes({ content, onFinish, say, onProgress }: EngineProps) {
  const rounds = useMemo(() => Array.from({ length: content.rounds }, () => {
    const opts = shuffle(content.shapes as string[]).slice(0, Math.min(4, content.shapes.length));
    return { target: opts[rand(0, opts.length - 1)], opts, colors: shuffle(SHAPE_COLORS) };
  }), [content]);
  return <Rounds rounds={rounds} onFinish={onFinish} onProgress={onProgress} render={(r, answer, shaking) => (<>
    <Big><button onClick={() => say(`Find the ${r.target}`)}>🔊</button> Find the <span className="text-pink-600">{r.target}</span></Big>
    <SayOnce text={`Find the ${r.target}`} say={say} />
    <div className="mx-auto grid max-w-xl grid-cols-2 gap-5">{r.opts.map((sh, k) => (
      <button key={sh + k} onClick={() => answer(sh === r.target, sh)} aria-label={sh} className={cn(TILE, 'flex aspect-square items-center justify-center bg-white p-6', shaking === sh && 'animate-[shake_.4s]')}>
        <svg viewBox="0 0 100 100" className="size-full" fill={r.colors[k]}>{SHAPE_PATHS[sh]}</svg></button>))}</div>
  </>)} />;
}
function SayOnce({ text, say }: { text: string; say: (t: string) => void }) { useEffect(() => { say(text); }, [text]); return null; } // eslint-disable-line

// ---------- 9: word building ----------
function WordBuild({ content, onFinish, say, onProgress }: EngineProps) {
  const words: { word: string; hint: string }[] = content.words;
  const [i, setI] = useState(0); const [built, setBuilt] = useState(''); const [used, setUsed] = useState<number[]>([]); const [mistake, setMistake] = useState(false); const [score, setScore] = useState(0);
  const w = words[i];
  const letters = useMemo(() => { let l = shuffle([...w.word]); if (l.join('') === w.word && w.word.length > 1) l = [...l.slice(1), l[0]]; return l; }, [w]);
  const { shaking, shake } = useShake();
  useEffect(() => { onProgress?.(i, words.length); say(w.word); }, [i]); // eslint-disable-line
  const tap = (k: number) => {
    const ch = letters[k];
    if (ch.toLowerCase() !== w.word[built.length].toLowerCase()) { shake(String(k)); setMistake(true); return; }
    const b = built + ch; setBuilt(b); setUsed([...used, k]);
    if (b.length === w.word.length) {
      const s = score + (mistake ? 0 : 1); setScore(s); say(w.word);
      setTimeout(() => { setBuilt(''); setUsed([]); setMistake(false); if (i + 1 >= words.length) onFinish(s); else setI(i + 1); }, 900);
    }
  };
  return (<>
    <div className="mb-4 text-center text-7xl">{w.hint}</div>
    <div className="mb-8 flex justify-center gap-2">{[...w.word].map((_, k) => <span key={k} className="flex h-16 w-14 items-center justify-center rounded-xl border-b-4 border-slate-300 bg-white text-4xl font-extrabold text-emerald-600">{built[k] ?? ''}</span>)}</div>
    <div className="flex flex-wrap justify-center gap-3">{letters.map((ch, k) => (
      <button key={k} disabled={used.includes(k)} onClick={() => tap(k)} className={cn(TILE, 'size-20 bg-teal-400 text-4xl text-white disabled:invisible', shaking === String(k) && 'animate-[shake_.4s]')}>{ch}</button>))}</div>
  </>);
}

// ---------- 10: picture puzzle (swap tiles) ----------
function Puzzle({ content, onFinish, say }: EngineProps) {
  const n: number = content.size; const total = n * n;
  const [img, setImg] = useState<string | null>(null);
  const [order, setOrder] = useState<number[]>(() => { let o = shuffle([...Array(total).keys()]); while (o.every((v, i) => v === i)) o = shuffle(o); return o; });
  const [sel, setSel] = useState<number | null>(null); const [moves, setMoves] = useState(0); const [done, setDone] = useState(false);
  useEffect(() => { // draw the picture once on a canvas, then slice it with CSS background positions
    const c = document.createElement('canvas'); c.width = c.height = 600; const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 600, 600); g.addColorStop(0, '#fde68a'); g.addColorStop(1, '#f9a8d4'); x.fillStyle = g; x.fillRect(0, 0, 600, 600);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '330px serif'; x.fillText(content.picture, 300, content.word ? 260 : 300);
    if (content.word) { x.font = 'bold 80px system-ui'; x.fillStyle = '#1e293b'; x.fillText(content.word, 300, 520); }
    setImg(c.toDataURL());
  }, [content]);
  const tap = (k: number) => {
    if (done) return;
    if (sel === null) return setSel(k);
    const o = [...order]; [o[sel], o[k]] = [o[k], o[sel]]; setOrder(o); setSel(null); setMoves(moves + 1);
    if (o.every((v, i) => v === i)) { setDone(true); say(content.word || 'Well done'); setTimeout(() => onFinish(moves + 1 <= total ? 3 : moves + 1 <= total * 2 ? 2 : 1), 900); }
  };
  return (<>
    <Big>Tap two pieces to swap them</Big>
    <div className="mx-auto grid aspect-square w-full max-w-md gap-1 rounded-3xl bg-white p-2 shadow" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {order.map((piece, k) => (
        <button key={k} onClick={() => tap(k)} aria-label={`Piece ${k + 1}`} className={cn('aspect-square rounded-lg transition', sel === k && 'ring-4 ring-amber-400 scale-95', done && 'rounded-none')}
          style={img ? { backgroundImage: `url(${img})`, backgroundSize: `${n * 100}% ${n * 100}%`, backgroundPosition: `${((piece % n) / (n - 1)) * 100}% ${(Math.floor(piece / n) / (n - 1)) * 100}%` } : undefined} />))}
    </div>
    <p className="mt-4 text-center text-lg text-slate-500">Moves: {moves}</p>
  </>);
}

export const ENGINES: Record<Engine, (p: EngineProps) => React.JSX.Element> = {
  ALPHABET_MATCH: Match, PICTURE_WORD: Match, MEMORY: Memory, COUNTING: Counting, SORTING: Sorting, FILL_BLANK: FillBlank, QUIZ: Quiz, SHAPES: Shapes, WORD_BUILD: WordBuild, PUZZLE: Puzzle,
};
export const maxScore = (engine: Engine, c: any) => ({ ALPHABET_MATCH: c.pairs?.length, PICTURE_WORD: c.pairs?.length, MEMORY: c.pairs?.length, COUNTING: c.rounds,
  SORTING: c.categories?.reduce((n: number, k: any) => n + k.items.length, 0), FILL_BLANK: c.sentences?.length, QUIZ: c.questions?.length, SHAPES: c.rounds, WORD_BUILD: c.words?.length, PUZZLE: 3 }[engine] ?? 1);
