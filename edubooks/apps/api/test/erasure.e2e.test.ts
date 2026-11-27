import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login, ownerPool } from './helpers';

describe('Right to erasure (student data)', () => {
  let app: INestApplication; const owner = ownerPool();
  let principal: any; let kid: any; let kidId: string;
  beforeAll(async () => {
    app = await createApp();
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    kidId = (await principal.get('/api/school/users?role=STUDENT')).body.items.find((u: any) => u.username === 'student1').id;
    kid = await login(app, 'student1', 'Student@123', 'SUN01');
    // give the child some data: reading, a bookmark, a submitted homework
    const hw = (await kid.get('/api/student/homework')).body[0];
    const view = (await kid.get(`/api/student/homework/${hw.id}`)).body;
    await kid.post(`/api/student/homework/${hw.id}/submit`).send({ answers: view.items.map((i: any) => ({ itemId: i.id, response: i.type === 'MCQ' ? 0 : i.type === 'TRUE_FALSE' ? true : 'x' })) });
    const ed = (await kid.get('/api/library')).body[0].editionId;
    const comp = (await kid.get(`/api/reader/editions/${ed}`)).body.components[0].id;
    await kid.post('/api/reader/progress').send({ componentId: comp, page: 3 });
    await kid.post('/api/reader/bookmarks').send({ componentId: comp, page: 3, note: 'my note' });
  });
  afterAll(async () => { await owner.end(); await app.close(); });
  const count = async (sqlText: string) => Number((await owner.query(sqlText, [kidId])).rows[0].n);

  it('needs the exact username; teachers and other schools cannot erase', async () => {
    expect((await principal.post(`/api/school/students/${kidId}/erase`).send({ confirmUsername: 'student2' })).status).toBe(400);
    const teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    expect((await teacher.post(`/api/school/students/${kidId}/erase`).send({ confirmUsername: 'student1' })).status).toBe(403);
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.post(`/api/school/students/${kidId}/erase`).send({ confirmUsername: 'student1' })).status).toBe(404);
  });

  it('erases personal data and learning records, frees the seat, scrubs the audit log', async () => {
    expect(await count(`SELECT count(*) n FROM submissions WHERE student_id = $1`)).toBeGreaterThan(0);
    expect(await count(`SELECT count(*) n FROM parent_students WHERE student_id = $1`)).toBe(1);
    const seatsBefore = await count(`SELECT count(*) n FROM license_assignments WHERE user_id = $1 AND status = 'ACTIVE'`);
    expect(seatsBefore).toBeGreaterThan(0);
    const sib = (await principal.get('/api/school/users?role=STUDENT')).body.items.find((u: any) => u.username === 'student2').id;
    await principal.post(`/api/school/users/${sib}/reset-password`);       // an audit entry about the sibling
    await principal.post(`/api/school/users/${kidId}/reset-password`);     // and one about the child
    const r = await principal.post(`/api/school/students/${kidId}/erase`).send({ confirmUsername: 'Student1' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ ok: true, seatsFreed: seatsBefore });
    expect(r.body.username).toMatch(/^deleted-/);
    for (const t of ['submissions WHERE student_id', 'reader_progress WHERE user_id', 'bookmarks WHERE user_id', 'enrolments WHERE student_id', 'parent_students WHERE student_id',
      'notifications WHERE user_id', 'access_entitlements WHERE user_id', 'sessions WHERE user_id', 'game_attempts WHERE student_id', 'student_badges WHERE student_id'])
      expect([t, await count(`SELECT count(*) n FROM ${t} = $1`)]).toEqual([t, 0]);
    expect(await count(`SELECT count(*) n FROM license_assignments WHERE user_id = $1 AND status = 'ACTIVE'`)).toBe(0);
    const u = (await owner.query(`SELECT display_name, username, phone, status FROM users WHERE id = $1`, [kidId])).rows[0];
    expect(u).toMatchObject({ display_name: 'Deleted student', phone: null, status: 'SUSPENDED' });
    const audit = (await owner.query(`SELECT summary, coalesce(before::text,'') || coalesce(after::text,'') AS j FROM audit_logs WHERE school_id = (SELECT id FROM schools WHERE code='SUN01')`)).rows;
    expect(audit.some((a: any) => /\bstudent1\b|Sample Student 1\b/.test(a.summary + a.j))).toBe(false);
    expect(audit.some((a: any) => /\bstudent2\b/.test(a.summary + a.j) || /Sample Student 2/.test(a.summary + a.j))).toBe(true); // siblings untouched
    expect(audit.some((a: any) => a.summary === "Erased a student's personal data on request")).toBe(true);
    expect((await request(app.getHttpServer()).post('/api/auth/login').send({ schoolCode: 'SUN01', username: 'student1', password: 'Student@123' })).status).toBe(401);
    expect((await principal.post(`/api/school/students/${kidId}/erase`).send({ confirmUsername: r.body.username })).status).toBe(409);
  });

  it('the publisher admin can erase too', async () => {
    const admin = await login(app, 'admin', 'Admin@12345');
    const gvs = (await owner.query(`SELECT s.id AS school, u.id AS kid FROM users u JOIN schools s ON s.id = u.school_id WHERE s.code = 'GVS02' AND u.username = 'student3'`)).rows[0];
    const sales = await login(app, 'sales', 'Admin@12345');
    expect((await sales.post(`/api/schools/${gvs.school}/students/${gvs.kid}/erase`).send({ confirmUsername: 'student3' })).status).toBe(403);
    expect((await admin.post(`/api/schools/${gvs.school}/students/${gvs.kid}/erase`).send({ confirmUsername: 'student3' })).status).toBe(201);
  });
});
