/* Live-provider path against a fake OpenAI-compatible server (what Ollama / vLLM expose). */
import * as http from 'http';
import { AddressInfo } from 'net';

const calls: any[] = [];
let mode: 'ok' | 'bad-then-ok' | 'down' = 'ok';
let server: http.Server;
const plan = { title: 'Letter B', objectives: 'Say /b/', materials: 'Flashcards', warmUp: 'Song', steps: [{ title: 'Intro', minutes: 10, detail: 'Show page', sources: [1, 42] }],
  practice: 'Book', assessment: 'Observe', homework: 'HW p.3', differentiation: 'Pairs', notes: '', sources: [1] };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (req.url?.endsWith('/models')) { res.end(JSON.stringify({ data: [{ id: 'test-model' }] })); return; }
      const j = JSON.parse(body); calls.push(j);
      if (mode === 'down') { res.statusCode = 500; res.end('boom'); return; }
      const content = mode === 'bad-then-ok' && calls.length % 2 === 1 ? 'Sorry, here is your plan: {not json' : JSON.stringify(plan);
      res.end(JSON.stringify({ model: 'test-model', choices: [{ message: { content } }], usage: { prompt_tokens: 900, completion_tokens: 300 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.AI_PROVIDER = 'openai-compatible';
  process.env.AI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  process.env.AI_MODEL = 'test-model';
  process.env.AI_MONTHLY_REQUESTS_PER_SCHOOL = '4';
});
afterAll(() => server.close());

describe('Phase 5 — live AI provider (self-hosted, OpenAI-compatible)', () => {
  let app: any; let teacher: any; let english: string; let lessonId: string;
  beforeAll(async () => {
    const { createApp, login } = require('./helpers');
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    english = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    lessonId = (await teacher.get(`/api/reader/editions/${english}`)).body.components[0].units[0].lessons[0].id;
  });
  afterAll(async () => { await app.close(); });

  it('sends grounded book text + rules to the model and drops invented citations', async () => {
    const s = (await teacher.get('/api/ai/status')).body;
    expect(s).toMatchObject({ provider: 'openai-compatible', model: 'test-model', live: true, health: { ok: true } });
    const r = await teacher.post('/api/ai/generate').send({ task: 'LESSON_PLAN', editionId: english, lessonId, durationMin: 30 });
    expect(r.status).toBe(201);
    expect(r.body.output.steps[0].sources).toEqual([1]);
    expect(r.body.warnings.join(' ')).toMatch(/1 citation/);
    expect(r.body.usage).toMatchObject({ inputTokens: 900, outputTokens: 300 });
    const sent = calls[0];
    expect(sent.model).toBe('test-model');
    expect(sent.response_format).toEqual({ type: 'json_object' });
    expect(sent.messages[1].content).toMatch(/<source n="1" part="Student Book Part 1" page="2"/);
    expect(sent.messages[1].content).toMatch(/Sample placeholder page/);
    expect(JSON.stringify(sent)).not.toMatch(/Sample Student/); // no student data ever leaves
  });

  it('retries once when the model answers with invalid JSON', async () => {
    mode = 'bad-then-ok'; calls.length = 0;
    const r = await teacher.post('/api/ai/generate').send({ task: 'LESSON_PLAN', editionId: english, lessonId });
    expect(r.status).toBe(201);
    expect(calls).toHaveLength(2);
    expect(calls[1].messages[1].content).toMatch(/could not be used/);
    expect(r.body.usage.inputTokens).toBe(1800);
  });

  it('a down model server gives a clear 503 and the attempt is logged', async () => {
    mode = 'down';
    const r = await teacher.post('/api/ai/generate').send({ task: 'MCQ', editionId: english, lessonId });
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/AI server answered 500/);
    const owner = require('./helpers').ownerPool();
    const { rows } = await owner.query(`SELECT status, error FROM ai_generations WHERE task = 'MCQ'`);
    await owner.end();
    expect(rows).toEqual([{ status: 'ERROR', error: expect.stringMatching(/answered 500/) }]);
  });

  it('enforces the monthly request quota per school', async () => {
    mode = 'ok';
    const r = await teacher.post('/api/ai/generate').send({ task: 'LESSON_PLAN', editionId: english, lessonId });
    expect(r.status).toBe(201);
    const over = await teacher.post('/api/ai/generate').send({ task: 'LESSON_PLAN', editionId: english, lessonId });
    expect(over.status).toBe(429);
    expect(over.body.message).toMatch(/used its 4 AI requests/);
  });
});
