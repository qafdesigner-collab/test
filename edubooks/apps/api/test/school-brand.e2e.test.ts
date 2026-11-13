import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);

describe("A school's own name, contacts and logo (for its prints)", () => {
  let app: INestApplication; let principal: any; let teacher: any; let parent: any; let admin: any;
  beforeAll(async () => {
    app = await createApp();
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    parent = await login(app, 'parent1', 'Parent@123', 'SUN01');
    admin = await login(app, 'admin', 'Admin@12345');
  });
  afterAll(async () => { await app.close(); });

  it('the school admin updates the name, email and phone; teachers cannot', async () => {
    const before = (await principal.get('/api/auth/school-brand')).body;
    const r = await principal.patch('/api/school/profile').send({ name: 'Sunrise Grammar School Dubai', email: 'info@sunrise.ae', phone: '04 123 4567' });
    expect(r.status).toBe(200);
    const b = (await teacher.get('/api/auth/school-brand')).body;
    expect(b).toMatchObject({ name: 'Sunrise Grammar School Dubai', email: 'info@sunrise.ae', phone: '04 123 4567', code: 'SUN01' });
    expect((await principal.patch('/api/school/profile').send({ email: 'not-an-email' })).status).toBe(400);
    expect((await teacher.patch('/api/school/profile').send({ name: 'Hacked' })).status).toBe(403);
    await principal.patch('/api/school/profile').send({ name: before.name }); // keep the seed name for other tests
  });

  it('the school admin uploads a logo; everyone in the school (also parents) can use it on prints', async () => {
    const up = await principal.post('/api/school/logo').attach('file', PNG, 'logo.png');
    expect(up.status).toBe(201); expect(up.body.logoUrl).toMatch(/^\/api\/auth\/school-logo\//);
    const pb = (await parent.get('/api/auth/school-brand')).body;
    expect(pb.logoUrl).toBe(up.body.logoUrl);
    const img = await parent.get(pb.logoUrl);
    expect(img.status).toBe(200); expect(img.headers['content-type']).toBe('image/png');
    expect((await principal.post('/api/school/logo').attach('file', Buffer.from('not an image'), 'x.png')).status).toBe(400);
    expect((await teacher.post('/api/school/logo').attach('file', PNG, 'logo.png')).status).toBe(403);
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.get(pb.logoUrl)).status).toBe(404);
    // publisher staff have no school brand
    expect((await admin.get('/api/auth/school-brand')).body).toEqual({});
    expect((await principal.delete('/api/school/logo')).body.logoUrl).toBeNull();
  });
});
