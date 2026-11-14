import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('Student progress across terms', () => {
  let app: INestApplication; let teacher: any; let principal: any; let classId: string; let pupils: any[];
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
  });
  afterAll(async () => { await app.close(); });

  it('builds term scores and positions automatically from exam marks', async () => {
    const e = (await teacher.post('/api/exams').send({ classId, title: 'Term 2 check', term: 'Term 2', durationMin: 30 })).body;
    await teacher.put(`/api/exams/${e.id}/items`).send({ items: [{ type: 'SHORT', prompt: 'Q', marks: 20 }] });
    pupils = (await teacher.get(`/api/exams/${e.id}/marks`)).body.roster;
    await teacher.put(`/api/exams/${e.id}/marks`).send({ marks: [{ studentId: pupils[0].id, marks: 18 }, { studentId: pupils[1].id, marks: 10 }] });
    const p0 = (await teacher.get(`/api/teacher/classes/${classId}/students/${pupils[0].id}/progress`)).body;
    expect(p0.rows.map((r: any) => r.label)).toEqual(['Term 1', 'Term 2', 'Term 3', 'Final']);
    const t2 = p0.rows.find((r: any) => r.key === 'T2');
    expect(t2.exam).toBe(90); expect(t2.position).toBe(1);
    const p1 = (await teacher.get(`/api/teacher/classes/${classId}/students/${pupils[1].id}/progress`)).body;
    expect(p1.rows.find((r: any) => r.key === 'T2').position).toBe(2);
  });

  it('the teacher can adjust a term score and comment; positions follow; reset goes back to automatic', async () => {
    const r = await teacher.put(`/api/teacher/classes/${classId}/students/${pupils[1].id}/progress`).send({ period: 'T2', score: 95, comment: 'Big improvement in reading' });
    expect(r.status).toBe(200);
    const t2 = r.body.rows.find((x: any) => x.key === 'T2');
    expect(t2).toMatchObject({ score: 95, override: 95, comment: 'Big improvement in reading', position: 1 });
    expect((await principal.get(`/api/teacher/classes/${classId}/students/${pupils[1].id}/progress`)).status).toBe(200);
    const back = await teacher.put(`/api/teacher/classes/${classId}/students/${pupils[1].id}/progress`).send({ period: 'T2', score: null, comment: '' });
    expect(back.body.rows.find((x: any) => x.key === 'T2').override).toBeNull();
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.get(`/api/teacher/classes/${classId}/students/${pupils[1].id}/progress`)).status).toBeGreaterThanOrEqual(403);
  });
});
