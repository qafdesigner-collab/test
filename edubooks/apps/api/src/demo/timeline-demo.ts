import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { sql } from 'drizzle-orm';
import { StorageDriver } from '../storage/storage.driver';

/**
 * Sample news for demo schools: posts, events and drawn pictures (SVG illustrations — no real children, no real photos).
 */
const W = 1200, H = 800;
const frame = (bg: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">${bg}</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>${body}</svg>`;
const stops = (a: string, b: string) => `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>`;
const kid = (x: number, y: number, shirt: string, s = 1, arms = 'up') => {
  const a = arms === 'up' ? `<path d="M-38 -40 L-70 -95 M38 -40 L70 -95" stroke="#f2c09b" stroke-width="16" stroke-linecap="round"/>`
    : `<path d="M-38 -40 L-62 10 M38 -40 L62 10" stroke="#f2c09b" stroke-width="16" stroke-linecap="round"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">${a}<rect x="-40" y="-60" width="80" height="95" rx="30" fill="${shirt}"/><rect x="-30" y="30" width="22" height="70" rx="10" fill="#334155"/><rect x="8" y="30" width="22" height="70" rx="10" fill="#334155"/>
    <circle cx="0" cy="-100" r="42" fill="#f2c09b"/><path d="M-42 -110 Q0 -165 42 -110 Q20 -135 -42 -110Z" fill="#3b2a20"/><circle cx="-14" cy="-102" r="5" fill="#1e293b"/><circle cx="14" cy="-102" r="5" fill="#1e293b"/><path d="M-14 -82 Q0 -70 14 -82" stroke="#be123c" stroke-width="5" fill="none" stroke-linecap="round"/></g>`;
};
const sun = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="70" fill="#fde047"/><circle cx="${x}" cy="${y}" r="95" fill="#fde047" opacity=".25"/>`;
const cloud = (x: number, y: number) => `<g fill="#fff" opacity=".9"><ellipse cx="${x}" cy="${y}" rx="80" ry="38"/><ellipse cx="${x + 60}" cy="${y - 20}" rx="60" ry="40"/><ellipse cx="${x - 60}" cy="${y + 5}" rx="50" ry="30"/></g>`;
const label = (t: string, color = '#1e293b') => `<text x="${W / 2}" y="${H - 40}" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" font-weight="900" fill="${color}">${t}</text>`;

export const DEMO_PICTURES: Record<string, string> = {
  'sports-day': frame(stops('#7dd3fc', '#e0f2fe'), `${sun(1030, 130)}${cloud(260, 140)}${cloud(700, 90)}
    <rect y="470" width="${W}" height="330" fill="#4ade80"/>${[520, 600, 680].map((y) => `<rect y="${y}" width="${W}" height="6" fill="#fff" opacity=".9"/>`).join('')}
    <rect x="980" y="400" width="14" height="300" fill="#fff"/><rect x="994" y="400" width="120" height="70" fill="#ef4444"/><text x="1054" y="448" text-anchor="middle" font-family="Arial" font-size="38" font-weight="900" fill="#fff">FINISH</text>
    ${kid(300, 600, '#f97316', 1.1)}${kid(520, 640, '#3b82f6', 1.1)}${kid(740, 610, '#a855f7', 1.1)}<circle cx="160" cy="680" r="38" fill="#fff" stroke="#111" stroke-width="5"/>${label('Sports Day 🏅')}`),
  'science-fair': frame(stops('#ede9fe', '#fdf4ff'), `<rect y="560" width="${W}" height="240" fill="#c4b5fd"/>
    <rect x="140" y="420" width="920" height="40" rx="10" fill="#7c3aed"/><rect x="170" y="460" width="20" height="160" fill="#6d28d9"/><rect x="1010" y="460" width="20" height="160" fill="#6d28d9"/>
    <path d="M300 420 L330 300 L370 300 L400 420Z" fill="#22d3ee" opacity=".8"/><rect x="320" y="250" width="60" height="55" fill="#e2e8f0"/>${[0, 1, 2].map((i) => `<circle cx="${340 + i * 15}" cy="${220 - i * 40}" r="${16 - i * 3}" fill="#67e8f9" opacity=".8"/>`).join('')}
    <circle cx="600" cy="330" r="85" fill="#fbbf24"/><ellipse cx="600" cy="330" rx="150" ry="30" fill="none" stroke="#f97316" stroke-width="10"/>
    <rect x="800" y="300" width="160" height="120" rx="14" fill="#10b981"/><circle cx="880" cy="360" r="34" fill="#fff"/><path d="M880 340 L880 380 M860 360 L900 360" stroke="#10b981" stroke-width="10"/>
    ${kid(220, 690, '#ec4899', .8, 'down')}${kid(980, 690, '#0ea5e9', .8, 'up')}${label('Science Fair 🔬')}`),
  'art-class': frame(stops('#fef3c7', '#fff7ed'), `<rect x="120" y="120" width="420" height="320" rx="16" fill="#fff" stroke="#92400e" stroke-width="14"/>
    <circle cx="260" cy="250" r="60" fill="#f43f5e"/><path d="M160 410 Q330 250 520 410Z" fill="#22c55e"/><circle cx="440" cy="200" r="40" fill="#facc15"/>
    <rect x="640" y="160" width="420" height="300" rx="16" fill="#fff" stroke="#92400e" stroke-width="14"/><path d="M700 400 L800 240 L880 340 L940 280 L1020 400Z" fill="#60a5fa"/><circle cx="960" cy="230" r="34" fill="#fb923c"/>
    ${['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'].map((c, i) => `<circle cx="${300 + i * 140}" cy="560" r="46" fill="${c}"/>`).join('')}
    <rect x="200" y="620" width="800" height="18" rx="9" fill="#b45309"/>${label('Our Art Gallery 🎨', '#92400e')}`),
  'reading-week': frame(stops('#dbeafe', '#eff6ff'), `${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${140 + i * 135}" y="${180 + (i % 2) * 20}" width="110" height="${260 - (i % 3) * 30}" rx="8" fill="${['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'][i]}"/>`).join('')}
    <rect x="110" y="440" width="980" height="24" rx="6" fill="#92400e"/><path d="M380 600 Q600 520 820 600 L820 690 Q600 610 380 690Z" fill="#fff" stroke="#1d4ed8" stroke-width="8"/><path d="M600 560 L600 650" stroke="#1d4ed8" stroke-width="6"/>
    ${label('Reading Week 📚', '#1d4ed8')}`),
  garden: frame(stops('#bae6fd', '#f0f9ff'), `${sun(160, 140)}${cloud(900, 120)}<rect y="540" width="${W}" height="260" fill="#92400e"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => { const x = 170 + i * 175; return `<path d="M${x} 540 C${x} 470 ${x} 430 ${x} 380" stroke="#16a34a" stroke-width="12" fill="none"/><ellipse cx="${x - 35}" cy="${440 - i * 4}" rx="38" ry="18" fill="#22c55e" transform="rotate(-30 ${x - 35} 440)"/><ellipse cx="${x + 35}" cy="${420 - i * 4}" rx="38" ry="18" fill="#22c55e" transform="rotate(30 ${x + 35} 420)"/><rect x="${x - 55}" y="540" width="110" height="90" rx="10" fill="#ea580c"/>`; }).join('')}
    <path d="M1040 300 q30 -40 60 0 q-30 40 -60 0Z" fill="#60a5fa"/>${label('We planted seeds 🌱', '#14532d')}`),
  'national-day': frame(stops('#fefce8', '#fff'), `<g transform="translate(330 140)"><rect width="140" height="420" fill="#dc2626"/><rect x="140" width="400" height="140" fill="#16a34a"/><rect x="140" y="140" width="400" height="140" fill="#fff" stroke="#e5e7eb"/><rect x="140" y="280" width="400" height="140" fill="#111"/></g>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<circle cx="${100 + i * 145}" cy="${650 + (i % 2) * 30}" r="${20 + (i % 3) * 8}" fill="${['#dc2626', '#16a34a', '#111', '#fbbf24'][i % 4]}"/>`).join('')}${label('National Day celebration 🇦🇪', '#166534')}`),
};

export interface DemoPost { by: 'principal' | 'teacher'; forClass: boolean; kind: 'POST' | 'EVENT'; title: string; body: string; pics: string[]; eventInDays?: number; place?: string; pinned?: boolean; hoursAgo: number }
export const DEMO_POSTS: DemoPost[] = [
  { by: 'principal', forClass: false, kind: 'EVENT', title: 'Sports Day', body: 'Races, games and medals for everyone! Students come in their sports uniform. Parents are warmly welcome to cheer. 🏃‍♀️🏅', pics: ['sports-day'], eventInDays: 6, place: 'School playground, 8:30 am', pinned: true, hoursAgo: 2 },
  { by: 'teacher', forClass: true, kind: 'POST', title: '', body: 'Today our class planted bean seeds in the school garden 🌱 Every child watered their own pot. Ask your child at home: what does a seed need to grow?', pics: ['garden'], hoursAgo: 5 },
  { by: 'teacher', forClass: true, kind: 'POST', title: 'Our Art Gallery', body: 'Look at the beautiful paintings from this week’s art lesson! We learned about warm and cool colours. 🎨', pics: ['art-class'], hoursAgo: 26 },
  { by: 'principal', forClass: false, kind: 'EVENT', title: 'Science Fair', body: 'Each class will show a small experiment. Parents can visit between 10 and 12.', pics: ['science-fair'], eventInDays: 14, place: 'Main hall', hoursAgo: 30 },
  { by: 'principal', forClass: false, kind: 'POST', title: 'Reading Week starts on Monday 📚', body: 'Every day this week: 15 minutes of reading at home. Children who read every day get a special badge in the app!', pics: ['reading-week'], hoursAgo: 50 },
  { by: 'principal', forClass: false, kind: 'POST', title: 'Happy National Day! 🇦🇪', body: 'Thank you to all our families for the wonderful celebration — the songs, the flags and the smiles. We are proud of our students!', pics: ['national-day'], hoursAgo: 120 },
];

/** Stores the pictures under the school's timeline folder (once per school). */
async function storePictures(driver: StorageDriver, publisherId: string, schoolId: string) {
  const keys: Record<string, string> = {};
  for (const [name, svg] of Object.entries(DEMO_PICTURES)) {
    const key = `${publisherId}/timeline/${schoolId}/demo-${name}.svg`;
    const tmp = path.join(os.tmpdir(), `demo-pic-${randomBytes(6).toString('hex')}.svg`); fs.writeFileSync(tmp, svg);
    try { await driver.putFile(key, tmp, 'image/svg+xml'); } finally { fs.rmSync(tmp, { force: true }); }
    keys[name] = key;
  }
  return keys;
}

type Exec = (q: ReturnType<typeof sql>) => Promise<{ rows: any[] }>;
/**
 * Adds the sample posts to a demo school. `direct` = the demo-data loader (owner connection);
 * otherwise through add_demo_post(), which allows it only for the sales person's own demo school.
 */
export async function seedDemoPosts(exec: Exec, driver: StorageDriver, d: { publisherId: string; schoolId: string; principal: string; teacher: string; classId: string | null; direct?: boolean }) {
  const pics = await storePictures(driver, d.publisherId, d.schoolId); let n = 0;
  for (const p of DEMO_POSTS) {
    const author = p.by === 'principal' ? d.principal : d.teacher; const cls = p.forClass ? d.classId : null;
    const eventAt = p.eventInDays ? new Date(Date.now() + p.eventInDays * 864e5).toISOString() : null;
    const images = JSON.stringify(p.pics.map((x) => pics[x]));
    const age = `${p.hoursAgo} hours`;
    if (d.direct) await exec(sql`INSERT INTO timeline_posts (publisher_id, school_id, author_id, class_id, kind, title, body, event_at, place, images, pinned, created_at, updated_at)
      VALUES (${d.publisherId}, ${d.schoolId}, ${author}, ${cls}, ${p.kind}, ${p.title}, ${p.body}, ${eventAt}, ${p.place ?? ''}, ${images}::jsonb, ${!!p.pinned}, now() - ${age}::interval, now() - ${age}::interval)`);
    else await exec(sql`SELECT add_demo_post(${d.schoolId}, ${author}, ${cls}, ${p.kind}, ${p.title}, ${p.body}, ${eventAt}::timestamptz, ${p.place ?? ''}, ${images}::jsonb, ${!!p.pinned}, ${age}::interval)`);
    n++;
  }
  return n;
}
