import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login } from './helpers';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

describe('Company profile, documents, currency and region', () => {
  let app: INestApplication; let admin: any;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); admin = await login(app, 'admin', 'Admin@12345'); });
  afterAll(async () => { await app.close(); });

  it('defaults to dirhams with US dollars, and only the admin changes settings', async () => {
    const pub = (await http().get('/api/company')).body;
    expect(pub.finance).toMatchObject({ currency: 'AED', secondaryCurrency: 'USD', vatRate: 5 });
    expect(pub.region).toMatchObject({ phoneCode: '971', timezone: 'Asia/Dubai' });
    const editor = await login(app, 'editor', 'Admin@12345');
    expect((await editor.put('/api/company/finance').send({ currency: 'AED' })).status).toBe(403);
    expect((await admin.put('/api/company/finance').send({ currency: 'AED', secondaryCurrency: 'AED', rate: 1 })).status).toBe(400);
    expect((await admin.put('/api/company/finance').send({ currency: 'aed' })).status).toBe(400);
    const f = await admin.put('/api/company/finance').send({ currency: 'AED', secondaryCurrency: 'USD', rate: 0.2723, vatRate: 5, taxNumber: '100123456700003' });
    expect(f.body.finance).toMatchObject({ currency: 'AED', rate: 0.2723, taxNumber: '100123456700003' });
    expect((await admin.put('/api/company/region').send({ phoneCode: '971', timezone: 'Mars/Base' })).status).toBe(400);
    expect((await admin.put('/api/company/region').send({ phoneCode: '971', timezone: 'Asia/Dubai' })).status).toBe(200);
    expect((await admin.put('/api/company/profile').send({ website: 'http://x' })).status).toBe(400);
    const c = await admin.put('/api/company/profile').send({ legalName: 'Knowledge Gate Publishing LLC', address: 'Office 12, Al Quoz', city: 'Dubai', country: 'United Arab Emirates',
      phone: '+971 4 123 4567', email: 'info@example.com', website: 'https://example.com', about: 'Educational publisher.', showOnLogin: true });
    expect(c.status).toBe(200);
    expect((await http().get('/api/company')).body.company).toMatchObject({ legalName: 'Knowledge Gate Publishing LLC', city: 'Dubai' });
  });

  it('prices new products in the company currency', async () => {
    const eds = (await admin.get('/api/commerce/sellable-editions')).body;
    const p = await admin.post('/api/commerce/products').send({ kind: 'SINGLE', sku: 'AED-TEST', name: 'Dirham test', priceMinor: 25000, editionIds: [eds[0].id ?? eds[0].editionId] });
    expect(p.status).toBe(201);
    const prod = (await admin.get(`/api/commerce/products/${p.body.id}`)).body;
    expect(prod.versions[0].currency).toBe('AED');
    expect((await admin.get('/api/sales/dashboard')).body.currency).toBe('AED');
  });

  it('stores company documents with visibility for the public, schools or staff', async () => {
    expect((await admin.post('/api/company/documents').attach('file', Buffer.from('<svg/>'), 'x.svg')).status).toBe(400);
    const pub = await admin.post('/api/company/documents').field('title', 'Company profile').field('category', 'PROFILE').field('visibility', 'PUBLIC').attach('file', PDF, 'profile.pdf');
    expect(pub.status).toBe(201);
    const staff = await admin.post('/api/company/documents').field('title', 'Internal price list').field('category', 'PRICE_LIST').field('visibility', 'STAFF').attach('file', Buffer.concat([PDF, Buffer.from('%staff')]), 'prices.pdf');
    expect(staff.status).toBe(201);
    expect((await http().get('/api/company')).body.documents.map((d: any) => d.title)).toEqual(['Company profile']);
    const file = await http().get(`/api/company/public-documents/${pub.body.id}`);
    expect([file.status, file.headers['content-type']]).toEqual([200, 'application/pdf']);
    expect((await http().get(`/api/company/public-documents/${staff.body.id}`)).status).toBe(404);
    const teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    expect((await teacher.get('/api/company/documents')).body.map((d: any) => d.title)).toEqual(['Company profile']);
    expect((await teacher.get(`/api/company/documents/${staff.body.id}/file`)).status).toBe(404);
    expect((await teacher.delete(`/api/company/documents/${pub.body.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/company/documents/${staff.body.id}`)).status).toBe(200);
  });
});
