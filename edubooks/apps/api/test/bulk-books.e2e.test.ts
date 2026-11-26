import { INestApplication } from '@nestjs/common';
import { createApp, login, ownerPool } from './helpers';

describe('Give books by class: whole sections at once, seats left, and automatic giving for the grade', () => {
  let app: INestApplication; const owner = ownerPool(); let principal: any; let teacher: any; let pool: any; let g: string; let rose: any; let tulip: any;
  const tag = Date.now().toString(36); const start = new Date(); const kids: string[] = [];
  const addKid = async (n: string) => {
    await principal.post('/api/school/users').send({ role: 'STUDENT', users: [{ displayName: `Kid ${n} ${tag}`, username: `k${n}${tag}` }] });
    const id = (await owner.query(`SELECT id FROM users WHERE username = $1`, [`k${n}${tag}`])).rows[0].id; kids.push(id); return id;
  };
  beforeAll(async () => {
    app = await createApp();
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    pool = (await principal.get('/api/school/pools')).body.find((p: any) => p.seatType === 'STUDENT' && p.status === 'ACTIVE' && p.available >= 3);
    const { rows: [pub] } = await owner.query(`SELECT publisher_id, (SELECT curriculum_id FROM grades g WHERE g.publisher_id = s.publisher_id LIMIT 1) AS cur FROM schools s WHERE code = 'SUN01'`);
    g = (await owner.query(`INSERT INTO grades (publisher_id, curriculum_id, name, sort) VALUES ($1, $2, $3, 3) RETURNING id`, [pub.publisher_id, pub.cur, `G-${tag}`])).rows[0].id;
    const year = (await owner.query(`SELECT y.id FROM academic_years y JOIN schools s ON s.id = y.school_id WHERE s.code = 'SUN01' ORDER BY y.starts_on DESC LIMIT 1`)).rows[0].id;
    rose = (await principal.post('/api/classes').send({ academicYearId: year, gradeId: g, name: `Bk ${tag}`, section: 'A' })).body;
    tulip = (await principal.post('/api/classes').send({ academicYearId: year, gradeId: g, name: `Bk ${tag}`, section: 'B' })).body;
    await principal.post(`/api/classes/${rose.id}/students`).send({ studentIds: [await addKid('a'), await addKid('b')] });
    await principal.post(`/api/classes/${tulip.id}/students`).send({ studentIds: [await addKid('c')] });
    await principal.put(`/api/school/pools/${pool.id}/grades`).send({ gradeIds: [g] }); // the book is for this grade too
  });
  afterAll(async () => {
    const mine = `(pool_id = $1 AND assigned_at >= $2 AND status = 'ACTIVE')`;
    await owner.query(`UPDATE access_entitlements SET active = false WHERE assignment_id IN (SELECT id FROM license_assignments WHERE ${mine})`, [pool.id, start]);
    await owner.query(`UPDATE license_seats SET status = 'AVAILABLE' WHERE id IN (SELECT seat_id FROM license_assignments WHERE ${mine})`, [pool.id, start]);
    await owner.query(`UPDATE license_assignments SET status = 'RELEASED', ended_at = now() WHERE ${mine}`, [pool.id, start]);
    await owner.query(`DELETE FROM school_auto_books WHERE pool_id = $1`, [pool.id]);
    await owner.query(`DELETE FROM school_book_grades WHERE grade_id = $1`, [g]);
    await owner.end(); await app.close();
  });

  it('the board shows the grade with its sections and the books for it', async () => {
    const b = (await principal.get('/api/school/book-board')).body;
    expect(b.classes.filter((c: any) => c.gradeId === g).map((c: any) => [c.section, c.students])).toEqual([['A', 2], ['B', 1]]);
    expect(b.pools.find((p: any) => p.id === pool.id).gradeIds).toContain(g);
    expect((await teacher.get('/api/school/book-board')).status).toBe(403);
  });

  it('a preview first, then one click gives the book to a whole section; seats left are shown', async () => {
    const dry = (await principal.post('/api/school/pools/bulk-assign').send({ poolIds: [pool.id], classIds: [rose.id], dryRun: true })).body;
    expect(dry.plan[0]).toMatchObject({ people: 2, already: 0, willGet: 2, free: pool.available, left: pool.available - 2, short: 0 });
    expect(dry.given).toBe(0);
    const r = (await principal.post('/api/school/pools/bulk-assign').send({ poolIds: [pool.id], classIds: [rose.id] })).body;
    expect(r.given).toBe(2);
    const again = (await principal.post('/api/school/pools/bulk-assign').send({ poolIds: [pool.id], classIds: [rose.id, tulip.id], dryRun: true })).body;
    expect(again.plan[0]).toMatchObject({ people: 3, already: 2, willGet: 1 });
    const b = (await principal.get('/api/school/book-board')).body.pools.find((p: any) => p.id === pool.id);
    expect(b.held[rose.id]).toBe(2); expect(b.free).toBe(pool.available - 2);
  });

  it('"give automatically" gives the rest of the grade now and every new student of the grade later', async () => {
    const on = (await principal.put(`/api/school/pools/${pool.id}/auto`).send({ on: true })).body;
    expect(on.auto).toBe(true); expect(on.given).toBeGreaterThanOrEqual(1); // Kid c in section B (and anyone else of the book's grades)
    const late = await addKid('d');
    const e = (await principal.post(`/api/classes/${tulip.id}/students`).send({ studentIds: [late] })).body;
    expect(e.booksGiven).toBe(1);
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM license_assignments WHERE pool_id = $1 AND user_id = ANY($2) AND status = 'ACTIVE'`, [pool.id, kids]);
    expect(rows[0].n).toBe(4);
    expect((await principal.put(`/api/school/pools/${pool.id}/auto`).send({ on: false })).body.auto).toBe(false);
    const late2 = await addKid('e');
    expect((await principal.post(`/api/classes/${tulip.id}/students`).send({ studentIds: [late2] })).body.booksGiven).toBe(0);
  });
});
