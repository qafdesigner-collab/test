import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { MailerService } from './mailer.service';
import { DbService } from '../db/db.service';
import { messageOutbox, notifications } from '../db/schema';
import { channelInfo, normalisePhone, sendMessage } from './channels';

export interface NotifyTarget { id: string; phone?: string | null }
export interface NotifyMessage { kind: string; title: string; body?: string; link?: string }

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Notifications');
  private timers: NodeJS.Timeout[] = [];
  private sending = false;
  constructor(private readonly db: DbService, private readonly mailer: MailerService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.NOTIFY_WORKER === 'off') return;
    this.timers.push(setInterval(() => this.sendPending().catch((e) => this.log.error(e.message)), 60_000));
    this.timers.push(setInterval(() => this.runReminders().catch((e) => this.log.error(e.message)), 3600_000));
    this.timers.push(setTimeout(() => this.runReminders().catch((e) => this.log.error(e.message)), 30_000));
    for (const t of this.timers) t.unref();
  }
  onModuleDestroy() { this.timers.forEach((t) => clearInterval(t)); }

  // ---------------------------------------------------------------- in-app
  list(unreadOnly = false, limit = 30) {
    const u = this.db.ctx.userId!;
    return this.db.q.select().from(notifications)
      .where(and(eq(notifications.userId, u), unreadOnly ? isNull(notifications.readAt) : undefined))
      .orderBy(desc(notifications.createdAt)).limit(Math.min(limit, 100));
  }
  async unread() {
    const { rows } = await this.db.q.execute(sql`SELECT count(*)::int AS n FROM notifications WHERE user_id = ${this.db.ctx.userId} AND read_at IS NULL`);
    return { unread: (rows[0] as any).n };
  }
  async markRead(id: string) {
    const r = await this.db.q.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, this.db.ctx.userId!))).returning({ id: notifications.id });
    if (!r.length) throw new NotFoundException();
    return { ok: true };
  }
  async markAll() {
    await this.db.q.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, this.db.ctx.userId!), isNull(notifications.readAt)));
    return { ok: true };
  }

  /**
   * Notify users in the current tenant: always in-app; also WhatsApp/SMS when `phone` is true and the user has a number.
   * Runs inside the caller's transaction (RLS: own school, or publisher staff).
   */
  async notify(targets: NotifyTarget[], m: NotifyMessage, opts: { phone?: boolean; schoolId?: string | null; email?: boolean } = {}) {
    if (!targets.length) return 0;
    const ctx = this.db.ctx; const schoolId = opts.schoolId !== undefined ? opts.schoolId : ctx.schoolId ?? null;
    const uniq = [...new Map(targets.map((t) => [t.id, t])).values()];
    for (let i = 0; i < uniq.length; i += 500) {
      await this.db.q.insert(notifications).values(uniq.slice(i, i + 500).map((t) => ({
        publisherId: ctx.publisherId, schoolId, userId: t.id, kind: m.kind, title: m.title.slice(0, 200), body: (m.body ?? '').slice(0, 1000), link: m.link ?? null,
      })));
    }
    if (opts.phone) {
      const text = [m.title, m.body].filter(Boolean).join('\n');
      const phones = uniq.filter((t) => t.phone && normalisePhone(t.phone));
      for (let i = 0; i < phones.length; i += 500) {
        await this.db.q.insert(messageOutbox).values(phones.slice(i, i + 500).map((t) => ({
          publisherId: ctx.publisherId, schoolId, userId: t.id, kind: m.kind, toAddress: t.phone!, body: text,
        })));
      }
    }
    if (opts.email !== false) await this.emailCopies(uniq.map((t) => t.id), m).catch(() => undefined);
    return uniq.length;
  }

  /** Copies of in-app notifications to users who have an email address (when the publisher switched email on). */
  private async emailCopies(ids: string[], m: NotifyMessage) {
    const c = await this.mailer.config();
    if (!c || !c.notify_students || !ids.length) return;
    const { rows } = await this.db.q.execute(sql`SELECT DISTINCT email::text AS email FROM users WHERE id = ANY(${`{${ids.join(',')}}`}::uuid[]) AND email IS NOT NULL AND status = 'ACTIVE'`);
    const to = (rows as any[]).map((r) => r.email).filter(Boolean);
    if (!to.length) return;
    const body = m.body ?? '';
    this.mailer.later(c, { to, subject: m.title.slice(0, 200), text: `${body}${m.link && c.site_url ? `\n\n${c.site_url.replace(/\/$/, '')}${m.link}` : ''}`, html: this.mailer.html(c, m.title, body, m.link) });
  }

  // ---------------------------------------------------------------- outbox
  outbox(limit = 100) {
    return this.db.q.select({ id: messageOutbox.id, kind: messageOutbox.kind, toAddress: messageOutbox.toAddress, body: messageOutbox.body, status: messageOutbox.status,
      attempts: messageOutbox.attempts, lastError: messageOutbox.lastError, createdAt: messageOutbox.createdAt, sentAt: messageOutbox.sentAt })
      .from(messageOutbox).orderBy(desc(messageOutbox.createdAt)).limit(Math.min(limit, 500));
  }
  channel() { return channelInfo(); }

  async test(phone: string) {
    if (!normalisePhone(phone)) throw new BadRequestException('Enter a phone number');
    const [row] = await this.db.q.insert(messageOutbox).values({ publisherId: this.db.ctx.publisherId, kind: 'TEST', toAddress: phone,
      body: 'Test message from Knowledge Gate. If you can read this, school messages will reach parents and schools.' }).returning();
    return { queued: row.id };
  }

  /** Sends queued messages (all publishers; claimed atomically so several app processes never send twice). */
  async sendPending(limit = 25) {
    if (this.sending) return { sent: 0 };
    this.sending = true; let sent = 0;
    try {
      const { rows } = await this.db.root.execute(sql`SELECT * FROM outbox_claim(${limit})`);
      for (const m of rows as any[]) {
        let status = 'FAILED'; let error: string | null = null;
        try { const r = await sendMessage(m.to_address, m.body, m.kind); status = r.status; error = r.detail ?? null; if (status === 'SENT') sent++; }
        catch (e: any) { error = String(e.message); }
        await this.db.root.execute(sql`SELECT outbox_done(${m.id}::uuid, ${status}, ${error})`);
      }
      return { sent, processed: rows.length };
    } finally { this.sending = false; }
  }

  async runReminders() {
    const { rows } = await this.db.root.execute(sql`SELECT queue_reminders() AS n`);
    const n = (rows[0] as any).n;
    if (n) this.log.log(`Queued ${n} reminder(s)`);
    await this.sendPending();
    return { reminders: n };
  }
}
