import * as path from 'path';
import { createApp, login, ownerPool } from './helpers';

describe('Automatic OCR of chosen pages that have no text', () => {
  let app: any; let admin: any; let teacher: any; let ed: string; let part: any;
  beforeAll(async () => {
    app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    part = (await admin.get(`/api/publishing/editions/${ed}`)).body.components.find((c: any) => c.type === 'WORKBOOK' || (c.type === 'HOMEWORK_BOOK' && !c.bookFile));
  });
  afterAll(async () => { await admin.delete(`/api/publishing/components/${part.id}/book-pdf`).catch(() => undefined); await app.close(); });

  it('reads the pages with OCR when the teacher chooses them, then the AI uses their words', async () => {
    expect((await admin.post(`/api/publishing/components/${part.id}/book-pdf`).attach('file', path.join(__dirname, 'fixtures/scanned.pdf'), 'scanned.pdf')).status).toBe(201);
    for (let i = 0; i < 120; i++) { const c = (await admin.get(`/api/publishing/editions/${ed}`)).body.components.find((x: any) => x.id === part.id); if (c.indexStatus !== 'RUNNING') break; await new Promise((r) => setTimeout(r, 500)); }
    // as if the book had been indexed without OCR: the pages have no text
    const owner = ownerPool(); await owner.query(`UPDATE book_pages SET text_content = '' WHERE component_id = $1`, [part.id]); await owner.end();
    const r = await teacher.post('/api/ai/generate').send({ task: 'MCQ', editionId: ed, componentId: part.id, pages: '2-3' });
    expect(r.status).toBe(201);
    expect(r.body.warnings.join(' ')).toMatch(/read automatically with OCR/);
    expect(r.body.sources.map((x: any) => x.page)).toEqual([2, 3]);
    expect(r.body.sources[0].snippet.toLowerCase()).toContain('moon');
  }, 120_000);
});
