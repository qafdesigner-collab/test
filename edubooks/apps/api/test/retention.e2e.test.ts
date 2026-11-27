import { createApp, login, ownerPool } from './helpers';

describe('Retention: test pictures and children\'s voice recordings are kept 30 days, with notices', () => {
  let app: any; let teacher: any; let student: any; let principal: any; let id: string; let me: string;
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    const classId = (await teacher.get('/api/classes?mine=true')).body[0].id; me = (await student.get('/api/auth/me')).body.id;
    const r = await teacher.post('/api/teacher/assessments').send({ classId, kind: 'TEST', title: `Kept ${Date.now()}`, proctor: { camera: true },
      items: [{ type: 'TRUE_FALSE', prompt: 'x', answer: [true], points: 1 }] });
    id = r.body.id; await teacher.post(`/api/teacher/assessments/${id}/publish`);
  });
  afterAll(async () => { const o = ownerPool(); await o.query('DELETE FROM assessments WHERE id = $1', [id]); await o.end(); await app.close(); });

  it('publishing a watched test explains it to students in English and Arabic, and tells the teacher and school', async () => {
    const s = JSON.stringify((await student.get('/api/notifications')).body);
    expect(s).toContain('It is not hacking'); expect(s).toContain('هذا ليس اختراقًا');
    expect(JSON.stringify((await teacher.get('/api/notifications')).body)).toContain('Watched test published');
    expect(JSON.stringify((await principal.get('/api/notifications')).body)).toContain('Watched test published');
  });

  it('reminds a week before, then deletes old pictures and children\'s voice recordings', async () => {
    const { ProctorCleanup } = await import('../src/lms/proctor-cleanup');
    const job = app.get(ProctorCleanup);
    const o = ownerPool();
    const { rows: [a] } = await o.query('SELECT publisher_id, school_id FROM assessments WHERE id = $1', [id]);
    await o.query(`INSERT INTO proctor_events (publisher_id, school_id, assessment_id, student_id, kind, created_at) VALUES ($1, $2, $3, $4, 'AWAY', now() - interval '25 days')`, [a.publisher_id, a.school_id, id, me]);
    const { rows: [clip] } = await o.query(`INSERT INTO audio_clips (publisher_id, school_id, owner_id, kind, storage_key, mime, size_bytes, created_at)
      VALUES ($1, $2, $3, 'READING', 'audio/test-old-clip.webm', 'audio/webm', 10, now() - interval '40 days') RETURNING id`, [a.publisher_id, a.school_id, me]);
    expect(await job.remind()).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify((await teacher.get('/api/notifications')).body)).toContain('Test photos will be deleted on');
    expect(JSON.stringify((await principal.get('/api/notifications')).body)).toContain('Test photos will be deleted on');
    expect(JSON.stringify((await principal.get('/api/notifications')).body)).toContain('voice recording(s) of students will be deleted');
    // the notice goes only once
    const { rows: [t] } = await o.query('SELECT retention_notice_at FROM assessments WHERE id = $1', [id]); expect(t.retention_notice_at).not.toBeNull();
    // 25 days: not yet deleted; at 31 days it is
    await job.purge(30);
    expect((await o.query('SELECT count(*)::int AS n FROM proctor_events WHERE assessment_id = $1', [id])).rows[0].n).toBe(1);
    await o.query(`UPDATE proctor_events SET created_at = now() - interval '31 days' WHERE assessment_id = $1`, [id]);
    expect(await job.purge(30)).toBeGreaterThanOrEqual(1);
    expect((await o.query('SELECT count(*)::int AS n FROM proctor_events WHERE assessment_id = $1', [id])).rows[0].n).toBe(0);
    expect(await job.purgeVoice(30)).toBeGreaterThanOrEqual(1);
    expect((await o.query('SELECT count(*)::int AS n FROM audio_clips WHERE id = $1', [clip.id])).rows[0].n).toBe(0);
    await o.end();
  });
});
