import * as fs from 'fs';
import * as path from 'path';

// Minimal .env loader (no extra dependency). Real environment variables win.
const envFile = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
};

export const config = {
  port: Number(env('PORT', '4000')),
  databaseUrl: env('DATABASE_URL', 'postgres://edubooks_app:edubooks_app@localhost:5432/edubooks'),
  databaseOwnerUrl: env('DATABASE_OWNER_URL', 'postgres://edubooks:edubooks@localhost:5432/edubooks'),
  fileUrlSecret: env('FILE_URL_SECRET', 'dev-only-change-me-0123456789abcdef'),
  fileUrlTtlSec: Number(env('FILE_URL_TTL_SEC', '300')),
  cookieSecure: env('COOKIE_SECURE', '0') === '1',
  sessionTtlHours: Number(env('SESSION_TTL_HOURS', '168')),
  storageDriver: env('STORAGE_DRIVER', 'local') as 'local' | 's3',
  storageDir: path.resolve(env('STORAGE_DIR', path.resolve(__dirname, '..', 'storage'))),
  s3: {
    bucket: process.env.S3_BUCKET, region: process.env.S3_REGION || 'auto', endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  maxUploadMb: Number(env('MAX_UPLOAD_MB', '300')),
  clamav: process.env.CLAMAV_HOST ? { host: process.env.CLAMAV_HOST, port: Number(process.env.CLAMAV_PORT || 3310) } : null,
  requireMalwareScan: process.env.REQUIRE_MALWARE_SCAN === '1',
};
if (process.env.NODE_ENV === 'production' && config.fileUrlSecret.startsWith('dev-only')) {
  throw new Error('Set FILE_URL_SECRET in production');
}
