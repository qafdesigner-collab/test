import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('Demo data: load for testing, remove afterwards', () => {
  let app: INestApplication; let admin: any;
  const counts = async () => {
    const r = await admin.get('/api/schools?pageSize=100');
    return { schools: (r.body.items ?? r.body).length, books: (await admin.get('/api/publishing/packages?pageSize=100')).body.total, products: (await admin.get('/api/commerce/products?pageSize=100')).body.total };
  };
  beforeAll(async () => { app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); });
  afterAll(async () => { await app.close(); });

  it('loads demo data next to real data, and removes only the demo data', async () => {
    const before = await counts();
    const editor = await login(app, 'editor', 'Admin@12345');
    expect((await editor.post('/api/system/demo/load')).status).toBe(403);
    expect((await admin.get('/api/system/demo')).body.loaded).toBe(false);
    const l = await admin.post('/api/system/demo/load');
    expect(l.status).toBe(201);
    expect(l.body).toMatchObject({ loaded: true, counts: { school: 3, book_packages: 5, products: 5, training_courses: 1 } });
    expect((await admin.post('/api/system/demo/load')).status).toBe(409);
    const mid = await counts();
    expect(mid.schools).toBe(before.schools + 3);
    expect(mid.books).toBe(before.books + 5);

    // the demo logins work and have things to look at
    const kid = await login(app, 'student1', 'Student@123', 'DEMO1');
    expect((await kid.get('/api/library')).body.map((b: any) => b.title)).toContain('KG English (Demo)');
    expect((await kid.get('/api/student/report')).body.exams.length).toBe(1);
    const parent = await login(app, 'parent1', 'Parent@123', 'DEMO1');
    expect((await parent.get('/api/messages/conversations')).body.length).toBe(1);
    const teacher = await login(app, 'teacher1', 'Teacher@12345', 'DEMO1');
    expect((await teacher.get('/api/timetable/me')).body.slots.length).toBeGreaterThan(0);
    await kid.post('/api/tutor/ask').send({ editionId: (await kid.get('/api/library')).body[0].editionId, componentId: '00000000-0000-4000-8000-000000000000', page: 1, mode: 'EXPLAIN' });

    // a real school is untouched by removal
    const realBefore = (await (await login(app, 'principal', 'School@12345', 'SUN01')).get('/api/classes')).body.length;
    expect((await admin.post('/api/system/demo/remove').send({ confirm: 'yes' })).status).toBe(400);
    const r = await admin.post('/api/system/demo/remove').send({ confirm: 'REMOVE' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ loaded: false, removed: { schools: 3, book_packages: 5, products: 5 } });
    expect(await counts()).toEqual(before);
    expect((await (await login(app, 'student1', 'Student@123', 'SUN01')).get('/api/library')).body.length).toBeGreaterThan(0);
    expect((await (await login(app, 'principal', 'School@12345', 'SUN01')).get('/api/classes')).body.length).toBe(realBefore);
    const gone = await require('supertest')(app.getHttpServer()).post('/api/auth/login').send({ schoolCode: 'DEMO1', username: 'student1', password: 'Student@123' });
    expect(gone.status).toBe(401);
    // it can be loaded again later
    expect((await admin.post('/api/system/demo/load')).status).toBe(201);
    expect((await admin.post('/api/system/demo/remove').send({ confirm: 'REMOVE' })).status).toBe(201);
  });

  it('refuses to remove demo items that a real school is using', async () => {
    await admin.post('/api/system/demo/load');
    const products = (await admin.get('/api/commerce/products?pageSize=100')).body.items;
    const demo = products.find((p: any) => p.sku === 'DEMO-KG-ENG');
    const version = (await admin.get(`/api/commerce/products/${demo.id}`)).body.versions.find((v: any) => v.status === 'ACTIVE');
    const schools = (await admin.get('/api/schools?pageSize=100')).body.items;
    const sun = schools.find((x: any) => x.code === 'SUN01');
    const years = (await admin.get(`/api/schools/${sun.id}`)).body.academicYears;
    const order = await admin.post('/api/commerce/orders').send({ schoolId: sun.id, academicYearId: years[0].id, type: 'NEW', lines: [{ productVersionId: version.id, studentQty: 5, teacherQty: 0 }] });
    expect(order.status).toBe(201);
    const r = await admin.post('/api/system/demo/remove').send({ confirm: 'REMOVE' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/in use by the real school "Sunrise Grammar School"/);
    expect((await admin.get('/api/system/demo')).body.loaded).toBe(true); // nothing was removed
    await admin.delete(`/api/commerce/orders/${order.body.id}`);
    const again = await admin.post('/api/system/demo/remove').send({ confirm: 'REMOVE' });
    if (again.status !== 201) await admin.post(`/api/commerce/orders/${order.body.id}/cancel`);
  });
});
