import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('Messaging, announcements and live lessons', () => {
  let app: INestApplication; let teacher: any; let parent: any; let principal: any; let student: any; let classId: string;
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    parent = await login(app, 'parent1', 'Parent@123', 'SUN01');
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    student = await login(app, 'student1', 'Student@123', 'SUN01');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
  });
  afterAll(async () => { await app.close(); });

  it('lets parents and teachers talk about a child, with the school able to oversee', async () => {
    const contacts = (await parent.get('/api/messages/contacts')).body;
    const t = contacts.find((c: any) => c.displayName === 'Sample Teacher');
    expect(t).toBeTruthy();
    const conv = (await parent.post('/api/messages/conversations').send({ studentId: t.studentId, withId: t.id })).body;
    const again = (await parent.post('/api/messages/conversations').send({ studentId: t.studentId, withId: t.id })).body;
    expect(again.id).toBe(conv.id);
    expect((await parent.post(`/api/messages/conversations/${conv.id}`).send({ body: 'Hello, how is my child doing?' })).status).toBe(201);
    expect((await teacher.get('/api/messages/unread')).body.unread).toBeGreaterThanOrEqual(1);
    const list = (await teacher.get('/api/messages/conversations')).body;
    expect(list.find((c: any) => c.id === conv.id)).toMatchObject({ unread: 1, lastMessage: 'Hello, how is my child doing?' });
    const r = (await teacher.post(`/api/messages/conversations/${conv.id}`).send({ body: 'Very well, thank you!' })).body;
    expect(r.messages).toHaveLength(2);
    expect((await teacher.get('/api/messages/unread')).body.unread).toBe(0);
    expect(JSON.stringify((await parent.get('/api/notifications')).body)).toContain('New message from Sample Teacher');
    // school oversight: read-only
    expect((await principal.get('/api/messages/conversations?all=1')).body.some((c: any) => c.id === conv.id)).toBe(true);
    expect((await principal.get(`/api/messages/conversations/${conv.id}`)).body.readOnly).toBe(true);
    expect((await principal.post(`/api/messages/conversations/${conv.id}`).send({ body: 'x' })).status).toBe(403);
    expect((await teacher.get('/api/messages/conversations?all=1')).status).toBe(403);
    // rules: no stranger chats, no pupil chat
    const other = (await principal.get('/api/school/users?role=TEACHER')).body.items.find((u: any) => u.username !== 'teacher1');
    if (other) expect((await parent.post('/api/messages/conversations').send({ studentId: t.studentId, withId: other.id })).status).toBe(403);
    expect((await student.get('/api/messages/contacts')).status).toBe(403);
    expect((await parent.post(`/api/messages/conversations/${conv.id}`).send({ body: '' })).status).toBe(400);
  });

  it('posts announcements to the right people', async () => {
    expect((await teacher.post('/api/announcements').send({ title: 'Whole school' })).status).toBe(403);
    expect((await teacher.post('/api/announcements').send({ classId, title: 'Bring your reading book tomorrow', audience: 'BOTH' })).status).toBe(201);
    expect((await teacher.post('/api/announcements').send({ classId, title: 'Parents meeting on Friday', audience: 'PARENTS' })).status).toBe(201);
    expect((await principal.post('/api/announcements').send({ title: 'School closed on Monday', pinned: true })).status).toBe(201);
    const kid = (await student.get('/api/announcements')).body.map((a: any) => a.title);
    expect(kid).toEqual(expect.arrayContaining(['Bring your reading book tomorrow', 'School closed on Monday']));
    expect(kid).not.toContain('Parents meeting on Friday');
    const par = (await parent.get('/api/announcements')).body;
    expect(par[0].title).toBe('School closed on Monday'); // pinned first
    expect(par.map((a: any) => a.title)).toContain('Parents meeting on Friday');
  });

  it('schedules live lessons with a join window', async () => {
    expect((await teacher.post('/api/live').send({ classId, title: 'Phonics', startsAt: new Date().toISOString(), url: 'javascript:alert(1)' })).status).toBe(400);
    const now = await teacher.post('/api/live').send({ classId, title: 'Phonics live', startsAt: new Date(Date.now() + 5 * 60_000).toISOString(), durationMin: 30, url: 'https://meet.google.com/abc-defg-hij' });
    expect(now.status).toBe(201);
    await teacher.post('/api/live').send({ classId, title: 'Maths later', startsAt: new Date(Date.now() + 2 * 864e5).toISOString(), url: 'https://zoom.us/j/123' });
    const kid = (await student.get('/api/live')).body;
    expect(kid.find((l: any) => l.title === 'Phonics live').joinable).toBe(true);
    expect(kid.find((l: any) => l.title === 'Maths later').joinable).toBe(false);
    expect((await parent.get('/api/live')).body.length).toBeGreaterThanOrEqual(2);
    expect((await student.post('/api/live').send({ classId, title: 'x', startsAt: new Date().toISOString(), url: 'https://x.y' })).status).toBe(403);
    expect((await teacher.delete(`/api/live/${now.body.id}`)).status).toBe(200);
  });
});
