import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login, ownerPool, appPool } from './helpers';

describe('Phase 1 — auth, roles, tenant isolation', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); });

  it('rejects wrong passwords with a generic message', async () => {
    const r = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'admin', password: 'nope' });
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/Wrong school code, username or password/);
  });

  it('validates input', async () => {
    const r = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'admin', password: 'x', hack: 1 });
    expect(r.status).toBe(400);
  });

  it('logs in publisher staff without a school code and returns the profile', async () => {
    const a = await login(app, 'admin', 'Admin@12345');
    const me = await a.get('/api/auth/me');
    expect(me.body.roles).toEqual(['PUBLISHER_ADMIN']);
    expect(me.body.school).toBeNull();
  });

  it('school users need the right school code; same username is separate per school', async () => {
    const a = await login(app, 'principal', 'School@12345', 'SUN01');
    expect((await a.get('/api/auth/me')).body.school.code).toBe('SUN01');
    const wrong = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'principal', password: 'School@12345', schoolCode: 'NOPE' });
    expect(wrong.status).toBe(401);
  });

  it('blocks publisher endpoints for teachers (RBAC)', async () => {
    const t = await login(app, 'teacher1', 'Teacher@12345', 'GVS02');
    expect((await t.get('/api/publishing/packages')).status).toBe(403);
    expect((await t.post('/api/catalog/grades').send({ name: 'X' })).status).toBe(403);
  });

  it('suspending a school immediately ends its sessions and blocks login', async () => {
    const a = await login(app, 'teacher1', 'Teacher@12345', 'BFA03');
    expect((await a.get('/api/auth/me')).status).toBe(200);
    const pool = ownerPool();
    await pool.query(`UPDATE schools SET status='SUSPENDED' WHERE code='BFA03'`);
    try {
      expect((await a.get('/api/auth/me')).status).toBe(401);
      const r = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'teacher1', password: 'Teacher@12345', schoolCode: 'BFA03' });
      expect(r.status).toBe(403);
    } finally {
      await pool.query(`UPDATE schools SET status='ACTIVE' WHERE code='BFA03'`); await pool.end();
    }
  });

  it('logout revokes the session', async () => {
    const a = await login(app, 'editor', 'Admin@12345');
    await a.post('/api/auth/logout');
    expect((await a.get('/api/auth/me')).status).toBe(401);
  });

  it('change password signs out other devices', async () => {
    const d1 = await login(app, 'sales', 'Admin@12345');
    const d2 = await login(app, 'sales', 'Admin@12345');
    expect((await d1.post('/api/auth/change-password').send({ currentPassword: 'Admin@12345', newPassword: 'NewPass@2026' })).status).toBe(200);
    expect((await d1.get('/api/auth/me')).status).toBe(200);
    expect((await d2.get('/api/auth/me')).status).toBe(401);
  });

  describe('PostgreSQL Row-Level Security (runtime role)', () => {
    let owner: ReturnType<typeof ownerPool>; let appDb: ReturnType<typeof appPool>;
    let otherPub: string; let otherPkg: string; let pub1: string; let sun: string; let gvs: string;
    beforeAll(async () => {
      owner = ownerPool(); appDb = appPool();
      pub1 = (await owner.query(`SELECT id FROM publishers WHERE slug='demo'`)).rows[0].id;
      otherPub = (await owner.query(`INSERT INTO publishers(name, slug) VALUES ('Other Publisher','other') RETURNING id`)).rows[0].id;
      const g = (await owner.query(`INSERT INTO grades(publisher_id,name) VALUES ($1,'KG') RETURNING id`, [otherPub])).rows[0].id;
      const s = (await owner.query(`INSERT INTO subjects(publisher_id,name) VALUES ($1,'Science') RETURNING id`, [otherPub])).rows[0].id;
      otherPkg = (await owner.query(`INSERT INTO book_packages(publisher_id,grade_id,subject_id,title,slug) VALUES ($1,$2,$3,'Secret Book','secret') RETURNING id`, [otherPub, g, s])).rows[0].id;
      sun = (await owner.query(`SELECT id FROM schools WHERE code='SUN01'`)).rows[0].id;
      gvs = (await owner.query(`SELECT id FROM schools WHERE code='GVS02'`)).rows[0].id;
    });
    afterAll(async () => { await owner.end(); await appDb.end(); });

    const asTenant = async (vars: Record<string, string>, q: string, params: unknown[] = []) => {
      const c = await appDb.connect();
      try {
        await c.query('BEGIN');
        for (const [k, v] of Object.entries(vars)) await c.query(`SELECT set_config($1, $2, true)`, [k, v]);
        const r = await c.query(q, params); await c.query('ROLLBACK'); return r.rows;
      } finally { c.release(); }
    };

    it('without tenant context the app role sees nothing', async () => {
      expect(await asTenant({}, 'SELECT id FROM book_packages')).toHaveLength(0);
      expect(await asTenant({}, 'SELECT id FROM users')).toHaveLength(0);
    });
    it('a publisher never sees another publisher\'s content, even without a WHERE clause', async () => {
      const rows = await asTenant({ 'app.publisher_id': pub1, 'app.staff': 'on' }, 'SELECT id FROM book_packages');
      expect(rows.length).toBe(5);
      expect(rows.map((r: any) => r.id)).not.toContain(otherPkg);
    });
    it('a school sees only its own users', async () => {
      const rows = await asTenant({ 'app.publisher_id': pub1, 'app.school_id': sun }, 'SELECT DISTINCT school_id FROM users');
      expect(rows).toEqual([{ school_id: sun }]);
      expect(await asTenant({ 'app.publisher_id': pub1, 'app.school_id': sun }, 'SELECT id FROM users WHERE school_id=$1', [gvs])).toHaveLength(0);
    });
    it('school users cannot modify publisher content', async () => {
      await expect(asTenant({ 'app.publisher_id': pub1, 'app.school_id': sun }, `UPDATE book_packages SET title='hacked' RETURNING id`))
        .resolves.toHaveLength(0);
    });
    it('audit log is append-only for the app role', async () => {
      await expect(asTenant({ 'app.publisher_id': pub1, 'app.staff': 'on' }, 'DELETE FROM audit_logs')).rejects.toThrow(/permission denied/);
    });
    it('API returns 404 for another publisher\'s package id', async () => {
      const a = await login(app, 'admin', 'Admin@12345');
      expect((await a.get(`/api/publishing/packages/${otherPkg}`)).status).toBe(404);
    });
  });
});
