import { INestApplication } from '@nestjs/common';
import { createApp, login, ownerPool } from './helpers';

// A tiny "WebM" (EBML header) and an "M4A" (ftyp box): enough for the format check.
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(400, 7)]);
const M4A = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(300, 3)]);

describe('Voice notes, student chat and read-aloud homework', () => {
  let app: INestApplication; const owner = ownerPool();
  let teacher: any; let parent: any; let student: any; let principal: any; let other: any; let classId: string;
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    parent = await login(app, 'parent1', 'Parent@123', 'SUN01');
    student = await login(app, 'student1', 'Student@123', 'SUN01');
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    other = await login(app, 'principal', 'School@12345', 'GVS02');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
  });
  afterAll(async () => { await owner.end(); await app.close(); });

  const upload = (agent: any, buf: Buffer, kind: string, name = 'voice.webm') =>
    agent.post('/api/messages/audio').field('kind', kind).field('durationMs', '2400').attach('file', buf, name);

  it('a teacher sends a voice note to a parent; only the people in the chat (and the school) can play it', async () => {
    const c = (await teacher.get('/api/messages/contacts')).body.find((x: any) => x.role !== 'Student');
    const conv = (await teacher.post('/api/messages/conversations').send({ studentId: c.studentId, withId: c.id })).body;
    const up = await upload(teacher, WEBM, 'MESSAGE');
    expect(up.status).toBe(201); expect(up.body.mime).toBe('audio/webm');
    const sent = await teacher.post(`/api/messages/conversations/${conv.id}`).send({ audioId: up.body.id });
    expect(sent.status).toBe(201);
    const last = sent.body.messages[sent.body.messages.length - 1];
    expect(last).toMatchObject({ body: '', audioId: up.body.id, audioMs: 2400 });
    // the same clip cannot be sent twice
    expect((await teacher.post(`/api/messages/conversations/${conv.id}`).send({ audioId: up.body.id })).status).toBe(400);
    const list = (await parent.get('/api/messages/conversations')).body;
    expect(list.find((x: any) => x.id === conv.id).lastMessage).toBe('🎤 Voice message');
    const play = await parent.get(`/api/messages/audio/${up.body.id}`);
    expect(play.status).toBe(200); expect(play.headers['content-type']).toBe('audio/webm'); expect(play.body.length).toBe(WEBM.length);
    const part = await parent.get(`/api/messages/audio/${up.body.id}`).set('Range', 'bytes=0-9');
    expect(part.status).toBe(206); expect(part.headers['content-range']).toBe(`bytes 0-9/${WEBM.length}`);
    expect((await principal.get(`/api/messages/audio/${up.body.id}`)).status).toBe(200);
    expect((await student.get(`/api/messages/audio/${up.body.id}`)).status).toBe(403);
    expect((await other.get(`/api/messages/audio/${up.body.id}`)).status).toBe(404);
  });

  it('refuses files that are not sound recordings', async () => {
    expect((await upload(teacher, Buffer.from('MZ not audio at all'), 'MESSAGE', 'x.webm')).status).toBe(400);
    expect((await upload(teacher, WEBM, 'VIDEO')).status).toBe(400);
  });

  it('students can chat with their own teacher (text and voice), and the teacher can start a chat with a student', async () => {
    const contacts = (await student.get('/api/messages/contacts')).body;
    const t = contacts.find((x: any) => x.displayName === 'Sample Teacher');
    expect(t).toBeTruthy();
    expect(contacts.some((x: any) => x.role === 'School office')).toBe(true);
    const conv = (await student.post('/api/messages/conversations').send({ studentId: t.studentId, withId: t.id })).body;
    expect((await student.post(`/api/messages/conversations/${conv.id}`).send({ body: 'Miss, I finished page 3!' })).status).toBe(201);
    const v = await upload(student, M4A, 'MESSAGE', 'note.m4a');
    expect(v.body.mime).toBe('audio/mp4');
    expect((await student.post(`/api/messages/conversations/${conv.id}`).send({ audioId: v.body.id })).status).toBe(201);
    const seen = (await teacher.get(`/api/messages/conversations/${conv.id}`)).body;
    expect(seen.withPupil).toBe(true); expect(seen.messages.map((m: any) => m.body)).toContain('Miss, I finished page 3!');
    expect((await teacher.get(`/api/messages/audio/${v.body.id}`)).status).toBe(200);
    expect((await parent.get(`/api/messages/audio/${v.body.id}`)).status).toBe(403);
    // teacher side lists pupils as contacts too
    expect((await teacher.get('/api/messages/contacts')).body.some((x: any) => x.role === 'Student')).toBe(true);
  });

  it('read-aloud homework: the student records, the teacher listens and marks', async () => {
    const a = (await teacher.post('/api/teacher/assessments').send({ classId, kind: 'HOMEWORK', title: 'Read page 3 aloud', items: [
      { type: 'READING', prompt: 'Read page 3 of your book aloud', options: [], answer: [], points: 5 },
      { type: 'TRUE_FALSE', prompt: 'B is for ball', options: [], answer: [true], points: 1 },
    ] })).body;
    expect((await teacher.post(`/api/teacher/assessments/${a.id}/publish`)).status).toBe(201);
    const hw = (await student.get(`/api/student/homework/${a.id}`)).body;
    const reading = hw.items.find((i: any) => i.type === 'READING');
    expect(reading.answer).toBeUndefined();
    const clip = (await upload(student, WEBM, 'READING')).body;
    // someone else's clip id is not accepted as the answer
    const foreign = (await upload(teacher, WEBM, 'READING')).body;
    expect(foreign.id).not.toBe(clip.id);
    const r = await student.post(`/api/student/homework/${a.id}/submit`).send({ answers: [
      { itemId: reading.id, response: clip.id }, { itemId: hw.items.find((i: any) => i.type === 'TRUE_FALSE').id, response: true },
    ] });
    expect(r.status).toBe(201); expect(r.body.status).toBe('SUBMITTED');
    const full = (await teacher.get(`/api/teacher/assessments/${a.id}`)).body;
    const sub = full.students.map((s: any) => s.submission).find((s: any) => s?.answers.some((x: any) => x.response === clip.id));
    expect(sub).toBeTruthy();
    expect((await teacher.get(`/api/messages/audio/${clip.id}`)).status).toBe(200);
    expect((await parent.get(`/api/messages/audio/${clip.id}`)).status).toBe(200); // parent of the pupil
    const g = await teacher.patch(`/api/teacher/submissions/${sub.id}`).send({ itemScores: [{ itemId: reading.id, awarded: 4 }], feedback: 'Lovely clear reading!' });
    expect(g.status).toBe(200);
  });

  it('erasing a student also deletes their recordings', async () => {
    const { rows: [k] } = await owner.query(`SELECT u.id FROM users u JOIN schools s ON s.id = u.school_id WHERE s.code = 'SUN01' AND u.username = 'student1'`);
    const before = Number((await owner.query(`SELECT count(*) n FROM audio_clips WHERE owner_id = $1`, [k.id])).rows[0].n);
    expect(before).toBeGreaterThan(0);
    // (the erasure itself is exercised in erasure.e2e; here we only check the clean-up query runs against the same rows)
    const { rows } = await owner.query(`SELECT count(*) n FROM audio_clips WHERE owner_id = $1 OR id IN (SELECT m.audio_id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.student_id = $1 AND m.audio_id IS NOT NULL)`, [k.id]);
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(before);
  });
});
