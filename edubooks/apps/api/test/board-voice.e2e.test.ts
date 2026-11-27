import { createApp, login, ownerPool } from './helpers';

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(1500, 2)]);

describe('Whiteboard: the teacher speaks live, students in the class hear it', () => {
  let app: any; let teacher: any; let student: any; let id: string;
  beforeAll(async () => {
    app = await createApp(); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
    const kg = (await teacher.get('/api/classes?mine=true')).body[0].id;
    id = (await teacher.post('/api/whiteboards').send({ classId: kg, title: 'Voice test' })).body.id;
  });
  afterAll(async () => { const o = ownerPool(); await o.query('DELETE FROM whiteboards WHERE id = $1', [id]); await o.end(); await app.close(); });

  it('sends 2-second pieces; students list and play them; nothing after the end', async () => {
    expect((await student.post(`/api/whiteboards/${id}/voice`).attach('file', WEBM, 'v.webm')).status).toBe(403);
    expect((await teacher.post(`/api/whiteboards/${id}/voice`).attach('file', Buffer.from('not sound at all, sorry'), 'v.webm')).status).toBe(400);
    const a = (await teacher.post(`/api/whiteboards/${id}/voice`).attach('file', WEBM, 'v.webm')).body;
    const b = (await teacher.post(`/api/whiteboards/${id}/voice`).attach('file', WEBM, 'v.webm')).body;
    expect(b.seq).toBeGreaterThan(a.seq);
    const l = (await student.get(`/api/whiteboards/${id}/voice?after=0`)).body;
    expect(l.speaking).toBe(true); expect(l.pieces.map((p: any) => p.seq)).toEqual([a.seq, b.seq]);
    expect((await student.get(`/api/whiteboards/${id}/voice?after=${a.seq}`)).body.pieces).toHaveLength(1);
    const p = await student.get(`/api/whiteboards/${id}/voice/${a.seq}`);
    expect(p.status).toBe(200); expect(p.headers['content-type']).toContain('audio/webm');
    await teacher.post(`/api/whiteboards/${id}/end`);
    expect((await teacher.post(`/api/whiteboards/${id}/voice`).attach('file', WEBM, 'v.webm')).status).toBe(400);
  });
});
