import { Column, getTableName, sql } from 'drizzle-orm';
/**
 * Fully-qualified column reference ("table"."column") for use inside correlated subqueries.
 * Drizzle renders columns unqualified in single-table selects, so `${users.id}` inside
 * `(SELECT … FROM license_assignments a WHERE a.user_id = ${users.id})` would bind to a.id. Always use qc() there.
 */
export const qc = (col: Column) => sql.raw(`"${getTableName(col.table)}"."${col.name}"`);
