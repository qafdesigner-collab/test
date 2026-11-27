import { createApp, login, ownerPool } from './helpers';

describe('Sales team: the super admin assigns schools; a salesperson sees only their schools and orders', () => {
  let app: any; let admin: any; let sales: any; let sun: any; let gvs: any; const owner = ownerPool(); let salesId: string;
  beforeAll(async () => {
    app = await createApp();
    admin = await login(app, 'admin', 'Admin@12345'); sales = await login(app, 'sales', 'Admin@12345');
    sun = (await admin.get('/api/schools?search=SUN01')).body.items[0]; gvs = (await admin.get('/api/schools?search=GVS02')).body.items[0];
    salesId = (await admin.get('/api/schools/sales-team')).body.find((t: any) => t.username === 'sales').id;
  });
  afterAll(async () => { await owner.query(`UPDATE schools SET sales_owner_id = NULL WHERE code IN ('SUN01','GVS02')`); await owner.end(); await app.close(); });

  it('only the super admin assigns; a salesperson then sees just that school', async () => {
    expect((await sales.put('/api/schools/sales-owner').send({ schoolIds: [sun.id], userId: salesId })).status).toBe(403);
    expect((await admin.put('/api/schools/sales-owner').send({ schoolIds: [sun.id], userId: salesId })).body.updated).toBe(1);
    const mine = (await sales.get('/api/schools?pageSize=100')).body.items.map((s: any) => s.code);
    expect(mine).toContain('SUN01'); expect(mine).not.toContain('GVS02');
    expect((await sales.get(`/api/schools/${gvs.id}`)).status).toBe(403);
    expect((await sales.get(`/api/schools/${sun.id}`)).status).toBe(200);
    const all = (await admin.get('/api/schools?pageSize=100')).body.items;
    expect(all.find((s: any) => s.id === sun.id)).toMatchObject({ salesOwnerId: salesId, salesOwnerName: expect.any(String) });
    expect(all.some((s: any) => s.code === 'GVS02')).toBe(true); // the super admin still sees everything
    expect((await admin.get(`/api/schools?salesOwnerId=${salesId}`)).body.items.map((s: any) => s.code)).toEqual(['SUN01']);
  });

  it('orders, licences and the sales dashboard show only their schools', async () => {
    const orders = (await sales.get('/api/commerce/orders?pageSize=100')).body.items;
    expect(orders.every((o: any) => o.school.code === 'SUN01')).toBe(true);
    const gvsOrder = (await admin.get(`/api/commerce/orders?schoolId=${gvs.id}`)).body.items[0];
    if (gvsOrder) expect((await sales.get(`/api/commerce/orders/${gvsOrder.id}`)).status).toBe(403);
    const pools = (await sales.get('/api/licensing/pools')).body;
    expect(pools.every((p: any) => p.schoolCode === 'SUN01')).toBe(true);
    const gvsPool = (await admin.get(`/api/licensing/pools?schoolId=${gvs.id}`)).body[0];
    if (gvsPool) expect((await sales.get(`/api/licensing/pools/${gvsPool.id}`)).status).toBe(403);
    const d = (await sales.get('/api/sales/dashboard')).body;
    expect(d.topSchools.every((s: any) => s.code === 'SUN01')).toBe(true);
    // taken back: the school disappears for the salesperson
    await admin.put('/api/schools/sales-owner').send({ schoolIds: [sun.id], userId: null });
    expect((await sales.get('/api/schools?pageSize=100')).body.items.map((s: any) => s.code)).not.toContain('SUN01');
  });
});
