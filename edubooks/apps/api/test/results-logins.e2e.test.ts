import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login, ownerPool } from './helpers';

describe('Exam result sheets and downloadable logins', () => {
  let app: INestApplication; const owner = ownerPool(); let teacher: any; let principal: any; let admin: any; let classId: string;
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    admin = await login(app, 'admin', 'Admin@12345');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
  });
  afterAll(async () => { await owner.end(); await app.close(); });

  it('the teacher sees pass/fail, grade and position for every student, against the exam pass mark', async () => {
    const e = (await teacher.post('/api/exams').send({ classId, title: 'Unit test — results', durationMin: 40, passPercent: 50 })).body;
    await teacher.put(`/api/exams/${e.id}/items`).send({ items: [{ type: 'SHORT', prompt: 'Write the word', marks: 10 }, { type: 'SHORT', prompt: 'Read', marks: 10 }] });
    const roster = (await teacher.get(`/api/exams/${e.id}/marks`)).body.roster;
    expect(roster.length).toBeGreaterThanOrEqual(3);
    const r = await teacher.put(`/api/exams/${e.id}/marks`).send({ marks: [
      { studentId: roster[0].id, marks: 18 }, { studentId: roster[1].id, marks: 7 }, { studentId: roster[2].id, absent: true },
    ] });
    expect(r.status).toBe(200);
    const by = (id: string) => r.body.roster.find((x: any) => x.id === id);
    expect(by(roster[0].id)).toMatchObject({ percent: 90, grade: 'A*', result: 'PASS', rank: 1 });
    expect(by(roster[1].id)).toMatchObject({ percent: 35, grade: 'E', result: 'FAIL', rank: 2 });
    expect(by(roster[2].id)).toMatchObject({ result: 'ABSENT', percent: null });
    expect(r.body.stats).toMatchObject({ passed: 1, failed: 1, absent: 1 });
    expect(r.body.passPercent).toBe(50); expect(r.body.className).toBeTruthy();
    // changing the pass mark changes the result
    await teacher.patch(`/api/exams/${e.id}`).send({ passPercent: 30 });
    expect((await teacher.get(`/api/exams/${e.id}/marks`)).body.stats.passed).toBe(2);
  });

  it('school admins download login lists and can issue new passwords for a class', async () => {
    const list = (await principal.get('/api/school/logins?role=STUDENT')).body;
    expect(list.school.code).toBe('SUN01');
    expect(list.items.length).toBeGreaterThan(0);
    const teachers = (await principal.get('/api/school/logins?role=TEACHER')).body;
    expect(teachers.items.some((u: any) => u.username === 'teacher1')).toBe(true);
    // the class filter
    const inClass = (await principal.get(`/api/school/logins?role=STUDENT&classId=${classId}`)).body.items;
    expect(inClass.length).toBeGreaterThan(0); expect(inClass.length).toBeLessThanOrEqual(list.items.length);
    // new passwords for two fresh pupils: the old ones stop working, the new ones work
    const made = (await principal.post('/api/school/users').send({ role: 'STUDENT', users: [{ displayName: 'Reset Kid One' }, { displayName: 'Reset Kid Two' }] })).body;
    const reset = await principal.post('/api/school/logins/reset').send({ role: 'STUDENT', userIds: made.map((m: any) => m.id) });
    expect(reset.status).toBe(201); expect(reset.body).toHaveLength(2);
    const creds = reset.body[0];
    expect(creds.password).not.toBe(made[0].password);
    const srv = request(app.getHttpServer());
    expect((await srv.post('/api/auth/login').send({ schoolCode: 'SUN01', username: creds.username, password: creds.password })).status).toBe(200);
    expect((await srv.post('/api/auth/login').send({ schoolCode: 'SUN01', username: made[0].username, password: made[0].password })).status).toBe(401);
  });

  it('the super admin downloads the whole school (every role) with the passwords that were given out', async () => {
    const s = (await admin.get('/api/schools?search=SUN01')).body.items[0];
    const kid = (await principal.post('/api/school/users').send({ role: 'STUDENT', users: [{ displayName: 'Login Kid' }] })).body[0];
    const made = (await principal.post(`/api/school/students/${kid.id}/parents`).send({ displayName: 'Login Parent' })).body.credentials;
    const all = (await admin.get(`/api/schools/${s.id}/logins?role=ALL`)).body.items;
    expect(new Set(all.map((u: any) => u.role))).toEqual(new Set(['School admin', 'Teacher', 'Student', 'Parent']));
    expect(all.find((u: any) => u.id === made.id)).toMatchObject({ role: 'Parent', password: made.password });
    expect(all.find((u: any) => u.id === kid.id).password).toBe(kid.password);
    // only one role
    const parents = (await admin.get(`/api/schools/${s.id}/logins?role=PARENT`)).body.items;
    expect(parents.every((u: any) => u.role === 'Parent')).toBe(true);
    // a user who chooses their own password: nobody can see it any more
    const me = request.agent(app.getHttpServer());
    await me.post('/api/auth/login').send({ schoolCode: 'SUN01', username: kid.username, password: kid.password });
    expect((await me.post('/api/auth/change-password').send({ currentPassword: kid.password, newPassword: 'My-Own-Pass-77' })).status).toBe(200);
    expect((await admin.get(`/api/schools/${s.id}/logins?role=STUDENT`)).body.items.find((u: any) => u.id === kid.id).password).toBeNull();
    // stored encrypted, never in plain text
    const { rows } = await owner.query(`SELECT issued_password FROM users WHERE id = $1`, [made.id]);
    expect(rows[0].issued_password).toMatch(/^v1:/); expect(rows[0].issued_password).not.toContain(made.password);
    // new passwords only for the people without one
    const fix = await admin.post(`/api/schools/${s.id}/logins/reset`).send({ role: 'STUDENT', onlyMissing: true, userIds: [kid.id, all.find((u: any) => u.role === 'Student' && u.password && u.id !== kid.id).id] });
    expect(fix.body.map((x: any) => x.id)).toEqual([kid.id]);
    expect((await admin.get(`/api/schools/${s.id}/logins?role=STUDENT`)).body.items.find((u: any) => u.id === kid.id).password).toBe(fix.body[0].password);
  });

  it('the super admin can do the same for any school; teachers cannot', async () => {
    const s = (await admin.get('/api/schools?search=SUN01')).body.items[0];
    const list = (await admin.get(`/api/schools/${s.id}/logins?role=TEACHER`)).body;
    expect(list.items.length).toBeGreaterThan(0);
    const t = (await principal.post('/api/school/users').send({ role: 'TEACHER', users: [{ displayName: 'Reset Teacher' }] })).body[0];
    const reset = await admin.post(`/api/schools/${s.id}/logins/reset`).send({ role: 'TEACHER', userIds: [t.id] });
    expect(reset.status).toBe(201);
    expect((await request(app.getHttpServer()).post('/api/auth/login').send({ schoolCode: 'SUN01', username: t.username, password: reset.body[0].password })).status).toBe(200);
    expect((await teacher.get('/api/school/logins?role=STUDENT')).status).toBe(403);
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.get(`/api/schools/${s.id}/logins?role=STUDENT`)).status).toBe(403);
  });
});
