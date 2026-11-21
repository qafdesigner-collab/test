import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { createApp, login } from './helpers';

describe('Natural reading voice (Piper): installed from the platform, used for pages, Owl and notes', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  let app: any; let admin: any; let student: any; let teacher: any; let server: http.Server; let calls = 0;
  beforeAll(async () => {
    // a stand-in for Piper: writes a small WAV file where it is asked to
    const fake = path.join(home, 'fake-piper.sh');
    fs.writeFileSync(fake, '#!/bin/sh\nout=""\nwhile [ $# -gt 0 ]; do [ "$1" = "--output_file" ] && out="$2"; shift; done\ncat > /dev/null\nprintf "RIFF\\044\\000\\000\\000WAVEfmt " > "$out"\necho x >> "' + path.join(home, 'calls') + '"\n');
    fs.chmodSync(fake, 0o755);
    process.env.VOICE_HOME = path.join(home, 'voice'); process.env.PIPER_CMD = fake;
    server = http.createServer((req, res) => { calls++; res.end(req.url!.endsWith('.json') ? '{"audio":{"sample_rate":22050}}' : 'onnx-model'); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    process.env.VOICE_INSTALL_BASE_URL = `http://127.0.0.1:${(server.address() as any).port}`;
    app = await createApp(); admin = await login(app, 'admin', 'Admin@12345');
    student = await login(app, 'student1', 'Student@123', 'SUN01'); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
  });
  afterAll(async () => {
    delete process.env.VOICE_HOME; delete process.env.PIPER_CMD; delete process.env.VOICE_INSTALL_BASE_URL;
    server.close(); fs.rmSync(home, { recursive: true, force: true }); await app.close();
  });

  it('is off until a voice is installed; only the super admin installs', async () => {
    expect((await student.get('/api/voice/status')).body).toEqual({ ready: false, langs: [] });
    expect((await teacher.post('/api/voice/install').send({ voices: ['en_US-lessac-medium'] })).status).toBe(403);
    expect((await admin.post('/api/voice/install').send({ voices: ['not-a-voice'] })).status).toBe(400);
    expect((await admin.post('/api/voice/install').send({ voices: ['en_US-lessac-medium'] })).status).toBe(201);
    let d: any; for (let i = 0; i < 60; i++) { d = (await admin.get('/api/voice/admin')).body; if (d.install.state !== 'running') break; await new Promise((r) => setTimeout(r, 250)); }
    expect(d.install.error ?? '').toBe(''); expect(d.install.state).toBe('done'); expect(d.installed).toEqual(['en_US-lessac-medium']); expect(d.ready).toBe(true);
    expect(d.settings.voices.en).toBe('en_US-lessac-medium');
    expect(calls).toBe(2);
  });

  it('reads text and book pages aloud, remembers what it made, and leaves Urdu to the device voice', async () => {
    expect((await student.get('/api/voice/status')).body).toEqual({ ready: true, langs: ['en'] });
    const say = () => student.post('/api/voice/say').send({ text: 'Hello! The cat sat on the mat. 🐱' }).buffer(true).parse((r: any, cb: any) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); });
    const a = await say(); expect([200, 201]).toContain(a.status); expect(a.headers['content-type']).toMatch(/audio\/(wav|mpeg)/);
    const before = fs.readFileSync(path.join(home, 'calls'), 'utf8').length;
    await say(); expect(fs.readFileSync(path.join(home, 'calls'), 'utf8').length).toBe(before); // made once, then reused
    expect((await student.post('/api/voice/say').send({ text: 'یہ ایک کتاب ہے اور بچے پڑھتے ہیں' })).status).toBe(204);
    const ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    const part = (await student.get(`/api/reader/editions/${ed}`)).body.components.find((c: any) => c.title === 'Student Book Part 1');
    expect((await student.get(`/api/voice/components/${part.id}/pages/3`)).status).toBe(200);
    // switched off: readers go back to the device voice
    await admin.put('/api/voice/settings').send({ enabled: false });
    expect((await student.get('/api/voice/status')).body.ready).toBe(false);
    await admin.put('/api/voice/settings').send({ enabled: true, speed: 0.8 });
    expect((await admin.get('/api/voice/admin')).body.settings).toMatchObject({ enabled: true, speed: 0.8 });
  });
});
