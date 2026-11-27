import { sql } from 'drizzle-orm';

type Exec = (q: ReturnType<typeof sql>) => Promise<{ rows: any[] }>;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monday = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };

/**
 * Puts a day's lesson plan on its day of the teacher's weekly plan for that week (and class), making the week when there is
 * none yet. The entry remembers the lesson plan, so saving the plan again updates it instead of adding it twice.
 */
export async function addPlanToWeek(exec: Exec, ctx: { publisherId: string; schoolId: string | null; userId: string },
  p: { id: string; classId: string | null; editionId: string | null; lessonId: string | null; planDate: Date | string | null; title: string; content?: any }) {
  if (!p.planDate) return null;
  const date = new Date(p.planDate); const mon = monday(date); const week = iso(mon);
  const day = ((date.getUTCDay() + 6) % 7) + 1;
  let componentId: string | null = null; let pageFrom: number | null = null; let pageTo: number | null = null;
  if (p.lessonId) {
    const { rows: [l] } = await exec(sql`SELECT u.component_id, l.page_start, l.page_end FROM book_lessons l JOIN book_units u ON u.id = l.unit_id WHERE l.id = ${p.lessonId}`);
    if (l) { componentId = l.component_id; pageFrom = l.page_start ?? null; pageTo = l.page_end ?? l.page_start ?? null; }
  }
  const entry = { day, editionId: p.editionId, componentId, lessonId: p.lessonId, pageFrom, pageTo, resourceIds: [], planId: p.id,
    title: p.editionId ? '' : p.title, activity: p.editionId ? `${p.title}${p.content?.objectives ? ` — ${String(p.content.objectives).slice(0, 300)}` : ''}` : String(p.content?.objectives ?? '').slice(0, 1000),
    homework: String(p.content?.homework ?? '').slice(0, 500) };
  // the plan may have moved to another day or week: take it out everywhere first
  await exec(sql`UPDATE weekly_plans SET entries = (SELECT coalesce(jsonb_agg(e), '[]') FROM jsonb_array_elements(entries) e WHERE e->>'planId' IS DISTINCT FROM ${p.id}), updated_at = now()
    WHERE teacher_id = ${ctx.userId} AND entries @> ${JSON.stringify([{ planId: p.id }])}::jsonb`);
  const { rows: [w] } = await exec(sql`SELECT id FROM weekly_plans WHERE teacher_id = ${ctx.userId} AND week_start = ${week}::date AND class_id IS NOT DISTINCT FROM ${p.classId} ORDER BY created_at LIMIT 1`);
  if (w) {
    await exec(sql`UPDATE weekly_plans SET entries = entries || ${JSON.stringify([entry])}::jsonb, updated_at = now() WHERE id = ${w.id}`);
    return w.id as string;
  }
  const title = `Week of ${mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`;
  const { rows: [n] } = await exec(sql`INSERT INTO weekly_plans (publisher_id, school_id, teacher_id, class_id, week_start, title, entries)
    VALUES (${ctx.publisherId}, ${ctx.schoolId}, ${ctx.userId}, ${p.classId}, ${week}::date, ${title}, ${JSON.stringify([entry])}::jsonb) RETURNING id`);
  return n.id as string;
}

/** Takes a deleted lesson plan out of the weekly plans. */
export async function removePlanFromWeeks(exec: Exec, teacherId: string, planId: string) {
  await exec(sql`UPDATE weekly_plans SET entries = (SELECT coalesce(jsonb_agg(e), '[]') FROM jsonb_array_elements(entries) e WHERE e->>'planId' IS DISTINCT FROM ${planId}), updated_at = now()
    WHERE teacher_id = ${teacherId} AND entries @> ${JSON.stringify([{ planId }])}::jsonb`);
}
