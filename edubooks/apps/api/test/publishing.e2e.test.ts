import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login, PDF } from './helpers';

describe('Phase 2 — Book Package Management', () => {
  let app: INestApplication;
  let admin: Awaited<ReturnType<typeof login>>;
  let gradeId: string; let subjectId: string;
  let pkgId: string; let edId: string; let partId: string; let unitId: string; let lessonId: string;

  beforeAll(async () => {
    app = await createApp();
    admin = await login(app, 'admin', 'Admin@12345');
    gradeId = (await admin.get('/api/catalog/grades')).body.find((g: any) => g.name === 'Grade 2').id;
    subjectId = (await admin.get('/api/catalog/subjects')).body.find((s: any) => s.name === 'English').id;
  });
  afterAll(async () => { await app.close(); });

  it('lists and filters packages with pagination', async () => {
    const all = await admin.get('/api/publishing/packages?pageSize=2');
    expect(all.body.total).toBe(5);
    expect(all.body.items).toHaveLength(2);
    const drafts = await admin.get('/api/publishing/packages?status=DRAFT');
    expect(drafts.body.items.map((p: any) => p.title)).toEqual(['Grade 1 English']);
    const search = await admin.get('/api/publishing/packages?search=maths');
    expect(search.body.items[0].title).toBe('KG Maths');
  });

  it('creates a package with the standard structure (3 parts + homework + resources components)', async () => {
    const r = await admin.post('/api/publishing/packages').send({
      title: 'Grade 2 English', gradeId, subjectId, editionLabel: '2026 Edition', editionYear: 2026, standardStructure: true,
    });
    expect(r.status).toBe(201);
    pkgId = r.body.id; edId = r.body.editionId;
    const tree = (await admin.get(`/api/publishing/editions/${edId}`)).body;
    expect(tree.components.map((c: any) => c.title)).toEqual([
      'Student Book Part 1', 'Student Book Part 2', 'Student Book Part 3', 'Homework Book', 'Teacher Guide', 'Flashcards', 'Teacher Cards', 'Danglers', 'CD', 'Mobile App',
    ]);
    partId = tree.components[0].id;
  });

  it('builds units and lessons with auto numbering and validation', async () => {
    unitId = (await admin.post(`/api/publishing/components/${partId}/units`).send({ title: 'Unit A' })).body.id;
    const l1 = await admin.post(`/api/publishing/units/${unitId}/lessons`).send({ title: 'Letter A', pageStart: 3, pageEnd: 5 });
    const l2 = await admin.post(`/api/publishing/units/${unitId}/lessons`).send({ title: 'Letter B' });
    expect([l1.body.number, l2.body.number]).toEqual([1, 2]);
    lessonId = l1.body.id;
    const bad = await admin.post(`/api/publishing/units/${unitId}/lessons`).send({ title: 'Bad', pageStart: 9, pageEnd: 2 });
    expect(bad.status).toBe(400);
    const r = await admin.post('/api/publishing/reorder').send({ kind: 'lesson', ids: [l2.body.id, l1.body.id] });
    expect(r.status).toBe(201);
    const tree = (await admin.get(`/api/publishing/editions/${edId}`)).body;
    expect(tree.components[0].units[0].lessons.map((l: any) => l.title)).toEqual(['Letter B', 'Letter A']);
  });

  it('uploads resources scoped to a lesson and de-duplicates identical files', async () => {
    const r1 = await admin.post(`/api/publishing/editions/${edId}/resources`).field('lessonId', lessonId).field('audience', 'ALL')
      .attach('files', PDF, 'letter-a.pdf');
    expect(r1.status).toBe(201);
    expect(r1.body[0]).toMatchObject({ lessonId, unitId, componentId: partId, resourceType: 'PDF', reusedExistingFile: false });
    const r2 = await admin.post(`/api/publishing/editions/${edId}/resources`).attach('files', PDF, 'copy-of-letter-a.pdf');
    expect(r2.body[0].reusedExistingFile).toBe(true);
    expect(r2.body[0].assetId).toBe(r1.body[0].assetId);
    expect(r2.body[0].componentId).toBeNull(); // whole-book resource
  });

  it('rejects disallowed or disguised files', async () => {
    const exe = await admin.post(`/api/publishing/editions/${edId}/resources`).attach('files', Buffer.from('MZ\x90\x00'), 'virus.exe');
    expect(exe.status).toBe(400);
    const fake = await admin.post(`/api/publishing/editions/${edId}/resources`).attach('files', Buffer.from('MZ\x90\x00 not a pdf'), 'book.pdf');
    expect(fake.status).toBe(422);
  });

  it('serves files only through short-lived signed URLs; HTML is sandboxed', async () => {
    const tree = (await admin.get(`/api/publishing/editions/${edId}`)).body;
    const link = await admin.get(`/api/assets/${tree.resources[0].asset.id}/link`);
    expect(link.body.url).toMatch(/^\/api\/files\//);
    const f = await request(app.getHttpServer()).get(link.body.url).buffer(true);
    expect(f.status).toBe(200);
    expect(f.headers['content-type']).toMatch(/pdf/);
    const tampered = link.body.url.replace(/.$/, (c: string) => (c === 'A' ? 'B' : 'A'));
    expect((await request(app.getHttpServer()).get(tampered)).status).toBe(403);
    // Seeded HTML resource
    const kg = (await admin.get('/api/publishing/packages?search=KG English')).body.items[0];
    const kgTree = (await admin.get(`/api/publishing/editions/${(await admin.get(`/api/publishing/packages/${kg.id}`)).body.editions[0].id}`)).body;
    const html = kgTree.resources.find((r: any) => r.asset.ext === 'html');
    const hl = await admin.get(`/api/assets/${html.asset.id}/link`);
    const hf = await request(app.getHttpServer()).get(hl.body.url);
    expect(hf.headers['content-security-policy']).toMatch(/sandbox/);
  });

  it('teachers cannot obtain file links for publisher assets yet (licence checks come in Phase 3)', async () => {
    const t = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    const tree = (await admin.get(`/api/publishing/editions/${edId}`)).body;
    expect((await t.get(`/api/assets/${tree.resources[0].asset.id}/link`)).status).toBe(403);
  });

  it('publishing locks the structure but allows text edits and resources', async () => {
    const pub = await admin.post(`/api/publishing/editions/${edId}/publish`);
    expect(pub.status).toBe(201);
    expect((await admin.get(`/api/publishing/packages/${pkgId}`)).body.status).toBe('PUBLISHED');
    expect((await admin.post(`/api/publishing/components/${partId}/units`).send({ title: 'Late unit' })).status).toBe(409);
    expect((await admin.delete(`/api/publishing/lessons/${lessonId}`)).status).toBe(409);
    expect((await admin.patch(`/api/publishing/lessons/${lessonId}`).send({ pageStart: 1 })).status).toBe(409);
    expect((await admin.patch(`/api/publishing/lessons/${lessonId}`).send({ title: 'Letter A — Apple' })).status).toBe(200);
    expect((await admin.post(`/api/publishing/editions/${edId}/publish`)).status).toBe(409);
  });

  it('a new edition copies structure and links the SAME files (no duplication); editing it leaves the old one intact', async () => {
    const r = await admin.post(`/api/publishing/packages/${pkgId}/editions`).send({ label: '2027 Edition', editionYear: 2027, cloneFromEditionId: edId });
    expect(r.status).toBe(201);
    const [oldT, newT] = await Promise.all([admin.get(`/api/publishing/editions/${edId}`), admin.get(`/api/publishing/editions/${r.body.id}`)]);
    expect(newT.body.status).toBe('DRAFT');
    expect(newT.body.components).toHaveLength(oldT.body.components.length);
    expect(newT.body.components[0].units[0].lessons.map((l: any) => l.title)).toEqual(['Letter B', 'Letter A — Apple']);
    expect(newT.body.resources.map((x: any) => x.asset.id).sort()).toEqual(oldT.body.resources.map((x: any) => x.asset.id).sort());
    const newLesson = newT.body.resources.find((x: any) => x.lessonId);
    expect(newLesson.lessonId).not.toBe(lessonId);
    // structure editable again in the draft edition
    const newPart = newT.body.components[0].id;
    expect((await admin.post(`/api/publishing/components/${newPart}/units`).send({ title: 'New unit' })).status).toBe(201);
    expect((await admin.delete(`/api/publishing/resources/${newT.body.resources[0].id}`)).status).toBe(200);
    expect((await admin.get(`/api/publishing/editions/${edId}`)).body.resources).toHaveLength(oldT.body.resources.length);
  });

  it('archiving makes the package read-only; restore brings it back', async () => {
    await admin.post(`/api/publishing/packages/${pkgId}/archive`);
    expect((await admin.patch(`/api/publishing/packages/${pkgId}`).send({ title: 'Renamed' })).status).toBe(409);
    expect((await admin.patch(`/api/publishing/lessons/${lessonId}`).send({ title: 'Y' })).status).toBe(409);
    const r = await admin.post(`/api/publishing/packages/${pkgId}/restore`);
    expect(r.body.status).toBe('PUBLISHED');
  });

  it('protects referenced taxonomy and duplicate names', async () => {
    expect((await admin.delete(`/api/catalog/grades/${gradeId}`)).status).toBe(409);
    expect((await admin.post('/api/catalog/subjects').send({ name: 'english' })).status).toBe(409);
  });

  it('records every change in the audit log', async () => {
    const r = await admin.get(`/api/audit?entityType=book_package&entityId=${pkgId}`);
    expect(r.body.items.map((x: any) => x.action)).toEqual(expect.arrayContaining(['publishing.package.create', 'publishing.package.archive', 'publishing.package.restore']));
    expect(r.body.items[0].actor).toBe('Publisher Admin');
  });
});
