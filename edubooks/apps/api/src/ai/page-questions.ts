/**
 * Built-in question maker: free, unlimited and private (runs on this server, no outside AI service).
 * It reads the text of the chosen book page(s) and builds questions only from that text:
 *  - sentences → fill in the blank, multiple choice (pick the missing word), true / false, short answer;
 *  - word pages (picture books with labels) → missing letter, first letter, spelling questions.
 * Same page + same "seed" gives the same set; "Make new questions" changes the seed.
 */
export type QType = 'MCQ' | 'TRUE_FALSE' | 'FILL_BLANK' | 'SHORT';
export interface PageQuestion { type: QType; prompt: string; options: string[]; answer: (string | number | boolean)[]; points: number; page: number }

const STOP = new Set(('a an the and or but if then than so to of in on at by for with from up down out over under into onto is are was were be been being am do does did have has had '
  + 'i you he she it we they me him her us them my your his its our their this that these those there here what which who whom whose when where why how '
  + 'not no yes can could will would shall should may might must very too also just only all any some each every both few more most other such own same '
  + 'as about after again against before below between during off once through until while page book unit lesson part student activity look say read write '
  + 'colour color draw circle match tick trace find point name').split(/\s+/));

function rng(seed: number) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
const hash = (t: string) => { let h = 2166136261; for (const c of t) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function shuffle<T>(a: T[], r: () => number) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

const tidy = (t: string) => t.replace(/\s+/g, ' ').replace(/\s([,.!?;:])/g, '$1').trim();
const wordsOf = (t: string) => t.match(/\p{L}[\p{L}'’-]*/gu) ?? [];
const keyWord = (w: string) => w.length >= 3 && !STOP.has(w.toLowerCase()) && !/^\p{Lu}{2,}$/u.test(w);

/** A misspelling that really differs from the word: swap two different neighbouring letters, else drop one. */
function misspell(w: string) {
  for (let i = w.length - 2; i >= 1; i--) if (w[i] !== w[i + 1]) return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
  return w.length > 3 ? w.slice(0, -1) : w + w.slice(-1);
}

export function makePageQuestions(pages: { page: number; text: string }[], o: { count: number; types: QType[]; seed: number }) {
  const r = rng(hash(pages.map((p) => p.page).join(',')) ^ o.seed);
  const types = o.types.length ? o.types : (['FILL_BLANK', 'MCQ', 'TRUE_FALSE', 'SHORT'] as QType[]);
  // sentences with their page, and the page vocabulary
  const sentences: { s: string; page: number; keys: string[] }[] = [];
  const vocab = new Map<string, number>(); // word → page
  for (const p of pages) {
    const text = p.text.replace(/\s+/g, ' ');
    for (const w of wordsOf(text)) if (keyWord(w)) { const k = w.toLowerCase(); if (!vocab.has(k)) vocab.set(k, p.page); }
    for (const raw of text.split(/(?<=[.!?؟۔])\s+|\n+/u)) {
      const s = tidy(raw); const ws = wordsOf(s);
      if (ws.length < 4 || ws.length > 30 || /^(page|unit|lesson)\b/i.test(s)) continue;
      if (!ws.some((w) => STOP.has(w.toLowerCase()))) continue; // a list of words (picture page), not a sentence
      const keys = ws.filter(keyWord);
      if (keys.length) sentences.push({ s, page: p.page, keys });
    }
  }
  const words = [...vocab.keys()];
  const out: PageQuestion[] = []; const used = new Set<string>();
  const distractors = (answer: string, n: number) => shuffle(words.filter((w) => w !== answer.toLowerCase() && Math.abs(w.length - answer.length) <= 3), r).slice(0, n);
  const add = (q: Omit<PageQuestion, 'points'>) => { if (used.has(q.prompt)) return false; used.add(q.prompt); out.push({ ...q, points: 1 }); return true; };

  const fromSentence = (type: QType, st: { s: string; page: number; keys: string[] }) => {
    const key = st.keys.sort((a, b) => b.length - a.length)[Math.floor(r() * Math.min(3, st.keys.length))];
    const blanked = st.s.replace(new RegExp(`(^|[^\\p{L}])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[^\\p{L}]|$)`, 'u'), '$1_____');
    if (blanked === st.s) return false;
    if (type === 'FILL_BLANK') return add({ type, prompt: `Fill in the blank: ${blanked}`, options: [], answer: [key], page: st.page });
    if (type === 'MCQ') {
      const d = distractors(key, 3); if (d.length < 2) return false;
      const opts = shuffle([key, ...d.slice(0, 3)], r);
      return add({ type, prompt: `Choose the missing word: ${blanked}`, options: opts, answer: [opts.indexOf(key)], page: st.page });
    }
    if (type === 'TRUE_FALSE') {
      const truth = r() < 0.5; const d = distractors(key, 1)[0];
      if (!truth && !d) return false;
      const stmt = truth ? st.s : blanked.replace('_____', d!);
      return add({ type, prompt: `True or false: ${stmt}`, options: [], answer: [truth], page: st.page });
    }
    return add({ type: 'SHORT', prompt: `What does page ${st.page} tell us about “${key}”? Answer in a sentence.`, options: [], answer: [st.s], page: st.page });
  };
  const fromWord = (type: QType, w: string) => {
    const page = vocab.get(w)!; const W = w.toLowerCase();
    if (type === 'FILL_BLANK') { const i = 1 + Math.floor(r() * Math.max(1, W.length - 2)); return add({ type, prompt: `Write the missing letter: ${W.slice(0, i)}_${W.slice(i + 1)}`, options: [], answer: [W[i]], page }); }
    if (type === 'MCQ') {
      const d = distractors(W, 3).filter((x) => x[0] !== W[0]); if (d.length < 2) return false;
      const opts = shuffle([W, ...d.slice(0, 3)], r);
      return add({ type, prompt: `Which word starts with the letter “${W[0].toUpperCase()}”?`, options: opts, answer: [opts.indexOf(W)], page });
    }
    if (type === 'TRUE_FALSE') {
      const ok = r() < 0.5; const wrong = misspell(W);
      return add({ type, prompt: `Is this word spelled correctly? “${ok ? W : wrong}”`, options: [], answer: [ok], page });
    }
    return add({ type: 'SHORT', prompt: `Use the word “${W}” in a sentence.`, options: [], answer: [], page });
  };

  const sPool = shuffle(sentences, r); const wPool = shuffle(words, r);
  for (let i = 0, guard = 0; out.length < o.count && guard < o.count * 12; guard++, i++) {
    const type = types[i % types.length];
    const useSentence = sPool.length && (type !== 'FILL_BLANK' || r() < 0.75) && (i % 4 !== 3 || !wPool.length);
    if (useSentence) { if (!fromSentence(type, sPool[i % sPool.length])) { if (wPool.length) fromWord(type, wPool[i % wPool.length]); } }
    else if (wPool.length) fromWord(type, wPool[i % wPool.length]);
    else break;
  }
  return out;
}
