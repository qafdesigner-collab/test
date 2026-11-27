import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('School admin undoes a book given to a student by mistake', () => {
  let app: INestApplication; let principal: any;
  beforeAll(async () => { app = await createApp(); principal = await login(app, 'principal', 'School@12345', 'SUN01'); });
  afterAll(async () => { await app.close(); });

  it('gives a student seat, then takes it back; the seat is free again', async () => {
    const pools = (await principal.get('/api/school/pools')).body; const list = pools.items ?? pools;
    const pool = list.find((p: any) => p.seatType === 'STUDENT' && p.status === 'ACTIVE');
    const eligible = (await principal.get(`/api/school/pools/${pool.id}/eligible`)).body; const e = (eligible.items ?? eligible).find((u: any) => !u.hasSeat && !u.assigned) ?? (eligible.items ?? eligible)[0];
    expect(e).toBeTruthy();
    const r = await principal.post(`/api/school/pools/${pool.id}/assign`).send({ userIds: [e.id] });
    expect(r.status).toBe(201);
    const p = (await principal.get(`/api/school/pools/${pool.id}`)).body; expect(p.undoDays).toBe(7);
    const a = p.assignments.find((x: any) => x.userId === e.id && x.status === 'ACTIVE');
    expect((await principal.post(`/api/school/assignments/${a.id}/release`).send({})).status).toBe(201);
    const after = (await principal.get(`/api/school/pools/${pool.id}`)).body.assignments.find((x: any) => x.id === a.id);
    expect(after.status).toBe('RELEASED'); expect(after.endReason).toBe('Undone by school');
  });
});
