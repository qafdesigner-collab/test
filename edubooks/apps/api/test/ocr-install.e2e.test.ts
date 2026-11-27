/* Installing OCR from the platform, against a local stand-in for the download sites (no real downloads in tests). */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-home-'));
// stand-in package tool: "create … -p <env>" makes env/bin/tesseract and env/bin/pdftoppm (small shell scripts)
const fakeTool = `#!/bin/sh
while [ "$1" != "-p" ] && [ -n "$1" ]; do shift; done; ENV="$2"
mkdir -p "$ENV/bin" "$ENV/share/tessdata"
printf '#!/bin/sh\\necho "List of available languages in \\\\"$TESSDATA_PREFIX/\\\\" (2):"\\nls "$TESSDATA_PREFIX" | sed "s/.traineddata//"\\n' > "$ENV/bin/tesseract"
printf '#!/bin/sh\\necho pdftoppm version 24\\n' > "$ENV/bin/pdftoppm"
chmod +x "$ENV/bin/tesseract" "$ENV/bin/pdftoppm"
`;
let bad = false; let server: http.Server; const fetched: string[] = [];
beforeAll(async () => {
  server = http.createServer((req, res) => {
    fetched.push(req.url!);
    if (req.url!.endsWith('.sha256')) return res.end(`${bad ? '0'.repeat(64) : createHash('sha256').update(fakeTool).digest('hex')}  micromamba\\n`);
    if (req.url!.includes('/micromamba-')) return res.end(fakeTool);
    if (req.url!.includes('/tessdata/')) return res.end('traineddata');
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.OCR_INSTALL_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.OCR_HOME = home;
});
afterAll(() => { server.close(); fs.rmSync(home, { recursive: true, force: true }); });

describe('Install OCR from the platform', () => {
  let app: any; let admin: any; let editor: any;
  beforeAll(async () => { const { createApp, login } = require('./helpers'); app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); editor = await login(app, 'editor', 'Admin@12345'); });
  afterAll(async () => { await app.close(); });
  const wait = async () => { for (let i = 0; i < 100; i++) { const s = (await admin.get('/api/ai/ocr')).body; if (s.install.state !== 'running') return s; await new Promise((r) => setTimeout(r, 100)); } throw new Error('still running'); };

  it('refuses a package tool that does not match its checksum', async () => {
    bad = true;
    expect((await editor.post('/api/ai/ocr/install').send({})).status).toBe(403);
    expect((await admin.post('/api/ai/ocr/install').send({ langs: ['fra'] })).status).toBe(201);
    const s = await wait(); expect(s.install.state).toBe('failed'); expect(s.install.error).toMatch(/checksum/);
    expect(fs.existsSync(path.join(home, 'env'))).toBe(false); // the tool was never run
  });

  it('installs into the app folder with the chosen languages and the platform then uses it', async () => {
    bad = false;
    expect((await admin.post('/api/ai/ocr/install').send({ langs: ['fra', 'ara'] })).status).toBe(201);
    const s = await wait();
    expect(s.install.state).toBe('done');
    expect(fs.readdirSync(path.join(home, 'env/share/tessdata')).sort()).toEqual(['ara.traineddata', 'eng.traineddata', 'fra.traineddata']);
    expect(s.own).toBe(true);
    expect(fetched.some((u) => u.includes('/tessdata/fra.traineddata'))).toBe(true);
    // the platform finds the installed programs (stand-ins here) and their languages
    const { ocrAvailable, resetOcr } = require('../src/ai/ocr'); resetOcr();
    const a = await ocrAvailable(); expect(a.ok).toBe(true); expect(a.langs.split('+')).toEqual(expect.arrayContaining(['eng', 'fra', 'ara']));
    expect((await admin.delete('/api/ai/ocr')).status).toBe(200);
    expect(fs.existsSync(path.join(home, 'env'))).toBe(false);
  });
});
