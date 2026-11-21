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

/** A PDF with one big uncompressed picture (about 3 MB) — the kind of file Ghostscript makes much smaller. */
function picturePdf() {
  const W = 1000, H = 1000; const img = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 3; img[o] = (x * 255) / W; img[o + 1] = (y * 255) / H; img[o + 2] = ((x ^ y) & 63) * 4; }
  const parts: Buffer[] = []; const offs: number[] = []; let len = 0;
  const push = (b: Buffer | string) => { const x = typeof b === 'string' ? Buffer.from(b, 'latin1') : b; parts.push(x); len += x.length; };
  const obj = (n: number, ...body: (Buffer | string)[]) => { offs[n] = len; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };
  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 240] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${img.length} >>\nstream\n`, img, '\nendstream');
  const draw = 'q 240 0 0 240 0 0 cm /Im0 Do Q'; obj(5, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  const x = len; push(`xref\n0 6\n0000000000 65535 f \n${offs.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`);
  return Buffer.concat(parts);
}

describe('Big PDFs (books, teacher guides) are uploaded in pieces and made smaller on the server', () => {
  let app: INestApplication; let admin: any;
  beforeAll(async () => { app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); });
  afterAll(async () => { await app.close(); });

  it('a teacher guide sent in pieces becomes a resource; with Ghostscript installed it is stored smaller', async () => {
    const pdf = picturePdf();
    const pkgs = (await admin.get('/api/publishing/packages')).body.items; const pkg = (await admin.get(`/api/publishing/packages/${pkgs[0].id}`)).body;
    const edId = pkg.editions[0].id;
    const st = (await admin.post('/api/uploads').send({ name: 'Teacher Guide.pdf', size: pdf.length, key: `guide|${Date.now()}` })).body;
    for (let i = 0; i < st.pieces; i++) expect((await admin.put(`/api/uploads/${st.id}/${i}`).set('Content-Type', 'application/octet-stream').send(pdf.subarray(i * st.chunkSize, (i + 1) * st.chunkSize))).status).toBe(200);
    const r = await admin.post(`/api/publishing/editions/${edId}/resources-from-upload`).send({ uploadId: st.id, audience: 'TEACHER' });
    expect(r.status).toBe(201); expect(r.body[0]).toMatchObject({ title: 'Teacher Guide' });
    const { ghostscript } = await import('../src/storage/pdf-compress');
    if (!ghostscript()) return; // the server has no Ghostscript: the file is kept as it was
    const assetId = r.body[0].assetId;
    let size = pdf.length;
    for (let i = 0; i < 60 && size === pdf.length; i++) {
      await new Promise((ok) => setTimeout(ok, 500));
      const link = (await admin.get(`/api/assets/${assetId}/link`)).body;
      const got = await admin.get(link.url).buffer(true).parse((res: any, cb: any) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
      size = got.body.length; if (size !== pdf.length) expect(got.body.subarray(0, 5).toString()).toBe('%PDF-');
    }
    expect(size).toBeLessThan(pdf.length * 0.5);
  }, 60_000);
});
