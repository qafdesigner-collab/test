import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as zlib from 'zlib';
import { createApp, login } from './helpers';

/** A plain square PNG of the given size. */
function png(size: number) {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (~c) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((size * 3 + 1) * size, 120);
  for (let y = 0; y < size; y++) raw[y * (size * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

describe('Installed app: the company logo as the home-screen icon', () => {
  let app: INestApplication; let admin: any; let teacher: any;
  beforeAll(async () => { app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); });
  afterAll(async () => { await admin.delete('/api/branding/app-icons'); await app.close(); });

  it('uses the default icons until the publisher sets one', async () => {
    await admin.delete('/api/branding/app-icons');
    const m = await request(app.getHttpServer()).get('/api/branding/manifest');
    expect(m.status).toBe(200); expect(m.headers['content-type']).toMatch(/manifest\+json/);
    expect(m.body.display).toBe('standalone'); expect(m.body.icons[0].src).toBe('/icon-192.png');
    const r = await request(app.getHttpServer()).get('/api/branding/app-icon/192');
    expect(r.status).toBe(302); expect(r.headers.location).toBe('/icon-192.png');
  });

  it('the super admin uploads icons made from the logo; the manifest and icon addresses use them', async () => {
    const up = await admin.post('/api/branding/app-icons').attach('icon192', png(192), 'a.png').attach('icon512', png(512), 'b.png').attach('maskable', png(512), 'c.png').attach('apple', png(180), 'd.png');
    expect(up.status).toBe(201); expect(up.body.appIcon).toMatch(/^\/api\/branding\/app-icon\/192\?v=/);
    const m = JSON.parse((await request(app.getHttpServer()).get('/api/branding/manifest')).text);
    expect(m.icons.map((i: any) => i.src)).toEqual(expect.arrayContaining([expect.stringMatching(/app-icon\/512\?v=/), expect.stringMatching(/app-icon\/maskable\?v=/)]));
    const i = await request(app.getHttpServer()).get('/api/branding/app-icon/180');
    expect(i.status).toBe(200); expect(i.headers['content-type']).toBe('image/png');
    // wrong size or not a PNG is refused; others cannot change it
    expect((await admin.post('/api/branding/app-icons').attach('icon192', png(100), 'a.png').attach('icon512', png(512), 'b.png').attach('maskable', png(512), 'c.png').attach('apple', png(180), 'd.png')).status).toBe(400);
    expect((await teacher.post('/api/branding/app-icons').attach('icon192', png(192), 'a.png')).status).toBe(403);
  });
});
