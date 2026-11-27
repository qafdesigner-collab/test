import { createApp, login } from './helpers';

describe('Groups of students in a class, and comparing sections and grades', () => {
  let app: any; let teacher: any; let principal: any; let student: any; let classId: string; let roster: any[]; let group: string;
  beforeAll(async () => {
    app = await createApp(); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    principal = await login(app, 'principal', 'School@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
    roster = (await teacher.get(`/api/classes/${classId}`)).body.roster;
  });
  afterAll(async () => { if (group) await teacher.delete(`/api/groups/${group}`); await app.close(); });

  it('makes a group, changes its members and shows how it is doing', async () => {
    const r = await teacher.post(`/api/classes/${classId}/groups`).send({ name: 'Needs support', color: 'amber', studentIds: [roster[0].id] });
    expect(r.status).toBe(201); group = r.body.id;
    expect((await teacher.post(`/api/classes/${classId}/groups`).send({ name: 'x', studentIds: ['00000000-0000-0000-0000-000000000001'] })).status).toBe(400);
    expect((await student.get(`/api/classes/${classId}/groups`)).status).toBe(403);
    await teacher.patch(`/api/groups/${group}`).send({ studentIds: roster.slice(0, 2).map((s: any) => s.id), note: 'Phonics practice' });
    const list = (await teacher.get(`/api/classes/${classId}/groups`)).body;
    const g = list.groups.find((x: any) => x.id === group);
    expect(g).toMatchObject({ name: 'Needs support', color: 'amber', note: 'Phonics practice' });
    expect(g.studentIds.sort()).toEqual(roster.slice(0, 2).map((s: any) => s.id).sort());
    expect(g.metrics.students).toBe(Math.min(2, roster.length));
    expect(list.class.students).toBe(roster.length);
    // the school admin sees the class groups too
    expect((await principal.get(`/api/classes/${classId}/groups`)).body.groups.length).toBeGreaterThan(0);
  });

  it('compares sections and grades on the same measures', async () => {
    const classes = (await teacher.get('/api/compare/classes')).body;
    expect(classes.find((c: any) => c.id === classId)).toMatchObject({ mine: true });
    const ids = classes.map((c: any) => c.id).join(',');
    const bySection = (await teacher.get(`/api/compare?classIds=${ids}&by=section`)).body;
    expect(bySection.rows.length).toBe(classes.length);
    expect(Object.keys(bySection.rows[0].metrics).sort()).toEqual(['activeWeek', 'attendance', 'examAverage', 'handedIn', 'homeworkAverage', 'pagesRead', 'stars', 'students']);
    const byGrade = (await principal.get(`/api/compare?classIds=${ids}&by=grade`)).body;
    expect(byGrade.by).toBe('grade'); expect(byGrade.rows.reduce((n: number, r: any) => n + r.sections, 0)).toBe(classes.length);
    expect((await student.get(`/api/compare?classIds=${ids}`)).status).toBe(403);
    expect((await teacher.get('/api/compare?classIds=')).status).toBe(400);
  });
});
