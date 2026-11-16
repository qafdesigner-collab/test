import { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import request from 'supertest';
import { createApp, login } from './helpers';

describe('Big files (e.g. a 300 MB Android app) are uploaded in pieces', () => {
  let app: INestApplication; let admin: any; let editor: any; let teacher: any; let comp: string;
  const size = 20 * 1048576 + 12345;
  const apk = Buffer.alloc(size); Buffer.from([0x50, 0x4b, 0x03, 0x04]).copy(apk, 0); for (let i = 4; i < size; i += 4096) apk[i] = i % 251;
  beforeAll(async () => {
    app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); editor = await login(app, 'editor', 'Admin@12345'); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    const pkgs = (await admin.get('/api/publishing/packages')).body.items; const pkg = (await admin.get(`/api/publishing/packages/${pkgs[0].id}`)).body;
    const ed = (await admin.get(`/api/publishing/editions/${pkg.editions[0].id}`)).body;
    comp = (ed.components.find((c: any) => c.type === 'MOBILE_APP') ?? (await admin.post(`/api/publishing/editions/${ed.id}/components`).send({ type: 'MOBILE_APP', title: 'Mobile App' })).body).id;
  });
  afterAll(async () => { await app.close(); });

  it('sends the pieces (in any order), continues after an interruption, then stores the app', async () => {
    const key = `my-app.apk|${size}|${Date.now()}`;
    const st = (await admin.post('/api/uploads').send({ name: 'my-app.apk', size, key })).body;
    expect(st.pieces).toBe(3); expect(st.received).toEqual([]);
    const piece = (i: number) => apk.subarray(i * st.chunkSize, Math.min(size, (i + 1) * st.chunkSize));
    const put = (agent: any, i: number, body = piece(i)) => agent.put(`/api/uploads/${st.id}/${i}`).set('Content-Type', 'application/octet-stream').send(body);
    expect((await put(admin, 2)).status).toBe(200);
    expect((await put(admin, 0)).status).toBe(200);
    // not finished yet → refused
    expect((await admin.post(`/api/publishing/components/${comp}/app/apk-from-upload`).send({ uploadId: st.id })).status).toBe(400);
    // "the browser was closed": choosing the same file again continues where it stopped
    const again = (await admin.post('/api/uploads').send({ name: 'my-app.apk', size, key })).body;
    expect(again.id).toBe(st.id); expect(again.received.sort()).toEqual([0, 2]);
    // a wrong-size piece and someone else's upload are refused
    expect((await put(admin, 1, Buffer.alloc(10))).status).toBe(400);
    expect((await put(editor, 1)).status).toBe(403);
    expect((await put(admin, 1)).status).toBe(200);
    const done = await admin.post(`/api/publishing/components/${comp}/app/apk-from-upload`).send({ uploadId: st.id });
    expect(done.status).toBe(201); expect(done.body).toMatchObject({ apkName: 'my-app.apk', apkSize: size });
    // the stored app is exactly the file that was sent
    const r = (await admin.get(`/api/reader/components/${comp}/app`)).body;
    const got = await request(app.getHttpServer()).get(r.apkUrl).buffer(true).parse((res: any, cb: any) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(createHash('sha256').update(got.body).digest('hex')).toBe(createHash('sha256').update(apk).digest('hex'));
    // used up: the same upload cannot be used twice
    expect((await admin.post(`/api/publishing/components/${comp}/app/apk-from-upload`).send({ uploadId: st.id })).status).toBe(404);
    expect((await teacher.post('/api/uploads').send({ name: 'x.apk', size: 10, key: 'x' })).status).toBe(403);
  });
});
