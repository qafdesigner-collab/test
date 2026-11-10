const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { all, get, run, tx, hash, DATA_DIR } = require('./db');
const { login, logout, requireRole, publicUser, allowedBookIds, canSeeBook } = require('./auth');
const ai = require('./ai');

const api = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = ['.pdf', '.ppt', '.pptx', '.pps', '.ppsx', '.doc', '.docx', '.xls', '.xlsx', '.html', '.htm',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp3', '.wav', '.mp4', '.webm', '.txt', '.zip'];
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_MB, 10) || 200) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase())),
});

// small helpers
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const need = (v, msg) => { if (v === undefined || v === null || String(v).trim() === '') fail(400, msg); return String(v).trim(); };
const int = (v) => (v === '' || v === null || v === undefined ? null : parseInt(v, 10));
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
function update(table, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => fields[k]), id);
}

// ================= Auth / common =================
api.post('/login', login);
api.post('/logout', logout);
api.get('/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null, ai: ai.provider() }));
api.post('/me/password', requireRole(), (req, res) => {
  const bcrypt = require('bcryptjs');
  const { current, next } = req.body;
  if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) fail(400, 'Current password is wrong');
  if (String(next || '').length < 4) fail(400, 'New password must be at least 4 characters');
  run('UPDATE users SET password_hash=? WHERE id=?', hash(next), req.user.id);
  res.json({ ok: true });
});
api.post('/me/avatar', requireRole(), (req, res) => {
  run('UPDATE users SET avatar=? WHERE id=?', String(req.body.avatar || '🦁').slice(0, 8), req.user.id);
  res.json({ ok: true });
});

function bookWithParts(book, user) {
  book.components = all('SELECT * FROM components WHERE book_id=? ORDER BY sort, id', book.id);
  const aud = user.role === 'student' ? `AND audience='all'` : '';
  book.materials = all(`SELECT id,book_id,component_id,title,original_name,mime,size,audience,created_at FROM materials WHERE book_id=? ${aud} ORDER BY id DESC`, book.id);
  return book;
}
api.get('/books', requireRole(), (req, res) => {
  const ids = allowedBookIds(req.user);
  if (!ids.length) return res.json([]);
  const books = all(`SELECT * FROM books WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY title`, ...ids);
  res.json(books.map((b) => bookWithParts(b, req.user)));
});
api.get('/books/:id', requireRole(), (req, res) => {
  if (!canSeeBook(req.user, req.params.id)) fail(403, 'This book is not available for you');
  const b = get('SELECT * FROM books WHERE id=?', req.params.id) || fail(404, 'Book not found');
  res.json(bookWithParts(b, req.user));
});
api.get('/materials/:id/file', requireRole(), (req, res) => {
  const m = get('SELECT * FROM materials WHERE id=?', req.params.id) || fail(404, 'Not found');
  if (!canSeeBook(req.user, m.book_id)) fail(403, 'Not allowed');
  if (req.user.role === 'student' && m.audience !== 'all') fail(403, 'Teachers only');
  const file = path.join(UPLOAD_DIR, path.basename(m.filename));
  if (!fs.existsSync(file)) fail(404, 'File missing');
  // Uploaded files (esp. HTML) run in a sandboxed, opaque origin so they can't touch the LMS session.
  res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-popups allow-forms allow-modals allow-downloads');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const name = (m.original_name || 'file').replace(/[^\w.\- ]/g, '_');
  if (req.query.download) res.attachment(name);
  else res.setHeader('Content-Disposition', `inline; filename="${name}"`);
  res.sendFile(file);
});

// ================= Publisher admin =================
const admin = express.Router();
admin.use(requireRole('admin'));

admin.get('/stats', (_req, res) => res.json({
  books: get('SELECT COUNT(*) n FROM books').n,
  schools: get('SELECT COUNT(*) n FROM schools').n,
  teachers: get(`SELECT COUNT(*) n FROM users WHERE role='teacher'`).n,
  students: get(`SELECT COUNT(*) n FROM users WHERE role='student'`).n,
  seats: get('SELECT IFNULL(SUM(seats),0) n FROM licenses').n,
  materials: get('SELECT COUNT(*) n FROM materials').n,
}));

const BOOK_FIELDS = ['title', 'subject', 'level', 'description', 'color', 'emoji', 'vocabulary'];
admin.post('/books', (req, res) => {
  need(req.body.title, 'Title is required');
  const f = pick(req.body, BOOK_FIELDS);
  const id = tx(() => {
    const id = run(`INSERT INTO books(${Object.keys(f).join(',')}) VALUES(${Object.keys(f).map(() => '?').join(',')})`, ...Object.values(f)).lastInsertRowid;
    if (req.body.default_structure) {
      ['Part 1', 'Part 2', 'Part 3'].forEach((t, i) => run(`INSERT INTO components(book_id,kind,title,sort) VALUES(?,'part',?,?)`, id, t, i + 1));
      run(`INSERT INTO components(book_id,kind,title,sort) VALUES(?,'homework','Homework Book',4)`, id);
    }
    return id;
  });
  res.json(get('SELECT * FROM books WHERE id=?', id));
});
admin.put('/books/:id', (req, res) => { update('books', req.params.id, pick(req.body, BOOK_FIELDS)); res.json({ ok: true }); });
admin.delete('/books/:id', (req, res) => {
  for (const m of all('SELECT filename FROM materials WHERE book_id=?', req.params.id)) fs.rm(path.join(UPLOAD_DIR, m.filename), () => {});
  run('DELETE FROM books WHERE id=?', req.params.id);
  res.json({ ok: true });
});

const COMP_FIELDS = ['kind', 'resource_type', 'title', 'topics', 'sort'];
admin.post('/books/:id/components', (req, res) => {
  need(req.body.title, 'Title is required');
  if (!['part', 'homework', 'resource'].includes(req.body.kind)) fail(400, 'Invalid kind');
  const sort = req.body.sort ?? (get('SELECT IFNULL(MAX(sort),0)+1 s FROM components WHERE book_id=?', req.params.id).s);
  const r = run('INSERT INTO components(book_id,kind,resource_type,title,topics,sort) VALUES(?,?,?,?,?,?)',
    req.params.id, req.body.kind, req.body.resource_type || '', req.body.title, req.body.topics || '', sort);
  res.json({ id: r.lastInsertRowid });
});
admin.put('/components/:id', (req, res) => { update('components', req.params.id, pick(req.body, COMP_FIELDS)); res.json({ ok: true }); });
admin.delete('/components/:id', (req, res) => { run('DELETE FROM components WHERE id=?', req.params.id); res.json({ ok: true }); });

admin.post('/materials', upload.array('files', 20), (req, res) => {
  if (!req.files?.length) fail(400, 'Choose at least one supported file (PDF, PPT, Word, HTML, image, audio, video)');
  const book = get('SELECT id FROM books WHERE id=?', int(req.body.book_id));
  if (!book) { req.files.forEach((f) => fs.rm(f.path, () => {})); fail(400, 'Book not found'); }
  const audience = req.body.audience === 'teacher' ? 'teacher' : 'all';
  const ids = req.files.map((f) => run(`INSERT INTO materials(book_id,component_id,title,filename,original_name,mime,size,audience,uploaded_by)
    VALUES(?,?,?,?,?,?,?,?,?)`, book.id, int(req.body.component_id), (req.files.length === 1 && req.body.title) || f.originalname.replace(/\.[^.]+$/, ''),
  f.filename, f.originalname, f.mimetype, f.size, audience, req.user.id).lastInsertRowid);
  res.json({ ids });
});
admin.put('/materials/:id', (req, res) => {
  const f = pick(req.body, ['title', 'audience', 'component_id']);
  if (f.audience && !['all', 'teacher'].includes(f.audience)) fail(400, 'Bad audience');
  if ('component_id' in f) f.component_id = int(f.component_id);
  update('materials', req.params.id, f);
  res.json({ ok: true });
});
admin.delete('/materials/:id', (req, res) => {
  const m = get('SELECT * FROM materials WHERE id=?', req.params.id);
  if (m) { fs.rm(path.join(UPLOAD_DIR, path.basename(m.filename)), () => {}); run('DELETE FROM materials WHERE id=?', m.id); }
  res.json({ ok: true });
});

function seatUsage(schoolId) {
  return all(`SELECT l.book_id, l.seats, b.title, b.emoji, b.color,
    (SELECT COUNT(*) FROM users u JOIN class_books cb ON cb.class_id=u.class_id
      WHERE u.role='student' AND u.active=1 AND u.school_id=l.school_id AND cb.book_id=l.book_id) AS used
    FROM licenses l JOIN books b ON b.id=l.book_id WHERE l.school_id=? ORDER BY b.title`, schoolId);
}
function assertSeats(schoolId) {
  for (const l of seatUsage(schoolId))
    if (l.used > l.seats) fail(400, `Not enough licences for "${l.title}": ${l.used} students need it but only ${l.seats} seats were purchased.`);
}

admin.get('/schools', (_req, res) => {
  const schools = all(`SELECT s.*, u.name AS sales_name FROM schools s LEFT JOIN users u ON u.id=s.created_by
    ORDER BY s.is_demo, s.name`);
  for (const s of schools) {
    s.licenses = seatUsage(s.id);
    s.teachers = get(`SELECT COUNT(*) n FROM users WHERE school_id=? AND role='teacher'`, s.id).n;
    s.students = get(`SELECT COUNT(*) n FROM users WHERE school_id=? AND role='student'`, s.id).n;
    s.admins = all(`SELECT id,username,name FROM users WHERE school_id=? AND role='school'`, s.id);
  }
  res.json(schools);
});
admin.post('/schools', (req, res) => {
  const name = need(req.body.name, 'School name is required');
  const code = need(req.body.code, 'School code is required').toUpperCase();
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) fail(400, 'School code: 3–20 letters/numbers');
  if (get('SELECT id FROM schools WHERE code=?', code)) fail(400, 'That school code is already used');
  const username = need(req.body.username, 'School login username is required');
  const password = need(req.body.password, 'School login password is required');
  const id = tx(() => {
    const id = run('INSERT INTO schools(name,code,city,contact) VALUES(?,?,?,?)', name, code, req.body.city || '', req.body.contact || '').lastInsertRowid;
    run(`INSERT INTO users(school_id,role,username,password_hash,name,avatar) VALUES(?,'school',?,?,?,'🏫')`, id, username, hash(password), `${name} Admin`);
    return id;
  });
  res.json({ id });
});
admin.put('/schools/:id', (req, res) => {
  const f = pick(req.body, ['name', 'city', 'contact', 'active', 'notes', 'lead_status', 'expires_at']);
  if ('active' in f) f.active = f.active ? 1 : 0;
  if (req.body.convert) { f.is_demo = 0; f.expires_at = null; f.lead_status = 'converted'; }
  update('schools', req.params.id, f);
  if (req.body.username || req.body.password) {
    const a = get(`SELECT id FROM users WHERE school_id=? AND role='school' ORDER BY id LIMIT 1`, req.params.id);
    if (a) update('users', a.id, { ...(req.body.username ? { username: req.body.username } : {}), ...(req.body.password ? { password_hash: hash(req.body.password) } : {}) });
  }
  res.json({ ok: true });
});
admin.delete('/schools/:id', (req, res) => { run('DELETE FROM schools WHERE id=?', req.params.id); res.json({ ok: true }); });
admin.put('/schools/:id/licenses', (req, res) => {
  const bookId = int(req.body.book_id); const seats = Math.max(0, int(req.body.seats) || 0);
  if (!get('SELECT id FROM books WHERE id=?', bookId)) fail(400, 'Book not found');
  tx(() => {
    if (seats === 0 && !req.body.keep) run('DELETE FROM licenses WHERE school_id=? AND book_id=?', req.params.id, bookId);
    else run('INSERT INTO licenses(school_id,book_id,seats) VALUES(?,?,?) ON CONFLICT(school_id,book_id) DO UPDATE SET seats=excluded.seats', req.params.id, bookId, seats);
    assertSeats(req.params.id);
  });
  res.json({ ok: true });
});

// sales team management (by publisher admin)
admin.get('/sales', (_req, res) => res.json(all(`SELECT u.id,u.username,u.name,u.avatar,u.active,
  (SELECT COUNT(*) FROM schools s WHERE s.created_by=u.id) AS demos,
  (SELECT COUNT(*) FROM schools s WHERE s.created_by=u.id AND s.is_demo=0) AS converted
  FROM users u WHERE role='sales' ORDER BY name`)));
admin.post('/sales', (req, res) => {
  const name = need(req.body.name, 'Name is required'); const username = need(req.body.username, 'Username is required');
  const password = need(req.body.password, 'Password is required');
  if (get('SELECT id FROM users WHERE school_id IS NULL AND username=?', username)) fail(400, 'Username already taken');
  const r = run(`INSERT INTO users(role,username,password_hash,name,avatar) VALUES('sales',?,?,?,'💼')`, username, hash(password), name);
  res.json({ id: r.lastInsertRowid });
});
admin.put('/sales/:id', (req, res) => {
  get(`SELECT id FROM users WHERE id=? AND role='sales'`, req.params.id) || fail(404, 'Not found');
  const f = pick(req.body, ['name']);
  if ('active' in req.body) f.active = req.body.active ? 1 : 0;
  if (req.body.password) f.password_hash = hash(req.body.password);
  update('users', req.params.id, f); res.json({ ok: true });
});
admin.delete('/sales/:id', (req, res) => { run(`DELETE FROM users WHERE id=? AND role='sales'`, req.params.id); res.json({ ok: true }); });
api.use('/admin', admin);

// ================= Sales team: instant demo schools =================
const sales = express.Router();
sales.use(requireRole('sales', 'admin'));
const DEMO_FIELDS = `s.id,s.name,s.code,s.city,s.contact,s.notes,s.lead_status,s.is_demo,s.expires_at,s.active,s.created_at,u.name AS sales_name`;
sales.get('/demos', (req, res) => {
  const mine = req.user.role === 'sales' ? 'WHERE s.created_by=?' : 'WHERE s.created_by IS NOT NULL';
  const rows = all(`SELECT ${DEMO_FIELDS} FROM schools s LEFT JOIN users u ON u.id=s.created_by ${mine} ORDER BY s.id DESC`,
    ...(req.user.role === 'sales' ? [req.user.id] : []));
  for (const r of rows) r.books = all('SELECT b.title,b.emoji FROM licenses l JOIN books b ON b.id=l.book_id WHERE l.school_id=?', r.id);
  res.json(rows);
});
sales.post('/demos', (req, res) => {
  const name = need(req.body.name, 'School name is required');
  const days = Math.max(1, Math.min(30, int(req.body.days) || 7));
  let bookIds = (Array.isArray(req.body.book_ids) ? req.body.book_ids : []).map(Number).filter((id) => get('SELECT id FROM books WHERE id=?', id));
  if (!bookIds.length) fail(400, 'Choose at least one book to demo');
  const pw = () => String(crypto.randomInt(100000, 1000000));
  const creds = tx(() => {
    let code;
    do { code = 'DEMO' + crypto.randomInt(1000, 10000); } while (get('SELECT id FROM schools WHERE code=?', code));
    const expires = new Date(Date.now() + days * 864e5).toISOString();
    const sid = run(`INSERT INTO schools(name,code,city,contact,notes,is_demo,expires_at,created_by,lead_status) VALUES(?,?,?,?,?,1,?,?,'demo')`,
      name, code, req.body.city || '', req.body.contact || '', req.body.notes || '', expires, req.user.id).lastInsertRowid;
    const out = { code, expires_at: expires, logins: [] };
    const add = (role, username, display, avatar, classId = null) => {
      const password = pw();
      const id = run('INSERT INTO users(school_id,role,username,password_hash,name,avatar,class_id) VALUES(?,?,?,?,?,?,?)',
        sid, role, username, hash(password), display, avatar, classId).lastInsertRowid;
      out.logins.push({ role, username, password, name: display });
      return id;
    };
    for (const b of bookIds) run('INSERT INTO licenses(school_id,book_id,seats) VALUES(?,?,5)', sid, b);
    add('school', 'principal', 'Principal (demo)', '🏫');
    const t = add('teacher', 'teacher', 'Demo Teacher', '🌻');
    const cls = run('INSERT INTO classes(school_id,name,teacher_id) VALUES(?,?,?)', sid, 'Demo Class', t).lastInsertRowid;
    for (const b of bookIds) run('INSERT INTO class_books VALUES(?,?)', cls, b);
    add('student', 'student1', 'Demo Student 1', '🐯', cls);
    add('student', 'student2', 'Demo Student 2', '🦄', cls);
    return out;
  });
  res.json(creds);
});
const myDemo = (req, id) => get(`SELECT * FROM schools WHERE id=? AND created_by IS NOT NULL ${req.user.role === 'sales' ? 'AND created_by=' + Number(req.user.id) : ''}`, id) || fail(404, 'Demo not found');
sales.put('/demos/:id', (req, res) => {
  const d = myDemo(req, req.params.id);
  const f = pick(req.body, ['notes', 'contact', 'city']);
  if (req.body.lead_status && ['demo', 'interested', 'negotiating', 'lost'].includes(req.body.lead_status)) f.lead_status = req.body.lead_status;
  if (req.body.extend_days && d.is_demo) {
    const base = Math.max(Date.now(), Date.parse(d.expires_at) || 0);
    f.expires_at = new Date(base + Math.min(30, int(req.body.extend_days)) * 864e5).toISOString();
  }
  update('schools', d.id, f); res.json({ ok: true, expires_at: f.expires_at });
});
sales.post('/demos/:id/reset', (req, res) => {
  const d = myDemo(req, req.params.id);
  if (!d.is_demo) fail(400, 'This school is already a customer');
  const logins = all('SELECT id,role,username,name FROM users WHERE school_id=? ORDER BY id', d.id).map((u) => {
    const password = String(crypto.randomInt(100000, 1000000));
    run('UPDATE users SET password_hash=? WHERE id=?', hash(password), u.id);
    return { role: u.role, username: u.username, name: u.name, password };
  });
  res.json({ code: d.code, expires_at: d.expires_at, logins });
});
sales.delete('/demos/:id', (req, res) => {
  const d = myDemo(req, req.params.id);
  if (!d.is_demo) fail(400, 'Converted schools can only be removed by the admin');
  run('DELETE FROM schools WHERE id=?', d.id); res.json({ ok: true });
});
api.use('/sales', sales);

// ================= School admin =================
const school = express.Router();
school.use(requireRole('school'));
const ownClass = (req, id) => get('SELECT * FROM classes WHERE id=? AND school_id=?', id, req.user.school_id);
const ownUser = (req, id, role) => get('SELECT * FROM users WHERE id=? AND school_id=? AND role=?', id, req.user.school_id, role);
function uniqueUsername(schoolId, username) {
  if (get('SELECT id FROM users WHERE IFNULL(school_id,0)=? AND username=?', schoolId, username)) fail(400, `Username "${username}" is already taken`);
}

school.get('/overview', (req, res) => {
  const sid = req.user.school_id;
  res.json({
    school: get('SELECT * FROM schools WHERE id=?', sid),
    licenses: seatUsage(sid),
    teachers: get(`SELECT COUNT(*) n FROM users WHERE school_id=? AND role='teacher'`, sid).n,
    students: get(`SELECT COUNT(*) n FROM users WHERE school_id=? AND role='student'`, sid).n,
    classes: get('SELECT COUNT(*) n FROM classes WHERE school_id=?', sid).n,
  });
});

school.get('/teachers', (req, res) => res.json(all(`SELECT u.id,u.username,u.name,u.avatar,u.active,
  (SELECT GROUP_CONCAT(name, ', ') FROM classes WHERE teacher_id=u.id) AS classes
  FROM users u WHERE school_id=? AND role='teacher' ORDER BY name`, req.user.school_id)));
school.post('/teachers', (req, res) => {
  const name = need(req.body.name, 'Name is required'); const username = need(req.body.username, 'Username is required');
  const password = need(req.body.password, 'Password is required');
  uniqueUsername(req.user.school_id, username);
  const r = run(`INSERT INTO users(school_id,role,username,password_hash,name,avatar) VALUES(?,'teacher',?,?,?,?)`,
    req.user.school_id, username, hash(password), name, req.body.avatar || '🌻');
  res.json({ id: r.lastInsertRowid });
});
school.put('/teachers/:id', (req, res) => {
  ownUser(req, req.params.id, 'teacher') || fail(404, 'Teacher not found');
  const f = pick(req.body, ['name', 'avatar']);
  if ('active' in req.body) f.active = req.body.active ? 1 : 0;
  if (req.body.password) f.password_hash = hash(req.body.password);
  update('users', req.params.id, f);
  res.json({ ok: true });
});
school.delete('/teachers/:id', (req, res) => {
  ownUser(req, req.params.id, 'teacher') || fail(404, 'Teacher not found');
  run('DELETE FROM users WHERE id=?', req.params.id); res.json({ ok: true });
});

school.get('/classes', (req, res) => {
  const classes = all(`SELECT c.*, u.name AS teacher_name,
    (SELECT COUNT(*) FROM users s WHERE s.class_id=c.id AND s.role='student') AS students
    FROM classes c LEFT JOIN users u ON u.id=c.teacher_id WHERE c.school_id=? ORDER BY c.name`, req.user.school_id);
  for (const c of classes) c.book_ids = all('SELECT book_id FROM class_books WHERE class_id=?', c.id).map((r) => r.book_id);
  res.json(classes);
});
function saveClass(req, id) {
  const licensed = all('SELECT book_id FROM licenses WHERE school_id=?', req.user.school_id).map((r) => r.book_id);
  const teacherId = int(req.body.teacher_id);
  if (teacherId && !ownUser(req, teacherId, 'teacher')) fail(400, 'Teacher not found');
  return tx(() => {
    if (id) update('classes', id, { name: need(req.body.name, 'Class name is required'), teacher_id: teacherId });
    else id = run('INSERT INTO classes(school_id,name,teacher_id) VALUES(?,?,?)', req.user.school_id, need(req.body.name, 'Class name is required'), teacherId).lastInsertRowid;
    if (Array.isArray(req.body.book_ids)) {
      run('DELETE FROM class_books WHERE class_id=?', id);
      for (const b of req.body.book_ids.map(Number)) {
        if (!licensed.includes(b)) fail(400, 'Your school has no licence for one of the selected books');
        run('INSERT INTO class_books VALUES(?,?)', id, b);
      }
    }
    assertSeats(req.user.school_id);
    return id;
  });
}
school.post('/classes', (req, res) => res.json({ id: saveClass(req, null) }));
school.put('/classes/:id', (req, res) => { ownClass(req, req.params.id) || fail(404, 'Class not found'); saveClass(req, Number(req.params.id)); res.json({ ok: true }); });
school.delete('/classes/:id', (req, res) => {
  ownClass(req, req.params.id) || fail(404, 'Class not found');
  run('DELETE FROM classes WHERE id=?', req.params.id); res.json({ ok: true });
});

school.get('/students', (req, res) => res.json(all(`SELECT u.id,u.username,u.name,u.avatar,u.stars,u.active,u.class_id,c.name AS class_name
  FROM users u LEFT JOIN classes c ON c.id=u.class_id WHERE u.school_id=? AND u.role='student' ORDER BY c.name, u.name`, req.user.school_id)));
school.post('/students', (req, res) => {
  const name = need(req.body.name, 'Name is required'); const username = need(req.body.username, 'Username is required');
  const password = need(req.body.password, 'Password is required'); const classId = int(req.body.class_id);
  if (classId && !ownClass(req, classId)) fail(400, 'Class not found');
  uniqueUsername(req.user.school_id, username);
  const id = tx(() => {
    const id = run(`INSERT INTO users(school_id,role,username,password_hash,name,avatar,class_id) VALUES(?,'student',?,?,?,?,?)`,
      req.user.school_id, username, hash(password), name, req.body.avatar || '🐯', classId).lastInsertRowid;
    assertSeats(req.user.school_id); return id;
  });
  res.json({ id });
});
// Bulk-create students: one name per line, auto usernames + simple passwords.
school.post('/students/bulk', (req, res) => {
  const classId = int(req.body.class_id);
  const cls = ownClass(req, classId) || fail(400, 'Choose a class');
  const names = String(req.body.names || '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (!names.length) fail(400, 'Enter at least one name');
  if (names.length > 500) fail(400, 'Max 500 at a time');
  const prefix = (String(req.body.prefix || cls.name).toLowerCase().replace(/[^a-z0-9]/g, '') || 'kid').slice(0, 10);
  const animals = ['🐯', '🦁', '🐼', '🦊', '🐸', '🐵', '🦄', '🐰', '🐨', '🐶', '🐱', '🐧'];
  const created = tx(() => {
    const out = [];
    let n = 1;
    for (const name of names) {
      let username;
      do { username = `${prefix}${n++}`; } while (get('SELECT id FROM users WHERE school_id=? AND username=?', req.user.school_id, username));
      const password = String(crypto.randomInt(1000, 10000));
      run(`INSERT INTO users(school_id,role,username,password_hash,name,avatar,class_id) VALUES(?,'student',?,?,?,?,?)`,
        req.user.school_id, username, hash(password), name, animals[out.length % animals.length], classId);
      out.push({ name, username, password });
    }
    assertSeats(req.user.school_id);
    return out;
  });
  res.json({ created });
});
school.put('/students/:id', (req, res) => {
  ownUser(req, req.params.id, 'student') || fail(404, 'Student not found');
  const f = pick(req.body, ['name', 'avatar']);
  if ('class_id' in req.body) { f.class_id = int(req.body.class_id); if (f.class_id && !ownClass(req, f.class_id)) fail(400, 'Class not found'); }
  if ('active' in req.body) f.active = req.body.active ? 1 : 0;
  if (req.body.password) f.password_hash = hash(req.body.password);
  tx(() => { update('users', req.params.id, f); assertSeats(req.user.school_id); });
  res.json({ ok: true });
});
school.delete('/students/:id', (req, res) => {
  ownUser(req, req.params.id, 'student') || fail(404, 'Student not found');
  run('DELETE FROM users WHERE id=?', req.params.id); res.json({ ok: true });
});
api.use('/school', school);

// ================= Teacher =================
const teacher = express.Router();
teacher.use(requireRole('teacher'));
const myClass = (req, id) => get('SELECT * FROM classes WHERE id=? AND teacher_id=? AND school_id=?', id, req.user.id, req.user.school_id);
const myStudent = (req, id) => get(`SELECT u.* FROM users u JOIN classes c ON c.id=u.class_id
  WHERE u.id=? AND u.role='student' AND c.teacher_id=?`, id, req.user.id);

teacher.get('/classes', (req, res) => {
  const classes = all('SELECT * FROM classes WHERE teacher_id=? AND school_id=? ORDER BY name', req.user.id, req.user.school_id);
  for (const c of classes) {
    c.books = all(`SELECT b.id,b.title,b.emoji,b.color FROM class_books cb JOIN books b ON b.id=cb.book_id
      JOIN licenses l ON l.book_id=b.id AND l.school_id=? WHERE cb.class_id=?`, req.user.school_id, c.id);
    c.students = all(`SELECT id,name,username,avatar,stars FROM users WHERE class_id=? AND role='student' AND active=1 ORDER BY name`, c.id);
  }
  res.json(classes);
});

// lesson plans
teacher.get('/plans', (req, res) => res.json(all(`SELECT p.*, b.title AS book_title, c.title AS component_title, cl.name AS class_name
  FROM lesson_plans p LEFT JOIN books b ON b.id=p.book_id LEFT JOIN components c ON c.id=p.component_id
  LEFT JOIN classes cl ON cl.id=p.class_id WHERE p.teacher_id=? ORDER BY p.plan_date DESC, p.id DESC`, req.user.id)));
function planFields(req) {
  const f = pick(req.body, ['title', 'plan_date', 'content']);
  for (const k of ['book_id', 'component_id', 'class_id']) if (k in req.body) f[k] = int(req.body[k]);
  if (f.book_id && !canSeeBook(req.user, f.book_id)) fail(403, 'Book not available');
  if (f.class_id && !myClass(req, f.class_id)) fail(400, 'Class not found');
  if ('ai' in req.body) f.ai = req.body.ai ? 1 : 0;
  return f;
}
teacher.post('/plans', (req, res) => {
  need(req.body.title, 'Title is required');
  const f = planFields(req); f.teacher_id = req.user.id;
  const r = run(`INSERT INTO lesson_plans(${Object.keys(f).join(',')}) VALUES(${Object.keys(f).map(() => '?').join(',')})`, ...Object.values(f));
  res.json({ id: r.lastInsertRowid });
});
teacher.put('/plans/:id', (req, res) => {
  get('SELECT id FROM lesson_plans WHERE id=? AND teacher_id=?', req.params.id, req.user.id) || fail(404, 'Plan not found');
  update('lesson_plans', req.params.id, planFields(req)); res.json({ ok: true });
});
teacher.delete('/plans/:id', (req, res) => { run('DELETE FROM lesson_plans WHERE id=? AND teacher_id=?', req.params.id, req.user.id); res.json({ ok: true }); });

// AI
function aiContext(req) {
  const bookId = int(req.body.book_id);
  if (!bookId || !canSeeBook(req.user, bookId)) fail(400, 'Choose one of your books');
  const book = get('SELECT * FROM books WHERE id=?', bookId);
  const component = int(req.body.component_id) ? get('SELECT * FROM components WHERE id=? AND book_id=?', int(req.body.component_id), bookId) : null;
  return { book, component, topic: String(req.body.topic || '').slice(0, 300), extra: String(req.body.extra || '').slice(0, 1000),
    duration: int(req.body.duration) || 40, count: int(req.body.count) || 5 };
}
teacher.post('/ai/lesson-plan', wrap(async (req, res) => res.json(await ai.lessonPlan(aiContext(req)))));
teacher.post('/ai/questions', wrap(async (req, res) => res.json(await ai.questions(aiContext(req)))));

// assignments
teacher.get('/assignments', (req, res) => res.json(all(`SELECT a.id,a.title,a.instructions,a.due_date,a.created_at,a.class_id,a.book_id,
  c.name AS class_name, b.title AS book_title, json_array_length(a.questions) AS question_count,
  (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id) AS submitted,
  (SELECT COUNT(*) FROM users u WHERE u.class_id=a.class_id AND u.role='student') AS total
  FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN books b ON b.id=a.book_id
  WHERE a.teacher_id=? ORDER BY a.id DESC`, req.user.id)));
teacher.post('/assignments', (req, res) => {
  const title = need(req.body.title, 'Title is required');
  const classId = int(req.body.class_id); myClass(req, classId) || fail(400, 'Choose your class');
  const bookId = int(req.body.book_id); if (bookId && !canSeeBook(req.user, bookId)) fail(403, 'Book not available');
  const questions = ai.normalizeQuestions(req.body.questions || []);
  const r = run('INSERT INTO assignments(teacher_id,class_id,book_id,title,instructions,questions,due_date) VALUES(?,?,?,?,?,?,?)',
    req.user.id, classId, bookId, title, req.body.instructions || '', JSON.stringify(questions), req.body.due_date || '');
  res.json({ id: r.lastInsertRowid });
});
teacher.get('/assignments/:id', (req, res) => {
  const a = get('SELECT * FROM assignments WHERE id=? AND teacher_id=?', req.params.id, req.user.id) || fail(404, 'Not found');
  a.questions = JSON.parse(a.questions);
  a.submissions = all(`SELECT u.id AS student_id, u.name, u.avatar, s.id, s.answers, s.score, s.max_score, s.feedback, s.submitted_at
    FROM users u LEFT JOIN submissions s ON s.student_id=u.id AND s.assignment_id=?
    WHERE u.class_id=? AND u.role='student' ORDER BY u.name`, a.id, a.class_id)
    .map((s) => ({ ...s, answers: s.answers ? JSON.parse(s.answers) : null }));
  res.json(a);
});
teacher.delete('/assignments/:id', (req, res) => { run('DELETE FROM assignments WHERE id=? AND teacher_id=?', req.params.id, req.user.id); res.json({ ok: true }); });
teacher.put('/submissions/:id', (req, res) => {
  const s = get(`SELECT s.* FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=? AND a.teacher_id=?`, req.params.id, req.user.id) || fail(404, 'Not found');
  const score = Math.max(0, Math.min(s.max_score, int(req.body.score) ?? s.score));
  tx(() => {
    run('UPDATE submissions SET score=?, feedback=? WHERE id=?', score, String(req.body.feedback || ''), s.id);
    run('UPDATE users SET stars=MAX(0, stars + ?) WHERE id=?', score - s.score, s.student_id);
  });
  res.json({ ok: true });
});

// evaluations
teacher.get('/students/:id/report', (req, res) => {
  const st = myStudent(req, req.params.id) || fail(404, 'Student not found');
  res.json(studentReport(st));
});
teacher.post('/evaluations', (req, res) => {
  const st = myStudent(req, int(req.body.student_id)) || fail(400, 'Student not found');
  const rating = int(req.body.rating); if (!(rating >= 1 && rating <= 5)) fail(400, 'Rating must be 1–5');
  const bookId = int(req.body.book_id); if (bookId && !canSeeBook(req.user, bookId)) fail(403, 'Book not available');
  run('INSERT INTO evaluations(teacher_id,student_id,book_id,term,skill,rating,remarks) VALUES(?,?,?,?,?,?,?)',
    req.user.id, st.id, bookId, req.body.term || '', need(req.body.skill, 'Skill is required'), rating, req.body.remarks || '');
  res.json({ ok: true });
});
teacher.delete('/evaluations/:id', (req, res) => { run('DELETE FROM evaluations WHERE id=? AND teacher_id=?', req.params.id, req.user.id); res.json({ ok: true }); });
teacher.post('/students/:id/stars', (req, res) => {
  myStudent(req, req.params.id) || fail(404, 'Student not found');
  run('UPDATE users SET stars=MAX(0, stars+?) WHERE id=?', Math.max(-10, Math.min(10, int(req.body.delta) || 1)), req.params.id);
  res.json({ ok: true });
});
api.use('/teacher', teacher);

function studentReport(st) {
  return {
    student: { id: st.id, name: st.name, avatar: st.avatar, stars: st.stars, username: st.username },
    evaluations: all(`SELECT e.*, b.title AS book_title FROM evaluations e LEFT JOIN books b ON b.id=e.book_id
      WHERE e.student_id=? ORDER BY e.id DESC`, st.id),
    submissions: all(`SELECT s.score, s.max_score, s.feedback, s.submitted_at, a.title FROM submissions s
      JOIN assignments a ON a.id=s.assignment_id WHERE s.student_id=? ORDER BY s.id DESC`, st.id),
    games: all(`SELECT game, COUNT(*) AS plays, MAX(score) AS best FROM game_scores WHERE student_id=? GROUP BY game`, st.id),
  };
}

// ================= Student =================
const student = express.Router();
student.use(requireRole('student'));
student.get('/assignments', (req, res) => res.json(all(`SELECT a.id,a.title,a.instructions,a.due_date,a.created_at,
  b.title AS book_title, b.emoji, b.color, json_array_length(a.questions) AS question_count,
  s.score, s.max_score, s.feedback, s.submitted_at
  FROM assignments a LEFT JOIN books b ON b.id=a.book_id
  LEFT JOIN submissions s ON s.assignment_id=a.id AND s.student_id=?
  WHERE a.class_id=? ORDER BY a.id DESC`, req.user.id, req.user.class_id || -1)));
student.get('/assignments/:id', (req, res) => {
  const a = get('SELECT * FROM assignments WHERE id=? AND class_id=?', req.params.id, req.user.class_id || -1) || fail(404, 'Not found');
  const sub = get('SELECT * FROM submissions WHERE assignment_id=? AND student_id=?', a.id, req.user.id);
  const qs = JSON.parse(a.questions);
  a.questions = qs.map((q) => ({ q: q.q, type: q.type, options: q.options, ...(sub ? { answer: q.answer } : {}) }));
  a.submission = sub ? { ...sub, answers: JSON.parse(sub.answers) } : null;
  res.json(a);
});
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
student.post('/assignments/:id/submit', (req, res) => {
  const a = get('SELECT * FROM assignments WHERE id=? AND class_id=?', req.params.id, req.user.class_id || -1) || fail(404, 'Not found');
  if (get('SELECT id FROM submissions WHERE assignment_id=? AND student_id=?', a.id, req.user.id)) fail(400, 'Already submitted');
  const qs = JSON.parse(a.questions);
  const answers = (Array.isArray(req.body.answers) ? req.body.answers : []).slice(0, qs.length).map((x) => String(x ?? '').slice(0, 1000));
  let score = 0;
  qs.forEach((q, i) => { if (q.answer && norm(answers[i]) === norm(q.answer)) score++; });
  tx(() => {
    run('INSERT INTO submissions(assignment_id,student_id,answers,score,max_score) VALUES(?,?,?,?,?)', a.id, req.user.id, JSON.stringify(answers), score, qs.length);
    run('UPDATE users SET stars=stars+? WHERE id=?', score, req.user.id);
  });
  res.json({ score, max: qs.length, correct: qs.map((q) => q.answer) });
});
student.post('/games', (req, res) => {
  const game = String(req.body.game || '').slice(0, 40); const score = Math.max(0, Math.min(100, int(req.body.score) || 0));
  const today = get(`SELECT COUNT(*) n FROM game_scores WHERE student_id=? AND date(created_at)=date('now')`, req.user.id).n;
  const stars = today < 20 ? Math.min(3, Math.ceil(score / 4)) : 0; // cap rewards per day
  tx(() => {
    run('INSERT INTO game_scores(student_id,game,score) VALUES(?,?,?)', req.user.id, game, score);
    run('UPDATE users SET stars=stars+? WHERE id=?', stars, req.user.id);
  });
  res.json({ stars, total: get('SELECT stars FROM users WHERE id=?', req.user.id).stars });
});
student.get('/report', (req, res) => res.json(studentReport(get('SELECT * FROM users WHERE id=?', req.user.id))));
student.get('/leaderboard', (req, res) => res.json(all(`SELECT name, avatar, stars FROM users
  WHERE class_id=? AND role='student' AND active=1 ORDER BY stars DESC, name LIMIT 10`, req.user.class_id || -1)));
api.use('/student', student);

// errors
api.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
api.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (/UNIQUE constraint/.test(err.message)) return res.status(400).json({ error: 'That name/username is already used' });
  console.error(err);
  res.status(500).json({ error: err.message?.startsWith('AI') || err.message?.startsWith('Gemini') ? err.message : 'Something went wrong' });
});

module.exports = api;
