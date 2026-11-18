/* Connecting a (free) AI service from the super admin screen, against a fake OpenAI-compatible service. */
import * as http from 'http';
import { AddressInfo } from 'net';

const calls: any[] = []; let server: http.Server; let base = '';
const plan = { title: 'Letter B', objectives: 'Say /b/', materials: 'Flashcards', warmUp: 'Song', steps: [{ title: 'Intro', minutes: 10, detail: 'Show page', sources: [1] }],
  practice: 'Book', assessment: 'Observe', homework: 'HW p.3', differentiation: 'Pairs', notes: '', sources: [1] };
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (req.headers.authorization !== 'Bearer free-key-1234') { res.statusCode = 401; res.end('{"error":"bad key"}'); return; }
      if (req.url?.endsWith('/models')) { res.end(JSON.stringify({ data: [{ id: 'models/free-model' }] })); return; }
      const j = JSON.parse(body); calls.push(j);
      if (j.response_format) { res.statusCode = 400; res.end('{"error":"response_format is not supported"}'); return; } // like some free models
      const content = j.max_tokens <= 30 ? 'OK, I am ready to help teachers.' : JSON.stringify(plan);
      res.end(JSON.stringify({ model: 'free-model', choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => server.close());

describe('Super admin connects a free AI service', () => {
  let app: any; let admin: any; let teacher: any; let editor: any;
  beforeAll(async () => {
    const { createApp, login } = require('./helpers');
    app = await createApp();
    admin = await login(app, 'admin', 'Admin@12345'); editor = await login(app, 'editor', 'Admin@12345'); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
  });
  afterAll(async () => { await admin.delete('/api/ai/settings'); await app.close(); });

  it('tests, saves and uses the service; the key never comes back; switching off returns to offline drafts', async () => {
    const g = (await admin.get('/api/ai/settings')).body;
    expect(Object.keys(g.presets)).toEqual(expect.arrayContaining(['gemini', 'groq', 'openrouter']));
    expect((await editor.get('/api/ai/settings')).status).toBe(403);
    expect((await admin.post('/api/ai/settings/test').send({ preset: 'gemini', model: 'x' })).status).toBe(400); // free services need a key
    const bad = (await admin.post('/api/ai/settings/test').send({ preset: 'custom', baseUrl: base, model: 'free-model', apiKey: 'wrong' })).body;
    expect(bad.ok).toBe(false); expect(bad.error).toMatch(/did not accept the API key/);
    const ok = (await admin.post('/api/ai/settings/test').send({ preset: 'custom', baseUrl: base, model: 'free-model', apiKey: 'free-key-1234' })).body;
    expect(ok).toMatchObject({ ok: true, reply: 'OK, I am ready to help teachers.' });
    const saved = (await admin.put('/api/ai/settings').send({ preset: 'custom', baseUrl: base, model: 'free-model', apiKey: 'free-key-1234' })).body;
    expect(saved).toMatchObject({ enabled: true, model: 'free-model', hasKey: true, keyHint: '••••1234' });
    expect(JSON.stringify(saved)).not.toContain('free-key-1234');
    // saving again without a key keeps the saved one
    expect((await admin.put('/api/ai/settings').send({ preset: 'custom', baseUrl: base, model: 'free-model' })).body.hasKey).toBe(true);

    const s = (await teacher.get('/api/ai/status')).body;
    expect(s).toMatchObject({ model: 'free-model', live: true, health: { ok: true } });
    const english = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    const lessonId = (await teacher.get(`/api/reader/editions/${english}`)).body.components[0].units[0].lessons[0].id;
    const before = calls.length;
    const r = await teacher.post('/api/ai/generate').send({ task: 'LESSON_PLAN', editionId: english, lessonId, durationMin: 30 });
    expect(r.status).toBe(201); expect(r.body.output.title).toBe('Letter B');
    // asked with JSON mode first, then again without it when the service refused
    expect(calls.slice(before).map((c) => !!c.response_format)).toEqual([true, false]);

    // teachers: open assistant for any teaching task (plain text, not limited to the book); students cannot use it
    const chat = await teacher.post('/api/ai/chat').send({ message: 'Make a 10-question paper on plants for grade 2 with an answer key', history: [{ role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hello!' }] });
    expect(chat.status).toBe(201); expect(chat.body.text.length).toBeGreaterThan(5);
    expect(calls.at(-1).response_format).toBeUndefined(); expect(calls.at(-1).messages[1].content).toContain('plants');
    const withBook = await teacher.post('/api/ai/chat').send({ message: 'Ideas for teaching the letter A', editionId: english });
    expect(withBook.status).toBe(201); expect(calls.at(-1).messages[1].content).toContain('KG English');
    const { login } = require('./helpers'); const student = await login(app, 'student1', 'Student@123', 'SUN01');
    expect((await student.post('/api/ai/chat').send({ message: 'do my homework' })).status).toBe(403);
    expect((await admin.delete('/api/ai/settings')).status).toBe(200);
    expect((await teacher.get('/api/ai/status')).body.live).toBe(false);
    expect((await teacher.post('/api/ai/chat').send({ message: 'hello' })).status).toBe(503);
  });
});
