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
  /** Sessions end after this much inactivity (minutes). */
  sessionIdleMinutes: Number(env('SESSION_IDLE_MINUTES', '720')),
  production: process.env.NODE_ENV === 'production',
  apiDocs: (process.env.ENABLE_API_DOCS ?? (process.env.NODE_ENV === 'production' ? '0' : '1')) === '1',
  logFormat: (process.env.LOG_FORMAT ?? (process.env.NODE_ENV === 'production' ? 'json' : 'pretty')) as 'json' | 'pretty',
  storageDriver: env('STORAGE_DRIVER', 'local') as 'local' | 's3',
  storageDir: path.resolve(env('STORAGE_DIR', path.resolve(__dirname, '..', 'storage'))),
  s3: {
    bucket: process.env.S3_BUCKET, region: process.env.S3_REGION || 'auto', endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  maxUploadMb: Number(env('MAX_UPLOAD_MB', '300')),
  clamav: process.env.CLAMAV_HOST ? { host: process.env.CLAMAV_HOST, port: Number(process.env.CLAMAV_PORT || 3310) } : null,
  requireMalwareScan: process.env.REQUIRE_MALWARE_SCAN === '1',
  ocr: {
    /** OCR for scanned book pages (needs `pdftoppm` + `tesseract` on the server). auto = use it when installed. */
    mode: (process.env.OCR_ENABLED || 'auto') as 'auto' | '1' | '0',
    langs: process.env.OCR_LANGS || 'eng+urd',
    dpi: Number(process.env.OCR_DPI || 200),
    maxPages: Number(process.env.OCR_MAX_PAGES || 400),
    pageTimeoutMs: Number(process.env.OCR_PAGE_TIMEOUT_MS || 60_000),
    concurrency: Number(process.env.OCR_CONCURRENCY || 2),
  },
  ai: {
    /** openai-compatible (self-hosted Ollama / vLLM / LM Studio, or any compatible service) | anthropic | offline */
    provider: (process.env.AI_PROVIDER || (process.env.AI_BASE_URL ? 'openai-compatible' : 'offline')) as 'openai-compatible' | 'anthropic' | 'offline',
    baseUrl: (process.env.AI_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, ''),
    model: process.env.AI_MODEL || (process.env.AI_PROVIDER === 'anthropic' ? 'claude-opus-5-5' : 'qwen2.5:7b-instruct'),
    apiKey: process.env.AI_API_KEY || '',
    /** Optional embeddings model on the same OpenAI-compatible server (e.g. nomic-embed-text) — enables semantic search. */
    embedModel: process.env.AI_EMBED_MODEL || '',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 180_000),
    monthlyRequestsPerSchool: Number(process.env.AI_MONTHLY_REQUESTS_PER_SCHOOL || 1000),
    maxSourceChars: Number(process.env.AI_MAX_SOURCE_CHARS || 14_000),
    /** Optional cost estimate for reports (per 1M tokens, in your currency). Self-hosted: leave 0 and track GPU cost separately. */
    costInPerM: Number(process.env.AI_COST_INPUT_PER_M || 0),
    costOutPerM: Number(process.env.AI_COST_OUTPUT_PER_M || 0),
  },
};
if (process.env.NODE_ENV === 'production' && config.fileUrlSecret.startsWith('dev-only')) {
  throw new Error('Set FILE_URL_SECRET in production');
}
