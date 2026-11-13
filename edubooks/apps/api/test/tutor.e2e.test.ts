/* "Ask Owl" tutor: school switch, limits, safety, grounding in the book, teacher log. Uses a fake OpenAI-compatible model. */
import * as http from 'http';
import { AddressInfo } from 'net';

const calls: any[] = [];
let reply: any = { answer: 'This page is about the letter A. A is for apple! 🍎', pages: [2] };
let server: http.Server;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (req.url?.endsWith('/models')) { res.end(JSON.stringify({ data: [{ id: 'test-model' }] })); return; }
      calls.push(JSON.parse(body));
      res.end(JSON.stringify({ model: 'test-model', choices: [{ message: { content: JSON.stringify(reply) } }], usage: { prompt_tokens: 300, completion_tokens: 60 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.AI_PROVIDER = 'openai-compatible';
  process.env.AI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  process.env.AI_MODEL = 'test-model';
});
afterAll(() => server.close());

describe('AI tutor for students', () => {
  let app: any; let student: any; let principal: any; let teacher: any; let ed: string; let part1: string;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  beforeAll(async () => {
    const { createApp, login } = require('./helpers');
    app = await createApp();
    [student, principal, teacher] = await Promise.all([login(app, 'student1', 'Student@123', 'SUN01'), login(app, 'principal', 'School@12345', 'SUN01'), login(app, 'teacher1', 'Teacher@12345', 'SUN01')]);
    const admin = await login(app, 'admin', 'Admin@12345');
    ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    part1 = (await teacher.get(`/api/reader/editions/${ed}`)).body.components[0].id;
    await admin.post(`/api/ai/index/components/${part1}`);
    for (let i = 0; i < 60; i++) { const st = (await admin.get(`/api/ai/index/editions/${ed}`)).body.find((c: any) => c.id === part1); if (st?.indexStatus && st.indexStatus !== 'RUNNING' && st.indexStatus !== 'PENDING') break; await sleep(250); }
  });
  afterAll(async () => { await app.close(); });
  const ask = (b: any) => student.post('/api/tutor/ask').send({ editionId: ed, componentId: part1, page: 2, ...b });

  it('is off until the school admin switches it on, with a daily limit', async () => {
    expect((await student.get('/api/tutor/status')).body).toMatchObject({ enabled: false });
    expect((await ask({ mode: 'EXPLAIN' })).status).toBe(403);
    expect((await teacher.put('/api/tutor/settings').send({ enabled: true })).status).toBe(403);
    expect((await principal.put('/api/tutor/settings').send({ enabled: true, dailyLimit: 5 })).body).toMatchObject({ enabled: true, dailyLimit: 5 });
    expect((await student.get('/api/tutor/status')).body).toMatchObject({ enabled: true, remaining: 5 });
  });

  it('answers from the book, keeps children safe and lets teachers see the questions', async () => {
    const r = await ask({ mode: 'EXPLAIN' });
    expect(r.status).toBe(201);
    expect(r.body.answer).toContain('letter A');
    const last = calls.at(-1);
    expect(last.messages[0].content).toContain('Use ONLY the BOOK PAGES');
    expect(last.messages[1].content).toContain('BOOK PAGES');
    const unsafe = await ask({ mode: 'ASK', question: 'someone hurts me at home' });
    expect(unsafe.body).toMatchObject({ flagged: true });
    expect(unsafe.body.answer).toMatch(/grown-up you trust/);
    const n = calls.length;
    const priv = await ask({ mode: 'ASK', question: 'my phone is 0300 1234567 call me' });
    expect(priv.body.answer).toMatch(/don't share/);
    expect(calls.length).toBe(n); // never sent to the model
    reply = { answer: 'Visit https://evil.example for more', pages: [] };
    expect((await ask({ mode: 'ASK', question: 'what is on this page?' })).body.answer).not.toMatch(/https?:/);
    reply = { answer: 'Quiz time!', quiz: [{ q: 'A is for?', options: ['apple', 'ball', 'cat'], answer: 0 }, { q: 'bad', options: ['x'], answer: 3 }], pages: [2] };
    const quiz = (await ask({ mode: 'QUIZ' })).body;
    expect(quiz.quiz).toHaveLength(1);
    expect(quiz.remaining).toBe(0);
    expect((await ask({ mode: 'EXPLAIN' })).status).toBe(429); // daily limit reached
    const log = (await teacher.get('/api/tutor/log')).body;
    expect(log.length).toBeGreaterThanOrEqual(5);
    expect(log.filter((x: any) => x.flagged)).toHaveLength(2);
    expect((await student.get('/api/tutor/log')).status).toBe(403);
    expect((await teacher.post('/api/tutor/ask').send({ editionId: ed, componentId: part1, page: 2, mode: 'EXPLAIN' })).status).toBe(403);
  });
});
