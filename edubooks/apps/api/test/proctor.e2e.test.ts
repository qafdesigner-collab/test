import { createApp, login, ownerPool } from './helpers';

// a tiny JPEG (starts with FF D8, the server checks that and the size)
const JPEG = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64')}`;

describe('Online exam safety: room scan, camera and screen pictures, leaving the page', () => {
  let app: any; let teacher: any; let student: any; let classId: string; let id: string; let plain: string; let me: string;
  beforeAll(async () => {
    app = await createApp(); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id; me = (await student.get('/api/auth/me')).body.id;
    const make = async (extra: any) => {
      const r = await teacher.post('/api/teacher/assessments').send({ classId, kind: 'TEST', title: `Watched ${Date.now()}`, ...extra, items: [{ type: 'TRUE_FALSE', prompt: 'Fish swim', answer: [true], points: 1 }] });
      await teacher.post(`/api/teacher/assessments/${r.body.id}/publish`); return r.body.id as string;
    };
    id = await make({ timeLimitMin: 30, proctor: { camera: true, roomScan: true, screen: true } });
    expect((await teacher.post('/api/teacher/assessments').send({ classId, kind: 'TEST', title: 'Bad', proctor: { camera: 'yes' } })).status).toBe(400);
    plain = await make({});
  });
  afterAll(async () => { const o = ownerPool(); await o.query(`DELETE FROM assessments WHERE id = ANY($1::uuid[])`, [[id, plain]]); await o.end(); await app.close(); });
  const watch = (aid: string, d: any) => student.post(`/api/student/homework/${aid}/watch`).send(d);

  it('tells the student what is watched; nothing is saved before Start or for unwatched work', async () => {
    expect((await student.get(`/api/student/homework/${id}`)).body.proctor).toEqual({ camera: true, roomScan: true, screen: true });
    expect((await watch(id, { kind: 'CAMERA', image: JPEG })).status).toBe(409);
    await student.post(`/api/student/homework/${plain}/start`);
    expect((await watch(plain, { kind: 'AWAY', seconds: 5 })).status).toBe(400);
  });

  it('saves pictures and events during the try; the teacher sees a summary, the timeline and the pictures', async () => {
    await student.post(`/api/student/homework/${id}/start`);
    for (let i = 0; i < 3; i++) expect((await watch(id, { kind: 'ROOM', image: JPEG })).status).toBe(201);
    expect((await watch(id, { kind: 'CAMERA', image: JPEG })).status).toBe(201);
    expect((await watch(id, { kind: 'SCREEN', image: JPEG })).status).toBe(201);
    expect((await watch(id, { kind: 'AWAY', seconds: 42 })).status).toBe(201);
    expect((await watch(id, { kind: 'SCREEN_OFF' })).status).toBe(201);
    expect((await watch(id, { kind: 'CAMERA', image: 'data:image/png;base64,iVBORw0KGgo=' })).status).toBe(400);
    expect((await watch(id, { kind: 'CAMERA', image: `data:image/jpeg;base64,${Buffer.from('<html>').toString('base64')}` })).status).toBe(400);
    expect((await watch(id, { kind: 'HACK' })).status).toBe(400);
    // the room panorama and the short video of the scan
    expect((await watch(id, { kind: 'PANORAMA', image: JPEG })).status).toBe(201);
    const WEBM = `data:video/webm;base64,${Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(300, 2)]).toString('base64')}`;
    expect((await watch(id, { kind: 'ROOM_VIDEO', video: WEBM })).status).toBe(201);
    expect((await watch(id, { kind: 'ROOM_VIDEO', video: `data:video/webm;base64,${Buffer.from('<html>').toString('base64')}` })).status).toBe(400);
    // students cannot read the records
    expect((await student.get(`/api/teacher/assessments/${id}/watch/${me}`)).status).toBe(403);

    const a = (await teacher.get(`/api/teacher/assessments/${id}`)).body;
    expect(a.proctor).toEqual({ camera: true, roomScan: true, screen: true });
    expect(a.students.find((s: any) => s.id === me).watch).toMatchObject({ photos: 5, screens: 1, away: 1, awaySeconds: 42, warnings: 1 });
    const log = (await teacher.get(`/api/teacher/assessments/${id}/watch/${me}`)).body;
    expect(log.map((e: any) => e.kind)).toEqual(['ROOM', 'ROOM', 'ROOM', 'CAMERA', 'SCREEN', 'AWAY', 'SCREEN_OFF', 'PANORAMA', 'ROOM_VIDEO']);
    const vid = await teacher.get(`/api/teacher/watch/${log[8].id}/image`); expect(vid.status).toBe(200); expect(vid.headers['content-type']).toBe('video/webm');
    const pic = await teacher.get(`/api/teacher/watch/${log[3].id}/image`);
    expect(pic.status).toBe(200); expect(pic.headers['content-type']).toBe('image/jpeg'); expect(pic.body[0]).toBe(0xff);
    expect((await student.get(`/api/teacher/watch/${log[3].id}/image`)).status).toBe(403);

    // the live view: the newest camera and screen picture, which question, for the teacher only
    expect((await student.post(`/api/student/homework/${id}/live`).send({ cam: JPEG, screen: JPEG, q: 1, answered: 0 })).status).toBe(201);
    expect((await student.post(`/api/student/homework/${id}/live`).send({ cam: 'data:image/png;base64,AAAA' })).status).toBe(400);
    expect((await student.post(`/api/student/homework/${plain}/live`).send({ cam: JPEG })).status).toBe(400);
    const live = (await teacher.get(`/api/teacher/assessments/${id}/live`)).body.students.find((x: any) => x.id === me);
    expect(live).toMatchObject({ state: 'LIVE', cam: true, screen: true, q: 1, answered: 0, away: 1, awaySeconds: 42, warnings: 1 });
    const li = await teacher.get(`/api/teacher/assessments/${id}/live/${me}/screen`);
    expect(li.status).toBe(200); expect(li.headers['cache-control']).toBe('no-store');
    expect((await student.get(`/api/teacher/assessments/${id}/live`)).status).toBe(403);
    expect((await teacher.get(`/api/teacher/assessments/${id}/live/${me}/../../x`)).status).toBe(404);

    // after handing in, nothing more is recorded
    const v = (await student.get(`/api/student/homework/${id}`)).body;
    await student.post(`/api/student/homework/${id}/submit`).send({ answers: [{ itemId: v.items[0].id, response: true }] });
    expect((await watch(id, { kind: 'CAMERA', image: JPEG })).status).toBe(409);
    // the live pictures are gone after handing in
    expect((await teacher.get(`/api/teacher/assessments/${id}/live`)).body.students.find((x: any) => x.id === me)).toMatchObject({ state: 'HANDED_IN', cam: false, screen: false });
    expect((await teacher.get(`/api/teacher/assessments/${id}/live/${me}/cam`)).status).toBe(404);
  });

  it('lets the teacher delete all photos; old ones are removed automatically', async () => {
    expect((await teacher.delete(`/api/teacher/assessments/${id}/watch`)).body.removed).toBe(9);
    expect((await teacher.get(`/api/teacher/assessments/${id}/watch/${me}`)).body).toEqual([]);
    const o = ownerPool();
    const { rows: [r] } = await o.query(`SELECT publisher_id, school_id FROM assessments WHERE id = $1`, [id]);
    await o.query(`INSERT INTO proctor_events (publisher_id, school_id, assessment_id, student_id, kind, created_at) VALUES ($1, $2, $3, $4, 'AWAY', now() - interval '200 days')`, [r.publisher_id, r.school_id, id, me]);
    await o.end();
    const { ProctorCleanup } = await import('../src/lms/proctor-cleanup');
    expect(await app.get(ProctorCleanup).purge(90)).toBeGreaterThanOrEqual(1);
    expect((await teacher.get(`/api/teacher/assessments/${id}/watch/${me}`)).body).toEqual([]);
  });

  it('room scan with a phone: a one-time QR link without login; the panorama joins the test', async () => {
    const r = await teacher.post('/api/teacher/assessments').send({ classId, kind: 'TEST', title: `Phone scan ${Date.now()}`, proctor: { roomScan: true, camera: true }, items: [{ type: 'TRUE_FALSE', prompt: 'x', answer: [true], points: 1 }] });
    const pid = r.body.id; await teacher.post(`/api/teacher/assessments/${pid}/publish`);
    const link = (await student.post(`/api/student/homework/${pid}/scan-link`)).body;
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    // the phone has no login
    const phone = require('supertest')(app.getHttpServer());
    expect((await phone.get('/api/room-scan/not-a-real-token-1234567890')).status).toBe(404);
    expect((await phone.get(`/api/room-scan/${link.token}`)).body.title).toContain('Phone scan');
    expect((await phone.post(`/api/room-scan/${link.token}`).send({ panorama: 'data:image/png;base64,AAAA', coverage: 50, complete: false })).status).toBe(400);
    expect((await student.get(`/api/student/homework/${pid}/scan-link/${link.id}`)).body).toMatchObject({ done: false });
    expect((await phone.post(`/api/room-scan/${link.token}`).send({ panorama: JPEG, coverage: 100, complete: true })).status).toBe(201);
    expect((await phone.post(`/api/room-scan/${link.token}`).send({ panorama: JPEG, coverage: 100, complete: true })).status).toBe(409); // only once
    expect((await student.get(`/api/student/homework/${pid}/scan-link/${link.id}`)).body).toMatchObject({ done: true, coverage: 100, complete: true });
    expect((await student.get(`/api/student/homework/${pid}/scan-link/${link.id}/panorama`)).status).toBe(200);
    // at Start the phone's panorama is added to the test record
    await student.post(`/api/student/homework/${pid}/start`);
    expect((await watch(pid, { kind: 'PANORAMA', linkId: link.id })).status).toBe(201);
    // an unfinished panorama made on the computer is a warning for the teacher
    expect((await watch(pid, { kind: 'PANORAMA', image: JPEG, coverage: 40, complete: false })).status).toBe(201);
    const log = (await teacher.get(`/api/teacher/assessments/${pid}/watch/${me}`)).body;
    expect(log.map((e: any) => [e.kind, e.detail])).toEqual([['PANORAMA', { coverage: 100, complete: true, phone: true }], ['PANORAMA', { coverage: 40, complete: false }]]);
    expect((await teacher.get(`/api/teacher/assessments/${pid}`)).body.students.find((s: any) => s.id === me).watch.warnings).toBe(1);
    // an expired link does not work
    const old = (await student.post(`/api/student/homework/${pid}/scan-link`)).body;
    const o = ownerPool(); await o.query(`UPDATE room_scan_links SET expires_at = now() - interval '1 minute' WHERE id = $1`, [old.id]); await o.end();
    expect((await phone.get(`/api/room-scan/${old.token}`)).status).toBe(409);
    const v = (await student.get(`/api/student/homework/${pid}`)).body;
    await student.post(`/api/student/homework/${pid}/submit`).send({ answers: [{ itemId: v.items[0].id, response: true }] });
    const o2 = ownerPool(); await o2.query('DELETE FROM assessments WHERE id = $1', [pid]); await o2.end();
  });
});
