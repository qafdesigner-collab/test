import { INestApplication } from '@nestjs/common';
import { createApp, login, ownerPool, appPool } from './helpers';
import { starsFor, validateContent } from '../src/games/engines';

type Agent = Awaited<ReturnType<typeof login>>;

describe('game engines (unit)', () => {
  it('validates content and computes the maximum score for each engine', () => {
    expect(validateContent('MEMORY', { pairs: [{ a: '🐱', b: 'cat' }, { a: '🐶', b: 'dog' }] }).maxScore).toBe(2);
    expect(() => validateContent('MEMORY', { pairs: [{ a: '🐱', b: 'cat' }] })).toThrow(/2 and 12 pairs/);
    expect(validateContent('COUNTING', { things: ['🍎'], min: 5, max: 2, rounds: 99 }).content).toEqual({ things: ['🍎'], min: 5, max: 5, rounds: 15 });
    expect(() => validateContent('SORTING', { categories: [{ name: 'A', items: ['x', 'y', 'z', 'w'] }] })).toThrow(/2 to 4 groups/);
    expect(validateContent('FILL_BLANK', { sentences: [{ text: 'c___t', answer: 'a', options: ['o', 'u'] }] }).content.sentences[0].options).toEqual(['o', 'u', 'a']);
    expect(() => validateContent('FILL_BLANK', { sentences: [{ text: 'no blank', answer: 'a' }] })).toThrow(/___/);
    expect(() => validateContent('QUIZ', { questions: [{ prompt: 'x', options: ['a', 'b'], answer: 5 }] })).toThrow(/choices/);
    expect(validateContent('SHAPES', { shapes: ['circle', 'hexagon', 'star'], rounds: 4 }).content.shapes).toEqual(['circle', 'star']);
    expect(validateContent('WORD_BUILD', { words: [{ word: 'c a t', hint: '🐱' }] }).content.words[0].word).toBe('cat');
    expect(validateContent('PUZZLE', { picture: '🍎', size: 9 }).content.size).toBe(3);
  });
  it('awards stars by percentage', () => {
    expect([starsFor(10, 10), starsFor(9, 10), starsFor(6, 10), starsFor(1, 10), starsFor(0, 10)]).toEqual([3, 3, 2, 1, 0]);
  });
});

describe('Phase 6 — games, rewards & progress', () => {
  let app: INestApplication; const owner = ownerPool();
  let kid1: Agent; let kid3: Agent; let teacher: Agent; let editor: Agent; let gvsKid: Agent;
  let classId: string; let english: string;
  beforeAll(async () => {
    app = await createApp();
    [kid1, kid3, teacher, editor, gvsKid] = await Promise.all([login(app, 'student1', 'Student@123', 'SUN01'), login(app, 'student3', 'Student@123', 'SUN01'),
      login(app, 'teacher1', 'Teacher@12345', 'SUN01'), login(app, 'editor', 'Admin@12345'), login(app, 'student1', 'Student@123', 'GVS02')]);
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
    english = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
  });
  afterAll(async () => { await owner.end(); await app.close(); });

  it('students see games of their licensed books, assigned games first; licensing applies to games', async () => {
    const list = (await kid1.get('/api/student/games')).body;
    expect(list).toHaveLength(13);
    expect(list.slice(0, 2).map((g: any) => g.title).sort()).toEqual(['Count the fruit', 'Picture and word']);
    expect(list[0].assignmentId).toBeTruthy();
    // student3 is in the class but holds no licence: assigned publisher games stay locked.
    expect((await kid3.get('/api/student/games')).body).toEqual([]);
    // GVS02 student holds KG English + Maths only.
    const gvs = (await gvsKid.get('/api/student/games')).body.map((g: any) => g.bookTitle);
    expect(new Set(gvs)).toEqual(new Set(['KG English', 'KG Maths']));
  });

  it('a finished play is scored on the server: score clamped, stars computed, badges awarded once', async () => {
    const g = (await kid1.get('/api/student/games')).body.find((x: any) => x.title === 'Picture and word');
    const full = (await kid1.get(`/api/student/games/${g.id}`)).body;
    expect(full.content.pairs).toHaveLength(6);
    const r = (await kid1.post(`/api/student/games/${g.id}/attempts`).send({ score: 999, durationMs: 42000 })).body;
    expect(r).toMatchObject({ score: 6, maxScore: 6, stars: 3, best: 3, starsGained: 3 });
    expect(r.newBadges.map((b: any) => b.key).sort()).toEqual(['FIRST_GAME', 'PERFECT']);
    const again = (await kid1.post(`/api/student/games/${g.id}/attempts`).send({ score: 2 })).body;
    expect(again).toMatchObject({ stars: 1, best: 3, starsGained: 0, newBadges: [] });
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM game_attempts`);
    expect(rows[0].n).toBe(2);
  });

  it('teachers build their own games, assign them, and see a class report', async () => {
    expect((await teacher.post('/api/teacher/games').send({ engine: 'QUIZ', title: 'Bad', content: { questions: [] } })).status).toBe(400);
    const g = (await teacher.post('/api/teacher/games').send({ engine: 'WORD_BUILD', title: 'Our class words', editionId: english, content: { words: [{ word: 'pen', hint: '🖊️' }, { word: 'cup', hint: '☕' }] } })).body;
    expect(g.published).toBe(true);
    expect((await teacher.post(`/api/teacher/games/${g.id}/assign`).send({ classId })).status).toBe(201);
    const mine = (await kid1.get('/api/student/games')).body.find((x: any) => x.id === g.id);
    expect(mine.assignmentId).toBeTruthy();
    expect((await kid3.get('/api/student/games')).body.map((x: any) => x.title)).toEqual(['Our class words']); // school's own game: no licence needed
    await kid1.post(`/api/student/games/${g.id}/attempts`).send({ score: 1 });
    const rep = (await teacher.get(`/api/teacher/classes/${classId}/games`)).body;
    const col = rep.games.findIndex((x: any) => x.activityId === g.id);
    expect(rep.students.find((s: any) => s.displayName === 'Sample Student 1').cells[col]).toEqual({ best: 1, plays: 1 }); // 1 of 2 = 50% → 1 star
    expect((await gvsKid.get(`/api/student/games/${g.id}`)).status).toBe(404);
    expect((await teacher.patch(`/api/publishing/games/${g.id}`).send({ title: 'x' })).status).toBe(403);
  });

  it('publisher library: drafts are invisible until published', async () => {
    const g = (await editor.post('/api/publishing/games').send({ engine: 'SHAPES', title: 'Shape hunt', editionId: english, content: { shapes: ['circle', 'square'], rounds: 3 } })).body;
    expect(g.published).toBe(false);
    expect((await teacher.get('/api/teacher/games')).body.map((x: any) => x.id)).not.toContain(g.id);
    await editor.patch(`/api/publishing/games/${g.id}`).send({ published: true });
    expect((await teacher.get(`/api/teacher/games?editionId=${english}`)).body.map((x: any) => x.id)).toContain(g.id);
    expect((await teacher.post(`/api/teacher/games/${g.id}/assign`).send({ classId })).status).toBe(201);
    expect((await teacher.delete(`/api/teacher/games/${g.id}`)).status).toBe(403); // can't delete the publisher's game
  });

  it('achievements: stars, badges, streak and per-book progress', async () => {
    await kid1.put('/api/reader/progress').send({ componentId: (await kid1.get(`/api/reader/editions/${english}`)).body.components[0].id, page: 21 });
    const a = (await kid1.get('/api/student/achievements')).body;
    expect(a.stars).toBe(4); // 3 (picture game) + 1 (class words, 50%)
    expect(a.streak).toBe(1);
    const earned = a.badges.filter((b: any) => b.earnedAt).map((b: any) => b.key).sort();
    expect(earned).toEqual(['FIRST_GAME', 'PERFECT', 'READER_20']);
    expect(a.books.find((b: any) => b.title === 'KG English')).toMatchObject({ pagesRead: 21, plays: 3 });
    const home = (await kid1.get('/api/student/home')).body;
    expect(home.continueReading).toMatchObject({ title: 'KG English', page: 21 });
    expect(home.homework.map((h: any) => h.title)).toContain('Sample homework (placeholder questions)');
    expect(home.stars).toBe(4);
  });

  it('attempts and badges are private (RLS): other students and other schools cannot read them', async () => {
    const appDb = appPool();
    const { rows: [s3] } = await owner.query(`SELECT u.id, u.school_id, u.publisher_id FROM users u JOIN schools s ON s.id = u.school_id WHERE s.code = 'SUN01' AND u.username = 'student3'`);
    const { rows: [gvs] } = await owner.query(`SELECT id FROM schools WHERE code = 'GVS02'`);
    const asUser = async (school: string, user: string, q: string) => {
      const c = await appDb.connect();
      try {
        await c.query('BEGIN');
        await c.query(`SELECT set_config('app.publisher_id', $1, true), set_config('app.school_id', $2, true), set_config('app.user_id', $3, true)`, [s3.publisher_id, school, user]);
        const r = await c.query(q); await c.query('ROLLBACK'); return r.rows;
      } finally { c.release(); }
    };
    expect(await asUser(s3.school_id, s3.id, 'SELECT * FROM game_attempts')).toHaveLength(0); // student3 never played; can't see student1's
    expect(await asUser(s3.school_id, s3.id, 'SELECT * FROM student_badges')).toHaveLength(0);
    expect(await asUser(gvs.id, s3.id, 'SELECT * FROM game_attempts')).toHaveLength(0);
    await appDb.end();
    await expect(owner.query(`UPDATE game_attempts SET score = 0`)).resolves.toBeTruthy(); // owner can (maintenance); app role cannot:
    const app2 = appPool(); const c = await app2.connect();
    await expect(c.query(`UPDATE game_attempts SET score = 0`)).rejects.toThrow(/permission denied/);
    c.release(); await app2.end();
  });
});
