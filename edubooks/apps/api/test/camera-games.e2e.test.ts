import { createApp, login, ownerPool } from './helpers';

describe('Camera games: bubble pop, show me fingers, air writing', () => {
  let app: any; let teacher: any; let ed: string; const made: string[] = [];
  beforeAll(async () => {
    app = await createApp(); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
  });
  afterAll(async () => { const o = ownerPool(); await o.query('DELETE FROM game_activities WHERE id = ANY($1::uuid[])', [made]); await o.end(); await app.close(); });
  const make = async (engine: string, content: any) => { const r = await teacher.post('/api/teacher/games').send({ engine, title: engine, editionId: ed, content }); if (r.status === 201) made.push(r.body.id); return r; };

  it('bubble pop: what to pop, what not, goal and time (kept in range)', async () => {
    expect((await make('BUBBLE_POP', { targets: [] })).status).toBe(400);
    const r = await make('BUBBLE_POP', { task: 'Pop the letter B!', targets: ['B', 'b', 'B'], others: ['D', 'B', 'P'], goal: 99, seconds: 5 });
    expect(r.status).toBe(201);
    expect(r.body.content).toEqual({ task: 'Pop the letter B!', targets: ['B', 'b'], others: ['D', 'P'], goal: 20, seconds: 30 });
  });

  it('show me fingers: rounds of 0–10 fingers', async () => {
    expect((await make('FINGERS', { rounds: [{ show: 'x', answer: 11 }] })).status).toBe(400);
    const r = await make('FINGERS', { rounds: [{ show: '3', answer: 3 }, { show: '🍎🍎', answer: 2 }, { show: 'bad', answer: -1 }, 4] });
    expect(r.status).toBe(201);
    expect(r.body.content.rounds).toEqual([{ show: '3', answer: 3 }, { show: '🍎🍎', answer: 2 }, { show: '4', answer: 4 }]);
  });

  it('air writing: short letters or numbers', async () => {
    expect((await make('AIR_WRITING', { items: [] })).status).toBe(400);
    const r = await make('AIR_WRITING', { items: ['A', 'ب', '12', 'toolong'] });
    expect(r.status).toBe(201); expect(r.body.content.items).toEqual(['A', 'ب', '12', 'too']);
  });
});
