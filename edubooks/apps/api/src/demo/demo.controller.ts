import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Logger, Module, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Equals } from 'class-validator';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as s from '../db/schema';
import { DbService } from '../db/db.service';
import { config } from '../config';
import { Roles } from '../common/decorators';
import { createDriver } from '../storage/storage.driver';
import { demoContent, demoExtras, LIVE_CODES, liveOptions } from '../db/demo-content';

class RemoveDto { @Equals('REMOVE', { message: 'Type REMOVE to confirm' }) confirm!: string; }

export const DEMO_LOGINS = [
  { who: 'School admin', school: 'DEMO1', username: 'principal', password: 'School@12345' },
  { who: 'Teacher', school: 'DEMO1', username: 'teacher1', password: 'Teacher@12345' },
  { who: 'Student', school: 'DEMO1', username: 'student1', password: 'Student@123' },
  { who: 'Parent', school: 'DEMO1', username: 'parent1', password: 'Parent@123' },
  { who: 'Other demo schools', school: 'DEMO2 / DEMO3', username: 'principal, teacher1, student1–3', password: 'as above' },
];

/** Loads sample data into the publisher's own account (clearly marked "Demo") and removes it again. */
@Injectable()
export class DemoService {
  private readonly log = new Logger('Demo');
  constructor(private readonly db: DbService) {}
  private get ctx() { return this.db.ctx; }

  async status() {
    const { rows } = await this.db.q.execute(sql`SELECT kind, count(*)::int AS n, min(created_at) AS at FROM demo_records WHERE publisher_id = ${this.ctx.publisherId} GROUP BY kind`);
    const counts = Object.fromEntries((rows as any[]).map((r) => [r.kind, r.n]));
    const at = (rows as any[]).map((r) => r.at).sort()[0] ?? null;
    return { loaded: rows.length > 0, loadedAt: at, counts, logins: rows.length ? DEMO_LOGINS : [] };
  }

  async load() {
    if ((await this.status()).loaded) throw new ConflictException('Demo data is already loaded. Remove it first to load it again.');
    const pool = new Pool({ connectionString: config.databaseOwnerUrl, max: 2 });
    const db = drizzle(pool, { schema: s });
    const P = this.ctx.publisherId; const admin = { id: this.ctx.userId };
    try {
      const codes = Object.values(LIVE_CODES);
      const taken = await db.execute(sql`SELECT code FROM schools WHERE code = ANY(${`{${codes.join(',')}}`}::citext[])`);
      if (taken.rows.length) throw new ConflictException(`The school code ${(taken.rows[0] as any).code} is already used by a real school, so demo data cannot be loaded.`);
      await db.transaction(async (tx) => {
        const o = liveOptions((kind, id) => tx.execute(sql`INSERT INTO demo_records (publisher_id, kind, ref_id) VALUES (${P}, ${kind}, ${id})`));
        const r = await demoContent(tx as any, P, admin, o);
        await demoExtras(tx as any, P, admin, r, o);
        await tx.execute(sql`INSERT INTO audit_logs (publisher_id, actor_user_id, action, entity_type, summary) VALUES (${P}, ${admin.id}, 'system.demo.load', 'publisher', 'Loaded demo data')`);
      });
    } catch (e: any) {
      if (e instanceof ConflictException) throw e;
      this.log.error(`Loading demo data failed: ${e.message}`);
      throw new BadRequestException(`Demo data could not be loaded: ${e.message}`);
    } finally { await pool.end(); }
    return this.status();
  }

  async remove() {
    if (!(await this.status()).loaded) throw new BadRequestException('There is no demo data to remove.');
    let res: any;
    try {
      res = ((await this.db.q.execute(sql`SELECT remove_demo_data(${this.ctx.publisherId}, ${this.ctx.userId}) AS r`)).rows[0] as any).r;
    } catch (e: any) {
      throw new BadRequestException(String(e.cause?.message ?? e.message).replace(/^.*?Demo data/, 'Demo data'));
    }
    // Delete the sample files after the database change is committed (best effort; unused files are harmless).
    const files: string[] = res.files ?? []; const driver = createDriver();
    setTimeout(() => { for (const k of files) driver.remove(k).catch(() => undefined); }, 2000).unref();
    const { files: _f, ...counts } = res;
    return { removed: counts, ...(await this.status()) };
  }
}

@ApiTags('demo')
@Controller('system/demo')
export class DemoController {
  constructor(private readonly svc: DemoService) {}
  @Roles('PUBLISHER_ADMIN') @Get() status() { return this.svc.status(); }
  @Roles('PUBLISHER_ADMIN') @Post('load') load() { return this.svc.load(); }
  @Roles('PUBLISHER_ADMIN') @Post('remove') remove(@Body() _d: RemoveDto) { return this.svc.remove(); }
}

@Module({ controllers: [DemoController], providers: [DemoService] })
export class DemoModule {}
