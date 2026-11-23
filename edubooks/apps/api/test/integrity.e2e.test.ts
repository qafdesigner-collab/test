/* Copy-paste and AI-writing check on written answers: teachers see it, students never do. Uses a fake OpenAI-compatible model. */
import * as http from 'http';
import { AddressInfo } from 'net';

const calls: any[] = [];
let server: http.Server;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (req.url?.endsWith('/models')) { res.end(JSON.stringify({ data: [{ id: 'test-model' }] })); return; }
      calls.push(JSON.parse(body));
      // score the answer that holds the AI-style text (the answers come in any order)
      const user = String((JSON.parse(body).messages ?? []).map((m: any) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n'));
      const chunk = user.split(/(?=Answer \d+\n)/).find((c) => c.includes('Student answer: Furthermore')); const n = Number(/^Answer (\d+)/.exec(chunk ?? '')?.[1] ?? 1);
      const reply = { answers: [{ n, score: 88, reason: 'Polished, generic wording far above a grade 1 level.' }, { n: n === 1 ? 2 : 1, score: 5, reason: 'Simple words and spelling of a young child.' }] };
      res.end(JSON.stringify({ model: 'test-model', choices: [{ message: { content: JSON.stringify(reply) } }], usage: { prompt_tokens: 200, completion_tokens: 30 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.AI_PROVIDER = 'openai-compatible';
  process.env.AI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  process.env.AI_MODEL = 'test-model';
  process.env.INTEGRITY_DELAY_MS = '0';
});
afterAll(() => server.close());

const AI_TEXT = 'Furthermore, the water cycle plays a crucial role in sustaining life on Earth — it ensures that freshwater is continuously redistributed through evaporation, condensation and precipitation. Moreover, this comprehensive process significantly influences various ecosystems.';
const CHILD = 'the sun makes the water hot and it goes up in the sky and then it rains down agen';

describe('Copy-paste and AI-writing check (teachers only)', () => {
  let app: any; let teacher: any; let student: any; let classId: string; let id: string; const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  beforeAll(async () => {
    const { createApp, login } = require('./helpers');
    app = await createApp(); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
    // earlier test files may have used up this month's AI requests of the school
    { const { ownerPool } = require('./helpers'); const o = ownerPool(); await o.query(`DELETE FROM ai_generations WHERE created_at >= date_trunc('month', now())`); await o.end(); }
    const r = await teacher.post('/api/teacher/assessments').send({ classId, kind: 'HOMEWORK', title: `Water cycle ${Date.now()}`, maxAttempts: 2,
      items: [{ type: 'SHORT', prompt: 'How does rain happen?', answer: [], points: 2 }, { type: 'SHORT', prompt: 'Explain it again in your own words', answer: [], points: 2 }, { type: 'TRUE_FALSE', prompt: 'Rain is water', answer: [true], points: 1 }] });
    id = r.body.id; await teacher.post(`/api/teacher/assessments/${id}/publish`);
  });
  afterAll(async () => { const { ownerPool } = require('./helpers'); const o = ownerPool(); await o.query('DELETE FROM assessments WHERE id = $1', [id]); await o.end(); await app.close(); });

  it('rules alone see AI style; the device report shows pasting', async () => {
    const { ruleScore, checkItem } = require('../src/lms/integrity');
    expect(ruleScore(AI_TEXT, 1).score).toBeGreaterThanOrEqual(60);
    expect(ruleScore(CHILD, 1).score).toBeLessThan(20);
    expect(checkItem(AI_TEXT, { pasted: AI_TEXT.length, pastes: 1, typed: 0, ms: 4000 }, 1).copied).toBe(true);
    expect(checkItem(CHILD, { pasted: 0, pastes: 0, typed: CHILD.length + 6, ms: 90000 }, 1)).toMatchObject({ copied: false });
  });

  it('keeps the check out of everything the student sees, and shows it to the teacher with the AI estimate', async () => {
    const v = (await student.get(`/api/student/homework/${id}`)).body;
    const [q1, q2, q3] = v.items.map((i: any) => i.id);
    const r = await student.post(`/api/student/homework/${id}/submit`).send({
      answers: [{ itemId: q1, response: AI_TEXT }, { itemId: q2, response: CHILD }, { itemId: q3, response: true }],
      signals: [{ itemId: q1, pasted: AI_TEXT.length, pastes: 1, typed: 3, ms: 5000 }, { itemId: q2, pasted: 0, pastes: 0, typed: CHILD.length + 4, ms: 70000 }] });
    expect(r.status).toBe(201);
    expect(JSON.stringify(r.body)).not.toMatch(/integrity|copied|pasted/);
    let t: any;
    for (let i = 0; i < 100; i++) { t = (await teacher.get(`/api/teacher/assessments/${id}`)).body.students.find((s: any) => s.submission); if (t.submission.integrity.items[q1]?.ai?.by === 'ai') break; await sleep(200); }
    const it = t.submission.integrity.items;
    expect(it[q1]).toMatchObject({ copied: true, pasted: AI_TEXT.length, ai: { score: 88, by: 'ai' } });
    expect(it[q1].ai.rules.score).toBeGreaterThanOrEqual(60);
    expect(it[q2]).toMatchObject({ copied: false });
    expect(it[q2].ai.score).toBeLessThan(40);
    expect(it[q3]).toBeUndefined();
    // only the long answer went to the model, without names
    const sent = JSON.stringify(calls.at(-1));
    expect(sent).toContain('Furthermore'); expect(sent).not.toContain('Sample Student');

    // the student's own view (and the list) never contains it — also after marking
    const g = await teacher.patch(`/api/teacher/submissions/${t.submission.id}`).send({ itemScores: [{ itemId: q1, awarded: 0 }, { itemId: q2, awarded: 2 }], returnToStudent: true });
    expect(g.status).toBe(200);
    for (const path of [`/api/student/homework/${id}`, '/api/student/homework', '/api/student/report']) {
      const body = JSON.stringify((await student.get(path)).body);
      expect(body).not.toMatch(/integrity|"copied"|"pasted"|AI-written|ruleScore/);
    }
  });

  it('keeps the earlier check when the student tries again', async () => {
    const v = (await student.get(`/api/student/homework/${id}`)).body;
    await student.post(`/api/student/homework/${id}/start`);
    await student.post(`/api/student/homework/${id}/submit`).send({ answers: v.items.map((i: any) => ({ itemId: i.id, response: i.type === 'TRUE_FALSE' ? true : CHILD })) });
    const t = (await teacher.get(`/api/teacher/assessments/${id}`)).body.students.find((s: any) => s.submission);
    expect(t.submission.history[0].integrity.items).toBeDefined();
    expect(Object.values(t.submission.integrity.items).every((x: any) => x.copied === false)).toBe(true); // no device report: not called copied unless pasted
  });
});
