import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Logger, Module, NotFoundException, OnModuleDestroy, OnModuleInit, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { sql } from 'drizzle-orm';
import { DbService, TenantCtx } from '../db/db.service';
import { ManualTx, Roles } from '../common/decorators';
import { MailerService, SmtpConfig } from '../notifications/mailer.service';
import { open, seal } from '../common/secret-box';
import { fetchInbox, parseMail } from './imap';
import { MailModule, MailService } from './mail.controller';

const SENDERS = ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES', 'SCHOOL_ADMIN', 'TEACHER'];
const Id = () => new ParseUUIDPipe();
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

class AccountDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(120) fromName?: string;
  @IsOptional() @IsString() @MaxLength(200) username?: string;
  /** Leave empty to keep the saved password. */
  @IsOptional() @IsString() @MaxLength(300) password?: string;
  @IsString() @Length(1, 200) smtpHost!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(65535) smtpPort!: number;
  @IsBoolean() smtpSecure!: boolean;
  @IsOptional() @IsString() @MaxLength(200) imapHost?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) imapPort?: number;
  @IsOptional() @IsBoolean() imapSecure?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) signature?: string;
}
class ReplyDto { @IsString() @Length(1, 20000) body!: string; }
class SendDto {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(200, { each: true }) to!: string[];
  @IsString() @Length(1, 200) subject!: string;
  @IsString() @MaxLength(20000) body!: string;
}
class CampaignDto {
  @IsString() @Length(1, 120) name!: string;
  @IsString() @Length(1, 200) subject!: string;
  @IsString() @Length(1, 50000) body!: string;
  /** Group keys (as in the mail composer) and/or u:<id>. */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(120, { each: true }) to?: string[];
  /** Pasted addresses: one per line or comma separated; "Name <email>" works too. */
  @IsOptional() @IsString() @MaxLength(2_000_000) emails?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(500) batchSize!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) intervalMin!: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsBoolean() start?: boolean;
  @IsOptional() @IsBoolean() useOwnAccount?: boolean;
}
class ListQuery { @IsOptional() @IsString() @MaxLength(100) q?: string; }
class ActionDto { @IsIn(['start', 'pause', 'resume', 'cancel']) action!: string; }

/** Turns pasted text into unique {email, name} pairs. */
export function parseAddresses(text: string) {
  const out = new Map<string, string>(); const bad: string[] = [];
  for (const raw of text.split(/[\n;,]+/)) {
    const s = raw.trim(); if (!s) continue;
    const m = /^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(s) ?? /^(.*?)[\s\t]+(\S+@\S+)$/.exec(s);
    const email = (m ? m[2] : s).trim().toLowerCase(); const name = (m ? m[1] : '').trim();
    if (!EMAIL.test(email) || email.length > 200) { bad.push(s); continue; }
    if (!out.has(email) || (!out.get(email) && name)) out.set(email, name.slice(0, 120));
  }
  return { list: [...out].map(([email, name]) => ({ email, name })), bad };
}

/** A user's own mailbox: send from their own address and read what arrives there. */
@Injectable()
export class MailAccountService {
  constructor(private readonly db: DbService, private readonly mailer: MailerService) {}
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }

  async raw() { return (await this.rows(sql`SELECT * FROM user_mail_accounts WHERE user_id = ${this.db.ctx.userId}`))[0] ?? null; }

  /** SMTP settings for sending as this user (null when they have not connected a mailbox). */
  async smtp(): Promise<SmtpConfig | null> {
    const a = await this.raw(); if (!a?.smtp_host) return null;
    const sys = (await this.rows(sql`SELECT site_url FROM mail_smtp_config()`))[0];
    return { enabled: true, host: a.smtp_host, port: a.smtp_port, secure: a.smtp_secure, username: a.username || a.email, password: open(a.password_enc), from_name: a.from_name, from_email: a.email, notify_students: false, site_url: sys?.site_url ?? '' };
  }

  async get() {
    const a = await this.raw();
    if (!a) return { connected: false };
    return { connected: true, email: a.email, fromName: a.from_name, username: a.username, hasPassword: !!a.password_enc, smtpHost: a.smtp_host, smtpPort: a.smtp_port, smtpSecure: a.smtp_secure,
      imapHost: a.imap_host, imapPort: a.imap_port, imapSecure: a.imap_secure, signature: a.signature, lastSyncAt: a.last_sync_at, lastError: a.last_error, canReceive: !!a.imap_host };
  }

  async save(d: AccountDto) {
    const old = await this.raw();
    const pass = d.password ? seal(d.password) : old?.password_enc ?? '';
    if (!pass) throw new BadRequestException('Enter the mailbox password');
    const user = (d.username ?? '').trim() || d.email.trim();
    // Check the login before saving, so people find mistakes straight away.
    const smtp: SmtpConfig = { enabled: true, host: d.smtpHost.trim(), port: d.smtpPort, secure: d.smtpSecure, username: user, password: open(pass), from_name: d.fromName?.trim() ?? '', from_email: d.email.trim(), notify_students: false, site_url: '' };
    try { await this.mailer.verify(smtp); } catch (e: any) { throw new BadRequestException(`Sending (SMTP) did not work: ${friendly(e)}`); }
    if (d.imapHost?.trim()) {
      try { await fetchInbox({ host: d.imapHost.trim(), port: d.imapPort ?? 993, secure: d.imapSecure ?? true, username: user, password: open(pass) }, 2 ** 31, 1, 15_000); }
      catch (e: any) { throw new BadRequestException(`Receiving (IMAP) did not work: ${friendly(e)}`); }
    }
    const reset = old && (old.email !== d.email.trim() || old.imap_host !== (d.imapHost ?? '').trim());
    if (reset) await this.db.q.execute(sql`DELETE FROM user_mail_inbox WHERE user_id = ${this.db.ctx.userId}`);
    await this.db.q.execute(sql`INSERT INTO user_mail_accounts (user_id, publisher_id, school_id, email, from_name, username, password_enc, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, signature, updated_at)
      VALUES (${this.db.ctx.userId}, ${this.db.ctx.publisherId}, ${this.db.ctx.schoolId ?? null}, ${d.email.trim()}, ${d.fromName?.trim() ?? ''}, ${(d.username ?? '').trim()}, ${pass},
        ${d.smtpHost.trim()}, ${d.smtpPort}, ${d.smtpSecure}, ${(d.imapHost ?? '').trim()}, ${d.imapPort ?? 993}, ${d.imapSecure ?? true}, ${d.signature ?? ''}, now())
      ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, from_name = excluded.from_name, username = excluded.username, password_enc = excluded.password_enc,
        smtp_host = excluded.smtp_host, smtp_port = excluded.smtp_port, smtp_secure = excluded.smtp_secure, imap_host = excluded.imap_host, imap_port = excluded.imap_port,
        imap_secure = excluded.imap_secure, signature = excluded.signature, last_error = NULL, updated_at = now()${reset ? sql`, last_sync_at = NULL` : sql``}`);
    return this.get();
  }

  async remove() {
    await this.db.q.execute(sql`DELETE FROM user_mail_inbox WHERE user_id = ${this.db.ctx.userId}`);
    await this.db.q.execute(sql`DELETE FROM user_mail_accounts WHERE user_id = ${this.db.ctx.userId}`);
    return { connected: false };
  }

  /** Copies new mail from the user's mailbox (runs outside a long transaction: network first, then save). */
  async sync(ctx: TenantCtx) {
    const a = await this.db.withContext(ctx, () => this.raw());
    if (!a?.imap_host) throw new BadRequestException('Add the incoming mail server (IMAP) to your email account first');
    const last = await this.db.withContext(ctx, async () => Number((await this.rows(sql`SELECT coalesce(max(uid), 0) AS n FROM user_mail_inbox WHERE user_id = ${ctx.userId}`))[0].n));
    let got: Awaited<ReturnType<typeof fetchInbox>>;
    try { got = await fetchInbox({ host: a.imap_host, port: a.imap_port, secure: a.imap_secure, username: a.username || a.email, password: open(a.password_enc) }, last, last ? 200 : 40); }
    catch (e: any) {
      const msg = friendly(e);
      await this.db.withContext(ctx, () => this.db.q.execute(sql`UPDATE user_mail_accounts SET last_error = ${msg} WHERE user_id = ${ctx.userId}`));
      throw new BadRequestException(`Could not check your mailbox: ${msg}`);
    }
    return this.db.withContext(ctx, async () => {
      for (const m of got.messages) {
        const p = parseMail(m.raw);
        await this.db.q.execute(sql`INSERT INTO user_mail_inbox (user_id, publisher_id, uid, message_id, from_name, from_email, to_text, subject, sent_at, body, read)
          VALUES (${ctx.userId}, ${ctx.publisherId}, ${m.uid}, ${p.messageId}, ${p.fromName}, ${p.fromEmail}, ${p.to}, ${p.subject || '(no subject)'}, ${p.date?.toISOString() ?? null}, ${p.text}, ${m.seen})
          ON CONFLICT (user_id, uid) DO NOTHING`);
      }
      await this.db.q.execute(sql`UPDATE user_mail_accounts SET last_sync_at = now(), last_error = NULL WHERE user_id = ${ctx.userId}`);
      return { added: got.messages.length };
    });
  }

  async list(q?: string) {
    const like = q?.trim() ? `%${q.trim()}%` : null;
    return this.rows(sql`SELECT id, from_name AS "fromName", from_email AS "fromEmail", subject, left(body, 160) AS snippet, coalesce(sent_at, created_at) AS "createdAt", read
      FROM user_mail_inbox WHERE user_id = ${this.db.ctx.userId} ${like ? sql`AND (subject ILIKE ${like} OR from_email ILIKE ${like} OR from_name ILIKE ${like} OR body ILIKE ${like})` : sql``}
      ORDER BY coalesce(sent_at, created_at) DESC LIMIT 200`);
  }

  private async one(id: string) {
    const [m] = await this.rows(sql`SELECT * FROM user_mail_inbox WHERE id = ${id} AND user_id = ${this.db.ctx.userId}`);
    if (!m) throw new NotFoundException('Email not found');
    return m;
  }
  async read(id: string) {
    const m = await this.one(id);
    if (!m.read) await this.db.q.execute(sql`UPDATE user_mail_inbox SET read = true WHERE id = ${id}`);
    return { id: m.id, fromName: m.from_name, fromEmail: m.from_email, to: m.to_text, subject: m.subject, body: m.body, createdAt: m.sent_at ?? m.created_at };
  }
  async remove1(id: string) { await this.one(id); await this.db.q.execute(sql`DELETE FROM user_mail_inbox WHERE id = ${id}`); return { ok: true }; }

  private async mustSmtp() {
    const c = await this.smtp();
    if (!c) throw new BadRequestException('Connect your email account first (Mail → My email account)');
    return c;
  }
  private withSignature(body: string, sig?: string) { return sig?.trim() ? `${body}\n\n--\n${sig.trim()}` : body; }

  async reply(id: string, d: ReplyDto) {
    const m = await this.one(id); const c = await this.mustSmtp(); const a = await this.raw();
    const subject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`.slice(0, 200);
    const quoted = `${this.withSignature(d.body, a.signature)}\n\nOn ${new Date(m.sent_at ?? m.created_at).toUTCString()}, ${m.from_name || m.from_email} wrote:\n${String(m.body).split('\n').slice(0, 60).map((l: string) => `> ${l}`).join('\n')}`;
    try { await this.mailer.sendOne(c, { to: m.from_email, subject, text: quoted, inReplyTo: m.message_id || undefined }); }
    catch (e: any) { throw new BadRequestException(`Your mail server did not send it: ${friendly(e)}`); }
    return { ok: true };
  }

  /** New email to outside addresses, from the user's own account. */
  async send(d: SendDto) {
    const to = parseAddresses(d.to.join('\n'));
    if (to.bad.length) throw new BadRequestException(`Not an email address: ${to.bad.slice(0, 3).join(', ')}`);
    if (!to.list.length) throw new BadRequestException('Add at least one email address');
    const c = await this.mustSmtp(); const a = await this.raw();
    try { for (const r of to.list) await this.mailer.sendOne(c, { to: r.name ? `"${r.name.replace(/"/g, '')}" <${r.email}>` : r.email, subject: d.subject, text: this.withSignature(d.body, a.signature) }); }
    catch (e: any) { throw new BadRequestException(`Your mail server did not send it: ${friendly(e)}`); }
    return { sent: to.list.length };
  }
}

/** Bulk email in timed batches, e.g. 50 emails every 10 minutes, starting now or at a set time. */
@Injectable()
export class CampaignService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Campaigns');
  private timer?: NodeJS.Timeout; private busy = false;
  constructor(private readonly db: DbService, private readonly mailer: MailerService, private readonly mail: MailService, private readonly accounts: MailAccountService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.NOTIFY_WORKER === 'off') return;
    this.timer = setInterval(() => this.tick().catch((e) => this.log.error(e.message)), 30_000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }

  async create(d: CampaignDto) {
    const people = d.to?.length ? (await this.mail.resolve(d.to, 20000)) : { ids: [] as string[], label: '' };
    const users = people.ids.length ? await this.rows(sql`SELECT DISTINCT ON (lower(email::text)) lower(email::text) AS email, display_name AS name FROM users
      WHERE id = ANY(${`{${people.ids.join(',')}}`}::uuid[]) AND email IS NOT NULL AND status = 'ACTIVE'`) : [];
    const pasted = parseAddresses(d.emails ?? '');
    if (pasted.bad.length > 0 && pasted.bad.length > pasted.list.length / 10 + 5) throw new BadRequestException(`Some lines are not email addresses, e.g. ${pasted.bad.slice(0, 3).join(', ')}`);
    const all = new Map<string, string>();
    for (const u of users) all.set(u.email, u.name ?? '');
    for (const p of pasted.list) if (!all.has(p.email)) all.set(p.email, p.name);
    if (!all.size) throw new BadRequestException('Nobody to send to: choose groups with email addresses, or paste email addresses');
    if (all.size > 20000) throw new BadRequestException('A campaign can reach up to 20,000 addresses');
    const label = [people.label, pasted.list.length ? `${pasted.list.length} pasted address${pasted.list.length === 1 ? '' : 'es'}` : ''].filter(Boolean).join(' + ').slice(0, 300);
    const starts = d.startsAt ? new Date(d.startsAt) : new Date();
    const [c] = await this.rows(sql`INSERT INTO mail_campaigns (publisher_id, school_id, owner_id, name, subject, body, audience_label, batch_size, interval_min, starts_at, next_at, status, use_own_account)
      VALUES (${this.db.ctx.publisherId}, ${this.db.ctx.schoolId ?? null}, ${this.db.ctx.userId}, ${d.name.trim()}, ${d.subject.trim()}, ${d.body}, ${label}, ${d.batchSize}, ${d.intervalMin},
        ${starts.toISOString()}, ${d.start ? starts.toISOString() : null}, ${d.start ? 'SCHEDULED' : 'DRAFT'}, ${d.useOwnAccount ?? true}) RETURNING id`);
    const list = [...all];
    for (let i = 0; i < list.length; i += 1000) {
      const chunk = list.slice(i, i + 1000);
      await this.db.q.execute(sql`INSERT INTO mail_campaign_recipients (campaign_id, owner_id, publisher_id, email, name)
        SELECT ${c.id}, ${this.db.ctx.userId}, ${this.db.ctx.publisherId}, x->>0, x->>1 FROM jsonb_array_elements(${JSON.stringify(chunk)}::jsonb) x ON CONFLICT DO NOTHING`);
    }
    return this.get(c.id);
  }

  async list() {
    return this.rows(sql`SELECT c.id, c.name, c.subject, c.status, c.audience_label AS "audience", c.batch_size AS "batchSize", c.interval_min AS "intervalMin", c.starts_at AS "startsAt", c.next_at AS "nextAt",
        c.created_at AS "createdAt", c.finished_at AS "finishedAt", c.last_error AS "lastError",
        (SELECT count(*)::int FROM mail_campaign_recipients r WHERE r.campaign_id = c.id) AS total,
        (SELECT count(*)::int FROM mail_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'SENT') AS sent,
        (SELECT count(*)::int FROM mail_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'FAILED') AS failed
      FROM mail_campaigns c WHERE c.owner_id = ${this.db.ctx.userId} ORDER BY c.created_at DESC LIMIT 100`);
  }

  async get(id: string) {
    const [c] = (await this.list()).filter((x: any) => x.id === id);
    if (!c) throw new NotFoundException('Campaign not found');
    const [full] = await this.rows(sql`SELECT body, use_own_account FROM mail_campaigns WHERE id = ${id}`);
    const recipients = await this.rows(sql`SELECT email, name, status, error, sent_at AS "sentAt" FROM mail_campaign_recipients WHERE campaign_id = ${id}
      ORDER BY CASE status WHEN 'FAILED' THEN 0 WHEN 'SENT' THEN 1 ELSE 2 END, sent_at DESC NULLS LAST, email LIMIT 500`);
    const left = c.total - c.sent - c.failed;
    const batches = Math.ceil(left / c.batchSize);
    const eta = ['SCHEDULED', 'SENDING'].includes(c.status) && left > 0 && c.nextAt ? new Date(new Date(c.nextAt).getTime() + Math.max(0, batches - 1) * c.intervalMin * 60_000) : null;
    return { ...c, body: full.body, useOwnAccount: full.use_own_account, pending: left, finishEstimate: eta, recipients };
  }

  async act(id: string, action: string) {
    const c = await this.get(id);
    const to: Record<string, [string[], ReturnType<typeof sql>]> = {
      start: [['DRAFT'], sql`status = 'SCHEDULED', next_at = greatest(starts_at, now())`],
      pause: [['SCHEDULED', 'SENDING'], sql`status = 'PAUSED'`],
      resume: [['PAUSED'], sql`status = 'SCHEDULED', next_at = greatest(starts_at, now()), last_error = NULL`],
      cancel: [['DRAFT', 'SCHEDULED', 'SENDING', 'PAUSED'], sql`status = 'CANCELLED', finished_at = now(), next_at = NULL`],
    };
    const [allowed, set] = to[action];
    if (!allowed.includes(c.status)) throw new BadRequestException(`This campaign is ${c.status.toLowerCase()}; it cannot ${action} now`);
    await this.db.q.execute(sql`UPDATE mail_campaigns SET ${set} WHERE id = ${id}`);
    return this.get(id);
  }

  async remove(id: string) {
    const c = await this.get(id);
    if (['SCHEDULED', 'SENDING'].includes(c.status)) throw new BadRequestException('Pause or cancel the campaign first');
    await this.db.q.execute(sql`DELETE FROM mail_campaigns WHERE id = ${id}`);
    return { ok: true };
  }

  /** Background sender: one batch per due campaign. */
  async tick() {
    if (this.busy) return { batches: 0 };
    this.busy = true; let batches = 0;
    try {
      const { rows } = await this.db.root.execute(sql`SELECT * FROM mail_campaigns_due(20)`);
      for (const r of rows as any[]) {
        const ctx: TenantCtx = { userId: r.owner_id, publisherId: r.publisher_id, schoolId: r.school_id, roles: r.roles ?? [], staff: !r.school_id };
        try { if (await this.batch(r.id, ctx)) batches++; } catch (e: any) { this.log.warn(`Campaign ${r.id}: ${e.message}`); }
      }
      return { batches };
    } finally { this.busy = false; }
  }

  private async batch(id: string, ctx: TenantCtx) {
    // 1) claim the batch (short transaction)
    const claimed = await this.db.withContext(ctx, async () => {
      const [c] = await this.rows(sql`UPDATE mail_campaigns SET status = 'SENDING', next_at = now() + make_interval(mins => interval_min)
        WHERE id = ${id} AND status IN ('SCHEDULED', 'SENDING') AND next_at <= now() RETURNING *`);
      if (!c) return null;
      const list = await this.rows(sql`SELECT email, name FROM mail_campaign_recipients WHERE campaign_id = ${id} AND status = 'PENDING' ORDER BY email LIMIT ${c.batch_size}`);
      const own = c.use_own_account ? await this.accounts.smtp() : null;
      const smtp = own ?? (await this.mailer.config());
      const sender = (await this.rows(sql`SELECT display_name, email::text AS email FROM users WHERE id = ${ctx.userId}`))[0];
      if (!smtp) {
        await this.db.q.execute(sql`UPDATE mail_campaigns SET status = 'PAUSED', last_error = 'No email account to send from: connect your email account (or ask the super admin to set up outgoing email)' WHERE id = ${id}`);
        return null;
      }
      return { c, list, smtp, own: !!own, sender };
    });
    if (!claimed) return false;
    const { c, list, smtp, own, sender } = claimed;
    // 2) send (no transaction open while talking to the mail server)
    const results: { email: string; ok: boolean; error?: string }[] = [];
    for (const r of list) {
      const first = (r.name || '').split(/\s+/)[0] || '';
      const fill = (s: string) => s.replace(/\{name\}/gi, r.name || 'there').replace(/\{first_name\}/gi, first || 'there').replace(/\{email\}/gi, r.email);
      const text = `${fill(c.body)}\n\n—\nYou receive this email from ${sender?.display_name ?? smtp.from_name}${smtp.from_name ? ` (${smtp.from_name})` : ''}. To stop receiving these emails, reply with “unsubscribe”.`;
      try {
        await this.mailer.sendOne(smtp, { to: r.name ? `"${r.name.replace(/"/g, '')}" <${r.email}>` : r.email, subject: fill(c.subject), text,
          html: own ? undefined : this.mailer.html(smtp, fill(c.subject), text, null), replyTo: !own && sender?.email ? sender.email : undefined,
          headers: { 'List-Unsubscribe': `<mailto:${smtp.from_email}?subject=unsubscribe>` } });
        results.push({ email: r.email, ok: true });
      } catch (e: any) { results.push({ email: r.email, ok: false, error: friendly(e) }); }
    }
    // 3) record the results
    await this.db.withContext(ctx, async () => {
      const ok = results.filter((x) => x.ok).map((x) => x.email); const bad = results.filter((x) => !x.ok);
      if (ok.length) await this.db.q.execute(sql`UPDATE mail_campaign_recipients SET status = 'SENT', sent_at = now(), error = NULL WHERE campaign_id = ${id} AND email = ANY(${`{${ok.map((e) => `"${e}"`).join(',')}}`}::text[])`);
      for (const b of bad) await this.db.q.execute(sql`UPDATE mail_campaign_recipients SET status = 'FAILED', error = ${b.error ?? 'Not sent'} WHERE campaign_id = ${id} AND email = ${b.email}`);
      // every address failing (e.g. the password changed) pauses the campaign instead of burning through the list
      if (results.length && !ok.length) await this.db.q.execute(sql`UPDATE mail_campaigns SET status = 'PAUSED', last_error = ${`The mail server refused this batch: ${bad[0]?.error ?? ''}`.slice(0, 500)} WHERE id = ${id}`);
      const [{ n }] = await this.rows(sql`SELECT count(*)::int AS n FROM mail_campaign_recipients WHERE campaign_id = ${id} AND status = 'PENDING'`);
      if (!n) await this.db.q.execute(sql`UPDATE mail_campaigns SET status = 'DONE', finished_at = now(), next_at = NULL WHERE id = ${id} AND status = 'SENDING'`);
    });
    return true;
  }
}

/** A short, human message for mail-server errors (never echoes the password). */
function friendly(e: any) {
  const m = String(e?.message ?? e);
  if (/ENOTFOUND|EAI_AGAIN/.test(m)) return 'the server name was not found — check the server address';
  if (/ECONNREFUSED/.test(m)) return 'the server refused the connection — check the port';
  if (/ETIMEDOUT|did not answer|timeout/i.test(m)) return 'the server did not answer in time — check the address and port';
  if (/certificate|SSL|TLS|wrong version/i.test(m)) return 'secure connection failed — try the other security option (SSL on port 465/993, or STARTTLS on 587/143)';
  if (/auth|login|credentials|535|534/i.test(m)) return 'the username or password was not accepted (Gmail and Outlook need an “app password”)';
  return m.slice(0, 200);
}

@ApiTags('mail')
@Controller()
export class MailAccountController {
  constructor(private readonly acc: MailAccountService, private readonly camp: CampaignService) {}
  @Roles(...SENDERS) @Get('mailbox/account') account() { return this.acc.get(); }
  @Roles(...SENDERS) @Put('mailbox/account') save(@Body() d: AccountDto) { return this.acc.save(d); }
  @Roles(...SENDERS) @Delete('mailbox/account') disconnect() { return this.acc.remove(); }
  @Roles(...SENDERS) @Get('mailbox/inbox') emails(@Query() q: ListQuery) { return this.acc.list(q.q); }
  @Roles(...SENDERS) @ManualTx() @Post('mailbox/inbox/sync') @HttpCode(200) sync(@Req() req: any) { return this.acc.sync(req.ctx); }
  @Roles(...SENDERS) @Post('mailbox/inbox/send') send(@Body() d: SendDto) { return this.acc.send(d); }
  @Roles(...SENDERS) @Get('mailbox/inbox/:id') email(@Param('id', Id()) id: string) { return this.acc.read(id); }
  @Roles(...SENDERS) @Delete('mailbox/inbox/:id') delEmail(@Param('id', Id()) id: string) { return this.acc.remove1(id); }
  @Roles(...SENDERS) @Post('mailbox/inbox/:id/reply') reply(@Param('id', Id()) id: string, @Body() d: ReplyDto) { return this.acc.reply(id, d); }

  @Roles(...SENDERS) @Get('mailbox/campaigns') campaigns() { return this.camp.list(); }
  @Roles(...SENDERS) @Post('mailbox/campaigns') create(@Body() d: CampaignDto) { return this.camp.create(d); }
  @Roles(...SENDERS) @Get('mailbox/campaigns/:id') campaign(@Param('id', Id()) id: string) { return this.camp.get(id); }
  @Roles(...SENDERS) @Post('mailbox/campaigns/:id/action') @HttpCode(200) act(@Param('id', Id()) id: string, @Body() d: ActionDto) { return this.camp.act(id, d.action); }
  @Roles(...SENDERS) @Delete('mailbox/campaigns/:id') del(@Param('id', Id()) id: string) { return this.camp.remove(id); }
}

@Module({ imports: [MailModule], controllers: [MailAccountController], providers: [MailAccountService, CampaignService], exports: [MailAccountService] })
export class MailAccountsModule {}
