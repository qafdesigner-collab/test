import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('Sales dashboard', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); });

  it('summarises revenue, seats, cities and follow-ups for admin and sales staff only', async () => {
    const sales = await login(app, 'sales', 'Admin@12345');
    const r = await sales.get('/api/sales/dashboard');
    expect(r.status).toBe(200);
    const d = r.body;
    expect(d.kpis).toMatchObject({ revenue: expect.any(Number), orders: expect.any(Number), liveSeats: expect.any(Number), activeSchools: expect.any(Number) });
    expect(d.monthly.length).toBeGreaterThanOrEqual(12);
    expect(d.monthly.reduce((n: number, m: any) => n + m.revenue, 0)).toBe(d.kpis.revenue);
    expect(d.byCity.reduce((n: number, c: any) => n + c.revenue, 0)).toBe(d.kpis.revenue);
    expect(d.byProduct.reduce((n: number, c: any) => n + c.revenue, 0)).toBe(d.kpis.revenue);
    expect(d.kpis.liveSeats).toBeGreaterThan(0);
    for (const k of ['expiring', 'notRenewed', 'lowUsage', 'demos', 'topSchools']) expect(Array.isArray(d[k])).toBe(true);
    expect((await sales.get('/api/sales/dashboard?from=2026-13-01')).status).toBe(400);
    expect((await sales.get('/api/sales/dashboard?from=2026-05-01&to=2026-01-01')).status).toBe(400);
    const editor = await login(app, 'editor', 'Admin@12345');
    expect((await editor.get('/api/sales/dashboard')).status).toBe(403);
    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    expect((await principal.get('/api/sales/dashboard')).status).toBe(403);
  });
});
