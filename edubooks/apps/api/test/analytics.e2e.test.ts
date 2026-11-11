import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('Learning analytics', () => {
  let app: INestApplication; let teacher: any; let classId: string;
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
  });
  afterAll(async () => { await app.close(); });

  it('records daily activity and shows class insights to the class teacher', async () => {
    await login(app, 'student1', 'Student@123', 'SUN01'); // a sign-in counts as activity today
    const r = await teacher.get(`/api/analytics/classes/${classId}`);
    expect(r.status).toBe(200);
    expect(r.body.trend).toHaveLength(30);
    expect(r.body.trend.at(-1).active).toBeGreaterThanOrEqual(1);
    const s1 = r.body.students.find((s: any) => s.displayName === 'Sample Student 1');
    expect(s1.lastActive).toBe(new Date().toISOString().slice(0, 10));
    expect(s1.flags).not.toContain('Not active this week');
    expect(r.body.summary.students).toBe(r.body.students.length);
    for (const k of ['lessons', 'questions', 'games']) expect(Array.isArray(r.body[k])).toBe(true);
  });

  it('keeps each view to the right people', async () => {
    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    const sch = (await principal.get('/api/analytics/school')).body;
    expect(sch.trend).toHaveLength(30);
    expect(sch.classes.find((c: any) => c.id === classId)).toBeTruthy();
    expect((await teacher.get('/api/analytics/school')).status).toBe(403);
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.get(`/api/analytics/classes/${classId}`)).status).toBe(404);
    const sales = await login(app, 'sales', 'Admin@12345');
    const pub = (await sales.get('/api/analytics/publisher')).body;
    expect(pub.trend).toHaveLength(60);
    expect(pub.schools.find((s: any) => s.name === 'Sunrise Grammar School').active30).toBeGreaterThanOrEqual(1);
    const student = await login(app, 'student1', 'Student@123', 'SUN01');
    expect((await student.get(`/api/analytics/classes/${classId}`)).status).toBe(403);
  });
});
