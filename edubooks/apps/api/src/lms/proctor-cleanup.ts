import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { config } from '../config';
import { DbService } from '../db/db.service';

/** Exam photos and screen pictures are kept for PROCTOR_KEEP_DAYS days (default 90), then removed. */
@Injectable()
export class ProctorCleanup implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('ExamPhotos');
  private timer?: NodeJS.Timeout;
  constructor(private readonly db: DbService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_JOBS === '1') return;
    const run = () => this.purge().catch((e) => this.log.error(`clean-up failed: ${e.message}`));
    setTimeout(run, 60_000).unref();
    this.timer = setInterval(run, 24 * 3600_000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async purge(days = Number(process.env.PROCTOR_KEEP_DAYS || 90)) {
    const { rows } = await this.db.root.execute(sql`SELECT purge_proctor(${days}) AS file`);
    let n = 0;
    for (const r of rows as { file: string | null }[]) {
      if (!r.file) continue;
      const full = path.resolve(config.storageDir, r.file);
      if (!full.startsWith(path.resolve(config.storageDir, 'proctor') + path.sep)) continue;
      await fsp.rm(full, { force: true }); n++;
    }
    if (rows.length) this.log.log(`removed ${rows.length} old exam record(s), ${n} picture(s)`);
    return rows.length;
  }
}
