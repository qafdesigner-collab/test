import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

describe('Attendance and timetable', () => {
  let app: INestApplication; let teacher: any; let principal: any; let parent: any; let classId: string; let roster: any[];
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    parent = await login(app, 'parent1', 'Parent@123', 'SUN01');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
    roster = (await teacher.get(`/api/attendance/classes/${classId}`)).body.roster;
  });
  afterAll(async () => { await app.close(); });

  it('marks a register, alerts parents of new absences once, and reports', async () => {
    expect(roster.length).toBeGreaterThan(1);
    const s1 = roster.find((r) => r.username === 'student1');
    const records = roster.map((r) => ({ studentId: r.id, status: r.id === s1.id ? 'ABSENT' : 'PRESENT' }));
    const r1 = await teacher.put(`/api/attendance/classes/${classId}`).send({ day: today(), records });
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ saved: roster.length, notified: 1 });
    const again = await teacher.put(`/api/attendance/classes/${classId}`).send({ day: today(), records });
    expect(again.body.notified).toBe(0); // already absent: no second alert
    const notes = (await parent.get('/api/notifications')).body;
    expect(JSON.stringify(notes)).toContain('was marked absent today');

    const reg = (await teacher.get(`/api/attendance/classes/${classId}?day=${today()}`)).body;
    expect(reg).toMatchObject({ marked: true, summary: { ABSENT: 1, PRESENT: roster.length - 1 } });
    await teacher.put(`/api/attendance/classes/${classId}`).send({ day: daysAgo(1), records: records.map((r) => ({ ...r, status: 'LATE' })) });
    const rep = (await teacher.get(`/api/attendance/classes/${classId}/report?from=${daysAgo(5)}&to=${today()}`)).body;
    const row = rep.students.find((s: any) => s.id === s1.id);
    expect(row).toMatchObject({ absent: 1, late: 1, rate: 50 });
    expect((await principal.get('/api/attendance/school')).body.totals.absent).toBeGreaterThanOrEqual(1);

    const kid = (await parent.get(`/api/parent/children/${s1.id}/attendance`)).body;
    expect(kid).toMatchObject({ absent: 1, late: 1 });
    expect((await parent.get(`/api/parent/children/${s1.id}`)).body.attendance.length).toBeGreaterThan(0);
  });

  it('rejects future days, strangers and students outside the class', async () => {
    const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    expect((await teacher.put(`/api/attendance/classes/${classId}`).send({ day: future, records: [] })).status).toBe(400);
    expect((await teacher.put(`/api/attendance/classes/${classId}`).send({ day: today(), records: [{ studentId: '00000000-0000-4000-8000-000000000000', status: 'PRESENT' }] })).status).toBe(400);
    expect((await teacher.put(`/api/attendance/classes/${classId}`).send({ day: today(), records: [{ studentId: roster[0].id, status: 'MAYBE' }] })).status).toBe(400);
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.get(`/api/attendance/classes/${classId}`)).status).toBe(404); // RLS hides another school's class
    const student = await login(app, 'student1', 'Student@123', 'SUN01');
    expect((await student.put(`/api/attendance/classes/${classId}`).send({ day: today(), records: [] })).status).toBe(403);
    expect((await student.get('/api/student/attendance')).body.absent).toBe(1);
  });

  it('builds bell times and a class timetable without teacher clashes', async () => {
    const periods = [
      { number: 1, startsAt: '08:00', endsAt: '08:40' }, { number: 2, startsAt: '08:40', endsAt: '09:20' },
      { number: 3, label: 'Break', startsAt: '09:20', endsAt: '09:40', isBreak: true }, { number: 4, startsAt: '09:40', endsAt: '10:20' },
    ];
    expect((await teacher.put('/api/timetable/periods').send({ periods })).status).toBe(403);
    expect((await principal.put('/api/timetable/periods').send({ periods: [{ number: 1, startsAt: '09:00', endsAt: '08:00' }] })).status).toBe(400);
    expect((await principal.put('/api/timetable/periods').send({ periods: [periods[0], { ...periods[1], startsAt: '08:30' }] })).status).toBe(400);
    expect((await principal.put('/api/timetable/periods').send({ periods })).body).toHaveLength(4);

    const subjects = (await principal.get('/api/catalog/subjects')).body;
    const teachers = (await principal.get('/api/school/users?role=TEACHER')).body.items;
    const t1 = teachers.find((t: any) => t.username === 'teacher1');
    const slots = [{ weekday: 1, period: 1, subjectId: subjects[0].id, teacherId: t1.id, room: 'R1' }, { weekday: 1, period: 2, subjectId: subjects[1].id }];
    const tt = await principal.put(`/api/timetable/classes/${classId}`).send({ slots });
    expect(tt.status).toBe(200);
    expect(tt.body.slots).toHaveLength(2);
    expect(tt.body.slots[0]).toMatchObject({ teacher: t1.displayName, room: 'R1', subject: subjects[0].name });

    const classes = (await principal.get('/api/classes')).body;
    const other = (classes.items ?? classes).find((c: any) => c.id !== classId);
    if (other) {
      const clash = await principal.put(`/api/timetable/classes/${other.id}`).send({ slots: [{ weekday: 1, period: 1, teacherId: t1.id }] });
      expect(clash.status).toBe(409);
      expect(clash.body.message).toMatch(/already teaches/);
    }
    expect((await principal.put(`/api/timetable/classes/${classId}`).send({ slots: [slots[0], slots[0]] })).status).toBe(400);

    expect((await teacher.get('/api/timetable/me')).body.slots.some((s: any) => s.classId === classId)).toBe(true);
    const student = await login(app, 'student1', 'Student@123', 'SUN01');
    expect((await student.get('/api/timetable/me')).body.slots).toHaveLength(2);
    const s1 = roster.find((r) => r.username === 'student1');
    expect((await parent.get(`/api/parent/children/${s1.id}/timetable`)).body.periods).toHaveLength(4);
    expect((await parent.get('/api/timetable/periods')).status).toBe(403); // parents only reach /parent routes
  });
});
