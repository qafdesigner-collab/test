import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

describe('Branding (logo, name, colour)', () => {
  let app: INestApplication; let admin: any;
  beforeAll(async () => { app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); });
  afterAll(async () => { await app.close(); });
  const http = () => request(app.getHttpServer());

  it('is public (sign-in page) and editable by the publisher admin only', async () => {
    expect((await http().get('/api/branding')).body).toMatchObject({ name: 'Knowledge Gate', primaryColor: '#4f46e5', logoUrl: null });
    const editor = await login(app, 'editor', 'Admin@12345');
    expect((await editor.patch('/api/branding').send({ name: 'X' })).status).toBe(403);
    expect((await admin.patch('/api/branding').send({ primaryColor: 'red' })).status).toBe(400);
    expect((await admin.patch('/api/branding').send({ name: 'Bright Books Academy', tagline: 'Learning made joyful', primaryColor: '#0f766e' })).status).toBe(200);
    expect((await http().get('/api/branding')).body).toMatchObject({ name: 'Bright Books Academy', tagline: 'Learning made joyful', primaryColor: '#0f766e' });
  });

  it('accepts PNG/JPG/WebP logos only and serves them publicly', async () => {
    expect((await admin.post('/api/branding/logo').attach('file', Buffer.from('<svg onload=alert(1)>'), 'logo.png')).status).toBe(400);
    const up = await admin.post('/api/branding/logo').attach('file', PNG, 'logo.png');
    expect(up.status).toBe(201);
    expect(up.body.logoUrl).toMatch(/^\/api\/branding\/logo\?v=/);
    const img = await http().get(up.body.logoUrl);
    expect([img.status, img.headers['content-type']]).toEqual([200, 'image/png']);
    expect(Buffer.compare(img.body, PNG)).toBe(0);
    expect((await admin.delete('/api/branding/logo')).body.logoUrl).toBeNull();
    expect((await http().get('/api/branding/logo')).status).toBe(404);
  });
});
