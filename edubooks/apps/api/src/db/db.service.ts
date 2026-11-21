import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { config } from '../config';

export type Db = NodePgDatabase<typeof schema>;
export interface TenantCtx {
  userId: string;
  publisherId: string;
  schoolId: string | null;
  roles: string[];
  staff: boolean; // publisher staff (sees all schools of the publisher)
  ip?: string;
}
interface Store { tx: Db; ctx: TenantCtx | null }
const als = new AsyncLocalStorage<Store>();

/**
 * Every request runs inside ONE transaction whose session variables carry the tenant context.
 * PostgreSQL RLS policies read those variables, so even a query that forgets a tenant filter
 * cannot read or write another tenant's rows.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool = new Pool({ connectionString: config.databaseUrl, max: Number(process.env.DB_POOL_MAX || 20) });
  /** Root handle. Only for tenant-free work (session lookup via SECURITY DEFINER functions). */
  readonly root: Db = drizzle(this.pool, { schema });

  /** Current tenant-scoped transaction. */
  get q(): Db {
    const s = als.getStore();
    if (!s) throw new Error('DB access outside of a tenant context');
    return s.tx;
  }
  get ctx(): TenantCtx {
    const c = als.getStore()?.ctx;
    if (!c) throw new Error('No authenticated context');
    return c;
  }
  get ctxOrNull(): TenantCtx | null { return als.getStore()?.ctx ?? null; }

  async withContext<T>(ctx: TenantCtx | null, fn: () => Promise<T>): Promise<T> {
    if (als.getStore()) return fn(); // already inside a context (nested service call)
    return this.root.transaction(async (tx) => {
      await this.applyContext(tx as unknown as Db, ctx);
      return als.run({ tx: tx as unknown as Db, ctx }, fn);
    });
  }

  /** Run work in its own transaction, detached from the current request (background jobs). */
  detached<T>(ctx: TenantCtx, fn: () => Promise<T>): Promise<T> {
    return als.exit(() => this.withContext(ctx, fn));
  }

  /** Re-apply the session variables after the context object changed (e.g. roles resolved during login). */
  async refreshContext() { const s = als.getStore(); if (s) await this.applyContext(s.tx, s.ctx); }

  private async applyContext(tx: Db, ctx: TenantCtx | null) {
    await tx.execute(sql`SELECT
      set_config('app.publisher_id', ${ctx?.publisherId ?? ''}, true),
      set_config('app.school_id', ${ctx?.schoolId ?? ''}, true),
      set_config('app.user_id', ${ctx?.userId ?? ''}, true),
      set_config('app.staff', ${ctx?.staff ? 'on' : ''}, true)`);
  }

  async onModuleDestroy() { await this.pool.end(); }
}
