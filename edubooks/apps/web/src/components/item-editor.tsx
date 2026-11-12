'use client';
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { QTYPE_LABEL } from '@/lib/lms';
import { Button, Card, Input, Select, Textarea, cn } from '@/components/ui';

export interface Item { id?: string; type: 'MCQ' | 'TRUE_FALSE' | 'FILL_BLANK' | 'SHORT' | 'READING'; prompt: string; options: string[]; answer: any[]; points: number }
export const newItem = (type: Item['type'] = 'MCQ'): Item => ({ type, prompt: '', options: type === 'MCQ' ? ['', '', ''] : [], answer: type === 'MCQ' ? [0] : type === 'TRUE_FALSE' ? [true] : [], points: 1 });

export function ItemEditor({ item, index, onChange, onRemove, onMove, count }: { item: Item; index: number; onChange: (i: Item) => void; onRemove?: () => void; onMove?: (d: -1 | 1) => void; count?: number }) {
  const set = (p: Partial<Item>) => onChange({ ...item, ...p });
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{index + 1}</span>
        <Select aria-label="Question type" className="w-48" value={item.type} onChange={(e) => onChange({ ...newItem(e.target.value as Item['type']), prompt: item.prompt, points: item.points })}>
          {Object.entries(QTYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <label className="flex items-center gap-1 text-sm text-slate-600">Points<Input aria-label="Points" type="number" min={0} max={100} className="h-9 w-16" value={item.points} onChange={(e) => set({ points: Number(e.target.value) })} /></label>
        <div className="flex-1" />
        {onMove && <><button aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="size-4" /></button>
          <button aria-label="Move down" disabled={index === (count ?? 1) - 1} onClick={() => onMove(1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="size-4" /></button></>}
        {onRemove && <button aria-label="Remove question" onClick={onRemove} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button>}
      </div>
      <Textarea aria-label="Question" rows={2} placeholder={item.type === 'FILL_BLANK' ? 'Use ___ for the blank, e.g. “A is for ___”' : item.type === 'READING' ? 'What should they read? e.g. “Read page 12 aloud, slowly and clearly”' : 'Write the question'} value={item.prompt} onChange={(e) => set({ prompt: e.target.value })} />
      {item.type === 'MCQ' && (
        <div className="space-y-2">
          {item.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <button type="button" aria-label={`Mark choice ${i + 1} correct`} aria-pressed={item.answer[0] === i} onClick={() => set({ answer: [i] })} className={item.answer[0] === i ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-500'}>
                {item.answer[0] === i ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}</button>
              <Input aria-label={`Choice ${i + 1}`} value={o} placeholder={`Choice ${i + 1}`} onChange={(e) => set({ options: item.options.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" aria-label="Remove choice" disabled={item.options.length <= 2} onClick={() => set({ options: item.options.filter((_, j) => j !== i), answer: [Math.min(item.answer[0], item.options.length - 2)] })} className="text-slate-500 hover:text-red-500 disabled:opacity-30"><Trash2 className="size-4" /></button>
            </div>))}
          {item.options.length < 6 && <Button type="button" size="sm" variant="ghost" onClick={() => set({ options: [...item.options, ''] })}><Plus className="size-4" />Choice</Button>}
          <p className="text-xs text-slate-500">Tick the correct choice.</p>
        </div>
      )}
      {item.type === 'TRUE_FALSE' && (
        <div className="flex gap-2">{[true, false].map((v) => (
          <button key={String(v)} type="button" onClick={() => set({ answer: [v] })} aria-pressed={item.answer[0] === v}
            className={cn('rounded-lg border px-4 py-1.5 text-sm font-medium', item.answer[0] === v ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200')}>{v ? 'True' : 'False'}</button>))}
          <span className="self-center text-xs text-slate-500">is the correct answer</span></div>
      )}
      {item.type === 'FILL_BLANK' && (
        <div><Input aria-label="Accepted answers" placeholder="Accepted answers, separated by commas (e.g. cat, kitten)" value={item.answer.join(', ')} onChange={(e) => set({ answer: e.target.value.split(',').map((x) => x.trim()) })} />
          <p className="mt-1 text-xs text-slate-500">Marked automatically; capital letters and extra spaces are ignored.</p></div>
      )}
      {item.type === 'READING' && (
        <p className="rounded-lg bg-violet-50 p-2 text-xs text-violet-800">🎤 Pupils record themselves reading (in the app, with the microphone) and hand in the recording. You listen and give the points. Write above what to read, e.g. “Read page 12 aloud”.</p>
      )}
      {item.type === 'SHORT' && (
        <div><Input aria-label="Model answer" placeholder="Model answer for you (optional)" value={item.answer[0] ?? ''} onChange={(e) => set({ answer: e.target.value ? [e.target.value] : [] })} />
          <p className="mt-1 text-xs text-slate-500">Written answers are marked by you.</p></div>
      )}
    </Card>
  );
}
