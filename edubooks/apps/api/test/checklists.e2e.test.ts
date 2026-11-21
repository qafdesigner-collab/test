import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('Evaluation checklists', () => {
  let app: INestApplication; let teacher: any; let student: any; let parent: any; let other: any; let cls: any;
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
    parent = await login(app, 'parent1', 'Parent@123', 'SUN01'); other = await login(app, 'admin', 'Admin@12345');
    const classes = (await teacher.get('/api/classes?mine=true')).body; cls = (classes.items ?? classes)[0];
  });
  afterAll(async () => { await app.close(); });

  it('teacher makes a checklist from a template, marks students, shares it; student and parent see their own marks', async () => {
    const tpl = (await teacher.get('/api/checklists/templates')).body.find((t: any) => t.id === 'kg-language');
    const r = await teacher.post('/api/checklists').send({ classId: cls.id, title: 'Term 1 — Language', term: 'Term 1', scale: 'THREE', items: tpl.items });
    expect(r.status).toBe(201);
    const d = (await teacher.get(`/api/checklists/${r.body.id}`)).body;
    expect(d.items.length).toBe(tpl.items.length); expect(d.roster.length).toBeGreaterThan(0);
    const me = (await student.get('/api/auth/me')).body; const sid = me.id ?? me.user?.id;
    const row = d.roster.find((x: any) => x.id === sid); expect(row).toBeTruthy();
    const marks = Object.fromEntries(d.items.map((it: any, i: number) => [it.id, (i % 3) + 1]));
    expect((await teacher.put(`/api/checklists/${r.body.id}/marks`).send({ students: [{ studentId: sid, marks: { ...marks, [d.items[0].id]: 9 } }] })).status).toBe(400);
    expect((await teacher.put(`/api/checklists/${r.body.id}/marks`).send({ students: [{ studentId: sid, marks, comment: 'Great progress' }] })).status).toBe(200);
    // not shared yet → the student does not see it
    expect((await student.get('/api/student/checklists')).body.find((x: any) => x.id === r.body.id)).toBeUndefined();
    expect((await teacher.patch(`/api/checklists/${r.body.id}`).send({ shared: true })).status).toBe(200);
    const mine = (await student.get('/api/student/checklists')).body.find((x: any) => x.id === r.body.id);
    expect(mine.comment).toBe('Great progress'); expect(mine.marks[d.items[1].id]).toBe(2);
    const kids = (await parent.get('/api/parent/children')).body; const kid = kids.children.find((k: any) => k.id === sid);
    expect(kid).toBeTruthy(); expect((await parent.get(`/api/parent/children/${sid}/checklists`)).body.find((x: any) => x.id === r.body.id)).toBeTruthy();
    expect((await other.get(`/api/checklists/${r.body.id}`)).status).toBe(403);
    expect((await teacher.get('/api/checklists')).body.find((x: any) => x.id === r.body.id).marked).toBe(1);
    expect((await teacher.delete(`/api/checklists/${r.body.id}`)).status).toBe(200);
  });

  it('builds checklist lines from a book unit', async () => {
    const books = (await teacher.get('/api/teacher/books')).body; const ed = (await teacher.get(`/api/reader/editions/${books[0].editionId}`)).body;
    const unit = ed.components.flatMap((c: any) => c.units)[0];
    const r = (await teacher.get(`/api/checklists/from-unit/${unit.id}`)).body;
    expect(r.items.length).toBeGreaterThan(0); expect(r.title).toMatch(/Unit/);
  });
});
