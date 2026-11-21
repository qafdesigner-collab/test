'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, Printer, Send, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useMyBooks } from '@/lib/lms';
import { showPrintPreview } from '@/lib/print-preview';
import { Button, Card, Select, Textarea, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

type Turn = { role: 'user' | 'assistant'; text: string; pages?: number[] };
const IDEAS = ['Make a 20-mark question paper on “Plants” for grade 2 with an answer key', 'Explain photosynthesis simply, with a classroom activity',
  'Write a short note to parents about the upcoming sports day', 'Give me 5 ideas to help a child who finds reading hard', 'Make a rubric for a speaking task (4 levels)'];
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
/** Light formatting of the AI's answer: headings, bold, lists. */
function toHtml(t: string) {
  return esc(t).split('\n').map((l) => {
    const h = /^#{1,4}\s+(.*)/.exec(l); if (h) return `<h3>${h[1]}</h3>`;
    const b = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (/^\s*[-*•]\s+/.test(l)) return `<li>${b.replace(/^\s*[-*•]\s+/, '')}</li>`;
    return b.trim() ? `<p>${b}</p>` : '';
  }).join('');
}

/** Teachers: ask the AI anything for teaching (research, papers, plans, letters). Optionally add a book for context. */
export function AiChat({ live }: { live: boolean }) {
  const toast = useToast(); const books = useMyBooks();
  const [turns, setTurns] = useState<Turn[]>([]);
  useEffect(() => { try { const t = JSON.parse(sessionStorage.getItem('kg-ai-chat') || '[]'); if (Array.isArray(t)) setTurns(t); } catch { /* ignore */ } }, []);
  const [msg, setMsg] = useState(''); const [editionId, setEditionId] = useState(''); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { try { sessionStorage.setItem('kg-ai-chat', JSON.stringify(turns.slice(-20))); } catch { /* ignore */ } end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [turns]);
  const send = async (text = msg) => {
    if (!text.trim() || busy) return;
    const next: Turn[] = [...turns, { role: 'user', text: text.trim() }]; setTurns(next); setMsg(''); setBusy(true);
    try {
      const r = await api.post<any>('/ai/chat', { message: text.trim(), editionId: editionId || undefined, history: turns.slice(-8).map(({ role, text: t }) => ({ role, text: t.slice(0, 6000) })) });
      setTurns([...next, { role: 'assistant', text: r.text, pages: r.pages }]);
    } catch (e: any) { toast(e.message, 'err'); setTurns(turns); setMsg(text); } finally { setBusy(false); }
  };
  const print = (t: Turn) => showPrintPreview('AI answer', `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;margin:0;background:#e2e8f0}.sheet{width:210mm;min-height:297mm;margin:8mm auto;background:#fff;padding:16mm;box-sizing:border-box;font-size:13px;line-height:1.5}h3{margin:10px 0 4px}li{margin-left:18px}</style></head><body><section class="sheet">${toHtml(t.text)}</section></body></html>`);
  return (
    <div className="space-y-4">
      {!live && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No AI service is connected yet. Ask your publisher (super admin) to connect one — free plans are available.</p>}
      <Card className="flex min-h-[24rem] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!turns.length && <div className="space-y-3 text-sm text-slate-600"><p>Ask anything for your teaching — research a topic, make a question paper, plan a lesson, write to parents…</p>
            <div className="flex flex-wrap gap-2">{IDEAS.map((i) => <button key={i} type="button" onClick={() => send(i)} disabled={!live || busy} className="rounded-full border border-slate-200 px-3 py-1.5 text-left text-xs hover:bg-slate-50 disabled:opacity-50">{i}</button>)}</div></div>}
          {turns.map((t, i) => (
            <div key={i} className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-2xl px-4 py-3 text-sm', t.role === 'user' ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-800')}>
                {t.role === 'user' ? <p className="whitespace-pre-wrap">{t.text}</p> : <>
                  <div className="space-y-1.5 [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc" dangerouslySetInnerHTML={{ __html: toHtml(t.text) }} />
                  {t.pages && t.pages.length > 0 && <p className="mt-2 text-xs text-slate-500">📖 Used book pages: {[...new Set(t.pages)].join(', ')}</p>}
                  <div className="mt-2 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(t.text).then(() => toast('Copied'))}><Copy className="size-3.5" />Copy</Button>
                    <Button size="sm" variant="ghost" onClick={() => print(t)}><Printer className="size-3.5" />Print / PDF</Button></div></>}
              </div>
            </div>))}
          {busy && <p className="text-sm text-slate-500">Thinking…</p>}
          <div ref={end} />
        </div>
        <form className="space-y-2 border-t border-slate-100 p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <Textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ask anything for your teaching…" aria-label="Your question"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} disabled={!live} />
          <div className="flex flex-wrap items-center gap-2">
            <Select className="h-9 w-64" value={editionId} onChange={(e) => setEditionId(e.target.value)} aria-label="Use a book"><option value="">No book (general)</option>{(books.data ?? []).map((b) => <option key={b.editionId} value={b.editionId}>📖 Use: {b.title}</option>)}</Select>
            <div className="flex-1" />
            {turns.length > 0 && <Button type="button" variant="ghost" onClick={() => setTurns([])}><Trash2 className="size-4" />New chat</Button>}
            <Button loading={busy} disabled={!live || !msg.trim()}><Send className="size-4" />Send</Button>
          </div>
          <p className="text-xs text-slate-500">AI can make mistakes — check facts before you use them. Students cannot use this; they have Ask Owl, which only explains their book and does not do homework.</p>
        </form>
      </Card>
    </div>
  );
}
