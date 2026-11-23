import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { AssetsService } from '../storage/assets.service';
import { NotificationsService } from '../notifications/notifications.service';

/** How long children's watched-test pictures and voice recordings are kept (days). */
export const keepDays = () => ({ photos: Number(process.env.PROCTOR_KEEP_DAYS || 30), voice: Number(process.env.VOICE_KEEP_DAYS || 30), remindBefore: 7 });
const day = (d: Date | string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Once a day: children's watched-test photos (camera, screen, room panorama and video) and voice recordings are deleted
 * after a month (PROCTOR_KEEP_DAYS / VOICE_KEEP_DAYS, default 30); a week before, the teacher and the school admins are told.
 */
@Injectable()
export class ProctorCleanup implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('DataRetention');
  private timer?: NodeJS.Timeout;
  constructor(private readonly db: DbService, private readonly assets: AssetsService, private readonly notifications: NotificationsService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_JOBS === '1') return;
    const run = () => this.runDaily().catch((e) => this.log.error(`clean-up failed: ${e.message}`));
    setTimeout(run, 60_000).unref();
    this.timer = setInterval(run, 24 * 3600_000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async runDaily() { const n = await this.remind(); const p = await this.purge(); const v = await this.purgeVoice(); return { reminders: n, photos: p, voice: v }; }

  private async removeFiles(files: (string | null)[]) {
    let n = 0;
    for (const f of files) {
      if (!f) continue;
      const full = path.resolve(config.storageDir, f);
      if (!full.startsWith(path.resolve(config.storageDir, 'proctor') + path.sep)) continue;
      await fsp.rm(full, { force: true }); n++;
    }
    return n;
  }
  /** Test pictures older than the limit (and unused phone room scans). */
  async purge(days = keepDays().photos) {
    const { rows } = await this.db.root.execute(sql`SELECT purge_proctor(${days}) AS file`);
    const { rows: links } = await this.db.root.execute(sql`SELECT purge_room_scan_links(${days}) AS file`);
    const n = await this.removeFiles([...(rows as any[]), ...(links as any[])].map((r) => r.file));
    if (rows.length) this.log.log(`removed ${rows.length} old exam record(s), ${n} file(s)`);
    return rows.length;
  }
  /** Children's voice recordings older than the limit (chat voice notes, read-aloud answers, book readings). */
  async purgeVoice(days = keepDays().voice) {
    const { rows } = await this.db.root.execute(sql`SELECT purge_student_voice(${days}) AS key`);
    for (const r of rows as any[]) await this.assets.driver.remove(r.key).catch(() => undefined);
    if (rows.length) this.log.log(`removed ${rows.length} children's voice recording(s) older than ${days} days`);
    return rows.length;
  }
  /** A week before: the teacher and the school admins are told what will be deleted, and when. */
  async remind() {
    const k = keepDays(); let n = 0;
    const { rows: tests } = await this.db.root.execute(sql`SELECT * FROM claim_retention_notices(${k.photos}, ${k.remindBefore})`);
    for (const t of tests as any[]) {
      const ctx = { userId: t.teacher_id, publisherId: t.publisher_id, schoolId: t.school_id, roles: ['TEACHER'], staff: false };
      await this.db.detached(ctx, async () => {
        const msg = { kind: 'DATA', title: `📷 Test photos will be deleted on ${day(t.delete_on)}`,
          body: `The camera photos, screen pictures and room scans of “${t.title}” are kept for ${k.photos} days and deleted automatically from ${day(t.delete_on)}. Save anything you need before then.` };
        await this.notifications.notify([{ id: t.teacher_id }], { ...msg, link: `/teacher/assessments/${t.assessment_id}` });
        const { rows: admins } = await this.db.q.execute(sql`SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'SCHOOL_ADMIN' WHERE u.school_id = ${t.school_id} AND u.status = 'ACTIVE'`);
        await this.notifications.notify(admins as any[], { ...msg, link: '/school' });
      }); n++;
    }
    const { rows: voice } = await this.db.root.execute(sql`SELECT * FROM claim_voice_notices(${k.voice}, ${k.remindBefore})`);
    for (const v of voice as any[]) {
      if (!v.admin_id) continue;
      const ctx = { userId: v.admin_id, publisherId: v.publisher_id, schoolId: v.school_id, roles: ['SCHOOL_ADMIN'], staff: false };
      await this.db.detached(ctx, async () => {
        const { rows: admins } = await this.db.q.execute(sql`SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'SCHOOL_ADMIN' WHERE u.school_id = ${v.school_id} AND u.status = 'ACTIVE'`);
        await this.notifications.notify(admins as any[], { kind: 'DATA', title: `🎤 ${v.clips} voice recording(s) of students will be deleted within ${k.remindBefore} days`,
          body: `Students' voice recordings (voice messages, read-aloud answers and book readings) are kept for ${k.voice} days and then deleted automatically.`, link: '/school' });
      }); n++;
    }
    return n;
  }
}
