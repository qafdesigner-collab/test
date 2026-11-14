import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as zlib from 'zlib';
import { createApp, login } from './helpers';

/** Minimal zip writer (stored, no compression) for test fixtures. */
function makeZip(files: Record<string, string | Buffer>) {
  const parts: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const nameBuf = Buffer.from(name); const crc = (zlib as any).crc32(data) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, data); central.push(cen, nameBuf); offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

describe('Flipbooks (HTML zip and Flash/SWF)', () => {
  let app: INestApplication; let admin: any; let teacher: any; let comp: string;
  beforeAll(async () => {
    app = await createApp();
    admin = await login(app, 'admin', 'Admin@12345');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    const ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    comp = (await admin.get(`/api/publishing/editions/${ed}`)).body.components[0].id;
  });
  afterAll(async () => { await app.close(); });
  const http = () => request(app.getHttpServer());

  it('extracts an HTML flipbook, opens index.html and serves it sandboxed to licensed readers only', async () => {
    const zip = makeZip({
      'MyBook/index.html': '<html><head><title>Flip</title></head><body>FLIPBOOK HOME <script src="js/app.js"></script></body></html>',
      'MyBook/js/app.js': 'console.log("flip")', 'MyBook/files/page1.jpg': Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      'MyBook/other.html': '<p>other</p>', 'MyBook/upload.php': '<?php system($_GET[1]);', '__MACOSX/._index.html': 'x',
    });
    const up = await admin.post(`/api/publishing/components/${comp}/flipbook`).attach('file', zip, 'mybook.zip');
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ kind: 'HTML', entry: 'MyBook/index.html', fileCount: 4, skippedFiles: 2 });
    expect((await teacher.post(`/api/publishing/components/${comp}/flipbook`).attach('file', zip, 'x.zip')).status).toBe(403);
    const link = (await teacher.get(`/api/reader/components/${comp}/flipbook`)).body;
    expect(link.url).toMatch(/^\/api\/flip\/[\w-]+\.[\w-]+\/MyBook\/index\.html$/);
    const page = await http().get(link.url);   // no cookie needed: the signed link is the permission
    expect(page.status).toBe(200);
    expect(page.text).toContain('FLIPBOOK HOME');
    expect(page.headers['content-security-policy']).toMatch(/^sandbox allow-scripts/);
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(page.headers['x-frame-options']).toBeUndefined();
    const base = link.url.replace(/MyBook\/index\.html$/, '');
    const js = await http().get(base + 'MyBook/js/app.js');
    expect([js.status, js.headers['content-type']]).toEqual([200, 'text/javascript; charset=utf-8']);
    expect((await http().get(base + 'MyBook/upload.php')).status).toBe(404);
    expect((await http().get(base + 'MyBook/%2e%2e/MyBook/index.html')).status).toBe(404);
    expect((await http().get(link.url.replace(/\.([\w-]{5})/, '.AAAAA'))).status).toBe(404); // tampered signature
    // a brand-new student without a book licence is refused
    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    const [u] = (await principal.post('/api/school/users').send({ role: 'STUDENT', users: [{ displayName: 'No Licence Kid', password: 'Kid@12345' }] })).body;
    const kid = await login(app, u.username, 'Kid@12345', 'SUN01');
    expect((await kid.get(`/api/reader/components/${comp}/flipbook`)).status).toBe(403);
  });

  it('refuses unsafe zips and zips without index.html', async () => {
    const evil = makeZip({ '../escape.html': 'x', 'index.html': 'ok' });
    expect((await admin.post(`/api/publishing/components/${comp}/flipbook`).attach('file', evil, 'evil.zip')).body.message).toMatch(/Unsafe path/);
    const noIndex = makeZip({ 'a.html': '1', 'b.html': '2', 'img/x.png': 'p' });
    expect((await admin.post(`/api/publishing/components/${comp}/flipbook`).attach('file', noIndex, 'n.zip')).body.message).toMatch(/index\.html/);
    expect((await admin.post(`/api/publishing/components/${comp}/flipbook`).attach('file', Buffer.from('hello'), 'x.txt')).status).toBe(400);
  });

  it('plays a Flash (SWF) flipbook with Ruffle, replacing the previous flipbook', async () => {
    const swf = Buffer.concat([Buffer.from('FWS'), Buffer.from([10, 30, 0, 0, 0]), Buffer.alloc(22)]);
    const up = await admin.post(`/api/publishing/components/${comp}/flipbook`).attach('file', swf, 'Grade 1 Book.swf');
    expect(up.body).toMatchObject({ kind: 'SWF', entry: '__player.html', fileCount: 2 });
    const link = (await teacher.get(`/api/reader/components/${comp}/flipbook`)).body;
    expect(link.kind).toBe('SWF');
    const page = await http().get(link.url);
    expect(page.text).toContain('__ruffle/ruffle.js');
    expect(page.text).toContain('Grade_1_Book.swf');
    const base = link.url.replace(/__player\.html$/, '');
    const rjs = await http().get(base + '__ruffle/ruffle.js');
    expect([rjs.status, rjs.headers['content-type']]).toEqual([200, 'text/javascript; charset=utf-8']);
    const sw = await http().get(base + 'Grade_1_Book.swf');
    expect([sw.status, sw.headers['content-type'], sw.headers['access-control-allow-origin']]).toEqual([200, 'application/x-shockwave-flash', '*']);
    expect((await http().get(base + '__ruffle/../package.json')).status).toBe(404);
    const tree = (await admin.get(`/api/reader/editions/${(await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId}`)).body;
    expect(tree.components[0].flipbook).toBe('SWF');
    expect((await admin.delete(`/api/publishing/components/${comp}/flipbook`)).status).toBe(200);
    expect((await teacher.get(`/api/reader/components/${comp}/flipbook`)).status).toBe(404);
  });
});
