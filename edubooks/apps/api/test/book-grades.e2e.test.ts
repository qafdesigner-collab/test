import { INestApplication } from '@nestjs/common';
import { createApp, login, ownerPool } from './helpers';

describe('Book licences by grade (a KG book shows KG students first; schools can add grades)', () => {
  let app: INestApplication; const owner = ownerPool(); let principal: any; let teacher: any; let pool: string; let kg2: string; let kidId: string;
  const tag = Date.now().toString(36);
  beforeAll(async () => {
    app = await createApp();
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    pool = (await principal.get('/api/school/pools')).body.find((p: any) => p.seatType === 'STUDENT' && p.status === 'ACTIVE').id;
    const { rows: [pub] } = await owner.query(`SELECT publisher_id, (SELECT curriculum_id FROM grades g WHERE g.publisher_id = s.publisher_id LIMIT 1) AS cur FROM schools s WHERE code = 'SUN01'`);
    kg2 = (await owner.query(`INSERT INTO grades (publisher_id, curriculum_id, name, sort) VALUES ($1, $2, $3, 2) RETURNING id`, [pub.publisher_id, pub.cur, `KG2-${tag}`])).rows[0].id;
    const year = (await owner.query(`SELECT y.id FROM academic_years y JOIN schools s ON s.id = y.school_id WHERE s.code = 'SUN01' ORDER BY y.starts_on DESC LIMIT 1`)).rows[0].id;
    const cls = (await principal.post('/api/classes').send({ academicYearId: year, gradeId: kg2, name: `Lily ${tag}` })).body;
    await principal.post('/api/school/users').send({ role: 'STUDENT', users: [{ displayName: `Zara KG2 ${tag}`, username: `zara${tag}` }] });
    kidId = (await owner.query(`SELECT id FROM users WHERE username = $1`, [`zara${tag}`])).rows[0].id;
    expect((await principal.post(`/api/classes/${cls.id}/students`).send({ studentIds: [kidId] })).status).toBeLessThan(300);
  });
  afterAll(async () => { await owner.end(); await app.close(); });

  it('lists the students of the book grade first, with their class and grade', async () => {
    const g = (await principal.get(`/api/school/pools/${pool}/grades`)).body;
    expect(g.book.map((x: any) => x.name)).toContain('KG');
    expect(g.options.some((o: any) => o.id === kg2 && o.inSchool)).toBe(true);
    const list = (await principal.get(`/api/school/pools/${pool}/eligible`)).body;
    const zara = list.find((u: any) => u.id === kidId);
    expect(zara).toMatchObject({ gradeName: `KG2-${tag}`, match: false });
    expect(zara.className).toContain('Lily');
    const firstNo = list.findIndex((u: any) => !u.match);
    expect(list.slice(firstNo).every((u: any) => !u.match)).toBe(true); // matches come first
  });

  it('the school admin maps the KG book to KG2 too; KG2 students then match', async () => {
    const r = await principal.put(`/api/school/pools/${pool}/grades`).send({ gradeIds: [kg2] });
    expect(r.status).toBe(200); expect(r.body.extra.map((x: any) => x.id)).toEqual([kg2]);
    const zara = (await principal.get(`/api/school/pools/${pool}/eligible`)).body.find((u: any) => u.id === kidId);
    expect(zara.match).toBe(true);
    expect((await teacher.put(`/api/school/pools/${pool}/grades`).send({ gradeIds: [] })).status).toBe(403);
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.put(`/api/school/pools/${pool}/grades`).send({ gradeIds: [kg2] })).status).toBe(404);
    expect((await principal.put(`/api/school/pools/${pool}/grades`).send({ gradeIds: ['00000000-0000-4000-8000-000000000000'] })).status).toBe(400);
    expect((await principal.put(`/api/school/pools/${pool}/grades`).send({ gradeIds: [] })).body.extra).toEqual([]);
  });
});
