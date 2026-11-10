import { Pool } from 'pg';
import * as path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from '../config';

export async function runMigrations(url = config.databaseOwnerUrl) {
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '..', '..', 'drizzle') });
  } finally { await pool.end(); }
}
if (require.main === module) {
  runMigrations().then(() => console.log('✅ migrations applied'), (e) => { console.error(e); process.exit(1); });
}
