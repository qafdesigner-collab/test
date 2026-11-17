import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('Switching a book off for one school, or removing it from the school', () => {
  let app: INestApplication; let admin: any; let teacher: any; let student: any; let principal: any; let editor: any; let school: string;
  beforeAll(async () => {
    app = await createApp();
    admin = await login(app, 'admin', 'Admin@12345'); editor = await login(app, 'editor', 'Admin@12345');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01'); principal = await login(app, 'principal', 'School@12345', 'SUN01');
    school = (await admin.get('/api/schools?search=SUN01')).body.items.find((s: any) => s.code === 'SUN01').id;
  });
  afterAll(async () => { await app.close(); });

  it('lists the school\'s books; off / removed closes the book for everyone at that school; on again gives it back', async () => {
    const books = (await admin.get(`/api/schools/${school}/books`)).body;
    expect(books.length).toBeGreaterThan(0);
    const ed = (await teacher.get('/api/teacher/books')).body[0];
    const book = books.find((b: any) => b.title === ed.title); expect(book).toBeTruthy(); expect(book.block).toBeNull();
    expect((await editor.put(`/api/schools/${school}/books/${book.id}`).send({ status: 'INACTIVE' })).status).toBe(403);
    for (const status of ['INACTIVE', 'REMOVED']) {
      expect((await admin.put(`/api/schools/${school}/books/${book.id}`).send({ status, reason: 'test' })).status).toBe(200);
      expect((await admin.get(`/api/schools/${school}/books`)).body.find((b: any) => b.id === book.id).block).toBe(status);
      for (const who of [teacher, student, principal]) expect((await who.get(`/api/reader/editions/${ed.editionId}`)).status).toBe(403);
      expect((await teacher.get('/api/teacher/books')).body.map((b: any) => b.editionId)).not.toContain(ed.editionId);
    }
    expect((await admin.put(`/api/schools/${school}/books/${book.id}`).send({ status: 'ACTIVE' })).status).toBe(200);
    for (const who of [teacher, student, principal]) expect((await who.get(`/api/reader/editions/${ed.editionId}`)).status).toBe(200);
  });
});
