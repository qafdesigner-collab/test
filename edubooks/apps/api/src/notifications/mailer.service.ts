import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import * as nodemailer from 'nodemailer';
import { DbService } from '../db/db.service';

export interface SmtpConfig { enabled: boolean; host: string; port: number; secure: boolean; username: string; password: string; from_name: string; from_email: string; notify_students: boolean; site_url: string }
export interface OutMail { to: string[]; subject: string; text: string; html?: string; replyTo?: string; ics?: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Sends copies by email through the publisher's own SMTP account (e.g. a cPanel mailbox).
 * Sending never blocks or breaks the action that triggered it: it runs after the response, in small BCC batches.
 */
@Injectable()
export class MailerService {
  private readonly log = new Logger('Mailer');
  private cache = new Map<string, nodemailer.Transporter>();
  constructor(private readonly db: DbService) {}

  /** Current publisher's SMTP settings (via a SECURITY DEFINER function, so school users never read the password). */
  async config(): Promise<SmtpConfig | null> {
    const { rows } = await this.db.q.execute(sql`SELECT * FROM mail_smtp_config()`);
    const c = rows[0] as any as SmtpConfig | undefined;
    return c && c.enabled && c.host && c.from_email ? c : null;
  }

  private transport(c: SmtpConfig) {
    const key = JSON.stringify([c.host, c.port, c.secure, c.username, c.password]);
    let t = this.cache.get(key);
    if (!t) {
      t = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: c.username ? { user: c.username, pass: c.password } : undefined,
        connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 });
      this.cache.set(key, t);
    }
    return t;
  }

  /** A simple branded HTML body with a button back to the platform. */
  html(c: SmtpConfig, title: string, body: string, link?: string | null) {
    const url = link && c.site_url ? `${c.site_url.replace(/\/$/, '')}${link}` : null;
    return `<!doctype html><html><body style="margin:0;background:#f4f6fc;font-family:Arial,Helvetica,sans-serif;color:#1e293b">
      <div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
      <h2 style="margin:0 0 12px;font-size:18px;color:#312e81">${esc(title)}</h2>
      <div style="white-space:pre-wrap;line-height:1.5;font-size:14px">${esc(body)}</div>
      ${url ? `<p style="margin:20px 0 0"><a href="${esc(url)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:bold">Open in ${esc(c.from_name || 'the app')}</a></p>` : ''}
      </div><p style="text-align:center;color:#64748b;font-size:12px">${esc(c.from_name || '')}</p></div></body></html>`;
  }

  /** Sends now (used by the "send a test email" button). Throws on failure. */
  async sendNow(c: SmtpConfig, m: OutMail) {
    const from = c.from_name ? `"${c.from_name.replace(/"/g, '')}" <${c.from_email}>` : c.from_email;
    const attachments = m.ics ? [{ filename: 'invite.ics', content: m.ics, contentType: 'text/calendar; charset=utf-8; method=REQUEST' }] : undefined;
    for (let i = 0; i < m.to.length; i += 50) {
      const batch = m.to.slice(i, i + 50);
      await this.transport(c).sendMail({ from, to: batch.length === 1 ? batch[0] : from, bcc: batch.length === 1 ? undefined : batch, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html, attachments });
    }
  }

  /** Checks that the server accepts the login (used when a user connects their own mailbox). */
  async verify(c: SmtpConfig) { await this.transport(c).verify(); }

  /** One personal message (campaigns, replies to outside email). Throws on failure. */
  async sendOne(c: SmtpConfig, m: { to: string; subject: string; text: string; html?: string; replyTo?: string; inReplyTo?: string; headers?: Record<string, string> }) {
    const from = c.from_name ? `"${c.from_name.replace(/"/g, '')}" <${c.from_email}>` : c.from_email;
    await this.transport(c).sendMail({ from, to: m.to, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html, inReplyTo: m.inReplyTo, references: m.inReplyTo, headers: m.headers });
  }

  /** Fire-and-forget after the current request. Returns immediately. */
  later(c: SmtpConfig | null, m: OutMail, after?: () => Promise<void>) {
    if (!c || !m.to.length) return;
    setTimeout(() => {
      this.sendNow(c, m).then(() => after?.()).catch((e) => this.log.warn(`Email not sent (${m.to.length} recipient(s)): ${e?.message ?? e}`));
    }, 50).unref?.();
  }
}
