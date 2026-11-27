/**
 * Signs that a written answer was copied in or written by an AI tool. These are estimates for the teacher to look at,
 * never proof — and they are never shown to the student.
 */
export interface Signals { pasted: number; pastes: number; typed: number; ms: number }
export interface ItemCheck extends Signals { length: number; copied: boolean; ai: { score: number; reasons: string[]; by: 'rules' | 'ai' } }

const PHRASES = ['furthermore', 'moreover', 'additionally', 'in conclusion', 'overall,', 'it is important to note', 'it is worth noting', 'plays a crucial role', 'plays a vital role',
  'delve', 'in summary', 'a testament to', 'not only', 'various', 'ensure', 'significant', 'essential', 'enhance', 'foster', 'crucial', 'comprehensive', 'in today', 'navigate', 'tapestry', 'realm'];

/** A rule-based AI-writing estimate (0–100) for one answer, with the reasons. */
export function ruleScore(text: string, grade?: number | null): { score: number; reasons: string[] } {
  const t = text.trim(); const reasons: string[] = []; let score = 0;
  if (t.length < 60) return { score: 0, reasons: [] };
  const lower = t.toLowerCase();
  const found = PHRASES.filter((p) => lower.includes(p));
  if (found.length) { score += Math.min(36, found.length * 12); reasons.push(`typical AI words: ${found.slice(0, 4).join(', ')}`); }
  if (/[—–]/.test(t)) { score += 10; reasons.push('long dashes (—)'); }
  if (/(^|\n)\s*([-*•]|\d+[.)])\s+\S/.test(t) || /\*\*[^*]+\*\*/.test(t) || /(^|\n)#+\s/.test(t)) { score += 15; reasons.push('lists or headings formatting'); }
  const sentences = t.split(/(?<=[.!?])\s+/).filter((s) => s.length > 2);
  const words = t.split(/\s+/).filter(Boolean);
  const avgWord = words.reduce((n, w) => n + w.replace(/[^\p{L}]/gu, '').length, 0) / Math.max(1, words.length);
  const avgSentence = words.length / Math.max(1, sentences.length);
  if (avgWord > 5.4) { score += 10; reasons.push('long, difficult words'); }
  if (avgSentence > 22) { score += 8; reasons.push('very long sentences'); }
  if (sentences.length >= 3 && sentences.every((s) => /^[\p{Lu}"'(]/u.test(s) && /[.!?]["')]?$/.test(s))) { score += 6; reasons.push('every sentence perfectly punctuated'); }
  if (words.length > 120) { score += 8; reasons.push('much longer than usual'); }
  // young students rarely write like this
  if (grade !== null && grade !== undefined && grade <= 6 && (avgWord > 5 || avgSentence > 18)) { score += 12; reasons.push('writing level well above the class'); }
  return { score: Math.min(95, score), reasons };
}

/** Puts together what the device reported and the text itself. */
export function checkItem(text: string, s: Partial<Signals> | undefined, grade?: number | null): ItemCheck {
  const length = text.trim().length;
  const sig: Signals = { pasted: Math.max(0, Math.round(s?.pasted ?? 0)), pastes: Math.max(0, Math.round(s?.pastes ?? 0)), typed: Math.max(0, Math.round(s?.typed ?? 0)), ms: Math.max(0, Math.round(s?.ms ?? 0)) };
  const reported = !!s;
  // copied: much of the answer was pasted, or a long answer appeared with almost no typing (dropped in / autofilled)
  const copied = length >= 15 && (sig.pasted >= Math.min(length, 15) * 0.6 || (reported && sig.typed < length * 0.3 && length >= 40));
  const r = ruleScore(text, grade);
  const reasons = [...r.reasons]; let score = r.score;
  if (length >= 60 && sig.pasted >= length * 0.6) { score = Math.min(95, score + 20); reasons.unshift('pasted in'); }
  if (reported && length >= 60 && sig.ms > 0 && length / (sig.ms / 1000) > 12 && sig.pasted < length * 0.3) { score = Math.min(95, score + 10); reasons.push('written faster than anyone can type'); }
  return { ...sig, length, copied, ai: { score, reasons, by: 'rules' } };
}

/** Grade number from a grade name like "Grade 3", "KG2", "Year 5" (KG counts as 0). */
export function gradeNumber(name?: string | null) {
  if (!name) return null;
  if (/\b(kg|pre|nursery|reception)/i.test(name)) return 0;
  const m = /(\d{1,2})/.exec(name); return m ? Number(m[1]) : null;
}
