import { compareReading } from '../src/ai/tutor';
import { createApp, login } from './helpers';

describe('Read to Owl: the student reads the open page aloud and Owl checks it', () => {
  it('finds the part of the page that was read, the words missed and the words said wrongly', () => {
    const page = 'Unit 2. The cat sat on the mat. The dog ran to the park and played with a ball.';
    const good = compareReading(page, 'the cat sat on the mat the dog ran to the park');
    expect(good.score).toBe(100); expect(good.missed).toEqual([]);
    const some = compareReading(page, 'the cat sat on the hat the dog ran to park');
    expect(some.missed).toEqual(expect.arrayContaining(['mat']));
    expect(some.extra).toEqual(['hat']);
    expect(some.score).toBeGreaterThan(60); expect(some.score).toBeLessThan(100);
    // speech recognition slips of one letter still count (played / playd)
    expect(compareReading(page, 'and playd with a ball').missed).toEqual([]);
    expect(compareReading(page, 'something else entirely').matched).toBe(0);
  });

  it('checks a reading of the open page and shows it to the teacher', async () => {
    const app = await createApp();
    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    await principal.put('/api/tutor/settings').send({ enabled: true, dailyLimit: 200 });
    const student = await login(app, 'student1', 'Student@123', 'SUN01');
    const teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    const book = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English');
    const admin = await login(app, 'admin', 'Admin@12345');
    const part = (await admin.get(`/api/publishing/editions/${book.editionId}`)).body.components.find((c: any) => c.title === 'Student Book Part 1');
    const r = await student.post('/api/tutor/read').send({ editionId: book.editionId, componentId: part.id, page: 3, transcript: 'KG English Part 1 page 3 sample placeholder page' });
    expect(r.status).toBe(201);
    expect(r.body.score).toBeGreaterThanOrEqual(90);
    expect(r.body.feedback).toMatch(/Excellent reading/);
    expect(r.body.words.length).toBeGreaterThan(3);
    expect((await student.post('/api/tutor/read').send({ editionId: book.editionId, componentId: part.id, page: 3, transcript: 'hello' })).status).toBe(400);
    const log = (await teacher.get('/api/tutor/log')).body;
    expect(log.find((x: any) => x.mode === 'READ' && x.page === 3)).toMatchObject({ score: r.body.score });
    await app.close();
  });
});
