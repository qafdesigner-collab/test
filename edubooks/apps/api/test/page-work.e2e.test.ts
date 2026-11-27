import { createApp, login, ownerPool } from './helpers';

// a tiny valid JPEG-looking data URL (the server checks the format and size, not the picture)
const IMG = `data:image/jpeg;base64,${Buffer.alloc(300, 7).toString('base64')}`;

describe('Book page work: drawing areas, tracing paths and sending work to the teacher', () => {
  let app: any; let editor: any; let teacher: any; let principal: any; let student: any; let part1: string; const made: string[] = [];
  beforeAll(async () => {
    app = await createApp();
    editor = await login(app, 'editor', 'Admin@12345');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); principal = await login(app, 'principal', 'School@12345', 'SUN01');
    student = await login(app, 'student1', 'Student@123', 'SUN01');
    const ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    part1 = (await teacher.get(`/api/reader/editions/${ed}`)).body.components[0].id;
  });
  afterAll(async () => {
    const owner = ownerPool(); await owner.query(`DELETE FROM page_work WHERE hotspot_id = ANY($1::uuid[])`, [made]); await owner.query(`DELETE FROM page_hotspots WHERE id = ANY($1::uuid[])`, [made]); await owner.end();
    await app.close();
  });
  const box = { page: 2, x: 0.1, y: 0.1, w: 0.5, h: 0.3 };

  it('saves the writing path of a tracing area (cleaned and limited) and adds drawing areas', async () => {
    const r = await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, kind: 'TRACE', title: 'Write a', data: { paths: [[[0.1, 0.5], [0.5, 0.2], [2, -1]], [[0.3, 0.3]], 'x'], evil: 1 } });
    expect(r.status).toBe(201); made.push(r.body.id);
    const d = await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, page: 3, kind: 'DRAW', title: 'Draw your family', data: { paths: [[[0, 0], [1, 1]]] } });
    expect(d.status).toBe(201); made.push(d.body.id);
    const list = (await student.get(`/api/reader/components/${part1}/hotspots`)).body;
    expect(list.find((h: any) => h.id === r.body.id).data).toEqual({ paths: [[[0.1, 0.5], [0.5, 0.2], [1, 0]]] });
    expect(list.find((h: any) => h.id === d.body.id)).toMatchObject({ kind: 'DRAW', data: {} });
    // editing other fields keeps the path; sending data replaces it
    await editor.patch(`/api/reader/hotspots/${r.body.id}`).send({ title: 'Write the letter a' });
    let h = (await student.get(`/api/reader/components/${part1}/hotspots`)).body.find((x: any) => x.id === r.body.id);
    expect(h.title).toBe('Write the letter a'); expect(h.data.paths).toHaveLength(1);
    await editor.patch(`/api/reader/hotspots/${r.body.id}`).send({ data: {} });
    h = (await student.get(`/api/reader/components/${part1}/hotspots`)).body.find((x: any) => x.id === r.body.id);
    expect(h.data).toEqual({});
  });

  it('accepts elements on every page of the PDF even when an old typed page count is too small', async () => {
    const o = ownerPool();
    const { rows: [c] } = await o.query('SELECT page_count, pages_checked FROM book_components WHERE id = $1', [part1]);
    await o.query('UPDATE book_components SET page_count = 10, pages_checked = false WHERE id = $1', [part1]);
    const r = await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, page: 21, kind: 'NOTE', body: 'p21' });
    expect(r.status).toBe(201); made.push(r.body.id);
    // the one-time check reads the real page count from the PDF; then it is used again
    const { IndexerService } = require('../src/ai/indexer.service');
    expect(await app.get(IndexerService).recountPages()).toBeGreaterThanOrEqual(1);
    const { rows: [after] } = await o.query('SELECT page_count, pages_checked FROM book_components WHERE id = $1', [part1]);
    expect(after.pages_checked).toBe(true); expect(after.page_count).toBeGreaterThan(10);
    expect((await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, page: 99, kind: 'NOTE', body: 'x' })).status).toBe(400);
    await o.query('UPDATE book_components SET page_count = $2, pages_checked = $3 WHERE id = $1', [part1, c.page_count, c.pages_checked]); await o.end();
  });

  it('lets a student send their tracing or drawing; the teacher sees it, comments and gives stars; the student sees the comment', async () => {
    const [trace, draw] = made;
    expect((await student.post(`/api/reader/hotspots/${trace}/work`).send({ image: 'data:text/html;base64,PHNjcmlwdD4=' })).status).toBe(400);
    expect((await teacher.post(`/api/reader/hotspots/${trace}/work`).send({ image: IMG })).status).toBe(403);
    expect((await student.post(`/api/reader/hotspots/${trace}/work`).send({ image: IMG, stars: 2 })).status).toBe(201);
    expect((await student.post(`/api/reader/hotspots/${draw}/work`).send({ image: IMG })).status).toBe(201);
    expect((await student.get(`/api/reader/work`)).status).toBe(403);

    const list = (await teacher.get('/api/reader/work')).body.filter((w: any) => made.includes(w.id) || w.element?.startsWith('Write') || w.element === 'Draw your family');
    expect(list.length).toBeGreaterThanOrEqual(2);
    const t = list.find((w: any) => w.kind === 'TRACE');
    expect(t).toMatchObject({ student: expect.any(String), page: 2, stars: 2, seenAt: null });
    const img = await teacher.get(`/api/reader/work/${t.id}/image`);
    expect(img.status).toBe(200); expect(img.headers['content-type']).toBe('image/jpeg');
    expect((await student.get(`/api/reader/work/${t.id}/image`)).status).toBe(403);

    expect((await teacher.patch(`/api/reader/work/${t.id}`).send({ comment: 'Lovely! Start from the top next time.', stars: 3 })).status).toBe(200);
    const mine = (await student.get(`/api/reader/hotspots/${trace}/my-work`)).body;
    expect(mine).toMatchObject({ comment: 'Lovely! Start from the top next time.', stars: 3 });
    // the principal sees all work of the school
    expect((await principal.get('/api/reader/work')).body.some((w: any) => w.id === t.id)).toBe(true);
    // elements that are not tracing or drawing do not take work
    const note = await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, page: 4, kind: 'NOTE', body: 'hi' }); made.push(note.body.id);
    expect((await student.post(`/api/reader/hotspots/${note.body.id}/work`).send({ image: IMG })).status).toBe(404);
  });

  it('read aloud on a book page: the student sends a recording; the teacher listens and answers well done or do it again', async () => {
    const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(400, 7)]);
    const r = await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, page: 5, kind: 'READ', title: 'Read the sentence' });
    expect(r.status).toBe(201); made.push(r.body.id);
    expect((await student.post(`/api/reader/hotspots/${r.body.id}/work`).send({})).status).toBe(400); // nothing recorded
    const teacherClip = (await teacher.post('/api/messages/audio').field('kind', 'READING').field('durationMs', '2000').attach('file', WEBM, 'r.webm')).body;
    expect((await student.post(`/api/reader/hotspots/${r.body.id}/work`).send({ audioId: teacherClip.id })).status).toBe(400); // not their own reading
    const clip = (await student.post('/api/messages/audio').field('kind', 'READING').field('durationMs', '2000').attach('file', WEBM, 'r.webm')).body;
    expect((await student.post(`/api/reader/hotspots/${r.body.id}/work`).send({ audioId: clip.id })).status).toBe(201);
    const w = (await teacher.get('/api/reader/work')).body.find((x: any) => x.kind === 'READ' && x.element === 'Read the sentence');
    expect(w).toMatchObject({ audioId: clip.id, hasImage: false, verdict: null });
    expect((await teacher.get(`/api/messages/audio/${clip.id}`)).status).toBe(200); // the teacher can listen
    expect((await teacher.patch(`/api/reader/work/${w.id}`).send({ verdict: 'MAYBE' })).status).toBe(400);
    expect((await teacher.patch(`/api/reader/work/${w.id}`).send({ verdict: 'REDO', stars: 1, comment: 'Read a bit slower, please.' })).status).toBe(200);
    expect((await student.get(`/api/reader/hotspots/${r.body.id}/my-work`)).body).toMatchObject({ verdict: 'REDO', stars: 1, comment: 'Read a bit slower, please.' });
    // drawings get a verdict too
    const d = (await teacher.get('/api/reader/work')).body.find((x: any) => x.kind === 'DRAW');
    expect((await teacher.patch(`/api/reader/work/${d.id}`).send({ verdict: 'OK' })).status).toBe(200);
  });
});
