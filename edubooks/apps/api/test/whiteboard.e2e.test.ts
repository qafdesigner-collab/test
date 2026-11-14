import { INestApplication } from '@nestjs/common';
import { createApp, login, ownerPool } from './helpers';

describe('Live whiteboard', () => {
  let app: INestApplication; const owner = ownerPool();
  let teacher: any; let student: any; let classId: string; let boardId: string;
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    student = await login(app, 'student1', 'Student@123', 'SUN01');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
  });
  afterAll(async () => { await owner.end(); await app.close(); });

  it('a teacher starts a board for their class; students of the class see it live', async () => {
    const r = await teacher.post('/api/whiteboards').send({ classId, title: 'Letter B' });
    expect(r.status).toBe(201); expect(r.body.live).toBe(true);
    boardId = r.body.id;
    const live = (await student.get('/api/whiteboards')).body;
    expect(live.map((b: any) => b.id)).toContain(boardId);
  });

  it('strokes written by the teacher reach the student in order, from any point', async () => {
    const w = await teacher.post(`/api/whiteboards/${boardId}/ops`).send({ ops: [
      { kind: 'pts', data: { id: 's1', c: '#2563eb', w: 4, t: 'pen', p: [[0.1, 0.1], [0.2, 0.25]] } },
      { kind: 'pts', data: { id: 's1', c: '#2563eb', w: 4, t: 'pen', p: [[0.3, 0.4]] } },
      { kind: 'text', data: { id: 't1', x: 0.5, y: 0.5, s: 'B is for ball', c: '#dc2626', w: 32 } },
    ] });
    expect(w.status).toBe(200); expect(w.body.seq).toBe(3);
    const all = (await student.get(`/api/whiteboards/${boardId}/ops?after=0`)).body;
    expect(all.ops.map((o: any) => o.seq)).toEqual([1, 2, 3]);
    expect(all.ops[2].data.s).toBe('B is for ball');
    await teacher.post(`/api/whiteboards/${boardId}/ops`).send({ ops: [{ kind: 'undo', data: { id: 't1' } }] });
    const fresh = (await student.get(`/api/whiteboards/${boardId}/ops?after=3`)).body;
    expect(fresh.ops).toEqual([{ seq: 4, kind: 'undo', data: { id: 't1' } }]);
  });

  it('shapes and blank pages; the teacher sees who is watching', async () => {
    const w = await teacher.post(`/api/whiteboards/${boardId}/ops`).send({ ops: [
      { kind: 'shape', data: { id: 'sh1', s: 'arrow', a: [0.1, 0.1], b: [0.5, 0.4], c: '#16a34a', w: 4 } },
      { kind: 'bg', data: { componentId: null, page: 2 } },
      { kind: 'shape', data: { id: 'sh2', s: 'ellipse', a: [0.2, 0.2], b: [0.3, 0.3], c: '#dc2626', w: 3, f: true } },
    ] });
    expect(w.status).toBe(200);
    expect((await teacher.post(`/api/whiteboards/${boardId}/ops`).send({ ops: [{ kind: 'shape', data: { id: 'x', s: 'star', a: [0, 0], b: [1, 1] } }] })).status).toBe(400);
    const got = (await student.get(`/api/whiteboards/${boardId}/ops?after=4`)).body.ops;
    expect(got.map((o: any) => o.kind)).toEqual(['shape', 'bg', 'shape']);
    expect(got[2].data).toMatchObject({ s: 'ellipse', f: true });
    const wt = (await teacher.get(`/api/whiteboards/${boardId}/watchers`)).body;
    expect(wt.watching).toBeGreaterThanOrEqual(1); expect(wt.names).toContain('Sample Student 1');
    expect((await student.get(`/api/whiteboards/${boardId}/watchers`)).status).toBe(403);
  });

  it('rejects bad drawing data and writes by students', async () => {
    expect((await teacher.post(`/api/whiteboards/${boardId}/ops`).send({ ops: [{ kind: 'pts', data: { id: 's2', p: [[5, 5]] } }] })).status).toBe(400);
    expect((await teacher.post(`/api/whiteboards/${boardId}/ops`).send({ ops: [{ kind: 'script', data: {} }] })).status).toBe(400);
    expect((await student.post(`/api/whiteboards/${boardId}/ops`).send({ ops: [{ kind: 'clear', data: {} }] })).status).toBe(403);
  });

  it('other schools cannot see it; ending it hides it from students', async () => {
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.get(`/api/whiteboards/${boardId}`)).status).toBe(404);
    expect((await teacher.post(`/api/whiteboards/${boardId}/end`)).body.live).toBe(false);
    expect((await student.get('/api/whiteboards')).body.map((b: any) => b.id)).not.toContain(boardId);
    expect((await teacher.post(`/api/whiteboards/${boardId}/ops`).send({ ops: [{ kind: 'clear', data: {} }] })).status).toBe(400);
  });
});
