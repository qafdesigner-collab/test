import * as path from 'path';
import { createApp, login, ownerPool } from './helpers';

describe('Ask Owl reads pages that have no text yet; continue reading only shows licensed books', () => {
  let app: any; let admin: any; let principal: any; let student: any; let ed: string; let part: any;
  beforeAll(async () => {
    app = await createApp(); admin = await login(app, 'admin', 'Admin@12345');
    principal = await login(app, 'principal', 'School@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
    await principal.put('/api/tutor/settings').send({ enabled: true, dailyLimit: 200 });
    const teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    part = (await admin.get(`/api/publishing/editions/${ed}`)).body.components.find((c: any) => c.type === 'WORKBOOK' || (c.type === 'HOMEWORK_BOOK' && !c.bookFile));
  });
  afterAll(async () => { await admin.delete(`/api/publishing/components/${part.id}/book-pdf`).catch(() => undefined); await app.close(); });

  it('reads the page with OCR the first time a student asks Owl about it', async () => {
    expect((await admin.post(`/api/publishing/components/${part.id}/book-pdf`).attach('file', path.join(__dirname, 'fixtures/scanned.pdf'), 'scanned.pdf')).status).toBe(201);
    for (let i = 0; i < 120; i++) { const c = (await admin.get(`/api/publishing/editions/${ed}`)).body.components.find((x: any) => x.id === part.id); if (c.indexStatus !== 'RUNNING') break; await new Promise((r) => setTimeout(r, 500)); }
    const owner = ownerPool(); await owner.query(`UPDATE book_pages SET text_content = '' WHERE component_id = $1`, [part.id]); await owner.end();
    const r = await student.post('/api/tutor/ask').send({ editionId: ed, componentId: part.id, page: 2, mode: 'EXPLAIN' });
    expect(r.status).toBe(201);
    expect(r.body.answer).not.toMatch(/can't read the words/);
    // only the open page is used — never the pages around it
    expect(r.body.sources.map((x: any) => x.page)).toEqual([2]);
    const owner2 = ownerPool();
    const { rows } = await owner2.query(`SELECT page_number FROM book_pages WHERE component_id = $1 AND length(text_content) > 20 ORDER BY 1`, [part.id]); await owner2.end();
    expect(rows.map((x: any) => x.page_number)).toEqual([2]);
    // a double-page spread: both open pages, nothing else
    const q = await student.post('/api/tutor/ask').send({ editionId: ed, componentId: part.id, page: 2, toPage: 3, mode: 'ASK', question: 'What is on these pages?' });
    expect(q.status).toBe(201);
    expect(q.body.sources.every((x: any) => [2, 3].includes(x.page))).toBe(true);
  }, 120_000);

  it('continue reading skips a book the student no longer holds a licence for', async () => {
    const owner = ownerPool();
    const { rows: [u] } = await owner.query(`SELECT id, publisher_id, school_id FROM users WHERE username = 'student1' AND school_id = (SELECT id FROM schools WHERE code = 'SUN01')`);
    const { rows: [other] } = await owner.query(`SELECT c.id FROM book_components c JOIN book_editions e ON e.id = c.edition_id JOIN book_packages b ON b.id = e.package_id
      WHERE b.publisher_id = $1 AND e.id NOT IN (SELECT unnest($2::uuid[])) LIMIT 1`, [u.publisher_id, ((await student.get('/api/library')).body).map((b: any) => b.editionId)]);
    if (other) await owner.query(`INSERT INTO reader_progress (publisher_id, school_id, user_id, component_id, last_page, max_page, updated_at) VALUES ($1, $4, $2, $3, 4, 4, now() + interval '1 hour')
      ON CONFLICT (user_id, component_id) DO UPDATE SET updated_at = EXCLUDED.updated_at`, [u.publisher_id, u.id, other.id, u.school_id]);
    const home = (await student.get('/api/student/home')).body;
    if (other) await owner.query(`DELETE FROM reader_progress WHERE user_id = $1 AND component_id = $2`, [u.id, other.id]);
    await owner.end();
    expect(other).toBeTruthy();
    expect(home.continueReading?.componentId).not.toBe(other.id);
  });
});
