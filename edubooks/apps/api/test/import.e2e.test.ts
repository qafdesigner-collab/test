import { INestApplication } from '@nestjs/common';
import { createApp, login, ownerPool } from './helpers';

describe('Student import (Excel/CSV rows) with classes and parents', () => {
  let app: INestApplication; let principal: any; const owner = ownerPool();
  beforeAll(async () => { app = await createApp(); principal = await login(app, 'principal', 'School@12345', 'SUN01'); });
  afterAll(async () => { await owner.end(); await app.close(); });

  it('dry run reports problems per spreadsheet row and writes nothing', async () => {
    const before = Number((await owner.query(`SELECT count(*) n FROM users`)).rows[0].n);
    const r = await principal.post('/api/school/import/students?dryRun=1').send({ rows: [
      { name: 'Ali Raza', className: 'KG', section: 'Rose' },
      { name: '', className: 'KG' },
      { name: 'Sara', className: 'Grade 9' },
      { name: 'Omar', username: 'student1' },
      { name: 'Hina', parentPhone: '12' },
    ] });
    expect(r.body.ok).toBe(false);
    const msgs = r.body.issues.map((i: any) => `${i.row}: ${i.message}`);
    expect(msgs).toEqual(expect.arrayContaining([
      '3: Name is empty', expect.stringMatching(/^4: Class “Grade 9” not found/), '5: Username “student1” is already used', expect.stringMatching(/^6: Parent mobile “12”/),
    ]));
    expect(Number((await owner.query(`SELECT count(*) n FROM users`)).rows[0].n)).toBe(before);
    expect((await principal.post('/api/school/import/students').send({ rows: [{ name: '' }] })).status).toBe(400); // real run refuses
    expect(Number((await owner.query(`SELECT count(*) n FROM users`)).rows[0].n)).toBe(before);
  });

  it('imports students into classes and links one parent (same mobile) to siblings', async () => {
    const rows = [
      { name: 'Ali Raza', className: 'kg', section: 'rose', parentName: 'Imran Raza', parentPhone: '050 555 0001', relation: 'Father' },
      { name: 'Zara Raza', className: 'KG', parentName: 'Imran Raza', parentPhone: '+971 50 555 0001', relation: 'Father' },
      { name: 'Bilal Khan', parentPhone: '055 444 0000' },
    ];
    const dry = (await principal.post('/api/school/import/students?dryRun=1').send({ rows })).body;
    expect(dry).toMatchObject({ ok: true, summary: { students: 3, withClass: 2, newParents: 2 } });
    const r = await principal.post('/api/school/import/students').send({ rows });
    expect(r.status).toBe(201);
    expect(r.body.students).toHaveLength(3);
    expect(r.body.students[0]).toMatchObject({ displayName: 'Ali Raza', className: 'KG — Rose' });
    expect(r.body.students.every((s: any) => s.password)).toBe(true);
    expect(r.body.parents).toHaveLength(2);
    const imran = r.body.parents.find((p: any) => p.displayName === 'Imran Raza');
    expect(imran.children).toEqual(['Ali Raza', 'Zara Raza']);
    expect(r.body.parents.find((p: any) => p.displayName === 'Parent of Bilal Khan')).toBeTruthy();
    const kidsOfImran = (await owner.query(`SELECT count(*) n FROM parent_students WHERE parent_id = $1`, [imran.id])).rows[0].n;
    expect(Number(kidsOfImran)).toBe(2);
    // a second import with the same mobile links the existing parent instead of creating one
    const again = (await principal.post('/api/school/import/students').send({ rows: [{ name: 'Sana Raza', parentPhone: '0505550001' }] })).body;
    expect(again.parents).toHaveLength(0);
    expect(Number((await owner.query(`SELECT count(*) n FROM parent_students WHERE parent_id = $1`, [imran.id])).rows[0].n)).toBe(3);
    const teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    expect((await teacher.post('/api/school/import/students').send({ rows })).status).toBe(403);
  });

  it('bulk-adds teachers with only a name; optional designation and email; sign-in by login ID or email', async () => {
    const r = await principal.post('/api/school/users').send({ role: 'TEACHER', users: [
      { displayName: 'Noor Bulk', designation: 'Class teacher', email: 'Noor.Bulk@School.ae' },
      { displayName: 'Hamid Bulk' },
    ] });
    expect(r.status).toBe(201);
    const [noor, hamid] = r.body;
    expect(noor.username).toMatch(/^noor/); expect(noor.email).toBe('noor.bulk@school.ae'); expect(hamid.username).toBeTruthy(); expect(hamid.password).toBeTruthy();
    const list = (await principal.get('/api/school/users?role=TEACHER&search=Bulk')).body.items;
    expect(list.find((u: any) => u.id === noor.id)).toMatchObject({ designation: 'Class teacher', email: 'noor.bulk@school.ae' });
    // same email again is refused, a bad email too
    expect((await principal.post('/api/school/users').send({ role: 'TEACHER', users: [{ displayName: 'X', email: 'noor.bulk@school.ae' }] })).status).toBe(409);
    expect((await principal.post('/api/school/users').send({ role: 'TEACHER', users: [{ displayName: 'X', email: 'not-an-email' }] })).status).toBe(400);
    expect((await principal.post('/api/school/users').send({ role: 'TEACHER', users: [{ displayName: '  ' }] })).status).toBe(400);
    // login with the generated ID, and with the email (any case)
    await login(app, hamid.username, hamid.password, 'SUN01');
    await login(app, 'NOOR.BULK@school.ae', noor.password, 'SUN01');
    // CSV with headings maps optional columns by name
    const c = await principal.post('/api/school/users/import').send({ role: 'TEACHER', csv: 'Name,Designation,Email\nRania Csv,Arabic teacher,rania.csv@school.ae\nTariq Csv,,\n' });
    expect(c.status).toBe(201);
    expect(c.body.map((x: any) => x.email ?? null)).toEqual(['rania.csv@school.ae', null]);
    // editing details
    expect((await principal.patch(`/api/school/users/${hamid.id}`).send({ designation: 'Maths teacher', email: 'hamid@school.ae' })).status).toBe(200);
    await login(app, 'hamid@school.ae', hamid.password, 'SUN01');
  });
});
