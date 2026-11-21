import { createApp, login, ownerPool } from './helpers';

// a tiny valid PNG and an MP4 header ("ftyp") — enough for the file-type checks
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(64, 1)]);

describe('Flipbook made from the book PDF, with the publisher\'s own videos and pictures on the pages', () => {
  let app: any; let admin: any; let student: any; let teacher: any; let ed: string; let part: any;
  const send = async (name: string, data: Buffer) => {
    const st = (await admin.post('/api/uploads').send({ name, size: data.length, key: `${name}|${Date.now()}|${Math.random()}` })).body;
    for (let i = 0; i < st.pieces; i++) expect((await admin.put(`/api/uploads/${st.id}/${i}`).set('Content-Type', 'application/octet-stream').send(data.subarray(i * st.chunkSize, (i + 1) * st.chunkSize))).status).toBe(200);
    return admin.post(`/api/publishing/components/${part.id}/page-media-from-upload`).send({ uploadId: st.id });
  };
  beforeAll(async () => {
    app = await createApp(); admin = await login(app, 'admin', 'Admin@12345');
    student = await login(app, 'student1', 'Student@123', 'SUN01'); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    part = (await admin.get(`/api/publishing/editions/${ed}`)).body.components.find((c: any) => c.title === 'Student Book Part 1');
  });
  afterAll(async () => {
    const owner = ownerPool(); await owner.query(`DELETE FROM page_hotspots WHERE component_id = $1 AND asset_id IS NOT NULL`, [part.id]); await owner.end();
    await admin.patch(`/api/publishing/components/${part.id}`).send({ displayMode: 'PDF' }); await app.close();
  });

  it('shows a part as a flipbook (also on a published edition) and readers are told', async () => {
    const set = await admin.patch(`/api/publishing/components/${part.id}`).send({ displayMode: 'FLIP' }); expect(set.body).toMatchObject({ displayMode: 'FLIP' });
    expect((await admin.patch(`/api/publishing/components/${part.id}`).send({ displayMode: 'BOOK' })).status).toBe(400);
    const r = (await student.get(`/api/reader/editions/${ed}`)).body.components.find((c: any) => c.id === part.id);
    expect(r.displayMode).toBe('FLIP');
  });

  it('places a picture and the publisher\'s own video on pages; only licensed readers can open them', async () => {
    const pic = await send('lion.png', PNG); expect(pic.status).toBe(201); expect(pic.body).toMatchObject({ kind: 'IMAGE' });
    const vid = await send('song.mp4', MP4); expect(vid.body).toMatchObject({ kind: 'VIDEO' });
    expect((await send('notes.txt', Buffer.from('hello'))).status).toBe(400);
    // a picture needs a picture file, a video a video file
    expect((await admin.post(`/api/reader/components/${part.id}/hotspots`).send({ page: 2, x: 0.1, y: 0.1, w: 0.3, h: 0.2, kind: 'IMAGE', assetId: vid.body.assetId })).status).toBe(400);
    expect((await admin.post(`/api/reader/components/${part.id}/hotspots`).send({ page: 2, x: 0.1, y: 0.1, w: 0.3, h: 0.2, kind: 'IMAGE', assetId: pic.body.assetId, inline: true, body: 'A lion' })).status).toBe(201);
    expect((await admin.post(`/api/reader/components/${part.id}/hotspots`).send({ page: 3, x: 0.2, y: 0.5, w: 0.5, h: 0.3, kind: 'VIDEO', assetId: vid.body.assetId, inline: true })).status).toBe(201);
    const hs = (await student.get(`/api/reader/components/${part.id}/hotspots`)).body;
    expect(hs.find((h: any) => h.kind === 'IMAGE')).toMatchObject({ page: 2, inline: true, mime: 'image/png', assetId: pic.body.assetId });
    expect(hs.find((h: any) => h.kind === 'VIDEO')).toMatchObject({ page: 3, inline: true, mime: 'video/mp4', url: null });
    // the student (licensed) gets a short-lived link; a school without this book does not
    expect((await student.get(`/api/assets/${vid.body.assetId}/link`)).status).toBe(200);
    const owner = ownerPool();
    const { rows: [other] } = await owner.query(`SELECT s.code FROM schools s WHERE s.code <> 'SUN01' AND NOT EXISTS (SELECT 1 FROM school_licences l WHERE l.school_id = s.id) LIMIT 1`).catch(() => ({ rows: [] as any[] }));
    await owner.end();
    if (other) expect([403, 401]).toContain((await (await login(app, 'principal', 'School@12345', other.code)).get(`/api/assets/${vid.body.assetId}/link`)).status);
  });
});
