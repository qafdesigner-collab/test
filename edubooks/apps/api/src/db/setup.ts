/* Production first-run setup: creates the publisher and its first admin account (no demo data).
 * Run as the OWNER role after migrations:
 *   PUBLISHER_NAME="Acme Books" ADMIN_USERNAME=admin node dist/db/setup.js
 * Prints a one-time password unless ADMIN_PASSWORD is given; the admin must change it at first sign-in.
 * Safe to re-run: does nothing if a publisher already exists.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config';
import { hashPassword } from '../auth/password';
import { friendlyPassword } from '../common/creds';
import * as s from './schema';

async function main() {
  const name = process.env.PUBLISHER_NAME?.trim();
  if (!name) throw new Error('Set PUBLISHER_NAME');
  const slug = (process.env.PUBLISHER_SLUG || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const pool = new Pool({ connectionString: config.databaseOwnerUrl });
  const db = drizzle(pool, { schema: s });
  try {
    if ((await db.select({ id: s.publishers.id }).from(s.publishers)).length) {
      console.log('A publisher already exists — nothing to do.');
      return;
    }
    const password = process.env.ADMIN_PASSWORD || `${friendlyPassword()}-${friendlyPassword()}`;
    if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
    await db.transaction(async (tx) => {
      const [pub] = await tx.insert(s.publishers).values({ name, slug }).returning();
      const [u] = await tx.insert(s.users).values({
        publisherId: pub.id, username, displayName: process.env.ADMIN_DISPLAY_NAME || 'Publisher Admin',
        passwordHash: await hashPassword(password), mustChangePassword: true,
      }).returning();
      await tx.insert(s.userRoles).values({ userId: u.id, role: 'PUBLISHER_ADMIN', publisherId: pub.id });
    });
    console.log(`✅ Created publisher “${name}” and admin “${username}”.`);
    if (!process.env.ADMIN_PASSWORD) console.log(`   One-time password: ${password}   (shown once — you will be asked to change it)`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => { console.error(`Setup failed: ${e.message}`); process.exit(1); });
