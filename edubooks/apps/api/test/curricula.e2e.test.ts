import { INestApplication } from '@nestjs/common';
import { createApp, login, ownerPool } from './helpers';

describe('Curricula, grades by curriculum, school curriculum and academic calendar', () => {
  let app: INestApplication; const owner = ownerPool();
  let admin: Awaited<ReturnType<typeof login>>;
  beforeAll(async () => { app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); });
  afterAll(async () => { await owner.end(); await app.close(); });
  const year = new Date().getFullYear();

  it('ships all curricula with their own grades and stages', async () => {
    const cur = (await admin.get('/api/catalog/curricula')).body;
    expect(cur.map((c: any) => c.code)).toEqual(['AMERICAN', 'BRITISH', 'CAMBRIDGE', 'IB', 'MOE', 'CBC', 'PAKISTAN', 'OTHER']);
    const by = Object.fromEntries(cur.map((c: any) => [c.code, c]));
    const names = async (code: string) => (await admin.get(`/api/catalog/grades?curriculumId=${by[code].id}`)).body.map((g: any) => g.name);
    expect(await names('AMERICAN')).toEqual(['Pre-K', 'Kindergarten', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)]);
    expect(await names('BRITISH')).toEqual(['Nursery', 'Reception', ...Array.from({ length: 13 }, (_, i) => `Year ${i + 1}`)]);
    expect(await names('CBC')).toEqual(['PP1', 'PP2', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)]);
    expect((await names('MOE')).slice(0, 3)).toEqual(['KG1', 'KG2', 'Grade 1']);
    expect((await names('IB')).slice(-2)).toEqual(['DP 1', 'DP 2']);
    const brit = (await admin.get(`/api/catalog/grades?curriculumId=${by.BRITISH.id}`)).body;
    expect(brit.find((g: any) => g.name === 'Year 10').stage).toBe('Key Stage 4 (GCSE)');
    expect(by.PAKISTAN.packageCount).toBe(5); // the demo books use Pakistan grades
    expect((await admin.get('/api/catalog/subjects')).body.length).toBeGreaterThanOrEqual(27);
  });

  it('grade names are unique per curriculum; grades without a curriculum go to "Other"', async () => {
    const cur = Object.fromEntries((await admin.get('/api/catalog/curricula')).body.map((c: any) => [c.code, c.id]));
    expect((await admin.post('/api/catalog/grades').send({ name: 'Grade 1', curriculumId: cur.AMERICAN })).status).toBe(409);
    const g = await admin.post('/api/catalog/grades').send({ name: 'Year 14', curriculumId: cur.BRITISH, stage: 'Extra', sort: 500 });
    expect(g.status).toBe(201);
    const plain = (await admin.post('/api/catalog/grades').send({ name: 'Toddlers' })).body;
    expect((await admin.get('/api/catalog/grades')).body.find((x: any) => x.id === plain.id).curriculumCode).toBe('OTHER');
    expect((await admin.delete(`/api/catalog/curricula/${cur.OTHER}`)).status).toBe(400);
    expect((await admin.delete(`/api/catalog/curricula/${cur.BRITISH}`)).status).toBe(400); // still has grades
    const custom = (await admin.post('/api/catalog/curricula').send({ name: 'Indian CBSE', code: 'cbse' })).body;
    expect(custom.code).toBe('CBSE');
    expect((await admin.delete(`/api/catalog/curricula/${custom.id}`)).status).toBe(200);
    const teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    expect((await teacher.post('/api/catalog/curricula').send({ name: 'X', code: 'XX' })).status).toBe(403);
  });

  it("a school's curriculum puts its grades first in class forms; foreign curricula are refused", async () => {
    const cur = Object.fromEntries((await admin.get('/api/catalog/curricula')).body.map((c: any) => [c.code, c.id]));
    const sun = (await admin.get('/api/schools?search=SUN01')).body.items[0];
    expect(sun.curriculumName).toBe('Pakistan National Curriculum');
    expect((await admin.patch(`/api/schools/${sun.id}`).send({ curriculumId: cur.BRITISH })).status).toBe(200);
    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    const opts = (await principal.get('/api/classes/options')).body.grades;
    expect(opts[0]).toMatchObject({ name: 'Nursery', curriculumName: 'British', isSchoolCurriculum: true });
    const pub = (await owner.query(`INSERT INTO publishers(name, slug) VALUES ('Other Pub', 'other-pub-cur') RETURNING id`)).rows[0].id;
    const foreign = (await owner.query(`SELECT id FROM curricula WHERE publisher_id = $1 AND code = 'BRITISH'`, [pub])).rows[0].id;
    expect((await admin.patch(`/api/schools/${sun.id}`).send({ curriculumId: foreign })).status).toBe(400);
    expect((await admin.post('/api/catalog/grades').send({ name: 'Sneaky', curriculumId: foreign })).status).toBe(400);
    await admin.patch(`/api/schools/${sun.id}`).send({ curriculumId: cur.PAKISTAN });
  });

  it('academic calendar: templates per curriculum, school events private to the school, only admins edit', async () => {
    const range = `from=${year - 1}-01-01&to=${year + 2}-12-31`;
    const staffAll = (await admin.get(`/api/calendar?${range}`)).body;
    expect(staffAll.filter((e: any) => e.isTemplate).length).toBeGreaterThan(40);
    const p1 = await login(app, 'principal', 'School@12345', 'SUN01'); // Pakistan curriculum
    const p2 = await login(app, 'principal', 'School@12345', 'GVS02');
    const t1 = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    const kid = await login(app, 'student1', 'Student@123', 'SUN01');
    const seen = (await p1.get(`/api/calendar?${range}`)).body;
    expect(seen.some((e: any) => e.title === 'Summer vacation')).toBe(true);          // Pakistan template
    expect(seen.some((e: any) => e.title === 'Autumn half term')).toBe(false);        // British template
    const ev = await p1.post('/api/calendar').send({ title: 'Annual Day', kind: 'EVENT', startsOn: `${year + 1}-02-20`, endsOn: `${year + 1}-02-20` });
    expect(ev.status).toBe(201);
    expect(ev.body.schoolId).toBeTruthy();
    expect((await t1.get(`/api/calendar?${range}`)).body.find((e: any) => e.id === ev.body.id)).toMatchObject({ title: 'Annual Day', editable: false });
    expect((await kid.get(`/api/calendar?${range}`)).body.some((e: any) => e.id === ev.body.id)).toBe(true);
    expect((await p2.get(`/api/calendar?${range}`)).body.some((e: any) => e.id === ev.body.id)).toBe(false); // other school
    expect((await admin.get(`/api/calendar?${range}`)).body.some((e: any) => e.id === ev.body.id)).toBe(false); // publisher view: school events only when the school is chosen
    expect((await t1.post('/api/calendar').send({ title: 'x', kind: 'EVENT', startsOn: `${year}-05-01`, endsOn: `${year}-05-01` })).status).toBe(403);
    const pubEvent = staffAll.find((e: any) => e.title === 'Summer vacation');
    expect((await p1.patch(`/api/calendar/${pubEvent.id}`).send({ title: 'mine' })).status).toBe(403);
    expect((await p1.post('/api/calendar').send({ title: 'x', kind: 'EVENT', startsOn: `${year}-05-02`, endsOn: `${year}-05-01` })).status).toBe(400);
    expect((await p1.post('/api/calendar').send({ title: 'x', kind: 'EVENT', startsOn: `${year}-05-01`, endsOn: `${year}-05-01`, curriculumId: pubEvent.curriculumId })).status).toBe(403);
    expect((await p2.delete(`/api/calendar/${ev.body.id}`)).status).toBe(404); // invisible to the other school (RLS)
    expect((await p1.delete(`/api/calendar/${ev.body.id}`)).status).toBe(200);
    const staffEv = await admin.post('/api/calendar').send({ title: 'Book fair', kind: 'EVENT', startsOn: `${year + 1}-01-15`, endsOn: `${year + 1}-01-16` });
    expect((await p2.get(`/api/calendar?${range}`)).body.some((e: any) => e.id === staffEv.body.id)).toBe(true); // all schools
  });
});
