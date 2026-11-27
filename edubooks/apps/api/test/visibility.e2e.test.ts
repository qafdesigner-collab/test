import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('"Visible to" on book parts, units and lessons', () => {
  let app: INestApplication; let admin: any; let teacher: any; let student: any; let principal: any; let ed: any;
  beforeAll(async () => {
    app = await createApp();
    admin = await login(app, 'admin', 'Admin@12345'); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    student = await login(app, 'student1', 'Student@123', 'SUN01'); principal = await login(app, 'principal', 'School@12345', 'SUN01');
    const books = (await teacher.get('/api/teacher/books')).body; ed = books[0].editionId;
  });
  afterAll(async () => { await app.close(); });

  it('a part for teachers only is hidden from students (contents, pages, files); one for students only is hidden from teachers', async () => {
    const tree = (await student.get(`/api/reader/editions/${ed}`)).body;
    const part = tree.components.find((c: any) => c.hasPdf); expect(part).toBeTruthy();
    expect((await admin.patch(`/api/publishing/components/${part.id}`).send({ visibleTo: 'TEACHER' })).status).toBe(200);
    try {
      expect((await student.get(`/api/reader/editions/${ed}`)).body.components.map((c: any) => c.id)).not.toContain(part.id);
      expect((await student.get(`/api/reader/components/${part.id}/pdf`)).status).toBe(403);
      expect((await teacher.get(`/api/reader/editions/${ed}`)).body.components.map((c: any) => c.id)).toContain(part.id);
      expect((await teacher.get(`/api/reader/components/${part.id}/pdf`)).status).toBe(200);

      expect((await admin.patch(`/api/publishing/components/${part.id}`).send({ visibleTo: 'STUDENT' })).status).toBe(200);
      expect((await teacher.get(`/api/reader/editions/${ed}`)).body.components.map((c: any) => c.id)).not.toContain(part.id);
      expect((await teacher.get(`/api/reader/components/${part.id}/pdf`)).status).toBe(403);
      expect((await student.get(`/api/reader/components/${part.id}/pdf`)).status).toBe(200);
      // the school admin sees everything
      expect((await principal.get(`/api/reader/components/${part.id}/pdf`)).status).toBe(200);
    } finally { await admin.patch(`/api/publishing/components/${part.id}`).send({ visibleTo: 'ALL' }); }
  });

  it('units and lessons can be hidden too (also on a published edition)', async () => {
    const tree = (await teacher.get(`/api/reader/editions/${ed}`)).body;
    const part = tree.components.find((c: any) => c.units.length); const unit = part.units[0]; const lesson = part.units[1]?.lessons[0] ?? unit.lessons[0];
    expect((await admin.patch(`/api/publishing/units/${unit.id}`).send({ visibleTo: 'TEACHER' })).status).toBe(200);
    try {
      const s = (await student.get(`/api/reader/editions/${ed}`)).body.components.find((c: any) => c.id === part.id);
      expect(s.units.map((u: any) => u.id)).not.toContain(unit.id);
      expect((await teacher.get(`/api/reader/editions/${ed}`)).body.components.find((c: any) => c.id === part.id).units.map((u: any) => u.id)).toContain(unit.id);
    } finally { await admin.patch(`/api/publishing/units/${unit.id}`).send({ visibleTo: 'ALL' }); }
    if (lesson && lesson.id) {
      expect((await admin.patch(`/api/publishing/lessons/${lesson.id}`).send({ visibleTo: 'STUDENT' })).status).toBe(200);
      try {
        const t = (await teacher.get(`/api/reader/editions/${ed}`)).body.components.find((c: any) => c.id === part.id);
        expect(t.units.flatMap((u: any) => u.lessons).map((l: any) => l.id)).not.toContain(lesson.id);
      } finally { await admin.patch(`/api/publishing/lessons/${lesson.id}`).send({ visibleTo: 'ALL' }); }
    }
  });

  it('new teacher guides start as "Teachers only"', async () => {
    const t = (await admin.get(`/api/publishing/editions/${ed}`)).body;
    const tg = t.components.filter((c: any) => c.type === 'TEACHER_GUIDE');
    for (const c of tg) expect(c.visibleTo).toBe('TEACHER');
  });
});
