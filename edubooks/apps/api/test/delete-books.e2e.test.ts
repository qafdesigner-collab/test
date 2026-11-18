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
  it('edits a product: name, code and description; an unsold active version can change price and books', async () => {
    const eds = (await admin.get('/api/commerce/sellable-editions')).body; const list = eds.items ?? eds;
    const p = (await admin.post('/api/commerce/products').send({ kind: 'BUNDLE', sku: `ED-${Date.now() % 100000}`, name: 'Edit me', priceMinor: 1000, editionIds: list.slice(0, 2).map((e: any) => e.id ?? e.editionId) })).body;
    expect((await admin.patch(`/api/commerce/products/${p.id}`).send({ name: 'Edited name', sku: `${p.sku}-X`, description: 'New text' })).status).toBe(200);
    expect((await admin.patch(`/api/commerce/products/${p.id}`).send({ sku: 'KG-ENG' })).status).toBe(409);
    expect((await admin.post(`/api/commerce/versions/${p.draftVersionId}/activate`)).status).toBe(201);
    expect((await admin.patch(`/api/commerce/versions/${p.draftVersionId}`).send({ priceMinor: 2500, editionIds: list.slice(0, 3).map((e: any) => e.id ?? e.editionId) })).status).toBe(200);
    const full = (await admin.get(`/api/commerce/products/${p.id}`)).body;
    expect(full).toMatchObject({ name: 'Edited name', description: 'New text' }); expect(full.versions[0]).toMatchObject({ priceMinor: 2500, status: 'ACTIVE', sold: false });
    expect(full.versions[0].items.length).toBe(3);
    await admin.delete(`/api/commerce/products/${p.id}`);
  });
});
