import { createApp, login, ownerPool } from './helpers';

const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0, 0, 0, 0, 0]), Buffer.alloc(200, 0x11)]);

describe('Flipbook: reading direction, own page-turn sound, and the index marked by hand', () => {
  let app: any; let admin: any; let student: any; let teacher: any; let ed: string; let comp: any;
  beforeAll(async () => {
    app = await createApp(); admin = await login(app, 'admin', 'Admin@12345');
    student = await login(app, 'student1', 'Student@123', 'SUN01'); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    comp = (await admin.post(`/api/publishing/editions/${ed}/components`).send({ type: 'WORKBOOK', title: 'Index test workbook', pageCount: 12 })).body;
  });
  afterAll(async () => {
    const owner = ownerPool(); await owner.query(`DELETE FROM book_components WHERE id = $1`, [comp.id]); await owner.end();
    await admin.delete('/api/publishing/flip-sound'); await app.close();
  });

  it('reads right to left when the publisher says so', async () => {
    expect((await admin.patch(`/api/publishing/components/${comp.id}`).send({ readingDirection: 'RTL' })).body.readingDirection).toBe('RTL');
    expect((await admin.patch(`/api/publishing/components/${comp.id}`).send({ readingDirection: 'UP' })).status).toBe(400);
  });

  it('uses the publisher\'s own page-turn sound for every reader', async () => {
    const book = () => student.get(`/api/reader/editions/${ed}`);
    expect((await book()).body.flipSound).toBe(false);
    expect((await student.get('/api/reader/flip-sound')).status).toBe(204);
    const st = (await admin.post('/api/uploads').send({ name: 'page-turn.mp3', size: MP3.length, key: `snd|${Date.now()}` })).body;
    await admin.put(`/api/uploads/${st.id}/0`).set('Content-Type', 'application/octet-stream').send(MP3);
    const r = await admin.post('/api/publishing/flip-sound-from-upload').send({ uploadId: st.id });
    expect(r.status).toBe(201); expect(r.body.flipSound.name).toBe('page-turn.mp3');
    expect((await teacher.post('/api/publishing/flip-sound-from-upload').send({ uploadId: st.id })).status).toBe(403);
    expect((await book()).body.flipSound).toBe(true);
    const f = await student.get('/api/reader/flip-sound'); expect(f.status).toBe(200); expect(f.headers['content-type']).toMatch(/audio\/mpeg/);
    await admin.delete('/api/publishing/flip-sound');
    expect((await book()).body.flipSound).toBe(false);
  });

  it('marks where units and lessons start; page ranges follow; marks can be removed', async () => {
    const m = (kind: string, page: number, title: string) => admin.post(`/api/ai/contents/components/${comp.id}/marks`).send({ kind, page, title });
    expect((await m('UNIT', 2, 'My Family')).status).toBe(201);
    expect((await m('LESSON', 4, 'My mum')).status).toBe(201);
    expect((await m('UNIT', 7, 'Animals')).status).toBe(201);
    expect((await m('LESSON', 4, 'Again')).status).toBe(409);
    let list = (await admin.get(`/api/ai/contents/components/${comp.id}/marks`)).body;
    expect(list.map((x: any) => [x.unitNumber, x.title, x.pageStart, x.pageEnd, x.firstInUnit])).toEqual([[1, 'My Family', 2, 3, true], [1, 'My mum', 4, 6, false], [2, 'Animals', 7, 12, true]]);
    expect((await teacher.post(`/api/ai/contents/components/${comp.id}/marks`).send({ kind: 'UNIT', page: 9, title: 'x' })).status).toBe(403);
    list = (await admin.delete(`/api/ai/contents/components/${comp.id}/marks/${list[1].id}`)).body;
    expect(list.map((x: any) => [x.title, x.pageStart, x.pageEnd])).toEqual([['My Family', 2, 6], ['Animals', 7, 12]]);
    const r = (await admin.get(`/api/publishing/editions/${ed}`)).body.components.find((c: any) => c.id === comp.id);
    expect(r.units.map((u: any) => u.title)).toEqual(['My Family', 'Animals']);
  });
});
