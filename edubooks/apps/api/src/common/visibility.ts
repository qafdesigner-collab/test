/**
 * "Visible to" of book parts, units and lessons: ALL, TEACHER (hidden from students) or STUDENT (hidden from teachers).
 * Returns the values the current user may see, or null for everything (publisher staff and school admins).
 */
export type Audience = 'ALL' | 'TEACHER' | 'STUDENT';
export function visibleFor(ctx: { staff?: boolean; roles?: string[] }): Audience[] | null {
  const roles = ctx.roles ?? [];
  if (ctx.staff || roles.includes('SCHOOL_ADMIN')) return null;
  if (roles.includes('TEACHER')) return ['ALL', 'TEACHER'];
  if (roles.includes('STUDENT')) return ['ALL', 'STUDENT'];
  return ['ALL'];
}
export const sees = (v: Audience[] | null, x: string | null | undefined) => !v || v.includes((x ?? 'ALL') as Audience);
