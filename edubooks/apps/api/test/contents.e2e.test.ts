import { fromHeadings, tidy } from '../src/ai/contents';
import { createApp, login, ownerPool } from './helpers';

const PAGES = [
  { page: 1, text: 'KG English Workbook\nName: ________' },
  { page: 2, text: 'Contents\nUnit 1 My Family ..... 3\nLesson 1 Hello ..... 3\nLesson 2 My mum ..... 5\nUnit 2 Animals ..... 7\nLesson 1 Pets ..... 7' },
  { page: 3, text: 'Unit 1: My Family\nLesson 1 - Hello\nSay hello to your friends.' },
  { page: 4, text: 'Unit 1 My Family\nColour the picture of the family.' },
  { page: 5, text: 'Unit 1 My Family\nLesson 2: My mum\nMy mum is kind.' },
  { page: 6, text: 'Trace the letters.' },
  { page: 7, text: 'Unit 2 Animals\nLesson 1 Pets\nA cat is a pet.' },
  { page: 8, text: 'Unit 2 Animals | Lesson 2 Farm animals\nThe cow says moo.' },
  { page: 9, text: 'Draw your favourite animal.' },
];

describe('Contents found from the pages: where each unit and lesson begins', () => {
  it('reads headings, skips the contents page and works out page ranges', () => {
    const u = tidy(fromHeadings(PAGES, 'Workbook'), 9);
    expect(u.map((x) => [x.number, x.title, x.page])).toEqual([[1, 'My Family', 3], [2, 'Animals', 7]]);
    expect(u[0].lessons.map((l) => [l.number, l.title, l.page, l.pageEnd])).toEqual([[1, 'Hello', 3, 4], [2, 'My mum', 5, 6]]);
    expect(u[1].lessons.map((l) => [l.title, l.page, l.pageEnd])).toEqual([['Pets', 7, 7], ['Farm animals', 8, 9]]);
    // other languages
    expect(tidy(fromHeadings([{ page: 2, text: 'الوحدة ٣ الحيوانات\nالدرس ١ القطة' }, { page: 4, text: 'سبق ۲ گائے' }], 'Book'), 5)[0]).toMatchObject({ number: 3, page: 2, lessons: [{ number: 1, page: 2, pageEnd: 3 }, { number: 2, page: 4, pageEnd: 5 }] });
  });

  it('finds them for a book part, adds them to its contents and links each page to its lesson', async () => {
    const app = await createApp(); const admin = await login(app, 'admin', 'Admin@12345');
    const teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    const ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    const comp = (await admin.post(`/api/publishing/editions/${ed}/components`).send({ type: 'WORKBOOK', title: 'Contents test workbook', pageCount: 9 })).body;
    const owner = ownerPool();
    try {
      for (const p of PAGES) await owner.query(`INSERT INTO book_pages (publisher_id, component_id, page_number, text_content) VALUES ($1, $2, $3, $4)`, [comp.publisherId, comp.id, p.page, p.text]);
      expect((await admin.post(`/api/ai/contents/components/${comp.id}/find`)).status).toBe(201);
      let s: any;
      for (let i = 0; i < 60; i++) { s = (await admin.get(`/api/publishing/editions/${ed}`)).body.components.find((c: any) => c.id === comp.id).contentsSuggestion; if (s && !s.running) break; await new Promise((r) => setTimeout(r, 500)); }
      expect(s.units.length).toBe(2);
      // a lesson the publisher already entered keeps its own details
      // (added directly: this edition is published, where the normal editor locks units and lessons)
      const { rows: [unit] } = await owner.query(`INSERT INTO book_units (publisher_id, component_id, number, title) VALUES ($1, $2, 1, 'Family (my own title)') RETURNING id`, [comp.publisherId, comp.id]);
      await owner.query(`INSERT INTO book_lessons (publisher_id, unit_id, number, title) VALUES ($1, $2, 1, 'Hello there')`, [comp.publisherId, unit.id]);
      const r = await admin.post(`/api/ai/contents/components/${comp.id}/apply`);
      expect(r.status).toBe(201);
      expect(r.body).toEqual({ unitsAdded: 1, lessonsAdded: 3, pagesSet: 1 });
      const after = (await admin.get(`/api/publishing/editions/${ed}`)).body.components.find((c: any) => c.id === comp.id);
      expect(after.units.map((u: any) => u.title)).toEqual(['Family (my own title)', 'Animals']);
      expect(after.units[0].lessons.map((l: any) => [l.title, l.pageStart, l.pageEnd])).toEqual([['Hello there', 3, 4], ['My mum', 5, 6]]);
      expect(after.contentsSuggestion.applied).toBe(true);
      const { rows } = await owner.query(`SELECT bp.page_number, l.title FROM book_pages bp JOIN book_lessons l ON l.id = bp.lesson_id WHERE bp.component_id = $1 ORDER BY 1`, [comp.id]);
      expect(rows.map((x: any) => `${x.page_number}:${x.title}`)).toEqual(['3:Hello there', '4:Hello there', '5:My mum', '6:My mum', '7:Pets', '8:Farm animals', '9:Farm animals']);
    } finally {
      await owner.query(`DELETE FROM book_components WHERE id = $1`, [comp.id]).catch(() => undefined); await owner.end(); await app.close();
    }
  });
});
