# Deploying EduBooks LMS

This guide sets up the complete system on one Linux server with Docker.

> **Shared hosting with cPanel?** Use the cPanel package instead: `npm run build:cpanel`, then follow [packaging/cpanel/README.md](../packaging/cpanel/README.md). It's a good fit for demos and a modest number of schools. OCR and malware scanning are only available if your host provides them. For more schools, see **Scaling** at the end.

## What you need
- A Linux server (Ubuntu 24.04 or similar). A good start for a few hundred schools: **4 CPU, 8 GB RAM, 100 GB SSD**.
  If you plan to run a self-hosted AI model on the same machine, you need a GPU server for it (see *AI* below).
- A domain name, for example `lms.yourpublisher.com`, with a DNS **A record** pointing to the server's IP address.
- Ports **80** and **443** open to the internet. Caddy uses them to get a free HTTPS certificate automatically.
- Docker Engine 24+ with the Compose plugin.

## 1. Get the code and fill in the settings
```bash
git clone <your repository> edubooks-src && cd edubooks-src/edubooks
cp infra/prod/.env.example .env
```
Edit `.env`:

| Setting | What to put |
|---|---|
| `DOMAIN` | Your domain, e.g. `lms.yourpublisher.com` |
| `POSTGRES_SUPERUSER_PASSWORD`, `DB_OWNER_PASSWORD`, `DB_APP_PASSWORD`, `FILE_URL_SECRET` | Different long random values. Make each with `openssl rand -base64 33` |
| `STORAGE_DRIVER` | `local` keeps files in a Docker volume. `s3` stores them in a private bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO). Use `s3` for larger deployments. |
| `AI_PROVIDER` | `offline` (no model, template drafts), `openai-compatible` (self-hosted Ollama or vLLM), or `anthropic` |

Keep `.env` private. It is in `.gitignore`.

## 2. Start
```bash
docker compose -f compose.prod.yml up -d --build
```
This builds the images, creates the database (roles, extensions, row-level security), applies all migrations, and starts the API, the web app and Caddy.
Check that the system is ready:
```bash
curl https://lms.yourpublisher.com/api/health/ready
# {"status":"ready","checks":{"database":"ok","migrations":"ok","storage":"ok"}}
```

## 3. Create your publisher and first admin
This runs only once and creates **no demo data**:
```bash
docker compose -f compose.prod.yml exec -e PUBLISHER_NAME="Your Publishing House" api node dist/db/setup.js
```
It prints a one-time password. Sign in at `https://lms.yourpublisher.com/login` with the **Publisher staff** tab. You must choose a new password on first sign-in.
Then, in the admin portal: add grades and subjects (Catalog), create book packages and upload the PDFs, create products, add schools and orders.

> Do **not** run `db:seed` in production. It creates demo schools and well-known passwords.

## 4. Optional services
**Malware scanning (recommended).** Start ClamAV and require clean scans before files are accepted:
```bash
# in .env:  CLAMAV_HOST=clamav  and  REQUIRE_MALWARE_SCAN=1
docker compose -f compose.prod.yml --profile clamav up -d
```
ClamAV needs about 3 GB of RAM.

**AI.** For a self-hosted model, run [Ollama](https://ollama.com) or vLLM on a GPU machine and set:
```
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://<gpu-host>:11434/v1
AI_MODEL=qwen2.5:7b-instruct
AI_EMBED_MODEL=nomic-embed-text   # optional, adds semantic search
```
Book text never leaves your servers in this setup. Then run `docker compose -f compose.prod.yml up -d api` to apply the change.

**OCR.** The API image includes Tesseract with English and Urdu. Scanned book pages are read automatically when you upload a PDF. To turn it off, set `OCR_ENABLED=0`.

## 5. Backups
Set up daily backups first. See [OPERATIONS.md](OPERATIONS.md#backups).

## 6. Updating to a new version
```bash
git pull
docker compose -f compose.prod.yml up -d --build
```
The `migrate` service applies new database migrations before the new API starts. Make a backup before every update.

## Scaling
- **API:** it holds no state of its own. Sessions live in PostgreSQL. You can run several copies (`docker compose ... up -d --scale api=3`). Caddy spreads the requests across them. One API process handled about 300 requests per second in our load test, with 97.5 % of requests answered in under 300 ms. That is roughly 1,500 children actively clicking at the same moment.
  Note that rate limits are counted per API process.
- **Database:** move to a managed PostgreSQL 16 service that supports the `pgvector` extension (AWS RDS, Google Cloud SQL, Azure, Supabase, Neon…). Run `infra/prod/init-db.sh`'s SQL once as an admin, then point `DATABASE_URL` and `DATABASE_OWNER_URL` at it. Turn on point-in-time recovery.
- **Files:** use `STORAGE_DRIVER=s3` with a private bucket and turn on bucket versioning.
