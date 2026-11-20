/**
 * Finds a book part's contents — where each unit and lesson begins — from the text of its pages.
 * First from headings (“Unit 2”, “Lesson 3”, “الوحدة ٢”, “سبق ۳”, “पाठ 4”…), and with the AI when one is connected.
 */
export type FoundLesson = { number: number; title: string; page: number; pageEnd?: number };
export type FoundUnit = { number: number; title: string; page: number; lessons: FoundLesson[] };
export type Contents = { source: 'AI' | 'HEADINGS'; units: FoundUnit[]; foundAt: string; applied?: boolean; result?: string; running?: boolean; error?: string };

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const num = (s: string) => {
  const d = s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0)).replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x966));
  return /^\d+$/.test(d) ? Number(d) : WORDS[d.toLowerCase()] ?? NaN;
};
const N = '(\\d{1,2}|[٠-٩]{1,2}|[۰-۹]{1,2}|[०-९]{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const UNIT = new RegExp(`(?:^|[\\s|/])(unit|chapter|module|theme|الوحدة|وحدة|یونٹ|باب|इकाई|अध्याय|unité|einheit)\\s*[:#.\\-–]?\\s*${N}(?![\\p{L}\\p{N}])\\s*[:.\\-–]?\\s*([^\\n|/]{0,60})`, 'iu');
const LESSON = new RegExp(`(?:^|[\\s|/])(lesson|topic|الدرس|درس|سبق|पाठ|leçon|lektion)\\s*[:#.\\-–]?\\s*${N}(?![\\p{L}\\p{N}])\\s*[:.\\-–]?\\s*([^\\n|/]{0,60})`, 'iu');
const clean = (t: string) => t.replace(/\s{2,}.*$/, '').replace(/[.…·_\-–\s\d]+$/, '').trim().slice(0, 80);
/** the first lines of a page, where headings are */
export const headOf = (text: string, chars = 220) => text.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 6).join(' | ').replace(/\s+/g, ' ').slice(0, chars);

export function fromHeadings(pages: { page: number; text: string }[], partTitle: string): FoundUnit[] {
  const units: FoundUnit[] = []; const seenU = new Set<number>(); const seenL = new Set<string>();
  for (const p of pages) {
    const all = p.text.slice(0, 3000);
    // a contents page lists many units / lessons: it is not where they begin
    const many = (all.match(new RegExp(UNIT.source, 'giu'))?.length ?? 0) + (all.match(new RegExp(LESSON.source, 'giu'))?.length ?? 0);
    if (many >= 4 || /^\s*(contents|table of contents|index|فهرس|المحتويات|فہرست|विषय[- ]?सूची)\b/i.test(headOf(p.text, 80))) continue;
    const head = headOf(p.text);
    const u = UNIT.exec(head);
    if (u) { const n = num(u[2]); if (n && !seenU.has(n)) { seenU.add(n); units.push({ number: n, title: clean(u[3]) || `Unit ${n}`, page: p.page, lessons: [] }); } }
    const l = LESSON.exec(head);
    if (l) {
      const n = num(l[2]); const cur = units[units.length - 1];
      if (n) {
        const unit = cur ?? (units.push({ number: 1, title: partTitle, page: p.page, lessons: [] }), units[0]);
        const key = `${unit.number}:${n}`;
        if (!seenL.has(key)) { seenL.add(key); unit.lessons.push({ number: n, title: clean(l[3]) || `Lesson ${n}`, page: p.page }); }
      }
    }
  }
  return units;
}

/** Keeps only sensible results: pages in the book, in order; works out where each lesson ends. */
export function tidy(units: FoundUnit[], lastPage: number): FoundUnit[] {
  const ok = units.filter((u) => Number.isInteger(u.page) && u.page >= 1 && u.page <= lastPage && u.title)
    .sort((a, b) => a.page - b.page).slice(0, 40)
    .map((u) => ({ ...u, number: Number.isInteger(u.number) && u.number > 0 ? u.number : 0, title: String(u.title).slice(0, 120), lessons: (u.lessons ?? []).filter((l) => Number.isInteger(l.page) && l.page >= u.page && l.page <= lastPage && l.title).sort((a, b) => a.page - b.page).slice(0, 40) }));
  ok.forEach((u, i) => {
    if (!u.number) u.number = i + 1;
    const end = (ok[i + 1]?.page ?? lastPage + 1) - 1;
    u.lessons = u.lessons.filter((l) => l.page <= end).map((l, k) => ({ number: Number.isInteger(l.number) && l.number > 0 ? l.number : k + 1, title: String(l.title).slice(0, 120), page: l.page }));
    if (!u.lessons.length) u.lessons = [{ number: 1, title: u.title, page: u.page }];
    u.lessons.forEach((l, k) => { l.pageEnd = Math.max(l.page, (u.lessons[k + 1]?.page ?? end + 1) - 1); });
  });
  return ok;
}
