import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('New game engines and page hotspots', () => {
  let app: INestApplication; let editor: any; let teacher: any; let student: any; let englishEd: string; let part1: string;
  beforeAll(async () => {
    app = await createApp();
    editor = await login(app, 'editor', 'Admin@12345');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    student = await login(app, 'student1', 'Student@123', 'SUN01');
    englishEd = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    part1 = (await teacher.get(`/api/reader/editions/${englishEd}`)).body.components[0].id;
  });
  afterAll(async () => { await app.close(); });

  it('validates spelling bee, sentence builder and listening games', async () => {
    const make = (engine: string, content: any) => teacher.post('/api/teacher/games').send({ engine, title: engine, editionId: englishEd, content });
    expect((await make('SPELLING_BEE', { words: [{ word: 'a' }] })).status).toBe(400);
    expect((await make('SPELLING_BEE', { words: [{ word: 'apple', sentence: 'I eat an apple.' }] })).status).toBe(201);
    expect((await make('SENTENCE_BUILDER', { sentences: ['Hello'] })).status).toBe(400);
    const sb = await make('SENTENCE_BUILDER', { sentences: ['The cat is big', { text: 'I  like   books', hint: '📚' }] });
    expect(sb.status).toBe(201);
    expect(sb.body.content.sentences[1].text).toBe('I like books');
    expect((await make('LISTENING', { rounds: [{ say: 'dog', options: ['🐶'], answer: 0 }] })).status).toBe(400);
    expect((await make('LISTENING', { rounds: [{ say: 'dog', options: ['🐶', '🐱'], answer: 0 }] })).status).toBe(201);
  });

  it('lets publisher staff place hotspots that licensed readers can see', async () => {
    const box = { page: 2, x: 0.1, y: 0.2, w: 0.3, h: 0.1 };
    expect((await teacher.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, kind: 'NOTE', body: 'x' })).status).toBe(403);
    expect((await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, x: 0.9, kind: 'NOTE', body: 'x' })).status).toBe(400);
    expect((await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, kind: 'VIDEO', url: 'https://evil.example/v' })).status).toBe(400);
    expect((await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, kind: 'AUDIO', body: '' })).status).toBe(400);
    const note = await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, kind: 'AUDIO', title: 'Say it', body: 'Apple' });
    expect(note.status).toBe(201);
    const vid = await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, y: 0.5, kind: 'VIDEO', url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(vid.status).toBe(201);
    const games = (await editor.get('/api/publishing/games')).body;
    const pubGame = (games.items ?? games).find((g: any) => !g.schoolId && (g.editionId === englishEd || g.edition?.id === englishEd));
    if (pubGame) expect((await editor.post(`/api/reader/components/${part1}/hotspots`).send({ ...box, y: 0.7, kind: 'GAME', gameId: pubGame.id })).status).toBe(201);
    expect((await editor.patch(`/api/reader/hotspots/${note.body.id}`).send({ body: 'Red apple' })).status).toBe(200);

    const list = (await student.get(`/api/reader/components/${part1}/hotspots`)).body;
    expect(list.find((h: any) => h.id === note.body.id)).toMatchObject({ kind: 'AUDIO', body: 'Red apple', page: 2 });
    const noSeat = await login(app, 'student3', 'Student@123', 'SUN01');
    expect((await noSeat.get(`/api/reader/components/${part1}/hotspots`)).status).toBe(403); // holds no seat for this book
    expect((await editor.delete(`/api/reader/hotspots/${vid.body.id}`)).status).toBe(200);
    expect((await student.get(`/api/reader/components/${part1}/hotspots`)).body.find((h: any) => h.id === vid.body.id)).toBeUndefined();
  });
});
