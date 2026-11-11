import { INestApplication } from '@nestjs/common';
import { appPool, createApp, login, ownerPool } from './helpers';

/** Every table that holds a student's personal data, with the column that points at the student. */
const STUDENT_TABLES: [string, string][] = [
  ['users', 'id'], ['user_roles', 'user_id'], ['sessions', 'user_id'], ['enrolments', 'student_id'], ['license_assignments', 'user_id'],
  ['access_entitlements', 'user_id'], ['license_transfers', 'to_user_id'], ['reader_progress', 'user_id'], ['bookmarks', 'user_id'],
  ['submissions', 'student_id'], ['evaluations', 'student_id'], ['assessment_students', 'student_id'], ['game_attempts', 'student_id'],
  ['student_badges', 'student_id'],
];
const MARKER_NAME = 'Zainab Erasure-Marker';
const MARKER_NOTE = 'private-note-erasure-marker';

describe('Right to erasure — school admin erases a student', () => {
  let app: INestApplication; const owner = ownerPool(); const asApp = appPool();
  let sunId: string; let gvsId: string; let studentId: string; let teacherId: string; let seatId: string; let poolId: string;
  beforeAll(async () => {
    app = await createApp();
    const q = async (text: string, params: unknown[] = []) => (await owner.query(text, params)).rows;
    [{ id: sunId }] = await q(`SELECT id FROM schools WHERE code = 'SUN01'`);
    [{ id: gvsId }] = await q(`SELECT id FROM schools WHERE code = 'GVS02'`);
    [{ id: studentId }] = await q(`SELECT id FROM users WHERE school_id = $1 AND username = 'student2'`, [sunId]);
    [{ id: teacherId }] = await q(`SELECT id FROM users WHERE school_id = $1 AND username = 'teacher1'`, [sunId]);
    [{ seat_id: seatId, pool_id: poolId }] = await q(`SELECT seat_id, pool_id FROM license_assignments WHERE user_id = $1 AND status = 'ACTIVE'`, [studentId]);

    // Give the student data in every table, plus a recognisable name, so "nothing left" is meaningful.
    await q(`UPDATE users SET display_name = $2 WHERE id = $1`, [studentId, MARKER_NAME]);
    await login(app, 'student2', 'Student@123', 'SUN01'); // → a session row
    const [{ id: componentId }] = await q(`SELECT id FROM book_components LIMIT 1`);
    const [{ id: assessmentId }] = await q(`SELECT id FROM assessments WHERE school_id = $1 LIMIT 1`, [sunId]);
    const [{ activity_id: activityId }] = await q(`SELECT activity_id FROM game_assignments WHERE school_id = $1 LIMIT 1`, [sunId]);
    const [{ publisher_id: pub }] = await q(`SELECT publisher_id FROM schools WHERE id = $1`, [sunId]);
    const base = [pub, sunId, studentId];
    await q(`INSERT INTO reader_progress(publisher_id, school_id, user_id, component_id, last_page, max_page) VALUES ($1,$2,$3,$4,3,5) ON CONFLICT DO NOTHING`, [...base, componentId]);
    await q(`INSERT INTO bookmarks(publisher_id, school_id, user_id, component_id, page, note) VALUES ($1,$2,$3,$4,2,$5)`, [...base, componentId, MARKER_NOTE]);
    await q(`INSERT INTO assessment_students(publisher_id, school_id, student_id, assessment_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [...base, assessmentId]);
    await q(`INSERT INTO submissions(publisher_id, school_id, student_id, assessment_id, max_score, feedback) VALUES ($1,$2,$3,$4,10,$5) ON CONFLICT DO NOTHING`, [...base, assessmentId, MARKER_NOTE]);
    await q(`INSERT INTO evaluations(publisher_id, school_id, student_id, teacher_id, skill, rating, remarks) VALUES ($1,$2,$3,$4,'Reading',4,$5)`, [...base, teacherId, MARKER_NOTE]);
    await q(`INSERT INTO game_attempts(publisher_id, school_id, student_id, activity_id, score, max_score, stars) VALUES ($1,$2,$3,$4,3,5,2)`, [...base, activityId]);
    await q(`INSERT INTO student_badges(publisher_id, school_id, student_id, badge) VALUES ($1,$2,$3,'first-game') ON CONFLICT DO NOTHING`, base);
  });
  afterAll(async () => { await owner.end(); await asApp.end(); await app.close(); });

  const rowsFor = async (id: string) => {
    const out: Record<string, number> = {};
    for (const [t, c] of STUDENT_TABLES) out[t] = (await owner.query(`SELECT count(*)::int AS n FROM ${t} WHERE ${c} = $1`, [id])).rows[0].n;
    return out;
  };

  it('starts with the student\'s data in every table (sanity check of the fixture)', async () => {
    const before = await rowsFor(studentId);
    expect(Object.entries(before).filter(([t, n]) => t !== 'license_transfers' && n === 0)).toEqual([]);
  });

  it('a teacher cannot erase a student', async () => {
    const teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    expect((await teacher.post(`/api/school/users/${studentId}/erase`).send({ confirmUsername: 'student2' })).status).toBe(403);
    expect((await rowsFor(studentId)).users).toBe(1);
  });

  it('another school\'s admin cannot erase the student — neither through the API nor by calling the function directly', async () => {
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.post(`/api/school/users/${studentId}/erase`).send({ confirmUsername: 'student2' })).status).toBe(404);

    // Defence in depth: the SECURITY DEFINER function itself refuses, even with the right ids, for another school's admin…
    const [{ id: gvsAdmin, publisher_id: pub }] = (await owner.query(`SELECT id, publisher_id FROM users WHERE school_id = $1 AND username = 'principal'`, [gvsId])).rows;
    const call = async (ctxSchool: string, user: string, staff = '') => {
      const c = await asApp.connect();
      try {
        await c.query('BEGIN');
        await c.query(`SELECT set_config('app.publisher_id', $1, true), set_config('app.school_id', $2, true), set_config('app.user_id', $3, true), set_config('app.staff', $4, true)`, [pub, ctxSchool, user, staff]);
        await c.query(`SELECT erase_student($1, $2, 'student2', NULL)`, [sunId, studentId]);
        return 'erased';
      } catch (e: any) { return e.code; } finally { await c.query('ROLLBACK'); c.release(); }
    };
    expect(await call(gvsId, gvsAdmin)).toBe('42501');
    // …or pretending to be signed in to the student's school.
    expect(await call(sunId, gvsAdmin)).toBe('42501');
    // …or a teacher of the student's own school, or publisher staff who are not the publisher admin.
    expect(await call(sunId, teacherId)).toBe('42501');
    const [{ id: salesId }] = (await owner.query(`SELECT id FROM users WHERE school_id IS NULL AND username = 'sales'`)).rows;
    expect(await call('', salesId, 'on')).toBe('42501');
    // The app role still cannot delete the protected tables directly.
    await expect(asApp.query(`DELETE FROM game_attempts WHERE student_id = $1`, [studentId])).rejects.toMatchObject({ code: '42501' });
    expect((await rowsFor(studentId)).users).toBe(1);
  });

  it('publisher sales staff cannot use the publisher erase route', async () => {
    const sales = await login(app, 'sales', 'Admin@12345');
    expect((await sales.post(`/api/schools/${sunId}/students/${studentId}/erase`).send({ confirmUsername: 'student2' })).status).toBe(403);
  });

  it('requires the exact username as confirmation, and only erases student accounts', async () => {
    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    expect((await principal.post(`/api/school/users/${studentId}/erase`).send({})).status).toBe(400);
    const wrong = await principal.post(`/api/school/users/${studentId}/erase`).send({ confirmUsername: 'student3' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toMatch(/username/);
    const teacher = await principal.post(`/api/school/users/${teacherId}/erase`).send({ confirmUsername: 'teacher1' });
    expect(teacher.status).toBe(400);
    expect(teacher.body.message).toMatch(/Only student accounts/);
    expect((await rowsFor(studentId)).users).toBe(1);
    expect((await rowsFor(teacherId)).users).toBe(1);
  });

  it('erases the student: every row is gone, the seat is free and can be given to another child, and the audit entry holds no personal data', async () => {
    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    const kid = await login(app, 'student2', 'Student@123', 'SUN01');
    const availableBefore = (await principal.get('/api/school/pools')).body.find((p: any) => p.id === poolId).available;
    const [{ now: startedAt }] = (await owner.query('SELECT now()')).rows;

    const r = await principal.post(`/api/school/users/${studentId}/erase`).send({ confirmUsername: '  Student2 ' });
    expect(r.status).toBe(201);
    expect(r.body.ok).toBe(true);
    expect(r.body.removed).toMatchObject({ seats_freed: 1, license_assignments: 1, enrolments: 1, bookmarks: 1, submissions: 1, game_attempts: 1 });

    // 1. The data is gone.
    expect(Object.entries(await rowsFor(studentId)).filter(([, n]) => n > 0)).toEqual([]);
    const leftovers = (await owner.query(`SELECT
      (SELECT count(*) FROM users WHERE display_name = $1)::int AS names,
      (SELECT count(*) FROM bookmarks WHERE note = $2)::int + (SELECT count(*) FROM submissions WHERE feedback = $2)::int
        + (SELECT count(*) FROM evaluations WHERE remarks = $2)::int AS notes`, [MARKER_NAME, MARKER_NOTE])).rows[0];
    expect(leftovers).toEqual({ names: 0, notes: 0 });
    // The student is signed out and can no longer sign in.
    expect((await kid.get('/api/auth/me')).status).toBe(401);
    expect((await principal.post('/api/auth/login').send({ schoolCode: 'SUN01', username: 'student2', password: 'Student@123' })).status).toBe(401);
    // Classmates and the teacher's work are untouched.
    expect((await owner.query(`SELECT count(*)::int AS n FROM enrolments WHERE school_id = $1`, [sunId])).rows[0].n).toBe(2);
    expect((await rowsFor(teacherId)).users).toBe(1);

    // 2. The seat is free again and can be reassigned.
    expect((await owner.query(`SELECT status FROM license_seats WHERE id = $1`, [seatId])).rows[0].status).toBe('AVAILABLE');
    expect((await principal.get('/api/school/pools')).body.find((p: any) => p.id === poolId).available).toBe(availableBefore + 1);
    // Make the freed seat the only one left, then give it to another child.
    await owner.query(`UPDATE license_seats SET status = 'REVOKED' WHERE pool_id = $1 AND status = 'AVAILABLE' AND id <> $2`, [poolId, seatId]);
    const [{ id: student3 }] = (await owner.query(`SELECT id FROM users WHERE school_id = $1 AND username = 'student3'`, [sunId])).rows;
    expect((await principal.post(`/api/school/pools/${poolId}/assign`).send({ userIds: [student3] })).status).toBe(201);
    expect((await owner.query(`SELECT seat_id FROM license_assignments WHERE user_id = $1 AND pool_id = $2 AND status = 'ACTIVE'`, [student3, poolId])).rows[0].seat_id).toBe(seatId);

    // 3. Exactly one audit entry records the erasure, and no new audit entry contains the child's details.
    const { rows: audit } = await owner.query(`SELECT * FROM audit_logs WHERE created_at >= $1 AND action = 'school.user.erase'`, [startedAt]);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ school_id: sunId, entity_type: 'user', entity_id: null, summary: 'Erased a student\'s personal data (right to erasure)' });
    const { rows: fresh } = await owner.query(`SELECT row_to_json(a)::text AS j FROM audit_logs a WHERE created_at >= $1`, [startedAt]);
    for (const { j } of fresh) {
      for (const secret of [studentId, 'student2', MARKER_NAME, MARKER_NOTE]) expect([secret, j.toLowerCase().includes(secret.toLowerCase())]).toEqual([secret, false]);
    }
    // The school admin sees the entry in the audit trail.
    const trail = (await principal.get('/api/audit?action=school.user.erase')).body.items;
    expect(trail.map((e: any) => e.summary)).toContain('Erased a student\'s personal data (right to erasure)');
  });

  it('the publisher admin can erase a student of any of its schools', async () => {
    const admin = await login(app, 'admin', 'Admin@12345');
    const [{ id }] = (await owner.query(`SELECT id FROM users WHERE school_id = $1 AND username = 'student1'`, [gvsId])).rows;
    const seats = (await owner.query(`SELECT seat_id FROM license_assignments WHERE user_id = $1 AND status = 'ACTIVE'`, [id])).rows.map((x: any) => x.seat_id);
    expect(seats.length).toBe(2); // KG-ENG and KG-MAT
    // The school in the URL must be the student's school.
    expect((await admin.post(`/api/schools/${sunId}/students/${id}/erase`).send({ confirmUsername: 'student1' })).status).toBe(404);
    const r = await admin.post(`/api/schools/${gvsId}/students/${id}/erase`).send({ confirmUsername: 'student1' });
    expect(r.status).toBe(201);
    expect(r.body.removed.seats_freed).toBe(2);
    expect(Object.entries(await rowsFor(id)).filter(([, n]) => n > 0)).toEqual([]);
    expect((await owner.query(`SELECT array_agg(DISTINCT status::text) AS s FROM license_seats WHERE id = ANY($1)`, [seats])).rows[0].s).toEqual(['AVAILABLE']);
    const [entry] = (await owner.query(`SELECT * FROM audit_logs WHERE action = 'school.user.erase' AND school_id = $1`, [gvsId])).rows;
    expect(entry.entity_id).toBeNull();
    expect(JSON.stringify(entry)).not.toContain(id);
  });
});
