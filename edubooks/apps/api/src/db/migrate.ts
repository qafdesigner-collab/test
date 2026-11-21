import { Pool } from 'pg';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from '../config';
import { appTmp } from '../common/tmp';

const FOLDER = path.resolve(__dirname, '..', '..', 'drizzle');

/**
 * The migrations grant privileges to the runtime role `edubooks_app`. Hosts that prefix database user names
 * (cPanel: `cpuser_app`) set DB_APP_ROLE; the SQL is then applied with that role name instead.
 */
function migrationsFolder(appRole = process.env.DB_APP_ROLE) {
  if (!appRole || appRole === 'edubooks_app') return FOLDER;
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(appRole)) throw new Error(`DB_APP_ROLE "${appRole}" must be a plain lowercase PostgreSQL role name`);
  const out = fs.mkdtempSync(path.join(appTmp(), 'migrations-'));
  fs.cpSync(FOLDER, out, { recursive: true });
  for (const f of fs.readdirSync(out).filter((f) => f.endsWith('.sql'))) {
    const p = path.join(out, f);
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\bedubooks_app\b/g, appRole));
  }
  return out;
}

/** Any fixed number: all app processes use it to take turns applying database changes. */
const MIGRATION_LOCK = 727_373_901;

export async function runMigrations(url = config.databaseOwnerUrl) {
  const pool = new Pool({ connectionString: url, max: 3 });
  const folder = migrationsFolder();
  // Hosts often start several app processes at once (e.g. Passenger). Only one may apply changes at a time;
  // the others wait here, then find everything already applied.
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await migrate(drizzle(pool), { migrationsFolder: folder });
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => undefined);
    lock.release();
    await pool.end();
    if (folder !== FOLDER) fs.rmSync(folder, { recursive: true, force: true });
  }
}
if (require.main === module) {
  runMigrations().then(() => console.log('✅ migrations applied'), (e) => { console.error(e); process.exit(1); });
}
