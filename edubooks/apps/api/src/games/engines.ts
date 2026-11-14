import { BadRequestException } from '@nestjs/common';

/** The 13 reusable game engines. Content is plain data, so one engine serves any book or lesson. */
export const ENGINES = ['ALPHABET_MATCH', 'PICTURE_WORD', 'COUNTING', 'SORTING', 'MEMORY', 'FILL_BLANK', 'QUIZ', 'SHAPES', 'WORD_BUILD', 'PUZZLE', 'SPELLING_BEE', 'SENTENCE_BUILDER', 'LISTENING'] as const;
export type Engine = (typeof ENGINES)[number];
export const SHAPES = ['circle', 'square', 'triangle', 'rectangle', 'star', 'heart', 'oval', 'diamond'] as const;

const bad = (m: string) => { throw new BadRequestException(m); };
const s = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** Validates & normalises game content; returns it together with the maximum score a play can reach. */
export function validateContent(engine: Engine, c: any): { content: any; maxScore: number } {
  switch (engine) {
    case 'ALPHABET_MATCH': case 'PICTURE_WORD': case 'MEMORY': {
      const pairs = arr(c?.pairs).map((p: any) => ({ a: s(p?.a, 40), b: s(p?.b, 40) })).filter((p) => p.a && p.b);
      if (pairs.length < 2 || pairs.length > 12) bad('Add between 2 and 12 pairs');
      if (new Set(pairs.map((p) => p.a)).size !== pairs.length) bad('Each pair needs a different first item');
      return { content: { pairs }, maxScore: pairs.length };
    }
    case 'COUNTING': {
      const things = arr(c?.things).map((t) => s(t, 8)).filter(Boolean).slice(0, 12);
      const min = Math.max(1, Math.min(20, Math.round(Number(c?.min) || 1))); const max = Math.max(min, Math.min(20, Math.round(Number(c?.max) || 10)));
      const rounds = Math.max(3, Math.min(15, Math.round(Number(c?.rounds) || 6)));
      if (!things.length) bad('Add at least one thing to count (an emoji such as 🍎)');
      return { content: { things, min, max, rounds }, maxScore: rounds };
    }
    case 'SORTING': {
      const categories = arr(c?.categories).map((k: any) => ({ name: s(k?.name, 40), items: arr(k?.items).map((i) => s(i, 40)).filter(Boolean).slice(0, 10) })).filter((k) => k.name && k.items.length);
      const total = categories.reduce((n, k) => n + k.items.length, 0);
      if (categories.length < 2 || categories.length > 4) bad('Use 2 to 4 groups');
      if (total < 4 || total > 24) bad('Use between 4 and 24 items in total');
      return { content: { categories }, maxScore: total };
    }
    case 'FILL_BLANK': {
      const sentences = arr(c?.sentences).map((x: any) => ({ text: s(x?.text, 200), answer: s(x?.answer, 40), options: arr(x?.options).map((o) => s(o, 40)).filter(Boolean).slice(0, 4) }))
        .filter((x) => x.text.includes('___') && x.answer);
      if (!sentences.length || sentences.length > 15) bad('Add 1–15 sentences, each with ___ for the blank and an answer');
      for (const x of sentences) if (x.options.length && !x.options.includes(x.answer)) x.options.push(x.answer);
      return { content: { sentences }, maxScore: sentences.length };
    }
    case 'QUIZ': {
      const questions = arr(c?.questions).map((q: any) => ({ prompt: s(q?.prompt, 200), options: arr(q?.options).map((o) => s(o, 60)).filter(Boolean).slice(0, 4), answer: Math.round(Number(q?.answer)) }))
        .filter((q) => q.prompt && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length);
      if (!questions.length || questions.length > 20) bad('Add 1–20 questions, each with 2–4 choices and the right one marked');
      return { content: { questions }, maxScore: questions.length };
    }
    case 'SHAPES': {
      const shapes = [...new Set(arr(c?.shapes).filter((x) => (SHAPES as readonly unknown[]).includes(x)))];
      const rounds = Math.max(3, Math.min(12, Math.round(Number(c?.rounds) || 6)));
      if (shapes.length < 2) bad('Choose at least two shapes');
      return { content: { shapes, rounds }, maxScore: rounds };
    }
    case 'WORD_BUILD': {
      const words = arr(c?.words).map((w: any) => ({ word: s(w?.word, 12).replace(/\s+/g, ''), hint: s(w?.hint, 40) })).filter((w) => w.word.length >= 2);
      if (!words.length || words.length > 12) bad('Add 1–12 words (2–12 letters each)');
      return { content: { words }, maxScore: words.length };
    }
    case 'PUZZLE': {
      const picture = s(c?.picture, 8); const word = s(c?.word, 24); const size = Number(c?.size) === 2 ? 2 : 3;
      if (!picture) bad('Choose a picture (emoji) for the puzzle');
      return { content: { picture, word, size }, maxScore: 3 };
    }
    case 'SPELLING_BEE': {
      const words = arr(c?.words).map((w: any) => ({ word: s(w?.word, 20).replace(/\s+/g, ''), sentence: s(w?.sentence, 160), hint: s(w?.hint, 8) })).filter((w) => w.word.length >= 2);
      if (!words.length || words.length > 15) bad('Add 1–15 words to spell (2–20 letters each)');
      return { content: { words }, maxScore: words.length };
    }
    case 'SENTENCE_BUILDER': {
      const sentences = arr(c?.sentences).map((x: any) => ({ text: s(typeof x === 'string' ? x : x?.text, 160).replace(/\s+/g, ' '), hint: s(x?.hint, 8) }))
        .filter((x) => x.text.split(' ').length >= 2 && x.text.split(' ').length <= 12);
      if (!sentences.length || sentences.length > 12) bad('Add 1–12 sentences of 2–12 words');
      return { content: { sentences }, maxScore: sentences.length };
    }
    case 'LISTENING': {
      const rounds = arr(c?.rounds).map((r: any) => ({ say: s(r?.say, 160), options: arr(r?.options).map((o) => s(o, 40)).filter(Boolean).slice(0, 4), answer: Math.round(Number(r?.answer)) }))
        .filter((r) => r.say && r.options.length >= 2 && r.answer >= 0 && r.answer < r.options.length);
      if (!rounds.length || rounds.length > 15) bad('Add 1–15 rounds: what is said, 2–4 choices and the right one');
      return { content: { rounds }, maxScore: rounds.length };
    }
  }
  return bad('Unknown game type');
}

export const starsFor = (score: number, max: number) => (max <= 0 ? 0 : score / max >= 0.9 ? 3 : score / max >= 0.6 ? 2 : score > 0 ? 1 : 0);

export const BADGES: Record<string, { label: string; emoji: string; hint: string }> = {
  FIRST_GAME: { label: 'First game!', emoji: '🎮', hint: 'Finish your first game' },
  PERFECT: { label: 'Superstar', emoji: '⭐', hint: 'Get 3 stars in a game' },
  GAMES_10: { label: 'Game champion', emoji: '🕹️', hint: 'Play 10 games' },
  STARS_25: { label: 'Star collector', emoji: '🌟', hint: 'Collect 25 stars' },
  STARS_100: { label: 'Star hero', emoji: '🏆', hint: 'Collect 100 stars' },
  HOMEWORK_1: { label: 'Homework helper', emoji: '📝', hint: 'Hand in your first homework' },
  HOMEWORK_5: { label: 'Busy bee', emoji: '🐝', hint: 'Hand in 5 homework' },
  READER_20: { label: 'Bookworm', emoji: '🐛', hint: 'Read 20 pages' },
  READER_100: { label: 'Super reader', emoji: '📚', hint: 'Read 100 pages' },
  STREAK_3: { label: 'On fire', emoji: '🔥', hint: 'Learn 3 days in a row' },
};
