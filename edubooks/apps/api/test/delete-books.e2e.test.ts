import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('Deleting books and products', () => {
  let app: INestApplication; let admin: any; let sales: any;
  beforeAll(async () => { app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); sales = await login(app, 'sales1', 'Admin@12345').catch(() => null); });
  afterAll(async () => { await app.close(); });

  it('deletes a book nobody uses, with its editions and parts; a book schools have licences for is kept', async () => {
    const grades = (await admin.get('/api/catalog/grades')).body; const subjects = (await admin.get('/api/catalog/subjects')).body;
    const g = grades.items ?? grades; const s = subjects.items ?? subjects;
    const pkg = (await admin.post('/api/publishing/packages').send({ title: 'Book to delete', gradeId: g[0].id, subjectId: s[0].id, editionLabel: '2026 Edition', editionYear: 2026, standardStructure: true })).body;
    expect((await admin.delete(`/api/publishing/packages/${pkg.id}`)).status).toBe(200);
    expect((await admin.get(`/api/publishing/packages/${pkg.id}`)).status).toBe(404);
    expect((await admin.get(`/api/publishing/editions/${pkg.editionId}`)).status).toBe(404);
    // the seeded books are licensed to schools
    const used = (await admin.get('/api/publishing/packages')).body.items.find((p: any) => p.status === 'PUBLISHED');
    const r = await admin.delete(`/api/publishing/packages/${used.id}`);
    expect(r.status).toBe(409); expect(r.body.message).toMatch(/licences|product/);
  });

  it('deletes a product that was never ordered; an ordered product is kept', async () => {
    const eds = (await admin.get('/api/commerce/sellable-editions')).body; const e = (eds.items ?? eds)[0];
    const p = await admin.post('/api/commerce/products').send({ kind: 'SINGLE', sku: `DEL-${Date.now() % 100000}`, name: 'Product to delete', priceMinor: 1000, editionIds: [e.id ?? e.editionId] });
    expect(p.status).toBe(201);
    expect((await admin.delete(`/api/commerce/products/${p.body.id}`)).status).toBe(200);
    expect((await admin.get(`/api/commerce/products/${p.body.id}`)).status).toBe(404);
    const orders = (await admin.get('/api/commerce/orders')).body.items; const o = (await admin.get(`/api/commerce/orders/${orders[0].id}`)).body;
    const prods = (await admin.get('/api/commerce/products')).body.items; const ordered = prods.find((x: any) => x.sku === o.lines[0].sku);
    const r = await admin.delete(`/api/commerce/products/${ordered.id}`); expect(r.status).toBe(409); expect(r.body.message).toMatch(/ordered or licensed/);
  });
});
