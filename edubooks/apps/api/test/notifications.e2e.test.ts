import { INestApplication } from '@nestjs/common';
import * as http from 'http';
import { createApp, login, ownerPool } from './helpers';
import { NotificationsService } from '../src/notifications/notifications.service';

describe('Notifications, WhatsApp/SMS outbox and licence reminders', () => {
  let app: INestApplication; const owner = ownerPool();
  let admin: any; let principal: any; let teacher: any; let s1: any;
  beforeAll(async () => {
    app = await createApp();
    [admin, principal, teacher, s1] = await Promise.all([login(app, 'admin', 'Admin@12345'), login(app, 'principal', 'School@12345', 'SUN01'),
      login(app, 'teacher1', 'Teacher@12345', 'SUN01'), login(app, 'student1', 'Student@123', 'SUN01')]);
  });
  afterAll(async () => { delete process.env.NOTIFY_CHANNEL; delete process.env.NOTIFY_WEBHOOK_URL; await owner.end(); await app.close(); });

  it('publishing homework notifies the students; each user sees and marks only their own', async () => {
    const classId = (await principal.get('/api/classes')).body[0].id;
    const a = (await teacher.post('/api/teacher/assessments').send({ classId, kind: 'HOMEWORK', title: 'Count to ten', items: [{ type: 'TRUE_FALSE', prompt: '2 > 1', answer: [true] }] })).body;
    expect((await teacher.post(`/api/teacher/assessments/${a.id}/publish`)).status).toBe(201);
    const list = (await s1.get('/api/notifications')).body;
    const n = list.find((x: any) => x.title === 'New homework: Count to ten');
    expect(n).toMatchObject({ kind: 'HOMEWORK', link: `/homework/${a.id}`, readAt: null });
    expect((await s1.get('/api/notifications/count')).body.unread).toBeGreaterThan(0);
    expect((await teacher.post(`/api/notifications/${n.id}/read`)).status).toBe(404); // not the teacher's
    expect((await s1.post(`/api/notifications/${n.id}/read`)).status).toBe(201);
    await s1.post('/api/notifications/read-all');
    expect((await s1.get('/api/notifications/count')).body.unread).toBe(0);
    expect((await teacher.get('/api/notifications/outbox')).status).toBe(403);
  });

  it('licence reminders go out once to school admins (in-app + phone) and publisher staff; demos remind sales', async () => {
    await owner.query(`UPDATE license_pools SET valid_until = current_date + 5 WHERE school_id = (SELECT id FROM schools WHERE code = 'SUN01')`);
    await owner.query(`UPDATE users SET phone = '0300 1234567' WHERE username = 'principal' AND school_id = (SELECT id FROM schools WHERE code = 'SUN01')`);
    await owner.query(`UPDATE schools SET is_demo = true, demo_expires_at = now() + interval '2 days' WHERE code = 'BFA03'`);
    expect((await principal.post('/api/notifications/run')).status).toBe(403);
    expect((await admin.post('/api/notifications/run')).body.reminders).toBeGreaterThanOrEqual(2);
    expect((await admin.post('/api/notifications/run')).body.reminders).toBe(0); // only once
    const p = (await principal.get('/api/notifications')).body.filter((x: any) => x.kind === 'LICENCE_EXPIRY');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ title: 'Licences end in 5 days', link: '/school/licences' });
    const pub = (await admin.get('/api/notifications')).body;
    expect(pub.some((x: any) => x.kind === 'LICENCE_EXPIRY' && x.title.startsWith('Sunrise Grammar School'))).toBe(true);
    expect(pub.some((x: any) => x.kind === 'DEMO_EXPIRY' && x.title.includes('Bright Future Academy'))).toBe(true);
    const out = (await principal.get('/api/notifications/outbox')).body;
    expect(out[0]).toMatchObject({ kind: 'LICENCE_EXPIRY', toAddress: '0300 1234567', status: 'SKIPPED', lastError: 'No WhatsApp/SMS service configured' });
    expect((await (await login(app, 'principal', 'School@12345', 'GVS02')).get('/api/notifications/outbox')).body.some((x: any) => x.toAddress === '0300 1234567')).toBe(false);
  });

  it('delivers through a configured gateway (webhook), with numbers in international format', async () => {
    const got: any[] = [];
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { got.push({ auth: req.headers.authorization, ...JSON.parse(b) }); res.end('{}'); }); });
    await new Promise<void>((r) => srv.listen(0, r));
    process.env.NOTIFY_CHANNEL = 'webhook';
    process.env.NOTIFY_WEBHOOK_URL = `http://127.0.0.1:${(srv.address() as any).port}/send`;
    process.env.NOTIFY_WEBHOOK_TOKEN = 'secret-token';
    try {
      expect((await admin.get('/api/notifications/channel')).body).toEqual({ channel: 'webhook', configured: true, missing: [] });
      await admin.post('/api/notifications/test').send({ phone: '050 765 4321' }); // local UAE number: country code 971 from Company → Region
      await app.get(NotificationsService).sendPending();
      expect(got).toHaveLength(1);
      expect(got[0]).toMatchObject({ to: '971507654321', kind: 'TEST', auth: 'Bearer secret-token' });
      expect((await admin.get('/api/notifications/outbox')).body.find((x: any) => x.kind === 'TEST')).toMatchObject({ status: 'SENT' });
    } finally { srv.close(); delete process.env.NOTIFY_WEBHOOK_TOKEN; }
  });
});
