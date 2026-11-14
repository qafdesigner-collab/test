/* Sample content shared by the demo seed (tests, fresh demo installs) and the "Load demo data" tool.
 * All units/lessons are clearly marked "(sample)": placeholders, NOT real publisher textbook content.
 * Runs as the OWNER role (bypasses RLS). */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as s from './schema';
import { hashPassword } from '../auth/password';
import { createDriver } from '../storage/storage.driver';
import { extractPdfPages } from '../ai/extract';

export interface DemoOptions {
  code: (c: string) => string; name: (n: string) => string; title: (t: string) => string; slug: (x: string) => string; sku: (x: string) => string;
  tag: string; record: (kind: string, id: string) => Promise<unknown>;
}
/** Names used by the developer/test seed (unchanged from earlier versions). */
export const CLASSIC: DemoOptions = { code: (c) => c, name: (n) => n, title: (t) => t, slug: (x) => x, sku: (x) => x, tag: 'SEED', record: async () => undefined };
/** Names used when a publisher loads demo data next to their real data. */
export const LIVE_CODES: Record<string, string> = { SUN01: 'DEMO1', GVS02: 'DEMO2', BFA03: 'DEMO3' };
export const liveOptions = (record: DemoOptions['record']): DemoOptions => ({
  code: (c) => LIVE_CODES[c] ?? `DEMO-${c}`, name: (n) => `${n} (Demo)`, title: (t) => `${t} (Demo)`, slug: (x) => `demo-${x}`, sku: (x) => `DEMO-${x}`, tag: 'DEMO', record,
});

/** Builds a small valid PDF: one page per entry, each page a list of text lines (placeholder content only). */
export function samplePdf(lines: string[] | string[][], color = '0.95 0.45 0.2') {
  const pages = (Array.isArray(lines[0]) ? lines : [lines]) as string[][];
  const objs: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  const kids: number[] = [];
  for (const pg of pages) {
    const text = `${color} rg 0 742 420 50 re f 1 1 1 rg ` + pg.map((l, i) => `BT /F1 ${i ? 16 : 22} Tf ${i ? '0.2 0.2 0.3 rg ' : ''}40 ${i ? 680 - i * 34 : 758} Td (${l.replace(/[()\\]/g, '')}) Tj ET`).join('\n');
    objs.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
    const contentNo = objs.length;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNo} 0 R >>`);
    kids.push(objs.length);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}


/** Schools, books, products, licences, a class with homework and the game library. Returns what later steps need. */
export async function demoContent(db: NodePgDatabase<typeof s>, P: string, admin: { id: string }, o: DemoOptions) {
  const addUser = async (u: { schoolId?: string; username: string; displayName: string; pw: string; roles: (typeof s.roleEnum.enumValues)[number][] }) => {
    const [row] = await db.insert(s.users).values({ publisherId: P, schoolId: u.schoolId ?? null, username: u.username, displayName: u.displayName, passwordHash: u.pw }).returning();
    await db.insert(s.userRoles).values(u.roles.map((role) => ({ userId: row.id, role, publisherId: P, schoolId: u.schoolId ?? null })));
    return row;
  };
    // Schools (licences & orders arrive in Phase 3)
    const schoolPw = await hashPassword('School@12345'); const teacherPw = await hashPassword('Teacher@12345'); const studentPw = await hashPassword('Student@123');
    const schoolRows: { id: string; code: string; users: Record<string, string> }[] = [];
    const schoolDefs = [['Sunrise Grammar School', 'SUN01', 'Lahore'], ['Green Valley School', 'GVS02', 'Karachi'], ['Bright Future Academy', 'BFA03', 'Islamabad']];
    for (const [name, code, city] of schoolDefs) {
      const [sc] = await db.insert(s.schools).values({ publisherId: P, name: o.name(name), code: o.code(code), city }).returning();
      await o.record('school', sc.id);
      const u: Record<string, string> = {};
      u.principal = (await addUser({ schoolId: sc.id, username: 'principal', displayName: `${name} Admin`, pw: schoolPw, roles: ['SCHOOL_ADMIN'] })).id;
      u.teacher1 = (await addUser({ schoolId: sc.id, username: 'teacher1', displayName: 'Sample Teacher', pw: teacherPw, roles: ['TEACHER'] })).id;
      for (let i = 1; i <= 3; i++) u[`student${i}`] = (await addUser({ schoolId: sc.id, username: `student${i}`, displayName: `Sample Student ${i}`, pw: studentPw, roles: ['STUDENT'] })).id;
      if (code === 'SUN01') {
        // a demo parent with two children (siblings)
        u.parent1 = (await addUser({ schoolId: sc.id, username: 'parent1', displayName: 'Sample Parent', pw: await hashPassword('Parent@123'), roles: ['PARENT'] })).id;
        await db.update(s.users).set({ phone: '0300 0000000' }).where(sql`id = ${u.parent1}`);
        for (const k of ['student1', 'student2']) await db.insert(s.parentStudents).values({ parentId: u.parent1, studentId: u[k], publisherId: P, schoolId: sc.id, relation: 'Mother' });
      }
      schoolRows.push({ id: sc.id, code, users: u });
    }

    // Taxonomy
    // Curricula, grades and subjects come from seed_reference_data() (run by a trigger when the publisher is created).
    // The demo uses the Pakistan National Curriculum grades.
    const [pk] = (await db.select().from(s.curricula).where(sql`publisher_id = ${P} AND code = 'PAKISTAN'`)).concat(await db.select().from(s.curricula).where(sql`publisher_id = ${P}`));
    if (!pk) throw new Error('No curriculum found. Add one under Curricula & Grades first.');
    const gradeRows = await db.select().from(s.grades).where(sql`curriculum_id = ${pk.id} AND name IN ('Nursery', 'KG', 'Grade 1', 'Grade 2')`);
    const subj = await db.select().from(s.subjects).where(sql`publisher_id = ${P} AND name IN ('English', 'Mathematics', 'Urdu', 'General Knowledge')`);
    for (const sc of schoolRows) await db.update(s.schools).set({ curriculumId: pk.id }).where(sql`id = ${sc.id}`);
    const G = Object.fromEntries(gradeRows.map((g) => [g.name, g.id]));
    const S = Object.fromEntries(subj.map((x) => [x.name, x.id]));

    // A shared sample asset (stored once, reused by several resources → demonstrates de-duplication)
    const driver = createDriver();
    const putAsset = async (name: string, buf: Buffer, ext: string, mime: string) => {
      const sha = createHash('sha256').update(buf).digest('hex');
      const [had] = await db.select().from(s.digitalAssets).where(sql`publisher_id = ${P} AND sha256 = ${sha}`);
      if (had) return had; // identical file already stored: reuse it (not demo-owned, so never removed)
      const key = `${P}/${sha.slice(0, 2)}/${sha}.${ext}`;
      const tmp = path.join(os.tmpdir(), `seed-${sha}`); fs.writeFileSync(tmp, buf);
      await driver.putFile(key, tmp, mime); fs.rmSync(tmp);
      const [a] = await db.insert(s.digitalAssets).values({ publisherId: P, sha256: sha, storageKey: key, originalName: name, mimeType: mime, ext,
        sizeBytes: buf.length, scanStatus: 'SKIPPED', uploadedBy: admin.id }).returning();
      await o.record('digital_assets', a.id);
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
      const [pkg] = await db.insert(s.bookPackages).values({ publisherId: P, gradeId: G.KG, subjectId: S[p.subject], title: o.title(p.title),
        slug: o.slug(p.title.toLowerCase().replace(/\s+/g, '-')), description: `${p.title} complete package (sample structure for demonstration).`,
        coverColor: p.color, status: 'PUBLISHED', createdBy: admin.id }).returning();
      await o.record('book_packages', pkg.id);
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
      // Placeholder digital pages for Part 1 so the reader can be tried. NOT real textbook content.
      const pagesPdf = samplePdf(Array.from({ length: 26 }, (_, i) => i === 0
        ? [`${p.title} - Student Book Part 1`, 'SAMPLE PLACEHOLDER BOOK', 'Upload the real PDF in the Package Builder.']
        : [`${p.title} - Part 1`, `Page ${i + 1}`, 'Sample placeholder page', '(not publisher content)']), p.color === '#3b82f6' ? '0.23 0.51 0.96' : p.color === '#10b981' ? '0.06 0.73 0.5' : p.color === '#f59e0b' ? '0.96 0.62 0.04' : '0.94 0.27 0.27');
      const bookAsset = await putAsset(`${p.title} Part 1 (sample).pdf`, pagesPdf, 'pdf', 'application/pdf');
      await db.update(s.bookComponents).set({ bookAssetId: bookAsset.id, pageCount: 26 }).where(sql`id = ${part1.id}`);
      const pdfTmp = path.join(os.tmpdir(), `seed-index-${part1.id}.pdf`); fs.writeFileSync(pdfTmp, pagesPdf);
      // Text for search and Ask Owl; demo loading still works if the server cannot read PDFs.
      const extracted = (await extractPdfPages(pdfTmp).catch(() => ({ pages: [] as string[] }))).pages; fs.rmSync(pdfTmp, { force: true });
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
      // AI text index of Part 1 (pages linked to lessons by page range).
      const lessonRanges = await db.execute(sql`SELECT l.id, l.page_start AS a, l.page_end AS b FROM book_lessons l JOIN book_units u ON u.id = l.unit_id WHERE u.component_id = ${part1.id}`);
      if (extracted.length) await db.insert(s.bookPages).values(extracted.map((text, i) => ({ publisherId: P, componentId: part1.id, pageNumber: i + 1, textContent: text,
        lessonId: (lessonRanges.rows as any[]).find((r) => i + 1 >= r.a && i + 1 <= r.b)?.id ?? null })));
      if (extracted.length) await db.update(s.bookComponents).set({ indexStatus: 'DONE', indexedPages: extracted.length, indexedAt: new Date() }).where(sql`id = ${part1.id}`);
      // The same PDF is linked to all four packages — stored once.
      await db.insert(s.teachingResources).values({ publisherId: P, editionId: ed.id, assetId: guidePdf.id, title: 'Sample teaching guide (placeholder)',
        resourceType: 'PDF', audience: 'TEACHER', createdBy: admin.id });
    }
    // A draft package to show the draft workflow
    const [draft] = await db.insert(s.bookPackages).values({ publisherId: P, gradeId: G['Grade 1'], subjectId: S.English, title: o.title('Grade 1 English'),
      slug: o.slug('grade-1-english'), description: 'Draft package — structure in progress.', coverColor: '#8b5cf6', createdBy: admin.id }).returning();
    await o.record('book_packages', draft.id);
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
      const [pr] = await db.insert(s.products).values({ publisherId: P, sku: o.sku(sku), name: o.title(name), kind, gradeId: G.KG, description: kind === 'BUNDLE' ? 'One seat unlocks all four KG books.' : '' }).returning();
      await o.record('products', pr.id);
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
      const [ord] = await db.insert(s.orders).values({ publisherId: P, schoolId: sc.id, academicYearId: ays[code], orderNo: `ORD-${o.tag}-${String(orderSeq++).padStart(4, '0')}`,
        type: 'NEW', status: 'FULFILLED', createdBy: admin.id, confirmedAt: now, fulfilledAt: now }).returning();
      for (const [sku, stu, tea] of lines) {
        const [l] = await db.insert(s.orderLines).values({ publisherId: P, schoolId: sc.id, orderId: ord.id, productVersionId: versions[sku], studentQty: stu, teacherQty: tea, unitPriceMinor: sku === 'KG-BUNDLE' ? 850000 : 250000 }).returning();
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
    const [draftOrder] = await db.insert(s.orders).values({ publisherId: P, schoolId: bfa.id, academicYearId: ays.BFA03, orderNo: `ORD-${o.tag}-0003`, type: 'NEW', createdBy: admin.id, notes: 'Awaiting payment' }).returning();
    await db.insert(s.orderLines).values({ publisherId: P, schoolId: bfa.id, orderId: draftOrder.id, productVersionId: versions['KG-BUNDLE'], studentQty: 40, teacherQty: 4, unitPriceMinor: 850000 });

    // ---------- Phase 4: a class with teacher, students and one homework ----------
    const sun = schoolRows.find((x) => x.code === 'SUN01')!;
    const [kgRose] = await db.insert(s.classes).values({ publisherId: P, schoolId: sun.id, academicYearId: ays.SUN01, gradeId: G.KG, name: 'KG', section: 'Rose' }).returning();
    await db.insert(s.classTeachers).values({ classId: kgRose.id, userId: sun.users.teacher1, publisherId: P, schoolId: sun.id, subjectId: S.English });
    await db.insert(s.enrolments).values(['student1', 'student2', 'student3'].map((u) => ({ classId: kgRose.id, studentId: sun.users[u], publisherId: P, schoolId: sun.id, academicYearId: ays.SUN01 })));
    const [hw] = await db.insert(s.assessments).values({ publisherId: P, schoolId: sun.id, teacherId: sun.users.teacher1, classId: kgRose.id, editionId: editionByTitle['KG English'],
      kind: 'HOMEWORK', title: 'Sample homework (placeholder questions)', instructions: 'Read each question and choose the answer.', status: 'PUBLISHED', publishedAt: new Date(),
      dueAt: new Date(Date.now() + 7 * 864e5) }).returning();
    await db.insert(s.assessmentItems).values([
      { type: 'MCQ' as const, prompt: 'Which letter comes after A?', options: ['C', 'B', 'D'], answer: [1], points: 1 },
      { type: 'TRUE_FALSE' as const, prompt: 'An apple is a fruit.', options: [], answer: [true], points: 1 },
      { type: 'FILL_BLANK' as const, prompt: 'C is for ___ (an animal that says meow).', options: [], answer: ['cat'], points: 1 },
      { type: 'SHORT' as const, prompt: 'Write one word that starts with B.', options: [], answer: [], points: 2 },
    ].map((it, position) => ({ ...it, position, publisherId: P, schoolId: sun.id, assessmentId: hw.id })));

    // ---------- Phase 6: game library (generic early-years content, not publisher textbook content) ----------
    const firstLesson = async (title: string) => ((await db.execute(sql`SELECT l.id FROM book_lessons l JOIN book_units u ON u.id = l.unit_id JOIN book_components c ON c.id = u.component_id
      WHERE c.edition_id = ${editionByTitle[title]} ORDER BY c.sort, u.sort, l.sort LIMIT 1`)).rows[0] as any)?.id ?? null;
    const games: [string, (typeof s.gameEngineEnum.enumValues)[number], string, string, unknown][] = [
      ['KG English', 'ALPHABET_MATCH', 'Big and small letters', 'Match each capital letter with its small letter.', { pairs: 'ABCDEF'.split('').map((l) => ({ a: l, b: l.toLowerCase() })) }],
      ['KG English', 'PICTURE_WORD', 'Picture and word', 'Match the picture with its word.', { pairs: [['🍎', 'apple'], ['⚽', 'ball'], ['🐱', 'cat'], ['🐶', 'dog'], ['🥚', 'egg'], ['🐟', 'fish']].map(([a, b]) => ({ a, b })) }],
      ['KG English', 'MEMORY', 'Animal memory', 'Turn two cards. Find the matching pairs!', { pairs: [['🐱', 'cat'], ['🐶', 'dog'], ['🐮', 'cow'], ['🐷', 'pig'], ['🦆', 'duck'], ['🐑', 'sheep']].map(([a, b]) => ({ a, b })) }],
      ['KG English', 'WORD_BUILD', 'Build the word', 'Tap the letters in the right order.', { words: [['cat', '🐱'], ['dog', '🐶'], ['sun', '☀️'], ['hat', '🎩'], ['bus', '🚌']].map(([word, hint]) => ({ word, hint })) }],
      ['KG English', 'FILL_BLANK', 'Missing letter', 'Choose the missing letter.', { sentences: [
        { text: 'c___t 🐱', answer: 'a', options: ['a', 'o', 'u'] }, { text: 'd___g 🐶', answer: 'o', options: ['a', 'o', 'i'] }, { text: 's___n ☀️', answer: 'u', options: ['u', 'e', 'a'] }] }],
      ['KG English', 'PUZZLE', 'Apple puzzle', 'Swap the pieces to make the picture.', { picture: '🍎', word: 'apple', size: 3 }],
      ['KG Maths', 'COUNTING', 'Count the fruit', 'How many can you see?', { things: ['🍎', '🍌', '🍓', '🍊'], min: 1, max: 10, rounds: 6 }],
      ['KG Maths', 'SHAPES', 'Find the shape', 'Tap the shape I ask for.', { shapes: ['circle', 'square', 'triangle', 'rectangle', 'star', 'heart'], rounds: 6 }],
      ['KG Maths', 'QUIZ', 'Little sums', 'Choose the right answer.', { questions: [
        { prompt: '1 + 1 = ?', options: ['1', '2', '3'], answer: 1 }, { prompt: '2 + 2 = ?', options: ['4', '3', '5'], answer: 0 }, { prompt: '3 + 1 = ?', options: ['2', '5', '4'], answer: 2 }] }],
      ['KG Maths', 'SORTING', 'Big or small?', 'Drag each picture to the right group.', { categories: [{ name: 'Big', items: ['🐘', '🦒', '🚌'] }, { name: 'Small', items: ['🐜', '🐭', '🐞'] }] }],
      ['KG General Knowledge', 'SORTING', 'Animals and fruit', 'Put each picture in its group.', { categories: [{ name: 'Animals', items: ['🐶', '🐱', '🐮', '🐴'] }, { name: 'Fruit', items: ['🍎', '🍌', '🍇', '🍐'] }] }],
      ['KG General Knowledge', 'QUIZ', 'Where do they live?', 'Choose the right answer.', { questions: [
        { prompt: 'Where does a fish live? 🐟', options: ['In water', 'In a tree'], answer: 0 }, { prompt: 'Where does a bird live? 🐦', options: ['In a nest', 'In the sea'], answer: 0 }] }],
      ['KG Urdu', 'ALPHABET_MATCH', 'حروف اور الفاظ', 'ہر حرف کو اس کے لفظ سے ملائیں', { pairs: [['ا', 'انار'], ['ب', 'بکری'], ['پ', 'پتنگ'], ['ت', 'تتلی']].map(([a, b]) => ({ a, b })) }],
    ];
    const gameIds: Record<string, string> = {};
    for (const [book, engine, title, instructions, content] of games) {
      const [g] = await db.insert(s.gameActivities).values({ publisherId: P, editionId: editionByTitle[book], lessonId: await firstLesson(book), engine, title, instructions, content,
        published: true, createdBy: admin.id }).returning();
      await o.record('game_activities', g.id);
      gameIds[title] = g.id;
    }
    for (const t of ['Picture and word', 'Count the fruit'])
      await db.insert(s.gameAssignments).values({ publisherId: P, schoolId: sun.id, activityId: gameIds[t], classId: kgRose.id, teacherId: sun.users.teacher1 });

    return { schoolRows, kgRose, ays, S, G, editionByTitle, gameIds };
}

/** Extra sample activity for the "Load demo data" tool, so every feature has something to look at. */
export async function demoExtras(db: NodePgDatabase<typeof s>, P: string, admin: { id: string }, r: Awaited<ReturnType<typeof demoContent>>, o: DemoOptions) {
  const x = (q: ReturnType<typeof sql>) => db.execute(q);
  const sun = r.schoolRows.find((z) => z.code === 'SUN01')!; const S = sun.id; const u = sun.users; const cls = r.kgRose.id;
  const kids = ['student1', 'student2', 'student3'].map((k) => u[k]);
  // attendance: the last 5 school days
  const days: string[] = []; for (let d = new Date(); days.length < 5; d = new Date(d.getTime() - 864e5)) if (![0, 6].includes(d.getDay())) days.push(d.toISOString().slice(0, 10));
  for (const [i, day] of days.entries()) for (const [k, kid] of kids.entries()) {
    const status = i === 1 && k === 2 ? 'ABSENT' : i === 3 && k === 1 ? 'LATE' : 'PRESENT';
    await x(sql`INSERT INTO attendance (publisher_id, school_id, class_id, student_id, day, status, marked_by) VALUES (${P}, ${S}, ${cls}, ${kid}, ${day}, ${status}, ${u.teacher1})`);
  }
  // bell times and a weekly timetable
  const bells = [['08:00', '08:40'], ['08:40', '09:20'], ['09:20', '09:40'], ['09:40', '10:20'], ['10:20', '11:00']];
  for (const [i, [a, b]] of bells.entries()) await x(sql`INSERT INTO timetable_periods (publisher_id, school_id, number, label, starts_at, ends_at, is_break) VALUES (${P}, ${S}, ${i + 1}, ${i === 2 ? 'Break' : ''}, ${a}, ${b}, ${i === 2})`);
  const subj = [r.S.English, r.S.Mathematics, r.S.Urdu, r.S['General Knowledge']];
  for (let d = 1; d <= 5; d++) for (const p of [1, 2, 4, 5]) await x(sql`INSERT INTO timetable_slots (publisher_id, school_id, class_id, weekday, period, subject_id, teacher_id, room)
    VALUES (${P}, ${S}, ${cls}, ${d}, ${p}, ${subj[(d + p) % 4]}, ${p === 1 ? u.teacher1 : null}, 'Room 1')`);
  // announcements, a live lesson and a parent conversation
  await x(sql`INSERT INTO announcements (publisher_id, school_id, class_id, author_id, title, body, audience, pinned) VALUES
    (${P}, ${S}, null, ${u.principal}, 'Welcome to the new term!', 'This is demo data to try the system. Remove it any time from Super admin → Demo data.', 'BOTH', true),
    (${P}, ${S}, ${cls}, ${u.teacher1}, 'Bring your reading book tomorrow', 'We will read pages 2 to 5 together.', 'BOTH', false)`);
  await x(sql`INSERT INTO live_sessions (publisher_id, school_id, class_id, teacher_id, title, starts_at, duration_min, url, notes)
    VALUES (${P}, ${S}, ${cls}, ${u.teacher1}, 'Phonics revision (demo)', date_trunc('day', now()) + interval '1 day 10 hours', 40, 'https://meet.google.com/demo-lesson', 'Demo link — it does not open a real meeting.')`);
  const conv = (await x(sql`INSERT INTO conversations (publisher_id, school_id, parent_id, staff_id, student_id) VALUES (${P}, ${S}, ${u.parent1}, ${u.teacher1}, ${u.student1}) RETURNING id`)).rows[0] as any;
  await x(sql`INSERT INTO messages (publisher_id, school_id, conversation_id, sender_id, body, created_at) VALUES
    (${P}, ${S}, ${conv.id}, ${u.parent1}, 'Hello! How is my daughter doing with her reading?', now() - interval '2 hours'),
    (${P}, ${S}, ${conv.id}, ${u.teacher1}, 'She is doing very well and loves the picture books!', now() - interval '1 hour')`);
  // skill ratings and a marked exam with published results
  for (const [skill, rating] of [['Reading', 4], ['Speaking', 5], ['Writing', 3]] as const)
    await x(sql`INSERT INTO evaluations (publisher_id, school_id, teacher_id, student_id, class_id, subject_id, term, skill, rating, remarks) VALUES (${P}, ${S}, ${u.teacher1}, ${u.student1}, ${cls}, ${r.S.English}, 'Term 1', ${skill}, ${rating}, 'Good progress')`);
  const exam = (await x(sql`INSERT INTO exams (publisher_id, school_id, class_id, subject_id, edition_id, created_by, title, term, exam_date, duration_min, status, results_published_at)
    VALUES (${P}, ${S}, ${cls}, ${r.S.English}, ${r.editionByTitle['KG English']}, ${u.teacher1}, 'Term 1 English test', 'Term 1', current_date - 3, 45, 'PUBLISHED', now()) RETURNING id`)).rows[0] as any;
  const items: [string, string, unknown[], unknown[], number][] = [['MCQ', 'Which word starts with A?', ['Ball', 'Apple', 'Cat'], [1], 2], ['TRUE_FALSE', 'A cat says meow.', [], [true], 1],
    ['FILL_BLANK', 'D is for ___ (an animal that barks).', [], ['dog'], 2], ['LONG', 'Draw your family and write their names.', [], [], 5]];
  for (const [i, [type, prompt, options, answer, marks]] of items.entries())
    await x(sql`INSERT INTO exam_items (publisher_id, school_id, exam_id, section, position, type, prompt, options, answer, marks, lines) VALUES (${P}, ${S}, ${exam.id}, ${type === 'LONG' ? 'B' : 'A'}, ${i}, ${type}, ${prompt}, ${JSON.stringify(options)}::jsonb, ${JSON.stringify(answer)}::jsonb, ${marks}, ${type === 'LONG' ? 6 : 0})`);
  for (const [k, m] of [[0, 9], [1, 7.5], [2, null]] as const)
    await x(sql`INSERT INTO exam_marks (exam_id, student_id, publisher_id, school_id, marks, absent, entered_by) VALUES (${exam.id}, ${kids[k]}, ${P}, ${S}, ${m}, ${m === null}, ${u.teacher1})`);
  // Ask Owl switched on for the demo school
  await x(sql`INSERT INTO tutor_settings (school_id, publisher_id, enabled, daily_limit) VALUES (${S}, ${P}, true, 20)`);
  // a published teacher-training course
  const course = (await x(sql`INSERT INTO training_courses (publisher_id, title, description, status, color) VALUES (${P}, ${o.title('Getting started with your digital books')}, 'Three short lessons for new teachers.', 'PUBLISHED', '#0f766e') RETURNING id`)).rows[0] as any;
  await o.record('training_courses', course.id);
  await x(sql`INSERT INTO training_lessons (publisher_id, course_id, sort, title, kind, body, minutes) VALUES
    (${P}, ${course.id}, 1, 'Opening a book', 'TEXT', 'Go to My books and click Open book. Use the arrows to turn pages, and the bookmark button to remember a page.', 3),
    (${P}, ${course.id}, 2, 'Setting homework', 'TEXT', 'Open Homework & tests, choose New, pick the book lesson and add questions. Publish it when you are ready.', 4)`);
  await x(sql`INSERT INTO training_lessons (publisher_id, course_id, sort, title, kind, quiz, minutes) VALUES
    (${P}, ${course.id}, 3, 'Quick check', 'QUIZ', ${JSON.stringify([{ q: 'Where do you find your books?', options: ['My books', 'Games'], answer: 0 }])}::jsonb, 2)`);
  void admin;
}
