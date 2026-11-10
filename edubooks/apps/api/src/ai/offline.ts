import { Context, TASKS } from './tasks';

/**
 * Deterministic drafter used when no language model is configured (AI_PROVIDER=offline).
 * It only rearranges the publisher's own lesson data and page text — it never invents content —
 * and every result is clearly labelled as an offline draft. Useful for demos, tests and schools without AI.
 */
export function offlineDraft(c: Context): any {
  const t = TASKS[c.task];
  const cite = c.sources.slice(0, 3).map((s) => s.n);
  const pageRef = c.pages ? ` (book pages ${c.pages})` : '';
  const lesson = c.lesson ?? c.unit ?? c.book;
  if (t.kind === 'plan') {
    const d = c.durationMin; const m = (f: number) => Math.max(2, Math.round(d * f));
    return {
      title: `${lesson} — lesson plan (offline draft)`,
      objectives: c.objectives || `Children explore “${lesson}”${pageRef}.`,
      materials: [`Student book${pageRef}`, 'Flashcards / teacher cards for this lesson', 'Board and colours'].join('\n'),
      warmUp: 'Greeting song and a quick recap of the previous lesson (suggestion).',
      steps: [
        { title: 'Introduce', minutes: m(0.2), detail: `Show the lesson pages${pageRef} and talk about the pictures together.`, sources: cite },
        { title: 'Guided practice', minutes: m(0.35), detail: 'Work through the activities on the page with the whole class, modelling each answer.', sources: cite },
        { title: 'Pair / group work', minutes: m(0.25), detail: 'Children practise in pairs while you move around and support.', sources: [] },
        { title: 'Wrap-up', minutes: m(0.2), detail: 'Recap the key words; praise effort.', sources: [] },
      ],
      practice: 'Children complete the book activity for this lesson.',
      assessment: 'Observe: can each child answer one question about the lesson aloud?',
      homework: 'Homework book page for this lesson (check the matching page).',
      differentiation: 'Support: work with picture prompts. Challenge: children explain the answer in a full sentence.',
      notes: 'Offline draft — no AI model is configured. Edit before use.',
      sources: cite,
    };
  }
  if (t.kind === 'items') {
    // Questions built only from words that actually appear in the source pages.
    const words = [...new Set(c.sources.flatMap((s) => s.text.split(/[^\p{L}]+/u)).filter((w) => w.length >= 4).map((w) => w.toLowerCase()))].slice(0, 30);
    const items: any[] = []; const types = t.types as readonly string[];
    for (let i = 0; items.length < c.count && i < c.count * 3; i++) {
      const type = types[i % types.length]; const w = words[i % Math.max(1, words.length)] ?? 'lesson';
      const src = c.sources[i % Math.max(1, c.sources.length)];
      const page = src ? `page ${src.page}` : 'the lesson';
      if (type === 'MCQ') items.push({ type, prompt: `Which word appears on ${page}?`, options: [w, 'zebra', 'rocket'], answer: [0], sources: src ? [src.n] : [] });
      else if (type === 'TRUE_FALSE') items.push({ type, prompt: `The word “${w}” is on ${page}.`, answer: [true], sources: src ? [src.n] : [] });
      else if (type === 'FILL_BLANK') items.push({ type, prompt: `Complete the word from ${page}: ${w.slice(0, 2)}___`, answer: [w], sources: src ? [src.n] : [] });
      else items.push({ type: 'SHORT', prompt: `Tell one thing you learned in “${lesson}”.`, answer: [], sources: src ? [src.n] : [] });
    }
    return { title: `${lesson} — ${t.label.toLowerCase()} (offline draft)`, instructions: 'Offline draft — please review every question.', items };
  }
  return {
    title: `${lesson} — ${t.label.toLowerCase()} (offline draft)`,
    sections: c.task === 'DIFFERENTIATE'
      ? [{ heading: 'Needs support', body: 'Use pictures and gestures; pair with a buddy.', minutes: null, sources: cite },
        { heading: 'Expected level', body: `Complete the book activity${pageRef}.`, minutes: null, sources: cite },
        { heading: 'Ready for a challenge', body: 'Make their own example and explain it to the class.', minutes: null, sources: [] }]
      : [{ heading: c.task === 'GAMES' ? 'Find it!' : 'Picture talk', body: `Use the pictures${pageRef}: children point and name what they see.`, minutes: 5, sources: cite },
        { heading: c.task === 'GAMES' ? 'Flashcard race' : 'Act it out', body: 'Show a flashcard; children act or say the word.', minutes: 5, sources: [] }],
  };
}
