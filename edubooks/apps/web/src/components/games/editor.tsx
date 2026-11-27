'use client';
import { useState } from 'react';
import { Play, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Dialog, ErrorBox, Field, Input, Select, Textarea, cn } from '@/components/ui';
import { BookScope } from '@/components/book-scope';
import { ENGINE_INFO, Engine } from './engines';
import { GamePlayer } from './player';
import { printTracingSheet } from './tracing';
import { LineArtMaker } from './coloring';

const SHAPES = ['circle', 'square', 'triangle', 'rectangle', 'star', 'heart', 'oval', 'diamond'];
export const EMPTY_CONTENT: Record<Engine, any> = {
  ALPHABET_MATCH: { pairs: [{ a: 'A', b: 'a' }, { a: 'B', b: 'b' }, { a: 'C', b: 'c' }] },
  PICTURE_WORD: { pairs: [{ a: '🍎', b: 'apple' }, { a: '⚽', b: 'ball' }, { a: '🐱', b: 'cat' }] },
  MEMORY: { pairs: [{ a: '🐶', b: 'dog' }, { a: '🐱', b: 'cat' }, { a: '🐮', b: 'cow' }] },
  COUNTING: { things: ['🍎', '⭐'], min: 1, max: 10, rounds: 6 },
  SORTING: { categories: [{ name: 'Animals', items: ['🐶', '🐱'] }, { name: 'Fruit', items: ['🍎', '🍌'] }] },
  FILL_BLANK: { sentences: [{ text: 'c___t 🐱', answer: 'a', options: ['a', 'o', 'u'] }] },
  QUIZ: { questions: [{ prompt: '1 + 1 = ?', options: ['1', '2', '3'], answer: 1 }] },
  SHAPES: { shapes: ['circle', 'square', 'triangle'], rounds: 6 },
  WORD_BUILD: { words: [{ word: 'cat', hint: '🐱' }] },
  PUZZLE: { picture: '🍎', word: 'apple', size: 3 },
  SPELLING_BEE: { words: [{ word: 'apple', sentence: 'I eat a red apple.', hint: '🍎' }, { word: 'school', sentence: 'I go to school.', hint: '🏫' }] },
  SENTENCE_BUILDER: { sentences: [{ text: 'The cat is on the mat', hint: '🐱' }, { text: 'I like to read books', hint: '📚' }] },
  LISTENING: { rounds: [{ say: 'dog', options: ['🐶', '🐱', '🐮'], answer: 0 }, { say: 'Find the apple', options: ['🍌', '🍎', '🍇'], answer: 1 }] },
  TRACING: { items: ['A', 'a', 'B', 'b'], repeats: 2, guide: 'DOTTED', font: 'ROUND', lines: true },
  COLORING: { image: '', task: 'Colour the picture' },
  BUBBLE_POP: { task: 'Pop the letter B!', targets: ['B', 'b'], others: ['D', 'P', 'd', 'p', 'R'], goal: 8, seconds: 60 },
  FINGERS: { rounds: [{ show: '3', answer: 3 }, { show: '🍎🍎🍎🍎🍎', answer: 5 }, { show: '2 + 2', answer: 4 }, { show: '1', answer: 1 }] },
  AIR_WRITING: { items: ['A', 'B', 'C', '1', '2'] },
  PENALTY_KICK: { questions: [{ prompt: '2 + 2 = ?', options: ['3', '4', '5'], answer: 1 }, { prompt: 'Which is a fruit?', options: ['🍎', '🚗', '⚽'], answer: 0 }, { prompt: '5 − 1 = ?', options: ['4', '6'], answer: 0 }] },
  RUNNING_RACE: { seconds: 8, rival: '🐇', questions: [{ prompt: '3 + 1 = ?', options: ['4', '5', '2'], answer: 0 }, { prompt: 'Which animal flies?', options: ['🐶', '🐦', '🐟'], answer: 1 }, { prompt: '10 − 5 = ?', options: ['4', '6', '5'], answer: 2 }] },
  WHACK_A_MOLE: { task: 'Bonk the letter A!', targets: ['A', 'a'], others: ['B', 'D', 'E', 'b', 'o'], goal: 10, seconds: 60 },
};
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function Rows<T>({ rows, onChange, blank, render, label }: { rows: T[]; onChange: (r: T[]) => void; blank: T; label: string; render: (r: T, set: (v: Partial<T>) => void, i: number) => React.ReactNode }) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-2"><span className="mt-2 w-6 text-right text-xs text-slate-500">{i + 1}</span>
          <div className="flex flex-1 flex-wrap gap-2">{render(r, (v) => onChange(rows.map((x, j) => (j === i ? { ...x, ...v } : x))), i)}</div>
          <button type="button" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="mt-2 text-slate-500 hover:text-red-500"><Trash2 className="size-4" /></button></div>))}
      <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...rows, blank])}><Plus className="size-4" />{label}</Button>
    </div>
  );
}

/** Structured content form for each engine (no JSON editing). */
export function ContentForm({ engine, value, onChange }: { engine: Engine; value: any; onChange: (v: any) => void }) {
  const v = value;
  switch (engine) {
    case 'ALPHABET_MATCH': case 'PICTURE_WORD': case 'MEMORY':
      return <Rows label="Add pair" rows={v.pairs} blank={{ a: '', b: '' }} onChange={(pairs) => onChange({ pairs })} render={(r, set) => <>
        <Input aria-label="First item" className="w-40" placeholder={engine === 'ALPHABET_MATCH' ? 'A' : '🍎 (emoji)'} value={r.a} onChange={(e) => set({ a: e.target.value })} />
        <Input aria-label="Matching item" className="flex-1" placeholder={engine === 'ALPHABET_MATCH' ? 'a  or  apple' : 'apple'} value={r.b} onChange={(e) => set({ b: e.target.value })} /></>} />;
    case 'COUNTING':
      return <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Things to count (emoji, commas)" className="sm:col-span-4"><Input value={v.things.join(', ')} onChange={(e) => onChange({ ...v, things: list(e.target.value) })} /></Field>
        <Field label="From"><Input type="number" min={1} max={20} value={v.min} onChange={(e) => onChange({ ...v, min: Number(e.target.value) })} /></Field>
        <Field label="To"><Input type="number" min={1} max={20} value={v.max} onChange={(e) => onChange({ ...v, max: Number(e.target.value) })} /></Field>
        <Field label="Rounds"><Input type="number" min={3} max={15} value={v.rounds} onChange={(e) => onChange({ ...v, rounds: Number(e.target.value) })} /></Field></div>;
    case 'SORTING':
      return <Rows label="Add group" rows={v.categories} blank={{ name: '', items: [] as string[] }} onChange={(categories) => onChange({ categories })} render={(r, set) => <>
        <Input aria-label="Group name" className="w-40" placeholder="Animals" value={r.name} onChange={(e) => set({ name: e.target.value })} />
        <Input aria-label="Items" className="flex-1" placeholder="🐶, 🐱, 🐮 (commas)" value={r.items.join(', ')} onChange={(e) => set({ items: list(e.target.value) })} /></>} />;
    case 'FILL_BLANK':
      return <Rows label="Add sentence" rows={v.sentences} blank={{ text: '', answer: '', options: [] as string[] }} onChange={(sentences) => onChange({ sentences })} render={(r, set) => <>
        <Input aria-label="Sentence" className="min-w-56 flex-1" placeholder="A is for ___ 🍎" value={r.text} onChange={(e) => set({ text: e.target.value })} />
        <Input aria-label="Answer" className="w-28" placeholder="answer" value={r.answer} onChange={(e) => set({ answer: e.target.value })} />
        <Input aria-label="Choices" className="w-44" placeholder="choices (optional)" value={r.options.join(', ')} onChange={(e) => set({ options: list(e.target.value) })} /></>} />;
    case 'QUIZ': case 'PENALTY_KICK': case 'RUNNING_RACE': {
      const qs = <Rows label="Add question" rows={v.questions} blank={{ prompt: '', options: ['', ''], answer: 0 }} onChange={(questions) => onChange({ questions })} render={(r, set) => <>
        <Input aria-label="Question" className="min-w-56 flex-1" placeholder="Question" value={r.prompt} onChange={(e) => set({ prompt: e.target.value })} />
        <Input aria-label="Choices" className="w-52" placeholder="choices, commas" value={r.options.join(', ')} onChange={(e) => set({ options: list(e.target.value) })} />
        <Select aria-label="Correct choice" className="w-36" value={r.answer} onChange={(e) => set({ answer: Number(e.target.value) })}>{r.options.map((o, i) => <option key={i} value={i}>✓ {o || `choice ${i + 1}`}</option>)}</Select></>} />
      if (engine !== 'RUNNING_RACE') return <div className="space-y-2">{qs}{engine === 'PENALTY_KICK' && <p className="text-xs text-slate-500">⚽ The choices sit in the goal (2–4 each). A right answer is a goal; a wrong one is saved by the keeper.</p>}</div>;
      return <div className="space-y-3">{qs}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Seconds per question for the rival"><Input type="number" min={4} max={30} value={v.seconds ?? 8} onChange={(e) => onChange({ ...v, seconds: Number(e.target.value) })} /></Field>
          <Field label="Rival runner"><Select value={v.rival ?? '🐇'} onChange={(e) => onChange({ ...v, rival: e.target.value })}>{['🐇', '🐢', '🐕', '🐎', '🦊', '🚗'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
        </div><p className="text-xs text-slate-500">🏃 Each right answer moves the child towards the finish; the rival runs on a clock. Fewer seconds = a faster rival.</p></div>;
    }
    case 'SHAPES':
      return <div className="space-y-3"><div className="flex flex-wrap gap-2">{SHAPES.map((s) => (
        <label key={s} className={cn('cursor-pointer rounded-lg border px-3 py-1.5 text-sm', v.shapes.includes(s) ? 'border-brand-500 bg-brand-50' : 'border-slate-200')}>
          <input type="checkbox" className="sr-only" checked={v.shapes.includes(s)} onChange={(e) => onChange({ ...v, shapes: e.target.checked ? [...v.shapes, s] : v.shapes.filter((x: string) => x !== s) })} />{s}</label>))}</div>
        <Field label="Rounds" className="w-32"><Input type="number" min={3} max={12} value={v.rounds} onChange={(e) => onChange({ ...v, rounds: Number(e.target.value) })} /></Field></div>;
    case 'WORD_BUILD':
      return <Rows label="Add word" rows={v.words} blank={{ word: '', hint: '' }} onChange={(words) => onChange({ words })} render={(r, set) => <>
        <Input aria-label="Word" className="w-40" placeholder="cat" value={r.word} onChange={(e) => set({ word: e.target.value })} />
        <Input aria-label="Picture hint" className="w-32" placeholder="🐱" value={r.hint} onChange={(e) => set({ hint: e.target.value })} /></>} />;
    case 'TRACING':
      return <div className="space-y-3">
        <Field label="Letters, numbers or words to trace (commas) — English, Arabic, Urdu, Hindi…"><Input value={v.items.join(', ')} placeholder="A, a, B, b, cat  or  ا, ب, ت" onChange={(e) => onChange({ ...v, items: list(e.target.value) })} /></Field>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Guide"><Select value={v.guide} onChange={(e) => onChange({ ...v, guide: e.target.value })}><option value="DOTTED">Dotted letters</option><option value="FADED">Light grey letters</option><option value="OUTLINE">Outline</option></Select></Field>
          <Field label="Letter style"><Select value={v.font} onChange={(e) => onChange({ ...v, font: e.target.value })}><option value="ROUND">Rounded (for small children)</option><option value="PRINT">Print</option><option value="CURSIVE">Joined / cursive</option></Select></Field>
          <Field label="Times each"><Input type="number" min={1} max={4} value={v.repeats} onChange={(e) => onChange({ ...v, repeats: Number(e.target.value) })} /></Field>
          <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={v.lines !== false} onChange={(e) => onChange({ ...v, lines: e.target.checked })} />Writing lines</label>
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={!v.items.length} onClick={() => printTracingSheet(v, 'Handwriting practice')}>🖨 Print as a worksheet</Button>
        <p className="text-xs text-slate-500">Children trace each one with a finger, a stylus or the mouse; the app checks that they follow the letters, gives stars and says the letter.</p>
      </div>;
    case 'BUBBLE_POP': case 'WHACK_A_MOLE':
      return <div className="space-y-3">
        <Field label="Task (read aloud)"><Input value={v.task} maxLength={120} placeholder="Pop the letter B!" onChange={(e) => onChange({ ...v, task: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pop these (commas)"><Input value={v.targets.join(', ')} placeholder="B, b   or   5   or   🍎" onChange={(e) => onChange({ ...v, targets: list(e.target.value) })} /></Field>
          <Field label="Not these (commas)"><Input value={v.others.join(', ')} placeholder="D, P, d, p" onChange={(e) => onChange({ ...v, others: list(e.target.value) })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={engine === 'WHACK_A_MOLE' ? 'Moles to bonk to win' : 'Bubbles to pop to win'}><Input type="number" min={3} max={20} value={v.goal} onChange={(e) => onChange({ ...v, goal: Number(e.target.value) })} /></Field>
          <Field label="Time (seconds)"><Input type="number" min={30} max={180} value={v.seconds} onChange={(e) => onChange({ ...v, seconds: Number(e.target.value) })} /></Field>
        </div>
        <p className="text-xs text-slate-500">{engine === 'WHACK_A_MOLE' ? '🔨 Moles pop out of nine holes holding these; children tap only the right ones before the time is up.' : '📷 Children point with a finger in the air in front of the camera to pop the right bubbles (or tap them on the screen). The camera picture stays on the device.'}</p>
      </div>;
    case 'FINGERS':
      return <div className="space-y-2">
        <Rows label="Add round" rows={v.rounds} blank={{ show: '', answer: 1 }} onChange={(rounds) => onChange({ rounds })} render={(r, set) => <>
          <Input aria-label="What is shown" className="min-w-40 flex-1" placeholder="3   or   2 + 1   or   🍎🍎🍎" value={r.show} onChange={(e) => set({ show: e.target.value })} />
          <Input aria-label="Fingers" type="number" min={0} max={10} className="w-24" value={r.answer} onChange={(e) => set({ answer: Number(e.target.value) })} /></>} />
        <p className="text-xs text-slate-500">✋ Write a number (“Show me 3!”), a sum or pictures to count, and how many fingers is right (0–10, both hands). The camera counts the fingers; children can also tap the number.</p>
      </div>;
    case 'AIR_WRITING':
      return <div className="space-y-2">
        <Field label="Letters or numbers to write in the air (commas)"><Input value={v.items.join(', ')} placeholder="A, B, C, 1, 2   or   ا, ب" onChange={(e) => onChange({ ...v, items: list(e.target.value) })} /></Field>
        <p className="text-xs text-slate-500">☝️ Children point with one finger to write over the dotted letter in the air, and open the hand to lift the pen. The app checks the writing like tracing and gives stars.</p>
      </div>;
    case 'COLORING':
      return <div className="space-y-3">
        <LineArtMaker onChange={(image) => onChange({ ...v, image })} />
        {v.image && !v.image.startsWith('data:image/png') && !v.image.startsWith('data:image/jpeg') ? null : v.image && <p className="text-xs text-emerald-700">✅ Picture ready to colour.</p>}
        <Field label="Task (optional)"><Input value={v.task} maxLength={160} placeholder="Colour the apple red and the leaf green" onChange={(e) => onChange({ ...v, task: e.target.value })} /></Field>
      </div>;
    case 'PUZZLE':
      return <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Picture (emoji)"><Input value={v.picture} onChange={(e) => onChange({ ...v, picture: e.target.value })} /></Field>
        <Field label="Word (optional)"><Input value={v.word} onChange={(e) => onChange({ ...v, word: e.target.value })} /></Field>
        <Field label="Pieces"><Select value={v.size} onChange={(e) => onChange({ ...v, size: Number(e.target.value) })}><option value={2}>2 × 2 (easy)</option><option value={3}>3 × 3</option></Select></Field></div>;
    case 'SPELLING_BEE':
      return <Rows label="Add word" rows={v.words} blank={{ word: '', sentence: '', hint: '' }} onChange={(words) => onChange({ words })} render={(r, set) => <>
        <Input aria-label="Word to spell" className="w-36" placeholder="apple" value={r.word} onChange={(e) => set({ word: e.target.value })} />
        <Input aria-label="Example sentence" className="min-w-48 flex-1" placeholder="Sentence read aloud (optional)" value={r.sentence} onChange={(e) => set({ sentence: e.target.value })} />
        <Input aria-label="Picture hint" className="w-24" placeholder="🍎" value={r.hint} onChange={(e) => set({ hint: e.target.value })} /></>} />;
    case 'SENTENCE_BUILDER':
      return <Rows label="Add sentence" rows={v.sentences} blank={{ text: '', hint: '' }} onChange={(sentences) => onChange({ sentences })} render={(r, set) => <>
        <Input aria-label="Sentence" className="min-w-56 flex-1" placeholder="The cat is on the mat" value={r.text} onChange={(e) => set({ text: e.target.value })} />
        <Input aria-label="Picture hint" className="w-24" placeholder="🐱" value={r.hint} onChange={(e) => set({ hint: e.target.value })} /></>} />;
    case 'LISTENING':
      return <Rows label="Add round" rows={v.rounds} blank={{ say: '', options: ['', ''], answer: 0 }} onChange={(rounds) => onChange({ rounds })} render={(r, set) => <>
        <Input aria-label="What is said" className="min-w-44 flex-1" placeholder="Words read aloud, e.g. dog" value={r.say} onChange={(e) => set({ say: e.target.value })} />
        <Input aria-label="Choices" className="w-48" placeholder="🐶, 🐱, 🐮 (commas)" value={r.options.join(', ')} onChange={(e) => set({ options: list(e.target.value) })} />
        <Select aria-label="Correct choice" className="w-32" value={r.answer} onChange={(e) => set({ answer: Number(e.target.value) })}>{r.options.map((o, i) => <option key={i} value={i}>✓ {o || `choice ${i + 1}`}</option>)}</Select></>} />;
  }
}

/** Collections a publisher game can be offered in, to every school. */
export const GAME_COLLECTIONS = [{ id: 'GENERAL', label: 'General games', icon: '🎲' }, { id: 'SPORTS', label: 'Sports', icon: '⚽' }] as const;

export interface GameDraft { id?: string; engine: Engine; title: string; instructions: string; difficulty: number; editionId: string | null; lessonId: string | null; content: any; published: boolean; categories?: string[] }

export function GameEditor({ initial, onSave, saving, error, books, showPublish }: {
  initial: GameDraft; onSave: (g: GameDraft) => void; saving?: boolean; error?: unknown; books?: { editionId: string; title: string; editionLabel: string }[]; showPublish?: boolean;
}) {
  const [g, setG] = useState<GameDraft>(initial); const [preview, setPreview] = useState(false);
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        {!g.id && <div><p className="mb-2 text-sm font-medium text-slate-700">Game type</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{(Object.keys(ENGINE_INFO) as Engine[]).map((e) => (
            <button key={e} type="button" onClick={() => setG({ ...g, engine: e, content: EMPTY_CONTENT[e] })} aria-pressed={g.engine === e}
              className={cn('focus-ring flex flex-col items-center rounded-xl border p-3 text-sm', g.engine === e ? 'border-brand-500 bg-brand-50 font-semibold' : 'border-slate-200 hover:bg-slate-50')}>
              <span className="text-2xl">{ENGINE_INFO[e].icon}</span>{ENGINE_INFO[e].label}</button>))}</div></div>}
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field label="Title"><Input value={g.title} onChange={(e) => setG({ ...g, title: e.target.value })} placeholder="Big and small letters" /></Field>
          <Field label="Level"><Select value={g.difficulty} onChange={(e) => setG({ ...g, difficulty: Number(e.target.value) })}><option value={1}>Easy</option><option value={2}>Medium</option><option value={3}>Hard</option></Select></Field>
        </div>
        <Field label="Instructions (read aloud to children)"><Textarea rows={2} value={g.instructions} onChange={(e) => setG({ ...g, instructions: e.target.value })} placeholder="Match each picture with its word." /></Field>
        <BookScope books={books} editionId={g.editionId} lessonId={g.lessonId} onChange={(v) => setG({ ...g, ...v })} />
        {showPublish && <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-700">Also offer it in these collections <span className="font-normal text-slate-500">(to every school, with or without a book)</span></p>
          <div className="flex flex-wrap gap-2">{GAME_COLLECTIONS.map((c) => { const on = (g.categories ?? []).includes(c.id); return (
            <label key={c.id} className={cn('flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm', on ? 'border-brand-500 bg-brand-50 font-semibold text-brand-800' : 'border-slate-300 bg-white text-slate-700')}>
              <input type="checkbox" className="accent-brand-600" checked={on} onChange={(e) => setG({ ...g, categories: e.target.checked ? [...(g.categories ?? []), c.id] : (g.categories ?? []).filter((x) => x !== c.id) })} />{c.icon} {c.label}</label>); })}</div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={g.published} onChange={(e) => setG({ ...g, published: e.target.checked })} />Published (visible to schools licensed for the book{(g.categories ?? []).length ? ', and to every school in the collections ticked' : ''})</label>
        </div>}
      </Card>
      <Card className="p-5"><p className="mb-3 font-semibold">{ENGINE_INFO[g.engine].icon} {ENGINE_INFO[g.engine].label} — content</p><ContentForm engine={g.engine} value={g.content} onChange={(content) => setG({ ...g, content })} /></Card>
      {error ? <ErrorBox error={error} /> : null}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPreview(true)}><Play className="size-4" />Preview</Button><Button loading={saving} disabled={!g.title.trim()} onClick={() => onSave(g)}>Save game</Button></div>
      {preview && <Dialog open onOpenChange={() => setPreview(false)} title="Preview" wide><div className="rounded-2xl bg-amber-50 p-4"><GamePlayer preview game={g} /></div></Dialog>}
    </div>
  );
}
