import { ForbiddenException } from '@nestjs/common';
import { sql, SQL } from 'drizzle-orm';

/**
 * Sales team scope: a sales login (without the super-admin role) works only with its own schools —
 * those the super admin assigned to it, its personal demo school, and unassigned schools it created itself.
 */
export function salesOnly(ctx: { roles?: string[] }): boolean {
  const r = ctx.roles ?? [];
  return r.includes('PUBLISHER_SALES') && !r.includes('PUBLISHER_ADMIN');
}

/** A condition on the `schools` table (unqualified columns), or null when the user sees every school. */
export function mySchoolsWhere(ctx: { roles?: string[]; userId: string }, alias = ''): SQL | null {
  if (!salesOnly(ctx)) return null;
  const a = alias ? sql.raw(`${alias}.`) : sql``;
  return sql`(${a}sales_owner_id = ${ctx.userId} OR ${a}demo_owner_id = ${ctx.userId} OR (${a}sales_owner_id IS NULL AND ${a}created_by = ${ctx.userId}))`;
}

/** `school_id` column condition: the school is one of mine (or TRUE for everyone else). */
export function mySchoolIdIn(ctx: { roles?: string[]; userId: string }, column: SQL): SQL {
  const w = mySchoolsWhere(ctx);
  return w ? sql`${column} IN (SELECT id FROM public.schools WHERE ${w})` : sql`TRUE`;
}

export async function assertMySchool(q: { execute: (s: SQL) => Promise<{ rows: unknown[] }> }, ctx: { roles?: string[]; userId: string }, schoolId: string) {
  const w = mySchoolsWhere(ctx);
  if (!w) return;
  const { rows } = await q.execute(sql`SELECT 1 FROM public.schools WHERE id = ${schoolId} AND ${w}`);
  if (!rows.length) throw new ForbiddenException('This school is not assigned to you. Ask the super admin to assign it.');
}
