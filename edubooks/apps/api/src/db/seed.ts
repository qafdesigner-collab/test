/* Demo seed. Run as the OWNER role (bypasses RLS). Usage: npm run db:seed [-- --reset]
 * All units/lessons are clearly marked "(sample)": they are placeholders, NOT real publisher textbook content. */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as s from './schema';
import { config } from '../config';
import { hashPassword } from '../auth/password';
import { CLASSIC, demoContent } from './demo-content';

export async function seed(url = config.databaseOwnerUrl, opts: { reset?: boolean; quiet?: boolean } = {}) {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema: s });
  const log = (...a: unknown[]) => !opts.quiet && console.log(...a);
  try {
    if (opts.reset) {
      await db.execute(sql`TRUNCATE publishers, curricula, calendar_events, schools, users, user_roles, sessions, audit_logs, grades, subjects, digital_assets,
        book_packages, book_editions, book_components, book_units, book_lessons, book_pages, teaching_resources,
        academic_years, products, product_versions, bundle_items, orders, order_lines, fulfillments, license_adjustments, license_pools,
        license_seats, license_assignments, license_transfers, access_entitlements, classes, class_teachers, enrolments, reader_progress,
        bookmarks, lesson_plans, question_bank, assessments, assessment_items, assessment_students, submissions, evaluations, ai_generations, game_activities, game_assignments, game_attempts, student_badges CASCADE`);
    }
    const existing = await db.select().from(s.publishers).where(sql`slug = 'demo'`);
    if (existing.length) { log('Seed data already present (use --reset to recreate).'); return; }

    const [pub] = await db.insert(s.publishers).values({ name: 'EduBooks Demo Publishing', slug: 'demo' }).returning();
    const P = pub.id;
    const staffPw = await hashPassword('Admin@12345');
    const addUser = async (u: { schoolId?: string; username: string; displayName: string; pw: string; roles: (typeof s.roleEnum.enumValues)[number][] }) => {
      const [row] = await db.insert(s.users).values({ publisherId: P, schoolId: u.schoolId ?? null, username: u.username, displayName: u.displayName, passwordHash: u.pw }).returning();
      await db.insert(s.userRoles).values(u.roles.map((role) => ({ userId: row.id, role, publisherId: P, schoolId: u.schoolId ?? null })));
      return row;
    };
    const admin = await addUser({ username: 'admin', displayName: 'Publisher Admin', pw: staffPw, roles: ['PUBLISHER_ADMIN'] });
    await addUser({ username: 'editor', displayName: 'Content Editor', pw: staffPw, roles: ['PUBLISHER_EDITOR'] });
    await addUser({ username: 'sales', displayName: 'Sales Executive', pw: staffPw, roles: ['PUBLISHER_SALES'] });

    await demoContent(db, P, admin, CLASSIC);

    log('✅ Seeded: 1 publisher, 3 staff, 3 schools (16 users incl. a parent), 8 curricula with their grades, 27 subjects, academic calendar templates, 5 book packages, 5 products (incl. KG Complete Bundle), 3 orders with licences.');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seed(undefined, { reset: process.argv.includes('--reset') }).catch((e) => { console.error(e); process.exit(1); });
}
