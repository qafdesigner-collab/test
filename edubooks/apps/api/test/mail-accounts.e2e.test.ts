import { INestApplication } from '@nestjs/common';
import * as net from 'net';
import { createApp, login, ownerPool } from './helpers';
import { CampaignService } from '../src/mail/accounts.controller';
import { parseMail } from '../src/mail/imap';

/** SMTP sink that requires a login (user/pass) and keeps every message. */
function smtpSink(pass = 'mailbox-pass') {
  const got: { from: string; rcpt: string[]; data: string }[] = [];
  const server = net.createServer((sock) => {
    let rcpt: string[] = []; let from = ''; let inData = false; let buf = ''; let authStep = 0;
    sock.write('220 sink ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (inData) { const end = buf.indexOf('\r\n.\r\n'); if (end < 0) return; got.push({ from, rcpt, data: buf.slice(0, end) }); buf = buf.slice(end + 5); inData = false; rcpt = []; sock.write('250 OK\r\n'); }
      let i;
      while (!inData && (i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2); const cmd = line.slice(0, 4).toUpperCase();
        if (authStep === 1) { authStep = 2; sock.write('334 UGFzc3dvcmQ6\r\n'); continue; }
        if (authStep === 2) { authStep = 0; sock.write(Buffer.from(line, 'base64').toString() === pass ? '235 OK\r\n' : '535 bad login\r\n'); continue; }
        if (cmd === 'EHLO') sock.write('250-sink\r\n250 AUTH LOGIN PLAIN\r\n');
        else if (cmd === 'AUTH') {
          const parts = line.split(' ');
          if (/PLAIN/i.test(parts[1])) sock.write(Buffer.from(parts[2] ?? '', 'base64').toString().split('\u0000')[2] === pass ? '235 OK\r\n' : '535 bad login\r\n');
          else { authStep = 1; sock.write('334 VXNlcm5hbWU6\r\n'); }
        } else if (cmd === 'MAIL') { from = line.replace(/^MAIL FROM:\s*/i, '').replace(/[<>]/g, '').split(' ')[0]; sock.write('250 OK\r\n'); }
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

/** A tiny IMAP server with a fixed mailbox. */
function imapServer(mails: { uid: number; raw: string }[], pass = 'mailbox-pass') {
  const server = net.createServer((sock) => {
    let buf = ''; sock.write('* OK fake IMAP ready\r\n');
    sock.on('data', (d) => {
      buf += d.toString('latin1'); let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        const [tag, cmd, ...rest] = line.split(' ');
        const C = (cmd ?? '').toUpperCase();
        if (C === 'CAPABILITY') sock.write(`* CAPABILITY IMAP4rev1\r\n${tag} OK\r\n`);
        else if (C === 'LOGIN') sock.write(rest.join(' ').includes(`"${pass}"`) ? `${tag} OK logged in\r\n` : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
        else if (C === 'EXAMINE') sock.write(`* ${mails.length} EXISTS\r\n* OK [UIDVALIDITY 7] ok\r\n${tag} OK [READ-ONLY] done\r\n`);
        else if (C === 'FETCH' || C === 'UID') {
          const uidMode = C === 'UID'; const range = uidMode ? rest[1] : rest[0];
          const [a, b] = range.split(':'); const lo = Number(a); const hi = b === '*' ? Infinity : Number(b ?? a);
          mails.forEach((m, k) => {
            const key = uidMode ? m.uid : k + 1;
            if (key >= lo && key <= hi) { const body = Buffer.from(m.raw, 'latin1'); sock.write(`* ${k + 1} FETCH (UID ${m.uid} FLAGS () BODY[]<0> {${body.length}}\r\n`); sock.write(body); sock.write(')\r\n'); }
          });
          sock.write(`${tag} OK fetched\r\n`);
        } else if (C === 'LOGOUT') { sock.write(`* BYE\r\n${tag} OK\r\n`); sock.end(); }
        else sock.write(`${tag} BAD unknown\r\n`);
      }
    });
    sock.on('error', () => undefined);
  });
  return { server, listen: () => new Promise<number>((res) => server.listen(0, '127.0.0.1', () => res((server.address() as net.AddressInfo).port))) };
}

const MAIL1 = ['From: "Parent Ali" <ali@example.com>', 'To: teacher@school.ae', 'Subject: =?utf-8?B?TWVldGluZyDinIU=?=', 'Date: Tue, 10 Nov 2026 09:00:00 +0400', 'Message-ID: <m1@example.com>',
  'Content-Type: multipart/alternative; boundary="b1"', '', '--b1', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '',
  'Can we meet on Thursday? Caf=C3=A9 at 10.', '--b1', 'Content-Type: text/html; charset=utf-8', '', '<p>Can we meet?</p>', '--b1--', ''].join('\r\n');
const MAIL2 = ['From: office@vendor.ae', 'Subject: Invoice', 'Content-Type: text/html', '', '<div>Invoice <b>attached</b></div><p>Thanks</p>'].join('\r\n');

describe('Own email accounts and bulk email campaigns', () => {
  let app: INestApplication; const owner = ownerPool(); const smtp = smtpSink(); const imap = imapServer([{ uid: 11, raw: MAIL1 }, { uid: 12, raw: MAIL2 }]);
  let sp = 0; let ip = 0; let teacher: any; let principal: any; let student: any; let sales: any;
  beforeAll(async () => {
    sp = await smtp.listen(); ip = await imap.listen();
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    student = await login(app, 'student1', 'Student@123', 'SUN01');
    sales = await login(app, 'admin', 'Admin@12345');
  });
  afterAll(async () => { await owner.end(); await app.close(); smtp.server.close(); imap.server.close(); });
  const account = (extra: any = {}) => ({ email: 'miss.sara@school.ae', fromName: 'Miss Sara', password: 'mailbox-pass', smtpHost: '127.0.0.1', smtpPort: sp, smtpSecure: false, imapHost: '127.0.0.1', imapPort: ip, imapSecure: false, signature: 'Miss Sara, KG Rose', ...extra });

  it('reads plain, html and encoded mail', () => {
    const p = parseMail(Buffer.from(MAIL1, 'latin1'));
    expect(p).toMatchObject({ subject: 'Meeting ✅', fromName: 'Parent Ali', fromEmail: 'ali@example.com' });
    expect(p.text).toBe('Can we meet on Thursday? Café at 10.');
    expect(parseMail(Buffer.from(MAIL2)).text).toBe('Invoice attached\nThanks');
    expect(parseMail(Buffer.from('Subject: Book Fair — visits\r\n\r\nhi', 'utf8')).subject).toBe('Book Fair — visits');
  });

  it('a teacher connects their own mailbox; a wrong password is refused; the password is never shown', async () => {
    const bad = await teacher.put('/api/mailbox/account').send(account({ password: 'wrong' }));
    expect(bad.status).toBe(400); expect(bad.body.message).toMatch(/username or password/);
    const ok = await teacher.put('/api/mailbox/account').send(account());
    expect(ok.status).toBe(200); expect(ok.body).toMatchObject({ connected: true, email: 'miss.sara@school.ae', hasPassword: true, canReceive: true });
    expect(JSON.stringify(ok.body)).not.toContain('mailbox-pass');
    const { rows } = await owner.query(`SELECT password_enc FROM user_mail_accounts WHERE email = 'miss.sara@school.ae'`);
    expect(rows[0].password_enc).toMatch(/^v1:/); expect(rows[0].password_enc).not.toContain('mailbox-pass');
    // others cannot see it; students have no email account
    expect((await principal.get('/api/mailbox/account')).body.connected).toBe(false);
    expect((await student.get('/api/mailbox/account')).status).toBe(403);
  });

  it('receives mail from the mailbox and replies from the own address', async () => {
    const s = await teacher.post('/api/mailbox/inbox/sync');
    expect(s.status).toBe(200); expect(s.body.added).toBe(2);
    expect((await teacher.post('/api/mailbox/inbox/sync')).body.added).toBe(0); // only new mail next time
    const list = (await teacher.get('/api/mailbox/inbox')).body;
    expect(list.map((m: any) => m.subject)).toEqual(expect.arrayContaining(['Meeting ✅', 'Invoice']));
    const m = list.find((x: any) => x.subject === 'Meeting ✅');
    expect(m.read).toBe(false);
    expect((await teacher.get(`/api/mailbox/inbox/${m.id}`)).body.body).toContain('Café');
    expect((await principal.get(`/api/mailbox/inbox/${m.id}`)).status).toBe(404);
    const before = smtp.got.length;
    expect((await teacher.post(`/api/mailbox/inbox/${m.id}/reply`).send({ body: 'Yes, Thursday at 10 works.' })).status).toBe(201);
    const sent = smtp.got.slice(before)[0];
    expect(sent.from).toBe('miss.sara@school.ae'); expect(sent.rcpt).toEqual(['ali@example.com']);
    expect(sent.data).toMatch(/In-Reply-To: <m1@example.com>/); expect(sent.data).toMatch(/Miss Sara, KG Rose/);
  });

  it('writes to outside addresses from the normal composer, from the own mailbox', async () => {
    const before = smtp.got.length;
    const r = await teacher.post('/api/mail').send({ to: [], external: ['dad@example.com'], subject: 'Reading week', body: 'Please read with your child.' });
    expect(r.status).toBe(201);
    await new Promise((res) => setTimeout(res, 800));
    const got = smtp.got.slice(before).find((x) => x.rcpt.includes('dad@example.com'));
    expect(got?.from).toBe('miss.sara@school.ae');
    const sent = (await teacher.get('/api/mail?folder=sent')).body.find((x: any) => x.id === r.body.id);
    expect(sent.toLabel).toContain('dad@example.com');
  });

  it('a campaign sends in timed batches, can be paused, and finishes', async () => {
    const emails = Array.from({ length: 5 }, (_, i) => `Parent ${i + 1} <p${i + 1}@example.com>`).join('\n') + '\np1@example.com\nnot-an-email';
    const c = (await teacher.post('/api/mailbox/campaigns').send({ name: 'Open day', subject: 'Open day, {first_name}!', body: 'Dear {name}, you are invited.', emails, batchSize: 2, intervalMin: 15, start: true })).body;
    expect(c.total).toBe(5); expect(c.status).toBe('SCHEDULED'); expect(new Date(c.finishEstimate).getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
    const svc = app.get(CampaignService); const before = smtp.got.length;
    await svc.tick();
    let now = (await teacher.get(`/api/mailbox/campaigns/${c.id}`)).body;
    expect(now).toMatchObject({ status: 'SENDING', sent: 2, pending: 3 });
    expect(smtp.got.length - before).toBe(2);
    expect(smtp.got[before].data).toMatch(/Subject: Open day, Parent!/); expect(smtp.got[before].data).toMatch(/Dear Parent 1, you are invited/);
    await svc.tick(); // not due yet: the next batch waits for the interval
    expect((await teacher.get(`/api/mailbox/campaigns/${c.id}`)).body.sent).toBe(2);
    expect((await teacher.post(`/api/mailbox/campaigns/${c.id}/action`).send({ action: 'pause' })).body.status).toBe('PAUSED');
    await owner.query(`UPDATE mail_campaigns SET next_at = now() - interval '1 minute' WHERE id = $1`, [c.id]);
    await svc.tick();
    expect((await teacher.get(`/api/mailbox/campaigns/${c.id}`)).body.sent).toBe(2); // paused
    await teacher.post(`/api/mailbox/campaigns/${c.id}/action`).send({ action: 'resume' });
    for (let i = 0; i < 2; i++) { await svc.tick(); await owner.query(`UPDATE mail_campaigns SET next_at = now() - interval '1 minute' WHERE id = $1 AND status = 'SENDING'`, [c.id]); }
    now = (await teacher.get(`/api/mailbox/campaigns/${c.id}`)).body;
    expect(now).toMatchObject({ status: 'DONE', sent: 5, failed: 0 });
    expect((await principal.get(`/api/mailbox/campaigns/${c.id}`)).status).toBe(404);
  });

  it('a scheduled campaign waits for its start time; groups reach users with an email address', async () => {
    const at = new Date(Date.now() + 3 * 3600_000).toISOString();
    const c = (await sales.post('/api/mailbox/campaigns').send({ name: 'New catalogue', subject: 'New books', body: 'See our new books.', to: ['school-admins'], emails: 'buyer@school.com', batchSize: 100, intervalMin: 60, startsAt: at, start: true, useOwnAccount: false })).body;
    expect(c.status).toBe('SCHEDULED'); expect(c.total).toBeGreaterThanOrEqual(1);
    await app.get(CampaignService).tick();
    expect((await sales.get(`/api/mailbox/campaigns/${c.id}`)).body.sent).toBe(0);
    expect((await sales.post(`/api/mailbox/campaigns/${c.id}/action`).send({ action: 'cancel' })).body.status).toBe('CANCELLED');
    expect((await sales.delete(`/api/mailbox/campaigns/${c.id}`)).status).toBe(200);
    // teachers cannot reach the whole school through a campaign
    expect((await teacher.post('/api/mailbox/campaigns').send({ name: 'x', subject: 'x', body: 'x', to: ['students'], batchSize: 10, intervalMin: 5 })).status).toBe(403);
  });

  it('disconnecting removes the mailbox and its copied mail', async () => {
    expect((await teacher.delete('/api/mailbox/account')).body.connected).toBe(false);
    expect((await teacher.get('/api/mailbox/inbox')).body).toEqual([]);
  });
});
