import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

/** Correlated subqueries must reference the OUTER row (drizzle renders single-table columns unqualified). */
describe('regression: counts in list endpoints are correct', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); });

  it('grades/subjects show how many packages use them', async () => {
    const a = await login(app, 'admin', 'Admin@12345');
    const kg = (await a.get('/api/catalog/grades')).body.find((g: any) => g.name === 'KG');
    const english = (await a.get('/api/catalog/subjects')).body.find((s: any) => s.name === 'English');
    expect(kg.packageCount).toBe(4);
    expect(english.packageCount).toBe(2);
  });

  it('editions report their component and resource counts', async () => {
    const a = await login(app, 'admin', 'Admin@12345');
    const pkg = (await a.get('/api/publishing/packages?search=KG English')).body.items[0];
    const eds = (await a.get(`/api/publishing/packages/${pkg.id}/editions`)).body;
    expect(eds[0]).toMatchObject({ componentCount: 8, resourceCount: 2 });
  });

  it('schools list shows people and seat usage per school', async () => {
    const a = await login(app, 'admin', 'Admin@12345');
    const r = await a.get('/api/schools?status=ACTIVE&pageSize=100');
    expect(r.status).toBe(200);
    const sun = r.body.items.find((s: any) => s.code === 'SUN01');
    expect(sun).toMatchObject({ students: 3, teachers: 1, seats: 30, assigned: 2 });
  });

  it('school people list shows each person\'s active licences', async () => {
    const p = await login(app, 'principal', 'School@12345', 'GVS02');
    const items = (await p.get('/api/school/users?role=STUDENT')).body.items;
    expect(items.find((u: any) => u.username === 'student1').seats).toBe(2); // English + Maths
    expect(items.find((u: any) => u.username === 'student2').seats).toBe(0);
  });
});
