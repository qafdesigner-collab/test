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
      { name: 'Ali Raza', className: 'kg', section: 'rose', parentName: 'Imran Raza', parentPhone: '0321 5550001', relation: 'Father' },
      { name: 'Zara Raza', className: 'KG', parentName: 'Imran Raza', parentPhone: '+92 321 5550001', relation: 'Father' },
      { name: 'Bilal Khan', parentPhone: '0333 4440000' },
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
    const again = (await principal.post('/api/school/import/students').send({ rows: [{ name: 'Sana Raza', parentPhone: '03215550001' }] })).body;
    expect(again.parents).toHaveLength(0);
    expect(Number((await owner.query(`SELECT count(*) n FROM parent_students WHERE parent_id = $1`, [imran.id])).rows[0].n)).toBe(3);
    const teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    expect((await teacher.post('/api/school/import/students').send({ rows })).status).toBe(403);
  });
});
