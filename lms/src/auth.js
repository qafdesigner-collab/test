const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { get, run, all } = require('./db');

const COOKIE = 'lms_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 7;

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function publicUser(u) {
  if (!u) return null;
  const school = u.school_id ? get('SELECT id,name,code FROM schools WHERE id=?', u.school_id) : null;
  return { id: u.id, role: u.role, username: u.username, name: u.name, avatar: u.avatar,
    stars: u.stars, class_id: u.class_id, school };
}

function login(req, res) {
  const { code = '', username = '', password = '' } = req.body || {};
  let user;
  if (!String(code).trim()) {
    user = get(`SELECT * FROM users WHERE school_id IS NULL AND role='admin' AND username=?`, username.trim());
  } else {
    const school = get('SELECT * FROM schools WHERE code=?', code.trim());
    if (!school || !school.active) return res.status(401).json({ error: 'School code not found or inactive' });
    user = get('SELECT * FROM users WHERE school_id=? AND username=?', school.id, username.trim());
  }
  if (!user || !user.active || !bcrypt.compareSync(String(password), user.password_hash))
    return res.status(401).json({ error: 'Wrong username or password' });
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)', token, user.id, Date.now() + TTL_MS);
  run('DELETE FROM sessions WHERE expires < ?', Date.now());
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure}`);
  res.json({ user: publicUser(user) });
}

function logout(req, res) {
  const t = parseCookies(req)[COOKIE];
  if (t) run('DELETE FROM sessions WHERE token=?', t);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  res.json({ ok: true });
}

function attachUser(req, _res, next) {
  const t = parseCookies(req)[COOKIE];
  if (t) {
    const s = get('SELECT * FROM sessions WHERE token=? AND expires>?', t, Date.now());
    if (s) {
      const u = get('SELECT * FROM users WHERE id=? AND active=1', s.user_id);
      if (u && (!u.school_id || get('SELECT active FROM schools WHERE id=?', u.school_id)?.active)) req.user = u;
    }
  }
  next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please log in' });
  if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed' });
  next();
};

// Which book IDs can this user see?
function allowedBookIds(user) {
  if (user.role === 'admin') return all('SELECT id FROM books').map((r) => r.id);
  if (user.role === 'school') return all('SELECT book_id AS id FROM licenses WHERE school_id=?', user.school_id).map((r) => r.id);
  if (user.role === 'teacher')
    return all(`SELECT DISTINCT cb.book_id AS id FROM class_books cb JOIN classes c ON c.id=cb.class_id
      JOIN licenses l ON l.book_id=cb.book_id AND l.school_id=c.school_id
      WHERE c.teacher_id=?`, user.id).map((r) => r.id);
  if (user.role === 'student')
    return all(`SELECT cb.book_id AS id FROM class_books cb JOIN classes c ON c.id=cb.class_id
      JOIN licenses l ON l.book_id=cb.book_id AND l.school_id=c.school_id
      WHERE cb.class_id=?`, user.class_id || -1).map((r) => r.id);
  return [];
}
const canSeeBook = (user, bookId) => allowedBookIds(user).includes(Number(bookId));

module.exports = { login, logout, attachUser, requireRole, publicUser, allowedBookIds, canSeeBook };
