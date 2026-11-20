import request from 'supertest';
import { createApp, login } from './helpers';

describe('Schools register themselves from the login page', () => {
  let app: any; let admin: any; let sales: any;
  beforeAll(async () => { app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); sales = await login(app, 'sales1', 'Admin@12345').catch(() => null); });
  afterAll(async () => { await admin.put('/api/schools/registration-settings').send({ enabled: true }); await app.close(); });
  const anon = () => request(app.getHttpServer());
  const reg = (u: string, extra: any = {}) => ({ school: { name: 'Little Stars Academy', city: 'Dubai', phone: '+971 4 000 0000', email: 'office@littlestars.test', students: 250 },
    admin: { name: 'Amna Khan', email: 'amna@littlestars.test', phone: '+971 50 000 0000', username: u, password: 'Stars@12345' }, message: 'We use KG English.', ...extra });

  it('registers, waits for approval, and can sign in once approved', async () => {
    const f = (await anon().get('/api/public/school-registration')).body; expect(f.enabled).toBe(true);
    const r = await anon().post('/api/public/school-registration').send(reg('amna'));
    expect(r.status).toBe(201); expect(r.body.code).toMatch(/^LSA\d{2,3}$/);
    const code = r.body.code;
    const l1 = await anon().post('/api/auth/login').send({ schoolCode: code, username: 'amna', password: 'Stars@12345' });
    expect(l1.status).toBe(403); expect(l1.body.message).toMatch(/waiting for approval/);
    const list = (await admin.get('/api/schools/registrations?status=PENDING')).body.items;
    const item = list.find((x: any) => x.code === code); expect(item).toMatchObject({ name: 'Little Stars Academy', contact_email: 'amna@littlestars.test', students: 250 });
    const notes = (await admin.get('/api/notifications')).body; expect(JSON.stringify(notes)).toContain('Little Stars Academy');
    expect((await admin.post(`/api/schools/${item.school_id}/registration/approve`).send({})).status).toBe(201);
    expect((await anon().post('/api/auth/login').send({ schoolCode: code, username: 'amna', password: 'Stars@12345' })).status).toBe(200);
  });

  it('refuses bad data, ignores robots, can be rejected or closed', async () => {
    expect((await anon().post('/api/public/school-registration').send(reg('x y'))).status).toBe(400); // bad login ID
    const bot = await anon().post('/api/public/school-registration').send(reg('robot1', { website: 'http://spam.example' }));
    expect(bot.status).toBe(201);
    expect((await admin.get('/api/schools/registrations')).body.items.find((x: any) => x.contact_name === 'Amna Khan' && x.code === bot.body.code)).toBeUndefined();
    const r = await anon().post('/api/public/school-registration').send(reg('amna2'));
    const id = (await admin.get('/api/schools/registrations?status=PENDING')).body.items.find((x: any) => x.code === r.body.code).school_id;
    expect((await admin.post(`/api/schools/${id}/registration/reject`).send({ note: 'Not a real school' })).status).toBe(201);
    expect((await anon().post('/api/auth/login').send({ schoolCode: r.body.code, username: 'amna2', password: 'Stars@12345' })).body.message).toMatch(/not approved/);
    if (sales) expect((await sales.post(`/api/schools/${id}/registration/approve`).send({})).status).toBe(403);
    expect((await admin.put('/api/schools/registration-settings').send({ enabled: false })).status).toBe(200);
    expect((await anon().get('/api/public/school-registration')).body.enabled).toBe(false);
    expect((await anon().post('/api/public/school-registration').send(reg('amna3'))).status).toBe(403);
  });
});
