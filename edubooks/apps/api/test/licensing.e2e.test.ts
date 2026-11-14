import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login, ownerPool } from './helpers';

type Agent = Awaited<ReturnType<typeof login>>;

describe('Phase 3 — products, orders & licensing rules', () => {
  let app: INestApplication;
  let admin: Agent; let sales: Agent; let editor: Agent;
  let products: any[]; let editions: any[];
  let schoolId: string; let ayId: string; let principal: Agent;
  let bundleVersion: string; let englishVersion: string;
  const owner = ownerPool();

  beforeAll(async () => {
    app = await createApp();
    [admin, sales, editor] = await Promise.all([login(app, 'admin', 'Admin@12345'), login(app, 'sales', 'Admin@12345'), login(app, 'editor', 'Admin@12345')]);
    products = (await admin.get('/api/commerce/products')).body.items;
    editions = (await admin.get('/api/commerce/sellable-editions')).body;
    bundleVersion = products.find((p) => p.sku === 'KG-BUNDLE').active.id;
    englishVersion = products.find((p) => p.sku === 'KG-ENG').active.id;
  });
  afterAll(async () => { await owner.end(); await app.close(); });

  describe('products & bundles', () => {
    it('validates product composition', async () => {
      const two = editions.slice(0, 2).map((e) => e.id);
      expect((await editor.post('/api/commerce/products').send({ sku: 'X1', name: 'Bad single', kind: 'SINGLE', editionIds: two })).status).toBe(400);
      expect((await editor.post('/api/commerce/products').send({ sku: 'X2', name: 'Bad bundle', kind: 'BUNDLE', editionIds: [two[0]] })).status).toBe(400);
      expect((await sales.post('/api/commerce/products').send({ sku: 'X3', name: 'No', kind: 'SINGLE', editionIds: [two[0]] })).status).toBe(403);
    });

    it('freezes an activated version (API and database trigger), new versions are drafts', async () => {
      const p = (await editor.post('/api/commerce/products').send({ sku: 'KG-DUO', name: 'KG English + Maths', kind: 'BUNDLE', editionIds: editions.slice(0, 2).map((e) => e.id), priceMinor: 400000 })).body;
      expect((await editor.post(`/api/commerce/versions/${p.draftVersionId}/activate`)).status).toBe(201);
      const r = await editor.patch(`/api/commerce/versions/${p.draftVersionId}`).send({ priceMinor: 1 });
      expect(r.status).toBe(409);
      await expect(owner.query(`DELETE FROM bundle_items WHERE product_version_id = $1`, [p.draftVersionId])).rejects.toThrow(/frozen|cannot change/);
      await expect(owner.query(`UPDATE product_versions SET price_minor = 5 WHERE id = $1`, [p.draftVersionId])).rejects.toThrow(/frozen/);
      const v2 = (await editor.post(`/api/commerce/products/${p.id}/versions`).send({})).body;
      expect(v2).toMatchObject({ versionNo: 2, status: 'DRAFT', priceMinor: 400000 });
      await editor.patch(`/api/commerce/versions/${v2.id}`).send({ editionIds: editions.slice(0, 3).map((e) => e.id) });
      await editor.post(`/api/commerce/versions/${v2.id}/activate`);
      const full = (await editor.get(`/api/commerce/products/${p.id}`)).body;
      expect(full.versions.map((v: any) => [v.versionNo, v.status, v.items.length])).toEqual([[2, 'ACTIVE', 3], [1, 'RETIRED', 2]]);
    });
  });

  describe('school registration, orders and fulfilment', () => {
    it('registers a school with its first admin and academic year', async () => {
      const r = await sales.post('/api/schools').send({ name: 'Test Valley School', code: 'tvs01', city: 'Multan', adminName: 'Head Teacher', adminUsername: 'head', adminPassword: 'Head@12345' });
      expect(r.status).toBe(201);
      schoolId = r.body.id;
      expect(r.body.code).toBe('TVS01');
      const now = new Date(); const end = new Date(now.getTime() + 300 * 864e5);
      ayId = (await sales.post(`/api/schools/${schoolId}/academic-years`).send({ name: '2026–27', startsOn: now.toISOString(), endsOn: end.toISOString() })).body.id;
      principal = await login(app, 'head', 'Head@12345', 'TVS01');
    });

    it('order lifecycle: draft → confirmed → fulfilled; seats are materialised and traceable', async () => {
      const o = await sales.post('/api/commerce/orders').send({ schoolId, academicYearId: ayId, type: 'NEW', lines: [
        { productVersionId: bundleVersion, studentQty: 3, teacherQty: 1 }, { productVersionId: englishVersion, studentQty: 2, teacherQty: 0 },
      ] });
      expect(o.status).toBe(201);
      expect((await sales.post(`/api/commerce/orders/${o.body.id}/fulfil`)).status).toBe(403); // only publisher admins issue licences
      expect((await admin.post(`/api/commerce/orders/${o.body.id}/fulfil`)).status).toBe(409); // must be confirmed first
      await sales.post(`/api/commerce/orders/${o.body.id}/confirm`);
      const f = await admin.post(`/api/commerce/orders/${o.body.id}/fulfil`);
      expect(f.body.seatsIssued).toBe(6);
      expect((await admin.post(`/api/commerce/orders/${o.body.id}/fulfil`)).status).toBe(409);
      expect((await sales.post(`/api/commerce/orders/${o.body.id}/cancel`)).status).toBe(409);
      const { rows } = await owner.query(`SELECT p.quantity, count(s.*)::int AS seats, p.fulfillment_id IS NOT NULL AS traced FROM license_pools p
        JOIN license_seats s ON s.pool_id = p.id WHERE p.school_id = $1 GROUP BY p.id ORDER BY p.quantity`, [schoolId]);
      expect(rows).toEqual([{ quantity: 1, seats: 1, traced: true }, { quantity: 2, seats: 2, traced: true }, { quantity: 3, seats: 3, traced: true }]);
    });

    it('rejects pools without a source and orders using draft/retired versions', async () => {
      await expect(owner.query(`INSERT INTO license_pools(publisher_id, school_id, academic_year_id, product_version_id, seat_type, quantity, valid_from, valid_until)
        SELECT publisher_id, school_id, academic_year_id, product_version_id, seat_type, 5, valid_from, valid_until FROM license_pools LIMIT 1`)).rejects.toThrow(/pool_source_ck/);
      const retired = (await owner.query(`SELECT id FROM product_versions WHERE status='RETIRED' LIMIT 1`)).rows[0].id;
      expect((await sales.post('/api/commerce/orders').send({ schoolId, academicYearId: ayId, type: 'ADDITIONAL', lines: [{ productVersionId: retired, studentQty: 1, teacherQty: 0 }] })).status).toBe(400);
    });
  });

  describe('seat allocation by the school', () => {
    let students: any[]; let teacher: any; let bundlePool: any; let teacherPool: any; let englishPool: any;
    beforeAll(async () => {
      const created = (await principal.post('/api/school/users').send({ role: 'STUDENT', users: [1, 2, 3, 4, 5].map((i) => ({ displayName: `Kid ${i}` })) })).body;
      students = created;
      teacher = (await principal.post('/api/school/users/import').send({ role: 'TEACHER', csv: 'name,username\n"Miss Noor",noor' })).body[0];
      const pools = (await principal.get('/api/school/pools')).body;
      bundlePool = pools.find((p: any) => p.sku === 'KG-BUNDLE' && p.seatType === 'STUDENT');
      teacherPool = pools.find((p: any) => p.sku === 'KG-BUNDLE' && p.seatType === 'TEACHER');
      englishPool = pools.find((p: any) => p.sku === 'KG-ENG');
    });

    it('creates accounts with generated usernames & one-time passwords (CSV import too)', () => {
      expect(students.map((s) => s.username)).toEqual(['kid1', 'kid2', 'kid3', 'kid4', 'kid5']);
      expect(students[0].password).toMatch(/^[a-z]{4}[2-9]{4}$/);
      expect(teacher.username).toBe('noor');
    });

    it('cannot exceed purchased quantity; all-or-nothing', async () => {
      const r = await principal.post(`/api/school/pools/${bundlePool.id}/assign`).send({ userIds: students.slice(0, 4).map((s) => s.id) });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/No student seats left/);
      expect((await principal.get(`/api/school/pools/${bundlePool.id}`)).body.assigned).toBe(0);
    });

    it('two simultaneous requests can never take the same seat or overflow the pool', async () => {
      const results = await Promise.all(students.map((s) => principal.post(`/api/school/pools/${bundlePool.id}/assign`).send({ userIds: [s.id] })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      const { rows } = await owner.query(`SELECT count(DISTINCT seat_id)::int AS seats, count(*)::int AS live FROM license_assignments WHERE pool_id = $1 AND status = 'ACTIVE'`, [bundlePool.id]);
      expect(rows[0]).toEqual({ seats: 3, live: 3 });
    });

    it('seat type must match the role; one seat per person per pool', async () => {
      expect((await principal.post(`/api/school/pools/${teacherPool.id}/assign`).send({ userIds: [students[4].id] })).status).toBe(400);
      expect((await principal.post(`/api/school/pools/${teacherPool.id}/assign`).send({ userIds: [teacher.id] })).status).toBe(201);
      const holder = (await principal.get(`/api/school/pools/${bundlePool.id}`)).body.assignments[0];
      expect((await principal.post(`/api/school/pools/${englishPool.id}/assign`).send({ userIds: [holder.userId, holder.userId] })).status).toBe(201);
      expect((await principal.post(`/api/school/pools/${englishPool.id}/assign`).send({ userIds: [holder.userId] })).status).toBe(409);
    });

    it('a bundle seat unlocks every included book; duplicate grants appear once in the library', async () => {
      const holder = (await principal.get(`/api/school/pools/${englishPool.id}`)).body.assignments[0];
      const kid = students.find((s) => s.id === holder.userId);
      const k = await login(app, kid.username, kid.password, 'TVS01');
      const lib = (await k.get('/api/library')).body;
      expect(lib.map((b: any) => b.title).sort()).toEqual(['KG English', 'KG General Knowledge', 'KG Maths', 'KG Urdu']);
    });

    it('cannot assign users from another school', async () => {
      const other = (await owner.query(`SELECT u.id FROM users u JOIN schools s ON s.id = u.school_id WHERE s.code = 'SUN01' AND u.username = 'student3'`)).rows[0].id;
      expect((await principal.post(`/api/school/pools/${englishPool.id}/assign`).send({ userIds: [other] })).status).toBe(400);
    });

    it('licence content access: teachers see teacher resources; students only student/ALL resources', async () => {
      const t = await login(app, 'noor', teacher.password, 'TVS01');
      const assets = (await owner.query(`SELECT DISTINCT ON (r.audience) r.audience, r.asset_id FROM teaching_resources r JOIN book_editions e ON e.id = r.edition_id
        JOIN book_packages p ON p.id = e.package_id WHERE p.title = 'KG English'`)).rows;
      const teacherOnly = assets.find((a: any) => a.audience === 'TEACHER').asset_id; const forAll = assets.find((a: any) => a.audience === 'ALL').asset_id;
      expect((await t.get(`/api/assets/${teacherOnly}/link`)).status).toBe(200);
      const kidHolder = (await principal.get(`/api/school/pools/${bundlePool.id}`)).body.assignments[0];
      const kid = students.find((s) => s.id === kidHolder.userId);
      const k = await login(app, kid.username, kid.password, 'TVS01');
      expect((await k.get(`/api/assets/${teacherOnly}/link`)).status).toBe(403);
      expect((await k.get(`/api/assets/${forAll}/link`)).status).toBe(200);
    });

    it('student seats move only through publisher-approved transfers; the same seat keeps its history', async () => {
      const pool = (await principal.get(`/api/school/pools/${bundlePool.id}`)).body;
      const from = pool.assignments.find((a: any) => a.status === 'ACTIVE');
      const holderIds = pool.assignments.map((a: any) => a.userId);
      const to = students.find((s) => !holderIds.includes(s.id));
      expect((await principal.post(`/api/school/assignments/${from.id}/release`).send({})).status).toBe(403);
      const t = await principal.post('/api/school/transfers').send({ assignmentId: from.id, toUserId: to.id, reason: 'Student moved to another city' });
      expect(t.status).toBe(201);
      expect((await principal.post('/api/school/transfers').send({ assignmentId: from.id, toUserId: to.id, reason: 'again' })).status).toBe(409);
      expect((await principal.post(`/api/licensing/transfers/${t.body.id}/approve`).send({})).status).toBe(403);
      expect((await admin.post(`/api/licensing/transfers/${t.body.id}/approve`).send({ note: 'ok' })).status).toBe(201);
      const after = (await principal.get(`/api/school/pools/${bundlePool.id}`)).body;
      const old = after.assignments.find((a: any) => a.id === from.id);
      const neu = after.assignments.find((a: any) => a.userId === to.id && a.status === 'ACTIVE');
      expect(old.status).toBe('TRANSFERRED');
      expect(neu.seatNo).toBe(old.seatNo);
      const fromKid = students.find((s) => s.id === from.userId);
      const toKid = students.find((s) => s.id === to.id);
      expect((await (await login(app, toKid.username, toKid.password, 'TVS01')).get('/api/library')).body.length).toBe(4);
      const fromLib = (await (await login(app, fromKid.username, fromKid.password, 'TVS01')).get('/api/library')).body;
      expect(fromLib.some((b: any) => b.title === 'KG Urdu')).toBe(false);
    });

    it('teacher seats can be released by the school; capacity returns', async () => {
      const pool = (await principal.get(`/api/school/pools/${teacherPool.id}`)).body;
      expect((await principal.post(`/api/school/assignments/${pool.assignments[0].id}/release`).send({ reason: 'Left school' })).status).toBe(201);
      expect((await principal.get(`/api/school/pools/${teacherPool.id}`)).body.available).toBe(1);
    });

    it('suspending a pool blocks access immediately; reactivating restores it', async () => {
      const holder = (await principal.get(`/api/school/pools/${bundlePool.id}`)).body.assignments.find((a: any) => a.status === 'ACTIVE');
      const kid = students.find((s) => s.id === holder.userId);
      const k = await login(app, kid.username, kid.password, 'TVS01');
      await admin.post(`/api/licensing/pools/${bundlePool.id}/suspend`).send({ reason: 'Payment overdue' });
      expect((await k.get('/api/library')).body.some((b: any) => b.title === 'KG Urdu')).toBe(false);
      expect((await principal.post(`/api/school/pools/${bundlePool.id}/assign`).send({ userIds: [students[4].id] })).status).toBe(409);
      await admin.post(`/api/licensing/pools/${bundlePool.id}/reactivate`);
      expect((await k.get('/api/library')).body.length).toBe(4);
    });

    it('licences expire automatically at the end of the period (access stops even before the job runs); history is kept', async () => {
      const holder = (await principal.get(`/api/school/pools/${englishPool.id}`)).body.assignments[0];
      const kid = students.find((s) => s.id === holder.userId);
      const k = await login(app, kid.username, kid.password, 'TVS01');
      await owner.query(`UPDATE license_pools SET valid_until = now() - interval '1 second', valid_from = now() - interval '2 days' WHERE school_id = $1`, [schoolId]);
      expect((await k.get('/api/library')).body).toEqual([]);
      const r = await admin.post('/api/licensing/run-expiry');
      expect(r.body.expiredPools).toBeGreaterThanOrEqual(3);
      const pool = (await principal.get(`/api/school/pools/${englishPool.id}`)).body;
      expect(pool.status).toBe('EXPIRED');
      expect(pool.assignments.every((a: any) => a.status === 'EXPIRED')).toBe(true);
      expect((await principal.post(`/api/school/pools/${englishPool.id}/assign`).send({ userIds: [students[4].id] })).status).toBe(409);
    });

    it('adjustments create traceable seats; renewal orders issue a new period', async () => {
      const now = new Date(); const end = new Date(now.getTime() + 365 * 864e5);
      const ay2 = (await sales.post(`/api/schools/${schoolId}/academic-years`).send({ name: '2027–28', startsOn: now.toISOString(), endsOn: end.toISOString() })).body.id;
      const adj = await admin.post('/api/licensing/adjustments').send({ schoolId, academicYearId: ay2, productVersionId: englishVersion, seatType: 'TEACHER', quantity: 2, kind: 'COMPLIMENTARY', reason: 'Free teacher copies' });
      expect(adj.status).toBe(201);
      const o = (await sales.post('/api/commerce/orders').send({ schoolId, academicYearId: ay2, type: 'RENEWAL', lines: [{ productVersionId: bundleVersion, studentQty: 5, teacherQty: 0 }] })).body;
      await sales.post(`/api/commerce/orders/${o.id}/confirm`); await admin.post(`/api/commerce/orders/${o.id}/fulfil`);
      const dash = (await principal.get('/api/school/overview')).body.licences;
      expect(dash.students.available).toBe(5);
      expect(dash.teachers.available).toBe(2);
      expect(dash.students.expired).toBeGreaterThan(0);
    });
  });

  describe('isolation & safety', () => {
    it('a school admin cannot read another school\'s pools or create publisher accounts', async () => {
      const sun = await login(app, 'principal', 'School@12345', 'SUN01');
      const sunPools = (await sun.get('/api/school/pools')).body;
      expect(sunPools.length).toBeGreaterThan(0);
      const tvsPool = (await owner.query(`SELECT id FROM license_pools WHERE school_id = $1 LIMIT 1`, [schoolId])).rows[0].id;
      expect((await sun.get(`/api/school/pools/${tvsPool}`)).status).toBe(404);
      expect((await sun.post('/api/school/users').send({ role: 'PUBLISHER_ADMIN', users: [{ displayName: 'Evil' }] })).status).toBe(400);
      expect((await sun.get('/api/licensing/pools')).status).toBe(403);
      expect((await sun.post('/api/school/profile' as any)).status).toBe(404); // PATCH only
      expect((await sun.patch('/api/school/profile').send({ phone: '042-123' })).status).toBe(200);
    });

    it('sales can create an instant demo school that works and expires', async () => {
      const r = await sales.post('/api/schools/demo').send({ name: 'Prospect School', productVersionIds: [bundleVersion], days: 7 });
      expect(r.status).toBe(201);
      const kid = r.body.logins.find((l: any) => l.role === 'Student');
      const k = await login(app, kid.username, kid.password, r.body.code);
      expect((await k.get('/api/library')).body).toHaveLength(4);
      await owner.query(`UPDATE schools SET demo_expires_at = now() - interval '1 minute' WHERE code = $1`, [r.body.code]);
      expect((await k.get('/api/library')).status).toBe(401);
      const again = await request(app.getHttpServer()).post('/api/auth/login').send({ username: kid.username, password: kid.password, schoolCode: r.body.code });
      expect(again.status).toBe(403);
    });

    it('every licence change is audited', async () => {
      const r = await admin.get(`/api/audit?schoolId=${schoolId}&action=licensing&pageSize=100`);
      const actions = new Set(r.body.items.map((x: any) => x.action));
      ['licensing.order.fulfil', 'licensing.seat.assign', 'licensing.transfer.request', 'licensing.transfer.approve', 'licensing.seat.release',
        'licensing.pool.suspend', 'licensing.pool.reactivate', 'licensing.pool.expire', 'licensing.adjustment.create'].forEach((a) => expect(actions).toContain(a));
    });
  });
});
