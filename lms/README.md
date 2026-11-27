# Bright Books LMS — working prototype (v0)

This is a fast, clickable prototype of the kids' book LMS. It's used for demos and for agreeing on the UX.
The production platform (**EduBooks LMS**: Next.js + NestJS + PostgreSQL) is being built separately, following `docs/ARCHITECTURE.md` at the repo root.

## Run
```bash
cd lms
npm install
npm start          # http://localhost:3000
```
Requires Node 22+. It uses the built-in `node:sqlite`, so no database server is needed. Data is stored in `lms/data/`.

## Demo logins
| Role | School code | Username | Password |
|---|---|---|---|
| Publisher admin | *(empty)* | admin | admin123 |
| Sales | *(empty)* | sales1 | sales123 |
| School admin | DEMO01 | principal | school123 |
| Teacher | DEMO01 | teacher1 | teacher123 |
| Student | DEMO01 | student1 / student2 / student3 | 1234 |

## Features
- **Publisher:** books → parts / homework book / resources (flash cards, teacher cards, danglers…), uploads (PPT, PDF, Word, HTML, media), schools, seat licences per book, sales team.
- **Sales:** catalogue, one-click demo schools with expiring logins (copy or print), lead status. The admin converts a demo into a customer.
- **School:** teachers, classes, students (bulk paste plus printable login cards), seat limits enforced.
- **Teacher:** AI lesson plans, AI question generator, assignments with auto-marking, manual checking, skill evaluations, report cards.
- **Student:** colourful dashboard, books, homework quizzes, 4 games (Memory Match, Word Builder, Letter Pop, Count & Tap), stars and leaderboard.

## AI (optional, free tiers)
With no key, a built-in offline generator is used. To use an online model, set one of:
`GEMINI_API_KEY` (Google AI Studio free tier), `GROQ_API_KEY`, or `OLLAMA_URL=http://localhost:11434` (self-hosted).
