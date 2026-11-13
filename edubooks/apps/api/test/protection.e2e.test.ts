import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const APK = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('fake android app')]);

describe('Covers, CD / mobile-app parts and content protection', () => {
  let app: INestApplication; let admin: any; let teacher: any; let student: any; let ed: string; let pkgId: string; let appPart: string; let part1: string;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    app = await createApp();
    admin = await login(app, 'admin', 'Admin@12345'); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
    const book = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English');
    ed = book.editionId; pkgId = book.packageId;
    part1 = (await teacher.get(`/api/reader/editions/${ed}`)).body.components[0].id;
  });
  afterAll(async () => { await app.close(); });

  it('uploads a cover mockup that appears in the libraries', async () => {
    expect((await teacher.post(`/api/publishing/packages/${pkgId}/cover`).attach('file', PNG, 'c.png')).status).toBe(403);
    expect((await admin.post(`/api/publishing/packages/${pkgId}/cover`).attach('file', Buffer.from('<svg/>'), 'c.png')).status).toBe(400);
    const up = await admin.post(`/api/publishing/packages/${pkgId}/cover`).attach('file', PNG, 'cover.png');
    expect(up.status).toBe(201);
    const lib = (await student.get('/api/library')).body.find((b: any) => b.editionId === ed);
    expect(lib.coverUrl).toBe(up.body.coverUrl);
    const img = await student.get(up.body.coverUrl);
    expect([img.status, img.headers['content-type']]).toEqual([200, 'image/png']);
    expect((await http().get(up.body.coverUrl)).status).toBe(401);
  });

  it('adds a mobile-app part; licensed students get a QR download link for the app only', async () => {
    // a draft edition is needed to add parts: use the builder of a fresh package
    const subjects = (await admin.get('/api/catalog/subjects')).body; const grades = (await admin.get('/api/catalog/grades')).body;
    const pkg = (await admin.post('/api/publishing/packages').send({ title: 'App test book', gradeId: grades[0].id, subjectId: subjects[0].id, editionLabel: '2026 Edition', editionYear: 2026, standardStructure: true })).body;
    const t = (await admin.get(`/api/publishing/editions/${pkg.editionId}`)).body;
    const appComp = t.components.find((c: any) => c.type === 'MOBILE_APP'); const cd = t.components.find((c: any) => c.type === 'CD');
    expect(appComp).toBeTruthy(); expect(cd).toBeTruthy();
    appPart = appComp.id;
    expect((await admin.post(`/api/publishing/components/${appPart}/app/apk`).attach('file', PNG, 'x.apk')).status).toBe(400);
    expect((await admin.post(`/api/publishing/components/${appPart}/app/apk`).attach('file', APK, 'kg-english.apk')).status).toBe(201);
    expect((await admin.put(`/api/publishing/components/${appPart}/app`).send({ androidUrl: 'http://x' })).status).toBe(400);
    const s = await admin.put(`/api/publishing/components/${appPart}/app`).send({ iosUrl: 'https://apps.apple.com/app/id1', version: '1.0' });
    expect(s.body).toMatchObject({ iosUrl: 'https://apps.apple.com/app/id1', apkName: 'kg-english.apk' });
    const r = (await admin.get(`/api/reader/components/${appPart}/app`)).body;
    expect(r.apkUrl).toMatch(/^\/api\/app-download\//);
    const dl = await http().get(r.apkUrl); // from a phone, not signed in
    expect([dl.status, dl.headers['content-type']]).toEqual([200, 'application/vnd.android.package-archive']);
    expect(dl.headers['content-disposition']).toMatch(/attachment/);
    expect((await http().get(r.apkUrl.slice(0, -3) + 'abc')).status).toBe(403);
    expect((await student.get(`/api/reader/components/${appPart}/app`)).status).toBe(403); // not licensed for this new book
  });

  it('lets school users only view book content inside the platform', async () => {
    expect((await student.get('/api/company/my-protection')).body).toMatchObject({ protect: true, watermark: expect.stringContaining('Sample Student 1') });
    expect((await admin.get('/api/company/my-protection')).body.protect).toBe(false);
    const link = (await student.get(`/api/reader/components/${part1}/pdf`)).body;
    expect(link.viewOnly).toBe(true);
    expect((await http().get(link.url).set('Sec-Fetch-Dest', 'empty')).status).toBe(200); // the reader's own fetch
    expect((await http().get(link.url).set('Sec-Fetch-Dest', 'document')).status).toBe(403); // opened as a page to save it
    const res = (await teacher.get(`/api/reader/editions/${ed}`)).body.resources[0];
    expect((await teacher.get(`/api/assets/${res.assetId}/link?download=1`)).status).toBe(403);
    // the publisher can relax it for teachers
    expect((await admin.put('/api/company/protection').send({ enabled: true, teachers: false })).status).toBe(200);
    expect((await teacher.get(`/api/assets/${res.assetId}/link?download=1`)).status).toBe(200);
    expect((await student.get('/api/company/my-protection')).body.protect).toBe(true);
    await admin.put('/api/company/protection').send({ enabled: true, teachers: true });
  });
});
