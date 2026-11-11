import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../common/decorators';
import { DbService } from '../db/db.service';
import { config } from '../config';

/** Liveness (process up) and readiness (database + storage reachable, schema migrated) for load balancers / orchestrators. */
@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Public() @Get() live() { return { status: 'ok', uptimeSec: Math.round(process.uptime()) }; }

  @Public() @Get('ready')
  async ready() {
    const checks: Record<string, string> = {};
    try {
      await this.db.root.execute(sql`SELECT 1`);
      const { rows } = await this.db.root.execute(sql`SELECT applied_migrations() AS n`);
      const expected = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'drizzle', 'meta', '_journal.json'), 'utf8')).entries.length;
      checks.database = 'ok';
      checks.migrations = (rows[0] as any).n >= expected ? 'ok' : `pending (${(rows[0] as any).n}/${expected})`;
    } catch (e: any) { checks.database = `error: ${e.message}`; }
    if (config.storageDriver === 'local') {
      try { await fs.promises.access(config.storageDir, fs.constants.W_OK); checks.storage = 'ok'; } catch { checks.storage = 'not writable'; }
    } else checks.storage = 's3';
    const ok = Object.values(checks).every((v) => v === 'ok' || v === 's3');
    if (!ok) throw new ServiceUnavailableException({ status: 'not ready', checks });
    return { status: 'ready', checks };
  }
}
