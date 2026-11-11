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
export function printReportCards(reports: any[], brand: Branding, o: ReportOptions) {
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
