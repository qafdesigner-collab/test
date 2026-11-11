'use client';
import { useState } from 'react';
import { Play, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Dialog, ErrorBox, Field, Input, Select, Textarea, cn } from '@/components/ui';
import { BookScope } from '@/components/book-scope';
import { ENGINE_INFO, Engine } from './engines';
import { GamePlayer } from './player';

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
    case 'QUIZ':
      return <Rows label="Add question" rows={v.questions} blank={{ prompt: '', options: ['', ''], answer: 0 }} onChange={(questions) => onChange({ questions })} render={(r, set) => <>
        <Input aria-label="Question" className="min-w-56 flex-1" placeholder="Question" value={r.prompt} onChange={(e) => set({ prompt: e.target.value })} />
        <Input aria-label="Choices" className="w-52" placeholder="choices, commas" value={r.options.join(', ')} onChange={(e) => set({ options: list(e.target.value) })} />
        <Select aria-label="Correct choice" className="w-36" value={r.answer} onChange={(e) => set({ answer: Number(e.target.value) })}>{r.options.map((o, i) => <option key={i} value={i}>✓ {o || `choice ${i + 1}`}</option>)}</Select></>} />;
    case 'SHAPES':
      return <div className="space-y-3"><div className="flex flex-wrap gap-2">{SHAPES.map((s) => (
        <label key={s} className={cn('cursor-pointer rounded-lg border px-3 py-1.5 text-sm', v.shapes.includes(s) ? 'border-brand-500 bg-brand-50' : 'border-slate-200')}>
          <input type="checkbox" className="sr-only" checked={v.shapes.includes(s)} onChange={(e) => onChange({ ...v, shapes: e.target.checked ? [...v.shapes, s] : v.shapes.filter((x: string) => x !== s) })} />{s}</label>))}</div>
        <Field label="Rounds" className="w-32"><Input type="number" min={3} max={12} value={v.rounds} onChange={(e) => onChange({ ...v, rounds: Number(e.target.value) })} /></Field></div>;
    case 'WORD_BUILD':
      return <Rows label="Add word" rows={v.words} blank={{ word: '', hint: '' }} onChange={(words) => onChange({ words })} render={(r, set) => <>
        <Input aria-label="Word" className="w-40" placeholder="cat" value={r.word} onChange={(e) => set({ word: e.target.value })} />
        <Input aria-label="Picture hint" className="w-32" placeholder="🐱" value={r.hint} onChange={(e) => set({ hint: e.target.value })} /></>} />;
    case 'PUZZLE':
      return <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Picture (emoji)"><Input value={v.picture} onChange={(e) => onChange({ ...v, picture: e.target.value })} /></Field>
        <Field label="Word (optional)"><Input value={v.word} onChange={(e) => onChange({ ...v, word: e.target.value })} /></Field>
        <Field label="Pieces"><Select value={v.size} onChange={(e) => onChange({ ...v, size: Number(e.target.value) })}><option value={2}>2 × 2 (easy)</option><option value={3}>3 × 3</option></Select></Field></div>;
  }
}

export interface GameDraft { id?: string; engine: Engine; title: string; instructions: string; difficulty: number; editionId: string | null; lessonId: string | null; content: any; published: boolean }

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
        {showPublish && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={g.published} onChange={(e) => setG({ ...g, published: e.target.checked })} />Published (visible to schools licensed for the book)</label>}
      </Card>
      <Card className="p-5"><p className="mb-3 font-semibold">{ENGINE_INFO[g.engine].icon} {ENGINE_INFO[g.engine].label} — content</p><ContentForm engine={g.engine} value={g.content} onChange={(content) => setG({ ...g, content })} /></Card>
      {error ? <ErrorBox error={error} /> : null}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPreview(true)}><Play className="size-4" />Preview</Button><Button loading={saving} disabled={!g.title.trim()} onClick={() => onSave(g)}>Save game</Button></div>
      {preview && <Dialog open onOpenChange={() => setPreview(false)} title="Preview" wide><div className="rounded-2xl bg-amber-50 p-4"><GamePlayer preview game={g} /></div></Dialog>}
    </div>
  );
}
