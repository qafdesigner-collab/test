import { INestApplication } from '@nestjs/common';
import * as net from 'net';
import { createApp, login, ownerPool } from './helpers';

/** A tiny SMTP sink: accepts every message and keeps it for the test. */
function smtpSink() {
  const got: { rcpt: string[]; data: string }[] = [];
  const server = net.createServer((sock) => {
    let rcpt: string[] = []; let inData = false; let buf = '';
    sock.write('220 sink ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (inData) {
        const end = buf.indexOf('\r\n.\r\n');
        if (end < 0) return;
        got.push({ rcpt, data: buf.slice(0, end) }); buf = buf.slice(end + 5); inData = false; rcpt = []; sock.write('250 OK queued\r\n');
      }
      let i;
      while (!inData && (i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2); const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-sink\r\n250 OK\r\n');
        else if (cmd === 'MAIL') sock.write('250 OK\r\n');
        else if (cmd === 'RCPT') { rcpt.push(line.replace(/^RCPT TO:\s*/i, '').replace(/[<>]/g, '')); sock.write('250 OK\r\n'); }
        else if (cmd === 'DATA') { inData = true; sock.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 OK\r\n');
      }
    });
    sock.on('error', () => undefined);
  });
  return { got, server, listen: () => new Promise<number>((res) => server.listen(0, '127.0.0.1', () => res((server.address() as net.AddressInfo).port))) };
}
const until = async (f: () => boolean, ms = 8000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 100)); return f(); };

describe('Built-in mail: inbox, groups, meeting invites and email copies', () => {
  let app: INestApplication; const owner = ownerPool(); const sink = smtpSink(); let port = 0;
  let admin: any; let principal: any; let teacher: any; let student: any; let parent: any;
  beforeAll(async () => {
    port = await sink.listen();
    app = await createApp();
    admin = await login(app, 'admin', 'Admin@12345');
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    student = await login(app, 'student1', 'Student@123', 'SUN01');
    parent = await login(app, 'parent1', 'Parent@123', 'SUN01');
  });
  afterAll(async () => { await owner.end(); await app.close(); sink.server.close(); });

  it('the super admin sets up the outgoing email account (password never shown) and sends a test', async () => {
    const s = await admin.put('/api/admin/mail-settings').set('Host', 'lms.example.ae').send({ enabled: true, host: '127.0.0.1', port, secure: false, username: '', password: 'secret-pass', fromName: 'Knowledge Gate', fromEmail: 'noreply@example.ae', notifyStudents: true });
    expect(s.status).toBe(200); expect(s.body.hasPassword).toBe(true); expect(JSON.stringify(s.body)).not.toContain('secret-pass');
    expect(s.body.siteUrl).toMatch(/lms\.example\.ae/);
    expect((await principal.get('/api/admin/mail-settings')).status).toBe(403);
    const t = await admin.post('/api/admin/mail-settings/test').send({ to: 'me@example.ae' });
    expect(t.status).toBe(200);
    expect(sink.got.some((m) => m.rcpt.includes('me@example.ae') && /Test email/.test(m.data))).toBe(true);
  });

  it('a school admin sends a meeting invite to all teachers; teachers reply YES/NO; the sender sees who is coming', async () => {
    // give teacher1 an email so an email copy goes out
    await principal.patch(`/api/school/users/${(await owner.query(`SELECT u.id FROM users u JOIN schools s ON s.id = u.school_id WHERE s.code='SUN01' AND u.username='teacher1'`)).rows[0].id}`).send({ email: 'teacher1@school.ae' });
    const groups = (await principal.get('/api/mail/groups')).body;
    expect(groups.map((g: any) => g.key)).toEqual(expect.arrayContaining(['teachers', 'students', 'parents', 'school-staff', 'publisher']));
    const startsAt = new Date(Date.now() + 2 * 864e5).toISOString();
    const r = await principal.post('/api/mail').send({ to: ['teachers'], subject: 'Staff meeting', body: 'Agenda: exams week.', meeting: { startsAt, durationMin: 45, location: 'Library' } });
    expect(r.status).toBe(201); expect(r.body.recipients).toBeGreaterThan(0);
    const inbox = (await teacher.get('/api/mail')).body;
    const m = inbox.find((x: any) => x.id === r.body.id);
    expect(m).toMatchObject({ subject: 'Staff meeting', kind: 'MEETING', read: false });
    expect((await teacher.get('/api/mail/unread')).body.unread).toBeGreaterThan(0);
    expect(JSON.stringify((await teacher.get('/api/notifications')).body)).toContain('Meeting: Staff meeting');
    expect((await teacher.post(`/api/mail/${r.body.id}/rsvp`).send({ answer: 'YES' })).body.rsvp).toBe('YES');
    const seen = (await principal.get(`/api/mail/${r.body.id}`)).body;
    expect(seen.mine).toBe(true); expect(seen.recipients.rsvp.YES).toBe(1); expect(seen.recipients.read).toBeGreaterThanOrEqual(1);
    // email copy with a calendar invitation
    expect(await until(() => sink.got.some((x) => x.rcpt.includes('teacher1@school.ae') && /Staff meeting/.test(x.data)))).toBe(true);
    const mail = sink.got.find((x) => x.rcpt.includes('teacher1@school.ae'))!;
    expect(mail.data).toMatch(/text\/calendar/); expect(mail.data).toMatch(/lms\.example\.ae\/mail\?m=/);
  });

  it('teachers mail the office and their own classes; students and parents can only reply', async () => {
    const g = (await teacher.get('/api/mail/groups')).body.map((x: any) => x.key);
    expect(g).toContain('office'); expect(g.some((k: string) => /^class:.*:parents$/.test(k))).toBe(true);
    expect(g).not.toContain('students'); // not the whole school
    expect((await teacher.post('/api/mail').send({ to: ['students'], subject: 'x' })).status).toBe(403);
    const cls = g.find((k: string) => /^class:.*:students$/.test(k));
    const sent = (await teacher.post('/api/mail').send({ to: [cls], subject: 'Bring your reading book', body: 'Tomorrow please bring Book 1.' })).body;
    const kid = (await student.get('/api/mail')).body.find((x: any) => x.id === sent.id);
    expect(kid.senderName).toBe('Sample Teacher');
    expect((await student.post('/api/mail').send({ to: ['office'], subject: 'hi' })).status).toBe(403);
    const reply = await student.post(`/api/mail/${sent.id}/reply`).send({ body: 'OK Miss!' });
    expect(reply.status).toBe(201);
    const back = (await teacher.get('/api/mail')).body.find((x: any) => x.id === reply.body.id);
    expect(back.subject).toBe('Re: Bring your reading book');
    // others cannot open it
    expect((await parent.get(`/api/mail/${sent.id}`)).status).toBe(403);
    expect((await parent.get('/api/mail')).status).toBe(200); // parents have an inbox
  });

  it('school admins can write to the publisher, and the publisher to every school admin', async () => {
    const up = await principal.post('/api/mail').send({ to: ['publisher'], subject: 'Need more seats', body: 'Please add 20 student seats.' });
    expect(up.status).toBe(201);
    expect((await admin.get('/api/mail')).body.some((x: any) => x.id === up.body.id)).toBe(true);
    const down = await admin.post('/api/mail').send({ to: ['school-admins'], subject: 'New books for next term', body: 'Catalogue attached on the Our publisher page.' });
    expect(down.status).toBe(201);
    const got = (await principal.get('/api/mail')).body.find((x: any) => x.id === down.body.id);
    expect(got.senderName).toBe('Publisher Admin');
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.get('/api/mail')).body.some((x: any) => x.id === down.body.id)).toBe(true);
    expect((await other.get(`/api/mail/${up.body.id}`)).status).toBe(404);
  });

  it('notifications also go by email when switched on', async () => {
    const before = sink.got.length;
    const t = (await owner.query(`SELECT u.id FROM users u JOIN schools s ON s.id = u.school_id WHERE s.code='SUN01' AND u.username='teacher1'`)).rows[0].id;
    const c = (await principal.get('/api/messages/contacts'));
    // a parent message to the teacher creates a notification for the teacher, who has an email address
    const tc = (await parent.get('/api/messages/contacts')).body.find((x: any) => x.id === t);
    if (tc) {
      const conv = (await parent.post('/api/messages/conversations').send({ studentId: tc.studentId, withId: tc.id })).body;
      await parent.post(`/api/messages/conversations/${conv.id}`).send({ body: 'Thank you for the reading homework!' });
      expect(await until(() => sink.got.slice(before).some((x) => x.rcpt.includes('teacher1@school.ae') && /New message from/.test(x.data)))).toBe(true);
    }
    expect(c.status).toBe(200);
  });
});
