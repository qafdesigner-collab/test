/* Demo seed. Run as the OWNER role (bypasses RLS). Usage: npm run db:seed [-- --reset]
 * All units/lessons are clearly marked "(sample)": they are placeholders, NOT real publisher textbook content. */
import { Pool } from 'pg';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as s from './schema';
import { config } from '../config';
import { hashPassword } from '../auth/password';
import { createDriver } from '../storage/storage.driver';

/** Builds a tiny valid one-page PDF with the given lines of text. */
function samplePdf(lines: string[]) {
  const text = lines.map((l, i) => `BT /F1 ${i ? 14 : 22} Tf 60 ${740 - i * 30} Td (${l.replace(/[()\\]/g, '')}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let out = '%PDF-1.4\n'; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

export async function seed(url = config.databaseOwnerUrl, opts: { reset?: boolean; quiet?: boolean } = {}) {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema: s });
  const log = (...a: unknown[]) => !opts.quiet && console.log(...a);
  try {
    if (opts.reset) {
      await db.execute(sql`TRUNCATE publishers, schools, users, user_roles, sessions, audit_logs, grades, subjects, digital_assets,
        book_packages, book_editions, book_components, book_units, book_lessons, book_pages, teaching_resources,
        academic_years, products, product_versions, bundle_items, orders, order_lines, fulfillments, license_adjustments, license_pools,
        license_seats, license_assignments, license_transfers, access_entitlements CASCADE`);
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

    // Schools (licences & orders arrive in Phase 3)
    const schoolPw = await hashPassword('School@12345'); const teacherPw = await hashPassword('Teacher@12345'); const studentPw = await hashPassword('Student@123');
    const schoolRows: { id: string; code: string; users: Record<string, string> }[] = [];
    const schoolDefs = [['Sunrise Grammar School', 'SUN01', 'Lahore'], ['Green Valley School', 'GVS02', 'Karachi'], ['Bright Future Academy', 'BFA03', 'Islamabad']];
    for (const [name, code, city] of schoolDefs) {
      const [sc] = await db.insert(s.schools).values({ publisherId: P, name, code, city }).returning();
      const u: Record<string, string> = {};
      u.principal = (await addUser({ schoolId: sc.id, username: 'principal', displayName: `${name} Admin`, pw: schoolPw, roles: ['SCHOOL_ADMIN'] })).id;
      u.teacher1 = (await addUser({ schoolId: sc.id, username: 'teacher1', displayName: 'Sample Teacher', pw: teacherPw, roles: ['TEACHER'] })).id;
      for (let i = 1; i <= 3; i++) u[`student${i}`] = (await addUser({ schoolId: sc.id, username: `student${i}`, displayName: `Sample Student ${i}`, pw: studentPw, roles: ['STUDENT'] })).id;
      schoolRows.push({ id: sc.id, code, users: u });
    }

    // Taxonomy
    const gradeRows = await db.insert(s.grades).values(['Nursery', 'KG', 'Grade 1', 'Grade 2'].map((name, sort) => ({ publisherId: P, name, sort }))).returning();
    const subj = await db.insert(s.subjects).values([
      ['English', '#ef4444'], ['Mathematics', '#3b82f6'], ['Urdu', '#10b981'], ['General Knowledge', '#f59e0b'],
    ].map(([name, color], sort) => ({ publisherId: P, name, color, sort }))).returning();
    const G = Object.fromEntries(gradeRows.map((g) => [g.name, g.id]));
    const S = Object.fromEntries(subj.map((x) => [x.name, x.id]));

    // A shared sample asset (stored once, reused by several resources → demonstrates de-duplication)
    const driver = createDriver();
    const putAsset = async (name: string, buf: Buffer, ext: string, mime: string) => {
      const sha = createHash('sha256').update(buf).digest('hex');
      const key = `${P}/${sha.slice(0, 2)}/${sha}.${ext}`;
      const tmp = path.join(os.tmpdir(), `seed-${sha}`); fs.writeFileSync(tmp, buf);
      await driver.putFile(key, tmp, mime); fs.rmSync(tmp);
      const [a] = await db.insert(s.digitalAssets).values({ publisherId: P, sha256: sha, storageKey: key, originalName: name, mimeType: mime, ext,
        sizeBytes: buf.length, scanStatus: 'SKIPPED', uploadedBy: admin.id }).returning();
      return a;
    };
    const guidePdf = await putAsset('Sample-Teaching-Guide.pdf',
      samplePdf(['SAMPLE RESOURCE', 'This is placeholder content created by the demo seed.', 'Replace it with the publisher\'s real teaching file.']), 'pdf', 'application/pdf');
    const html = await putAsset('sample-activity.html', Buffer.from('<!doctype html><title>Sample activity</title><h1>Sample HTML5 activity</h1><p>Placeholder interactive resource.</p>'), 'html', 'text/html');

    const packages = [
      { title: 'KG English', subject: 'English', color: '#ef4444', units: ['Letters and Sounds', 'My First Words'] },
      { title: 'KG Maths', subject: 'Mathematics', color: '#3b82f6', units: ['Numbers 1–10', 'Shapes Around Us'] },
      { title: 'KG Urdu', subject: 'Urdu', color: '#10b981', units: ['حروفِ تہجی (Haroof)', 'آسان الفاظ (Simple Words)'] },
      { title: 'KG General Knowledge', subject: 'General Knowledge', color: '#f59e0b', units: ['Myself and My Family', 'Animals Around Us'] },
    ];
    const editionByTitle: Record<string, string> = {};
    for (const p of packages) {
      const [pkg] = await db.insert(s.bookPackages).values({ publisherId: P, gradeId: G.KG, subjectId: S[p.subject], title: p.title,
        slug: p.title.toLowerCase().replace(/\s+/g, '-'), description: `${p.title} complete package (sample structure for demonstration).`,
        coverColor: p.color, status: 'PUBLISHED', createdBy: admin.id }).returning();
      const [ed] = await db.insert(s.bookEditions).values({ publisherId: P, packageId: pkg.id, label: '2026 Edition', editionYear: 2026,
        status: 'PUBLISHED', publishedAt: new Date(), publishedBy: admin.id }).returning();
      editionByTitle[p.title] = ed.id;
      const comps = [
        ...[1, 2, 3].map((n) => ({ type: 'STUDENT_BOOK' as const, title: `Student Book Part ${n}`, partNumber: n, pageCount: 64 })),
        { type: 'HOMEWORK_BOOK' as const, title: 'Homework Book', partNumber: null, pageCount: 48 },
        { type: 'TEACHER_GUIDE' as const, title: 'Teacher Guide', partNumber: null, pageCount: null },
        { type: 'FLASHCARDS' as const, title: 'Flashcards', partNumber: null, pageCount: null },
        { type: 'TEACHER_CARDS' as const, title: 'Teacher Cards', partNumber: null, pageCount: null },
        { type: 'DANGLERS' as const, title: 'Danglers', partNumber: null, pageCount: null },
      ];
      const compRows = await db.insert(s.bookComponents).values(comps.map((c, i) => ({ publisherId: P, editionId: ed.id, sort: i, ...c }))).returning();
      const part1 = compRows[0];
      let page = 2;
      for (const [ui, unitTitle] of p.units.entries()) {
        const [u] = await db.insert(s.bookUnits).values({ publisherId: P, componentId: part1.id, number: ui + 1, sort: ui, title: `${unitTitle} (sample)` }).returning();
        for (let li = 1; li <= 3; li++) {
          const [l] = await db.insert(s.bookLessons).values({ publisherId: P, unitId: u.id, number: li, sort: li, title: `Lesson ${li} (sample)`,
            objectives: 'Sample objective placeholder — replace with the textbook\'s real objectives.', pageStart: page, pageEnd: page + 3 }).returning();
          page += 4;
          if (ui === 0 && li === 1) {
            await db.insert(s.teachingResources).values({ publisherId: P, editionId: ed.id, componentId: part1.id, unitId: u.id, lessonId: l.id,
              assetId: html.id, title: 'Sample HTML5 activity', resourceType: 'HTML5', audience: 'ALL', createdBy: admin.id });
          }
        }
      }
      // The same PDF is linked to all four packages — stored once.
      await db.insert(s.teachingResources).values({ publisherId: P, editionId: ed.id, assetId: guidePdf.id, title: 'Sample teaching guide (placeholder)',
        resourceType: 'PDF', audience: 'TEACHER', createdBy: admin.id });
    }
    // A draft package to show the draft workflow
    const [draft] = await db.insert(s.bookPackages).values({ publisherId: P, gradeId: G['Grade 1'], subjectId: S.English, title: 'Grade 1 English',
      slug: 'grade-1-english', description: 'Draft package — structure in progress.', coverColor: '#8b5cf6', createdBy: admin.id }).returning();
    const [dEd] = await db.insert(s.bookEditions).values({ publisherId: P, packageId: draft.id, label: '2027 Edition', editionYear: 2027 }).returning();
    await db.insert(s.bookComponents).values([1, 2].map((n) => ({ publisherId: P, editionId: dEd.id, type: 'STUDENT_BOOK' as const, title: `Student Book Part ${n}`, partNumber: n, sort: n })));

    // ---------- Commerce & licensing (Phase 3) ----------
    const now = new Date(); const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1; // Aug–Jul academic year
    const ayStart = new Date(Date.UTC(y, 7, 1)); const ayEnd = new Date(Date.UTC(y + 1, 6, 31, 23, 59, 59));
    const ays: Record<string, string> = {};
    for (const sc of schoolRows) {
      const [ay] = await db.insert(s.academicYears).values({ publisherId: P, schoolId: sc.id, name: `${y}–${String(y + 1).slice(2)}`, startsOn: ayStart, endsOn: ayEnd }).returning();
      ays[sc.code] = ay.id;
    }
    const versions: Record<string, string> = {};
    const mkProduct = async (sku: string, name: string, kind: 'SINGLE' | 'BUNDLE', titles: string[], priceMinor: number) => {
      const [pr] = await db.insert(s.products).values({ publisherId: P, sku, name, kind, gradeId: G.KG, description: kind === 'BUNDLE' ? 'One seat unlocks all four KG books.' : '' }).returning();
      const [v] = await db.insert(s.productVersions).values({ publisherId: P, productId: pr.id, versionNo: 1, priceMinor, currency: 'PKR' }).returning();
      await db.insert(s.bundleItems).values(titles.map((t) => ({ productVersionId: v.id, editionId: editionByTitle[t], publisherId: P })));
      await db.update(s.productVersions).set({ status: 'ACTIVE', activatedAt: new Date() }).where(sql`id = ${v.id}`);
      versions[sku] = v.id;
    };
    for (const p of packages) await mkProduct(`KG-${p.subject.slice(0, 3).toUpperCase()}`, `${p.title} package`, 'SINGLE', [p.title], 250000);
    await mkProduct('KG-BUNDLE', 'KG Complete Bundle', 'BUNDLE', packages.map((p) => p.title), 850000);

    let orderSeq = 1;
    const fulfil = async (code: string, lines: [string, number, number][], assign: Record<string, string[]>) => {
      const sc = schoolRows.find((x) => x.code === code)!;
      const [o] = await db.insert(s.orders).values({ publisherId: P, schoolId: sc.id, academicYearId: ays[code], orderNo: `ORD-SEED-${String(orderSeq++).padStart(4, '0')}`,
        type: 'NEW', status: 'FULFILLED', createdBy: admin.id, confirmedAt: now, fulfilledAt: now }).returning();
      for (const [sku, stu, tea] of lines) {
        const [l] = await db.insert(s.orderLines).values({ publisherId: P, schoolId: sc.id, orderId: o.id, productVersionId: versions[sku], studentQty: stu, teacherQty: tea, unitPriceMinor: sku === 'KG-BUNDLE' ? 850000 : 250000 }).returning();
        const [f] = await db.insert(s.fulfillments).values({ publisherId: P, schoolId: sc.id, orderLineId: l.id, fulfilledBy: admin.id }).returning();
        for (const [seatType, qty] of [['STUDENT', stu], ['TEACHER', tea]] as const) {
          if (!qty) continue;
          const [pool] = await db.insert(s.licensePools).values({ publisherId: P, schoolId: sc.id, academicYearId: ays[code], productVersionId: versions[sku], seatType, quantity: qty,
            fulfillmentId: f.id, validFrom: ayStart, validUntil: ayEnd }).returning();
          const seats = await db.insert(s.licenseSeats).values(Array.from({ length: qty }, (_, i) => ({ publisherId: P, schoolId: sc.id, poolId: pool.id, seatNo: i + 1 }))).returning();
          const holders = (assign[`${sku}:${seatType}`] ?? []).map((u) => sc.users[u]);
          const items = await db.select().from(s.bundleItems).where(sql`product_version_id = ${versions[sku]}`);
          for (const [i, userId] of holders.entries()) {
            await db.update(s.licenseSeats).set({ status: 'ASSIGNED' }).where(sql`id = ${seats[i].id}`);
            const [a] = await db.insert(s.licenseAssignments).values({ publisherId: P, schoolId: sc.id, poolId: pool.id, seatId: seats[i].id, userId, assignedBy: sc.users.principal }).returning();
            await db.insert(s.accessEntitlements).values(items.map((it) => ({ publisherId: P, schoolId: sc.id, userId, editionId: it.editionId, assignmentId: a.id, validUntil: ayEnd })));
          }
        }
      }
    };
    await fulfil('SUN01', [['KG-BUNDLE', 30, 3]], { 'KG-BUNDLE:STUDENT': ['student1', 'student2'], 'KG-BUNDLE:TEACHER': ['teacher1'] });
    await fulfil('GVS02', [['KG-ENG', 20, 2], ['KG-MAT', 20, 2]], { 'KG-ENG:STUDENT': ['student1'], 'KG-ENG:TEACHER': ['teacher1'], 'KG-MAT:STUDENT': ['student1'] });
    const bfa = schoolRows.find((x) => x.code === 'BFA03')!;
    const [draftOrder] = await db.insert(s.orders).values({ publisherId: P, schoolId: bfa.id, academicYearId: ays.BFA03, orderNo: 'ORD-SEED-0003', type: 'NEW', createdBy: admin.id, notes: 'Awaiting payment' }).returning();
    await db.insert(s.orderLines).values({ publisherId: P, schoolId: bfa.id, orderId: draftOrder.id, productVersionId: versions['KG-BUNDLE'], studentQty: 40, teacherQty: 4, unitPriceMinor: 850000 });

    log('✅ Seeded: 1 publisher, 3 staff, 3 schools (15 users), 4 grades, 4 subjects, 5 book packages, 5 products (incl. KG Complete Bundle), 3 orders with licences.');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seed(undefined, { reset: process.argv.includes('--reset') }).catch((e) => { console.error(e); process.exit(1); });
}
