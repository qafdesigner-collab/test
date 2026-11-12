'use client';
import { palette, type Branding } from '@/lib/branding';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const today = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** Letter grade bands used on report cards. */
export const GRADE_BANDS: [number, string, string][] = [[90, 'A*', 'Outstanding'], [80, 'A', 'Excellent'], [70, 'B', 'Very good'], [60, 'C', 'Good'], [50, 'D', 'Satisfactory'], [0, 'E', 'Needs support']];
export const gradeFor = (p: number | null | undefined) => (p === null || p === undefined ? null : GRADE_BANDS.find(([min]) => p >= min)!);

function openDoc(title: string, css: string, body: string, landscape = false) {
  const w = window.open('', '_blank'); if (!w) return false;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:0} *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1e293b;background:#e2e8f0}
    .sheet{width:${landscape ? '297mm' : '210mm'};height:${landscape ? '210mm' : '297mm'};margin:8mm auto;background:#fff;position:relative;overflow:hidden;break-after:page}
    .sheet:last-child{break-after:auto}
    .bar{padding:10px;text-align:center} .bar button{font-size:16px;padding:8px 18px}
    @media print{body{background:#fff}.sheet{margin:0}.bar{display:none}}
    ${css}</style></head><body><div class="bar"><button onclick="print()">Print / save as PDF</button></div>${body}<script>window.addEventListener('load',()=>setTimeout(()=>print(),500))</script></body></html>`);
  w.document.close();
  return true;
}

const brandHead = (b: Branding) => b.logoUrl ? `<img class="logo" src="${esc(location.origin + b.logoUrl)}" alt="">` : `<span class="logo-txt">📚</span>`;

export interface ReportOptions { term: string; comment?: string; comments?: Record<string, string>; nextTerm?: string }

/** One A4 page per student: subjects with grades, skills, activity summary, comment and signatures. */
export function printReportCards(reports: any[], brand: Branding, o: ReportOptions & { company?: CompanyInfo }) {
  const p = palette(brand.primaryColor);
  const css = `
    .sheet{padding:14mm 15mm;display:flex;flex-direction:column;gap:5mm;font-size:12.5px}
    .top{display:flex;align-items:center;gap:4mm;border-bottom:3px solid ${p[600]};padding-bottom:4mm}
    .logo{height:16mm;max-width:45mm;object-fit:contain} .logo-txt{font-size:34px}
    .top h1{margin:0;font-size:20px;color:${p[800]}} .top .sub{color:#475569;font-size:12px}
    .top .doc{margin-left:auto;text-align:right} .doc b{display:block;font-size:17px;color:${p[700]};letter-spacing:.04em;text-transform:uppercase}
    .who{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm 5mm;background:${p[50]};border-radius:3mm;padding:3mm 4mm}
    .who div span{display:block;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.05em} .who div b{font-size:13px}
    h2{font-size:13px;margin:0 0 2mm;color:${p[700]};text-transform:uppercase;letter-spacing:.05em}
    table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #e2e8f0;padding:1.8mm 2mm;text-align:left} th{font-size:10.5px;color:#475569;text-transform:uppercase;background:#f8fafc}
    .meter{height:2.4mm;background:#e2e8f0;border-radius:2mm;overflow:hidden;width:40mm} .meter i{display:block;height:100%;background:${p[500]}}
    .grade{display:inline-block;min-width:9mm;text-align:center;font-weight:800;color:#fff;background:${p[600]};border-radius:1.5mm;padding:.4mm 1.5mm}
    .cols{display:grid;grid-template-columns:1.1fr .9fr;gap:6mm}
    .stars{color:#f59e0b;letter-spacing:1px}
    .tiles{display:grid;grid-template-columns:1fr 1fr;gap:2mm} .tile{border:1px solid #e2e8f0;border-radius:2mm;padding:2mm 3mm} .tile b{font-size:17px;color:${p[700]};display:block}
    .comment{border:1px solid #e2e8f0;border-radius:3mm;padding:3mm 4mm;min-height:24mm;white-space:pre-wrap;line-height:1.5}
    .sign{display:grid;grid-template-columns:repeat(3,1fr);gap:10mm;margin-top:auto;padding-top:10mm} .sign div{border-top:1px solid #94a3b8;padding-top:1.5mm;font-size:11px;color:#475569;text-align:center}
    .legend{font-size:10px;color:#475569} .muted{color:#64748b}`;
  const pages = reports.map((r) => {
    const evals = (r.evaluations ?? []).filter((e: any) => !o.term || !e.term || e.term === o.term);
    const latest = new Map<string, any>(); for (const e of evals) if (!latest.has(e.skill)) latest.set(e.skill, e);
    const work = r.work ?? []; const done = work.filter((w: any) => w.status).length;
    const s = r.summary ?? {}; const att = s.attendance as { status: string; n: number }[] | null;
    const attTotal = att?.reduce((n, a) => n + a.n, 0) ?? 0; const present = att?.filter((a) => ['PRESENT', 'LATE'].includes(a.status)).reduce((n, a) => n + a.n, 0) ?? 0;
    const subjects = (r.bySubject ?? []).filter((b: any) => b.percent !== null);
    const overall = subjects.length ? Math.round(subjects.reduce((n: number, b: any) => n + b.percent, 0) / subjects.length) : null;
    const cls = r.class ? [r.class.name, r.class.section].filter(Boolean).join(' — ') : '—';
    const comment = o.comments?.[r.student.id] ?? o.comment ?? '';
    return `<section class="sheet">
      <div class="top">${brandHead(brand)}<div><h1>${esc(r.school?.name ?? brand.name)}</h1><div class="sub">${esc(brand.name)}${r.class?.academicYear ? ` · Academic year ${esc(r.class.academicYear)}` : ''}</div></div>
        <div class="doc"><b>Progress report</b>${esc(o.term)}</div></div>
      <div class="who"><div><span>Student</span><b>${esc(r.student.displayName)}</b></div><div><span>Class</span><b>${esc(cls)}</b></div>
        <div><span>Class teacher</span><b>${esc(r.class?.teachers ?? '—')}</b></div><div><span>Date</span><b>${today()}</b></div></div>
      <div><h2>Subjects</h2><table><tr><th>Subject</th><th>Score</th><th></th><th>Grade</th><th>Remark</th></tr>
        ${subjects.map((b: any) => { const g = gradeFor(b.percent)!; return `<tr><td><b>${esc(b.subject)}</b></td><td>${b.percent}%</td><td><div class="meter"><i style="width:${Math.min(100, b.percent)}%"></i></div></td><td><span class="grade">${g[1]}</span></td><td>${g[2]}</td></tr>`; }).join('')}
        ${subjects.length ? `<tr><td><b>Overall</b></td><td><b>${overall}%</b></td><td></td><td><span class="grade">${gradeFor(overall)![1]}</span></td><td>${gradeFor(overall)![2]}</td></tr>` : '<tr><td colspan="5" class="muted">No marked work yet.</td></tr>'}</table>
        <p class="legend">Grades: ${GRADE_BANDS.map(([m, g]) => (m ? `${g} ${m}%+` : `${g} below 50%`)).join(' · ')}. Scores come from marked homework and tests.</p></div>
      ${(() => { const ex = (r.exams ?? []).filter((x: any) => !o.term || !x.term || x.term === o.term); return ex.length ? `<div><h2>Exam results</h2><table><tr><th>Exam</th><th>Subject</th><th>Marks</th><th>%</th><th>Grade</th></tr>
        ${ex.map((x: any) => { const pc = x.absent || x.marks === null || !x.total ? null : Math.round((x.marks / x.total) * 100); const g = gradeFor(pc);
          return `<tr><td><b>${esc(x.title)}</b>${x.remarks ? `<br><span class="muted">${esc(x.remarks)}</span>` : ''}</td><td>${esc(x.subject ?? '')}</td><td>${x.absent ? 'Absent' : `${x.marks} / ${x.total}`}</td><td>${pc === null ? '—' : pc + '%'}</td><td>${g ? `<span class="grade">${g[1]}</span>` : '—'}</td></tr>`; }).join('')}</table></div>` : ''; })()}
      <div class="cols">
        <div><h2>Skills</h2><table><tr><th>Skill</th><th>Rating</th><th>Teacher's note</th></tr>
          ${[...latest.values()].map((e) => `<tr><td><b>${esc(e.skill)}</b>${e.subject ? `<br><span class="muted">${esc(e.subject)}</span>` : ''}</td><td class="stars">${'★'.repeat(e.rating)}${'☆'.repeat(5 - e.rating)}</td><td>${esc(e.remarks)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No skill ratings for this term.</td></tr>'}</table></div>
        <div><h2>Learning at a glance</h2><div class="tiles">
          <div class="tile"><b>${done} / ${work.length}</b>homework handed in</div>
          <div class="tile"><b>${attTotal ? Math.round((present / attTotal) * 100) + '%' : '—'}</b>attendance${attTotal ? ` (${present} of ${attTotal} days)` : ''}</div>
          <div class="tile"><b>${s.pagesRead ?? 0}</b>book pages read</div>
          <div class="tile"><b>${s.stars ?? 0} ★</b>stars · ${s.badges ?? 0} badge(s)</div></div></div>
      </div>
      <div><h2>Teacher's comment</h2><div class="comment">${esc(comment)}</div></div>
      ${o.nextTerm ? `<p><b>Next term begins:</b> ${esc(o.nextTerm)}</p>` : ''}
      <div class="sign"><div>Class teacher</div><div>Principal</div><div>Parent / guardian</div></div>
      ${o.company ? `<div class="legend" style="text-align:center;margin-top:3mm">${companyFooter(o.company)}</div>` : ''}
    </section>`;
  });
  return openDoc(reports.length === 1 ? `Report card — ${reports[0].student.displayName}` : 'Report cards', css, pages.join(''));
}

export const CERTIFICATE_TEMPLATES = [
  { id: 'achievement', title: 'Certificate of Achievement', line: 'for outstanding effort and achievement', icon: '🏆' },
  { id: 'reader', title: 'Star Reader', line: 'for a wonderful love of reading', icon: '📚' },
  { id: 'completion', title: 'Certificate of Completion', line: 'for successfully completing', icon: '🎓' },
  { id: 'attendance', title: 'Perfect Attendance', line: 'for being at school every day', icon: '🌟' },
  { id: 'merit', title: 'Certificate of Merit', line: 'for excellent behaviour and kindness', icon: '🏅' },
];
export interface CertificateOptions { title: string; line: string; detail?: string; icon?: string; date?: string; signer?: string; signer2?: string; school?: string }

/** Landscape A4 certificate, one per name. */
export function printCertificates(names: string[], brand: Branding, o: CertificateOptions) {
  const p = palette(brand.primaryColor);
  const css = `
    .sheet{padding:10mm}
    .frame{height:100%;border:3mm solid ${p[600]};outline:1mm solid ${p[600]};outline-offset:-6mm;border-radius:4mm;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:16mm 24mm;
      background:radial-gradient(circle at 0 0, ${p[100]} 0 26mm, transparent 26.2mm), radial-gradient(circle at 100% 100%, ${p[100]} 0 26mm, transparent 26.2mm), #fff}
    .head{display:flex;align-items:center;gap:3mm;font-weight:700;color:${p[800]};font-size:15px} .logo{height:13mm;max-width:50mm;object-fit:contain} .logo-txt{font-size:26px}
    .icon{font-size:40px;margin:5mm 0 1mm}
    h1{font-family:Georgia,"Times New Roman",serif;font-size:40px;margin:1mm 0;color:${p[800]};letter-spacing:.02em}
    .pre{font-size:15px;color:#475569;margin-top:4mm} .name{font-family:Georgia,"Times New Roman",serif;font-size:42px;font-style:italic;color:#0f172a;border-bottom:1px solid #94a3b8;padding:0 14mm 1mm;margin:3mm 0}
    .line{font-size:17px;color:#334155;max-width:200mm} .detail{font-size:19px;font-weight:700;color:${p[700]};margin-top:1mm}
    .foot{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16mm;width:100%;margin-top:auto;align-items:end;font-size:12px;color:#475569}
    .foot .sig{border-top:1px solid #94a3b8;padding-top:1.5mm} .foot b{display:block;color:#0f172a;font-size:13px}
    .seal{width:24mm;height:24mm;margin:0 auto;border-radius:50%;background:${p[600]};color:#fff;display:grid;place-items:center;font-size:30px;box-shadow:0 0 0 1.5mm #fff,0 0 0 2.2mm ${p[600]}}`;
  const pages = names.map((n) => `<section class="sheet"><div class="frame">
      <div class="head">${brandHead(brand)}<span>${esc(o.school ?? brand.name)}</span></div>
      <div class="icon">${esc(o.icon ?? '🏆')}</div><h1>${esc(o.title)}</h1>
      <div class="pre">This certificate is proudly presented to</div><div class="name">${esc(n)}</div>
      <div class="line">${esc(o.line)}</div>${o.detail ? `<div class="detail">${esc(o.detail)}</div>` : ''}
      <div class="foot"><div class="sig"><b>${esc(o.signer ?? '')}</b>Teacher</div><div class="seal">★</div><div class="sig"><b>${esc(o.signer2 ?? '')}</b>Principal · ${esc(o.date || today())}</div></div>
    </div></section>`);
  return openDoc(o.title, css, pages.join(''), true);
}

const ROMAN = 'ABCDEFGH';
/** Shuffle with a fixed seed so Version B is the same every time it is printed. */
function seeded<T>(a: T[], seed: number): T[] { const b = [...a]; let s = seed; for (let i = b.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

export interface ExamPrint { title: string; term?: string; examDate?: string | null; durationMin: number; instructions: string; total: number; school?: string; className?: string; classSection?: string; subject?: string | null;
  items: { id: string; section: string; type: string; prompt: string; options: string[]; answer: any[]; marks: number; lines: number }[] }

/** A4 question paper (or its answer key). Version B shuffles questions within each section and the MCQ choices. */
export function printExamPaper(e: ExamPrint, brand: Branding, o: { key?: boolean; version?: 'A' | 'B' } = {}) {
  const p = palette(brand.primaryColor); const B = o.version === 'B';
  const sections = [...new Set(e.items.map((i) => i.section))].sort();
  let n = 0;
  const body = sections.map((sec, si) => {
    let items = e.items.filter((i) => i.section === sec);
    if (B) items = seeded(items, 7 + si);
    const marks = items.reduce((s, i) => s + i.marks, 0);
    return `<div class="sec"><h2>Section ${esc(sec)} <span>(${marks} mark${marks === 1 ? '' : 's'})</span></h2>${items.map((it) => {
      n++;
      let opts = it.options.map((t, k) => ({ t, k })); if (B && it.type === 'MCQ') opts = seeded(opts, n * 31);
      const right = it.type === 'MCQ' ? opts.findIndex((x) => x.k === it.answer?.[0]) : -1;
      const ans = it.type === 'MCQ' ? `${ROMAN[right] ?? '?'}) ${esc(opts[right]?.t ?? '')}` : it.type === 'TRUE_FALSE' ? (it.answer?.[0] ? 'True' : 'False') : (it.answer ?? []).map(esc).join(' / ') || '<i>Teacher to mark</i>';
      return `<div class="q"><div class="qh"><b>${n}.</b> <span class="pr">${esc(it.prompt).replace(/_{3,}/g, '<span class="blank"></span>')}</span><span class="mk">[${it.marks}]</span></div>
        ${o.key ? `<div class="ans">✔ ${ans}</div>` : it.type === 'MCQ' ? `<div class="opts">${opts.map((x, k) => `<span>${ROMAN[k]}) ${esc(x.t)}</span>`).join('')}</div>`
          : it.type === 'TRUE_FALSE' ? '<div class="opts"><span>☐ True</span><span>☐ False</span></div>'
          : it.lines ? `<div class="lines">${'<i></i>'.repeat(it.lines)}</div>` : ''}</div>`;
    }).join('')}</div>`;
  }).join('');
  const css = `.sheet{height:auto;min-height:297mm;padding:14mm 16mm;font-size:13px;line-height:1.45}
    .top{display:flex;align-items:center;gap:4mm;border-bottom:2.5px solid ${p[600]};padding-bottom:3mm} .logo{height:14mm;max-width:40mm;object-fit:contain} .logo-txt{font-size:30px}
    .top h1{margin:0;font-size:18px;color:${p[800]}} .top .sub{color:#475569;font-size:12px} .ver{margin-left:auto;text-align:right;font-weight:800;color:${p[700]}}
    .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:1mm 4mm;margin:3mm 0;font-size:12px} .meta b{display:block;font-size:13px}
    .who{display:grid;grid-template-columns:2fr 1fr 1fr;gap:6mm;margin:3mm 0 4mm} .who div{border-bottom:1px solid #64748b;padding-top:5mm;font-size:11px;color:#475569}
    .ins{background:${p[50]};border-radius:2mm;padding:2mm 3mm;margin-bottom:3mm;white-space:pre-wrap}
    .sec h2{font-size:14px;margin:5mm 0 2mm;color:${p[700]};border-bottom:1px solid #e2e8f0;padding-bottom:1mm} .sec h2 span{font-weight:400;color:#475569;font-size:12px}
    .q{margin:0 0 3.5mm;break-inside:avoid} .qh{display:flex;gap:2mm} .pr{flex:1;white-space:pre-wrap} .mk{color:#475569;white-space:nowrap}
    .blank{display:inline-block;width:28mm;border-bottom:1px solid #334155;margin:0 1mm}
    .opts{display:grid;grid-template-columns:1fr 1fr;gap:1mm 6mm;margin:1.5mm 0 0 6mm} .lines{margin:1mm 0 0 6mm} .lines i{display:block;border-bottom:1px solid #cbd5e1;height:7.5mm}
    .ans{margin:1mm 0 0 6mm;color:#047857;font-weight:600} .end{text-align:center;margin-top:6mm;color:#475569;font-size:12px}`;
  const head = `<div class="top">${brandHead(brand)}<div><h1>${esc(e.school ?? brand.name)}</h1><div class="sub">${esc([e.term, e.subject].filter(Boolean).join(' · '))}</div></div>
    <div class="ver">${o.key ? 'ANSWER KEY' : ''}${o.version ? `<br>Version ${o.version}` : ''}</div></div>
    <div class="meta"><div>Paper<b>${esc(e.title)}</b></div><div>Class<b>${esc([e.className, e.classSection].filter(Boolean).join(' — '))}</b></div>
      <div>Time<b>${e.durationMin} minutes</b></div><div>Total marks<b>${e.total}</b></div></div>
    ${o.key ? '' : `<div class="who"><div>Name</div><div>Roll no.</div><div>Date${e.examDate ? `: ${new Date(e.examDate + 'T12:00:00').toLocaleDateString()}` : ''}</div></div>`}
    ${e.instructions && !o.key ? `<div class="ins"><b>Instructions:</b> ${esc(e.instructions)}</div>` : ''}`;
  return openDoc(`${e.title}${o.key ? ' — answer key' : ''}${o.version ? ` (Version ${o.version})` : ''}`, css, `<section class="sheet">${head}${body}<div class="end">— End of paper —</div></section>`);
}

import type { CompanyInfo } from '@/lib/company';
import { formatMoney } from '@/lib/company';

/** Company details block used at the foot of printed documents. */
export const companyFooter = (c: CompanyInfo) => [c.company.legalName || c.name, c.company.address && `${c.company.address}${c.company.city ? `, ${c.company.city}` : ''}`, c.company.phone, c.company.email, c.company.website?.replace(/^https?:\/\//, '')]
  .filter(Boolean).map((x) => esc(x)).join(' · ');

/** A4 quotation (draft order) or tax invoice (confirmed / fulfilled order) in the company currency, with the second currency and tax. */
export function printOrderDocument(o: any, c: CompanyInfo, brand: Branding) {
  const p = palette(brand.primaryColor); const f = c.finance;
  const invoice = ['CONFIRMED', 'FULFILLED'].includes(o.status);
  const money = (m: number) => formatMoney(m, f.currency, f.decimals);
  const lines = o.lines.map((l: any) => ({ ...l, value: (l.unitPriceMinor ?? 0) * l.studentQty }));
  const subtotal = lines.reduce((n: number, l: any) => n + l.value, 0);
  const tax = Math.round(subtotal * (Number(f.vatRate) || 0) / 100); const total = subtotal + tax;
  const second = f.secondaryCurrency && f.rate ? formatMoney(Math.round(total * f.rate), f.secondaryCurrency) : null;
  const date = new Date(o.confirmedAt ?? o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const css = `.sheet{height:auto;min-height:297mm;padding:14mm 16mm;font-size:12.5px;display:flex;flex-direction:column}
    .top{display:flex;justify-content:space-between;gap:6mm;border-bottom:3px solid ${p[600]};padding-bottom:4mm} .logo{height:16mm;max-width:50mm;object-fit:contain} .logo-txt{font-size:32px}
    .co{font-size:11.5px;color:#334155;line-height:1.5} .co b{font-size:15px;color:${p[800]}}
    .doc{text-align:right} .doc h1{margin:0;font-size:22px;letter-spacing:.06em;color:${p[700]};text-transform:uppercase} .doc div{font-size:12px;color:#334155}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin:6mm 0} .parties h3{margin:0 0 1mm;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
    table{width:100%;border-collapse:collapse} th{background:${p[50]};color:${p[800]};text-align:left;font-size:10.5px;text-transform:uppercase;padding:2mm} td{padding:2mm;border-bottom:1px solid #e2e8f0;vertical-align:top}
    .r{text-align:right;white-space:nowrap} .muted{color:#64748b;font-size:11px}
    .tot{margin-left:auto;margin-top:4mm;width:85mm} .tot div{display:flex;justify-content:space-between;padding:1mm 0} .tot .g{border-top:2px solid ${p[600]};font-weight:800;font-size:15px;padding-top:2mm}
    .pay{margin-top:6mm;background:#f8fafc;border-radius:2mm;padding:3mm 4mm;white-space:pre-wrap} .foot{margin-top:auto;padding-top:8mm;text-align:center;font-size:10.5px;color:#64748b}`;
  const body = `<section class="sheet">
    <div class="top"><div class="co">${brandHead(brand)}<br><b>${esc(c.company.legalName || c.name || brand.name)}</b><br>${esc(c.company.address ?? '')}${c.company.city ? `, ${esc(c.company.city)}` : ''}${c.company.country ? `, ${esc(c.company.country)}` : ''}<br>
      ${[c.company.phone, c.company.email].filter(Boolean).map((x) => esc(x)).join(' · ')}${f.taxNumber ? `<br>${esc(f.taxLabel)} TRN: <b style="font-size:12px">${esc(f.taxNumber)}</b>` : ''}${c.company.registrationNo ? `<br>Licence no.: ${esc(c.company.registrationNo)}` : ''}</div>
      <div class="doc"><h1>${invoice ? (f.vatRate ? 'Tax invoice' : 'Invoice') : 'Quotation'}</h1><div>No. <b>${esc(o.orderNo)}</b></div><div>Date: ${date}</div><div>Academic year: ${esc(o.academicYear?.name ?? '')}</div></div></div>
    <div class="parties"><div><h3>${invoice ? 'Bill to' : 'Prepared for'}</h3><b>${esc(o.school.name)}</b>${o.school.code ? `<div class="muted">School code ${esc(o.school.code)}</div>` : ''}${o.school.city ? `<div>${esc(o.school.city)}</div>` : ''}</div>
      <div><h3>Currency</h3>${esc(f.currency)}${f.secondaryCurrency && f.rate ? `<div class="muted">1 ${esc(f.secondaryCurrency)} = ${(1 / f.rate).toFixed(4)} ${esc(f.currency)}</div>` : ''}</div></div>
    <table><tr><th>Item</th><th class="r">Student seats</th><th class="r">Teacher seats</th><th class="r">Unit price</th><th class="r">Amount</th></tr>
      ${lines.map((l: any) => `<tr><td><b>${esc(l.productName)}</b><div class="muted">${esc(l.sku)}${l.books?.length ? ` · ${esc(l.books.join(', '))}` : ''}</div></td><td class="r">${l.studentQty}</td><td class="r">${l.teacherQty} <span class="muted">(free)</span></td>
        <td class="r">${money(l.unitPriceMinor ?? 0)}</td><td class="r">${money(l.value)}</td></tr>`).join('')}</table>
    <div class="tot"><div><span>Subtotal</span><span>${money(subtotal)}</span></div>${f.vatRate ? `<div><span>${esc(f.taxLabel)} ${f.vatRate}%</span><span>${money(tax)}</span></div>` : ''}
      <div class="g"><span>Total</span><span>${money(total)}</span></div>${second ? `<div class="muted"><span>Approx. in ${esc(f.secondaryCurrency!)}</span><span>${second}</span></div>` : ''}</div>
    ${f.paymentDetails ? `<div class="pay"><b>Payment details</b>\n${esc(f.paymentDetails)}</div>` : ''}
    ${!invoice ? '<p class="muted">This quotation is valid for 30 days. Licences are issued when the order is confirmed and paid.</p>' : ''}
    <div class="foot">${companyFooter(c)}</div></section>`;
  return openDoc(`${invoice ? 'Invoice' : 'Quotation'} ${o.orderNo}`, css, body);
}
