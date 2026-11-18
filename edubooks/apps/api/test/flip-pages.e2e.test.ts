import * as path from 'path';
import { detectFlipPages } from '../src/flipbook/flip-pages';
import { createApp, login } from './helpers';

describe('Flipbook page pictures', () => {
  it('finds the numbered page images (and thumbnails) in common flipbook layouts', () => {
    const files = ['index.html', 'files/large/1.jpg', 'files/large/2.jpg', 'files/large/3.jpg', 'files/large/4.jpg', 'files/thumb/1.jpg', 'files/thumb/2.jpg', 'files/thumb/3.jpg', 'files/thumb/4.jpg', 'images/logo1.png', 'js/x.js'];
    expect(detectFlipPages(files)).toEqual([1, 2, 3, 4].map((n) => ({ n, path: `files/large/${n}.jpg`, thumb: `files/thumb/${n}.jpg` })));
    expect(detectFlipPages(['pages/page0000.webp', 'pages/page0001.webp', 'pages/page0002.webp']).map((p) => p.n)).toEqual([1, 2, 3]); // 0-based names
    expect(detectFlipPages(['a.jpg', 'b.png', 'index.html'])).toEqual([]);
  });
});

describe('AI from flipbook pages (a part with no PDF)', () => {
  let app: any; let admin: any; let teacher: any; let ed: string; let part: any;
  beforeAll(async () => {
    app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    part = (await admin.get(`/api/publishing/editions/${ed}`)).body.components.find((c: any) => c.type === 'FLASHCARDS' && !c.bookFile);
  });
  afterAll(async () => { await admin.delete(`/api/publishing/components/${part.id}/flipbook`); await app.close(); });

  it('reads the flipbook pages with OCR after upload; the teacher sees the pages and the AI uses the chosen ones', async () => {
    const up = await admin.post(`/api/publishing/components/${part.id}/flipbook`).attach('file', path.join(__dirname, 'fixtures/flipbook-pages.zip'));
    expect(up.status).toBe(201);
    let c: any;
    for (let i = 0; i < 120; i++) {
      c = (await admin.get(`/api/publishing/editions/${ed}`)).body.components.find((x: any) => x.id === part.id);
      if (c.indexStatus !== 'RUNNING') break; await new Promise((r) => setTimeout(r, 500));
    }
    expect(c.indexStatus).toBe('DONE'); expect(c.indexedPages).toBe(5);
    const pages = (await teacher.get(`/api/reader/components/${part.id}/flip-pages`)).body.pages;
    expect(pages.map((p: any) => p.n)).toEqual([1, 2, 3, 4, 5]); expect(pages[0].thumb).toMatch(/files\/thumb\/1\.jpg$/);
    expect((await teacher.get(pages[1].src)).status).toBe(200);
    const r = await teacher.post('/api/ai/generate').send({ task: 'LESSON_PLAN', editionId: ed, componentId: part.id, pages: '2-3' });
    expect(r.status).toBe(201);
    expect(r.body.sources.map((x: any) => x.page)).toEqual([2, 3]);
    expect(r.body.sources[0].snippet.toLowerCase()).toContain('ball');
  }, 120_000);
});
