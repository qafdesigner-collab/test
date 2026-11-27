import { INestApplication } from '@nestjs/common';
import { createApp, login, ownerPool } from './helpers';
import { makePageQuestions } from '../src/ai/page-questions';

const STORY = 'Ali has a red ball. He plays with the ball in the garden every morning. His sister Sara likes to read books under the mango tree. The cat sleeps near the door. In the evening, Ali and Sara help their mother water the flowers.';
const WORDS = 'apple ball cat dog egg fish goat hat';

describe('Questions from a book page (built-in, free and unlimited)', () => {
  it('makes real questions from the sentences on the page', () => {
    const qs = makePageQuestions([{ page: 12, text: STORY }], { count: 8, types: [], seed: 1 });
    expect(qs.length).toBe(8);
    expect(new Set(qs.map((q) => q.type))).toEqual(new Set(['FILL_BLANK', 'MCQ', 'TRUE_FALSE', 'SHORT']));
    for (const q of qs) {
      expect(q.page).toBe(12);
      if (q.type === 'MCQ') { expect(q.options.length).toBeGreaterThanOrEqual(3); expect(STORY.toLowerCase()).toContain(String(q.options[q.answer[0] as number]).toLowerCase()); expect(q.prompt).toContain('_____'); }
      if (q.type === 'FILL_BLANK' && q.prompt.includes('_____')) expect(STORY).toContain(String(q.answer[0]));
    }
    // same seed → same set; new seed → a different set
    expect(makePageQuestions([{ page: 12, text: STORY }], { count: 8, types: [], seed: 1 })).toEqual(qs);
    expect(makePageQuestions([{ page: 12, text: STORY }], { count: 8, types: [], seed: 2 })).not.toEqual(qs);
  });

  it('word pages (picture books) get letter and spelling questions', () => {
    const qs = makePageQuestions([{ page: 3, text: WORDS }], { count: 6, types: ['FILL_BLANK', 'MCQ', 'TRUE_FALSE'], seed: 3 });
    expect(qs.length).toBeGreaterThanOrEqual(5);
    expect(qs.some((q) => /missing letter/.test(q.prompt))).toBe(true);
    expect(qs.some((q) => /starts with the letter/.test(q.prompt))).toBe(true);
    // a "misspelled" word is never the real word
    for (const q of qs.filter((x) => /spelled correctly/.test(x.prompt))) expect(WORDS.split(' ').includes(q.prompt.match(/“(.+)”/)![1])).toBe(q.answer[0]);
    console.log(qs.map((q) => `${q.type}: ${q.prompt} → ${JSON.stringify(q.type === 'MCQ' ? q.options[q.answer[0] as number] : q.answer)}`).join('\n'));
  });

  describe('endpoint', () => {
    let app: INestApplication; const owner = ownerPool(); let teacher: any; let student: any; let ed: string; let comp: string;
    beforeAll(async () => {
      app = await createApp(); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
      const book = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English'); ed = book.editionId;
      comp = (await teacher.get(`/api/reader/editions/${ed}`)).body.components[0].id;
      await owner.query(`INSERT INTO book_pages (publisher_id, component_id, page_number, text_content) SELECT publisher_id, id, 12, $2 FROM book_components WHERE id = $1
        ON CONFLICT (component_id, page_number) DO UPDATE SET text_content = excluded.text_content`, [comp, STORY]);
    });
    afterAll(async () => { await owner.end(); await app.close(); });
    it('a teacher picks a page and gets questions; no limits; students cannot', async () => {
      for (let i = 0; i < 3; i++) {
        const r = await teacher.post('/api/ai/page-questions').send({ editionId: ed, componentId: comp, page: 12, count: 5, seed: i });
        expect(r.status).toBe(201); expect(r.body.items).toHaveLength(5); expect(r.body.source).toBe('built-in');
      }
      const pic = await teacher.post('/api/ai/page-questions').send({ editionId: ed, componentId: comp, page: 2000, count: 5 });
      expect(pic.body.items).toHaveLength(0); expect(pic.body.warnings.join(' ')).toMatch(/picture page|not been read/);
      expect((await student.post('/api/ai/page-questions').send({ editionId: ed, componentId: comp, page: 12, count: 5 })).status).toBe(403);
    });
    it('the assignment remembers its page; students get it to open the book there', async () => {
      const classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
      const qs = (await teacher.post('/api/ai/page-questions').send({ editionId: ed, componentId: comp, page: 12, count: 3, types: ['MCQ'] })).body.items;
      const a = (await teacher.post('/api/teacher/assessments').send({ classId, kind: 'HOMEWORK', title: 'Page 12 quiz', editionId: ed, bookComponentId: comp, bookPage: 12,
        items: qs.map((q: any) => ({ type: q.type, prompt: q.prompt, options: q.options, answer: q.answer, points: 1 })) })).body;
      expect(a).toMatchObject({ bookComponentId: comp, bookPage: 12 });
      await teacher.post(`/api/teacher/assessments/${a.id}/publish`);
      expect((await student.get(`/api/student/homework/${a.id}`)).body).toMatchObject({ editionId: ed, bookComponentId: comp, bookPage: 12 });
      // a page from another book is refused
      const other = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title !== 'KG English');
      const otherComp = (await teacher.get(`/api/reader/editions/${other.editionId}`)).body.components[0].id;
      expect((await teacher.patch(`/api/teacher/assessments/${a.id}`).send({ bookComponentId: otherComp, bookPage: 3 })).status).toBe(400);
    });
  });
});
