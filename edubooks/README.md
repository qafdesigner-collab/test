# EduBooks LMS

A multi-tenant platform for a children's book publisher. You publish book packages, sell them to schools as digital licences, and give teachers and students an LMS with AI support.

- **Architecture, ERD, API design and milestones:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Status:** ✅ Phase 1 foundation · ✅ Phase 2 Book Package Management · ✅ Phase 2b Products & grade bundles · ✅ Phase 3 Schools, orders & licensing + School Admin portal · ✅ Phase 4 Classes, digital reader, lesson planner, homework & tests, gradebook · ✅ Phase 5 AI teaching assistant grounded in the books. Next: Phase 6 (playful student portal & games).

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

School admins get the **School portal** (`/school`): accounts, CSV import, printable login cards, licence allocation, transfer requests.
**Teachers** get the Teacher portal (`/teacher`): their licensed books in the **digital reader**, the **lesson planner**, **homework / quizzes / tests** (multiple choice, true/false, fill-in-the-blank, short answer — auto-marked except written answers), a shared **question bank**, and per-class **gradebooks**, report cards and skill evaluations.
**Students** (`/portal`): today's homework (big, colourful, with read-aloud), their books in the reader, results and teacher feedback. The playful games portal arrives in Phase 6.

The seed includes **placeholder 26-page PDFs** for each KG book's Part 1 (clearly marked "sample placeholder", not publisher content), a class **KG Rose** at SUN01 with teacher1 and student1–3, and one sample homework.

Seed licences: **SUN01** bought 30 *KG Complete Bundle* seats (student1, student2 and teacher1 hold seats); **GVS02** bought KG English + KG Maths; **BFA03** has a draft order awaiting payment.

### Licensing in one minute
1. *Products & Bundles*: put published editions into a product (single book or grade bundle) → **activate** (version is frozen forever).
2. *Schools*: register a school (code + first admin) and add its **academic year**. Sales can also create an **instant demo school**.
3. *Orders*: record the sale → **confirm** → a publisher admin **issues licences** (student + teacher seats, valid for that academic year).
4. The **school admin** creates students/teachers and assigns seats. Moving a student seat needs a **transfer request** that the publisher approves.
5. Seats **expire automatically** when the academic year ends; renewals are new orders.

> The seed's units and lessons are labelled **"(sample)"**. They are placeholders, not real textbook content. Replace them with your real books in the Package Builder.

## AI teaching assistant (Phase 5)
Teachers open a lesson (from the reader, the planner or **AI assistant**) and ask for a lesson plan, homework, worksheet, MCQs, short questions,
fill-in-the-blanks, true/false, an assessment, activities, learning games or differentiated activities. The assistant reads **the text of
that lesson's pages** (extracted from the book PDFs), cites the pages it used (click to open the book at that page), never sends any student data, and
everything stays a **draft until the teacher saves / publishes it**. Every request is logged (tokens, latency, sources) with a monthly quota per school.

| Option | Settings (`apps/api/.env`) | Notes |
|---|---|---|
| **Self-hosted (recommended)** | `AI_BASE_URL=http://<gpu-server>:11434/v1` · `AI_MODEL=qwen2.5:7b-instruct` | [Ollama](https://ollama.com) (`ollama pull qwen2.5:7b-instruct`) or vLLM / LM Studio — any OpenAI-compatible server. No per-request fees, but you pay for the GPU server. A 7–8B model runs on one 16–24 GB GPU; larger models give better plans. |
| Semantic search (optional) | `AI_EMBED_MODEL=nomic-embed-text` | Same server; otherwise PostgreSQL full-text search is used. |
| Hosted Claude | `AI_PROVIDER=anthropic` · `ANTHROPIC_API_KEY=…` (default model `claude-opus-5-5`, override with `AI_MODEL`) | Pay per token; server-side refusal fallbacks are enabled. |
| No model | *(nothing set)* | "Offline drafts" assembled only from the lesson data — clearly labelled; for demos and tests. |

Other knobs: `AI_MONTHLY_REQUESTS_PER_SCHOOL` (default 1000), `AI_RATE_LIMIT_PER_MIN` per teacher (10), `AI_MAX_SOURCE_CHARS` (14000),
`AI_COST_INPUT_PER_M` / `AI_COST_OUTPUT_PER_M` for cost estimates in the usage report.
Book PDFs are indexed automatically when uploaded (Package Builder shows "AI-ready · N pages"); scanned PDFs without a text layer
need OCR first (not built in yet). Publisher usage: **Admin → AI Assistant**.

## Tests
```bash
npm test     # 80 tests against the edubooks_test database
```
They cover login, sessions, RBAC, suspension, every licensing rule (capacity, concurrency, bundles, transfers, expiry, adjustments, demo expiry), reader access & privacy, marking rules, answer secrecy, class/teacher permissions, AI grounding, citation validation, approval flow, quotas and logging (with a fake OpenAI-compatible server), **PostgreSQL Row-Level Security isolation** (between publishers and between schools), the append-only audit log, package/edition/structure workflows, publish locking, edition cloning without file duplication, upload validation (magic bytes), and signed-URL tampering.

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
