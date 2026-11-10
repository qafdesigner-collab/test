# EduBooks LMS

A multi-tenant platform for a children's book publisher. You publish book packages, sell them to schools as digital licences, and give teachers and students an LMS with AI support.

- **Architecture, ERD, API design and milestones:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Status:** Phase 1 (foundation) ✅ and Phase 2 *Book Package Management* ✅. Products, bundles and licensing come next.

## Stack
NestJS (TypeScript), Drizzle ORM, PostgreSQL 16 (RLS + pgvector), Next.js 15, React 19, Tailwind 4, and S3-compatible private storage.

## Run locally
```bash
# 1. Infrastructure (or use your own PostgreSQL 16 and run infra/bootstrap.sql as superuser)
docker compose up -d db

# 2. Install, migrate and seed
npm install
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run db:seed              # add "-- --reset" to recreate the demo data

# 3. Start (two terminals)
npm run dev:api              # http://localhost:4000/api   · OpenAPI docs: /api/docs
npm run dev:web              # http://localhost:3000
```

### Demo logins (seed data)
| Who | School code | Username | Password |
|---|---|---|---|
| Publisher admin | — (choose "Publisher staff") | `admin` | `Admin@12345` |
| Content editor | — | `editor` | `Admin@12345` |
| Sales | — | `sales` | `Admin@12345` |
| School admin | `SUN01` / `GVS02` / `BFA03` | `principal` | `School@12345` |
| Teacher | same | `teacher1` | `Teacher@12345` |
| Student | same | `student1..3` | `Student@123` |

School, teacher and student portals arrive in Phases 3–6. Those accounts already sign in and land on a status page.

> The seed's units and lessons are labelled **"(sample)"**. They are placeholders, not real textbook content. Replace them with your real books in the Package Builder.

## Tests
```bash
npm test     # 26 end-to-end tests against the edubooks_test database
```
They cover login, sessions, RBAC, suspension, **PostgreSQL Row-Level Security isolation** (between publishers and between schools), the append-only audit log, package/edition/structure workflows, publish locking, edition cloning without file duplication, upload validation (magic bytes), and signed-URL tampering.

## Configuration (`apps/api/.env`)
| Variable | Purpose |
|---|---|
| `DATABASE_OWNER_URL` / `DATABASE_URL` | Owner role (migrations) / app role (runtime, RLS enforced) |
| `FILE_URL_SECRET` | HMAC secret for 5-minute signed file URLs. **Required in production.** |
| `STORAGE_DRIVER=s3` + `S3_*` | Private bucket on AWS S3, Cloudflare R2, MinIO… (default: private local folder) |
| `CLAMAV_HOST`, `REQUIRE_MALWARE_SCAN=1` | Malware scanning of uploads |
| `COOKIE_SECURE=1` | Set when served over HTTPS |
| `MAX_UPLOAD_MB` | Upload size limit (default 300) |

## Production notes
- Put the web and API behind one HTTPS domain (e.g. nginx: `/api` → API:4000, everything else → web:3000).
- Back up with daily `pg_dump` + WAL archiving, and turn on bucket versioning.
- The app's database user must stay **non-owner** and `NOBYPASSRLS`. That's what makes tenant isolation hold even if code has a bug.
