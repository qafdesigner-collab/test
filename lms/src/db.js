// Database layer — uses Node's built-in SQLite (node:sqlite), no native deps.
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'lms.sqlite'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  city TEXT DEFAULT '', contact TEXT DEFAULT '', active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('admin','school','teacher','student')),
  username TEXT NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL, name TEXT NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  avatar TEXT DEFAULT '🦁', stars INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users ON users(IFNULL(school_id,0), username);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, subject TEXT DEFAULT '', level TEXT DEFAULT '',
  description TEXT DEFAULT '', color TEXT DEFAULT '#ff6b6b', emoji TEXT DEFAULT '📘',
  vocabulary TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS components (
  id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('part','homework','resource')),
  resource_type TEXT DEFAULT '', title TEXT NOT NULL, topics TEXT DEFAULT '', sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  component_id INTEGER REFERENCES components(id) ON DELETE SET NULL,
  title TEXT NOT NULL, filename TEXT NOT NULL, original_name TEXT, mime TEXT, size INTEGER,
  audience TEXT DEFAULT 'all' CHECK(audience IN ('all','teacher')),
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE, seats INTEGER NOT NULL DEFAULT 0,
  UNIQUE(school_id, book_id));
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL, teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS class_books (
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE, PRIMARY KEY(class_id, book_id));
CREATE TABLE IF NOT EXISTS lesson_plans (
  id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id INTEGER REFERENCES books(id) ON DELETE SET NULL, component_id INTEGER REFERENCES components(id) ON DELETE SET NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  title TEXT NOT NULL, plan_date TEXT DEFAULT '', content TEXT DEFAULT '', ai INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
  title TEXT NOT NULL, instructions TEXT DEFAULT '', questions TEXT DEFAULT '[]',
  due_date TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers TEXT DEFAULT '[]', score INTEGER DEFAULT 0, max_score INTEGER DEFAULT 0,
  feedback TEXT DEFAULT '', submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(assignment_id, student_id));
CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
  term TEXT DEFAULT '', skill TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  remarks TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS game_scores (
  id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL, score INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const hash = (pw) => bcrypt.hashSync(String(pw), 10);
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function seed() {
  if (get('SELECT COUNT(*) AS n FROM users').n > 0) return;
  tx(() => {
    run(`INSERT INTO users(role,username,password_hash,name,avatar) VALUES('admin','admin',?,'Publisher Admin','👑')`, hash(process.env.ADMIN_PASSWORD || 'admin123'));
    const book = run(`INSERT INTO books(title,subject,level,description,color,emoji,vocabulary) VALUES(?,?,?,?,?,?,?)`,
      'KG English', 'English', 'KG', 'Fun phonics, alphabet and first words for kindergarten.', '#ff6b6b', '🔤',
      'apple, ball, cat, dog, egg, fish, goat, hat, ice, jug, kite, lion, moon, nest, orange, pen, queen, rat, sun, tree, umbrella, van, watch, box, yak, zebra').lastInsertRowid;
    const comps = [
      ['part', '', 'Part 1', 'Letters A–I, phonic sounds, tracing', 1],
      ['part', '', 'Part 2', 'Letters J–R, first words, colours', 2],
      ['part', '', 'Part 3', 'Letters S–Z, simple sentences, rhymes', 3],
      ['homework', '', 'Homework Book', 'Tracing, colouring and matching worksheets', 4],
      ['resource', 'flashcard', 'Alphabet Flash Cards', 'A–Z picture cards', 5],
      ['resource', 'teacher_card', 'Teacher Cards', 'Activity prompts for every lesson', 6],
      ['resource', 'dangler', 'Classroom Danglers', 'Hanging alphabet danglers', 7],
    ];
    for (const c of comps) run('INSERT INTO components(book_id,kind,resource_type,title,topics,sort) VALUES(?,?,?,?,?,?)', book, ...c);
    const math = run(`INSERT INTO books(title,subject,level,description,color,emoji,vocabulary) VALUES(?,?,?,?,?,?,?)`,
      'KG Maths', 'Maths', 'KG', 'Numbers 1–50, shapes, patterns and counting fun.', '#4dabf7', '🔢',
      'one, two, three, four, five, circle, square, triangle, big, small').lastInsertRowid;
    for (const [i, t] of ['Part 1', 'Part 2', 'Part 3'].entries())
      run('INSERT INTO components(book_id,kind,title,topics,sort) VALUES(?,?,?,?,?)', math, 'part', t, ['Numbers 1–10, shapes', 'Numbers 11–30, patterns', 'Numbers 31–50, big & small'][i], i + 1);
    run('INSERT INTO components(book_id,kind,title,topics,sort) VALUES(?,?,?,?,?)', math, 'homework', 'Homework Book', 'Counting & writing practice', 4);

    const school = run(`INSERT INTO schools(name,code,city,contact) VALUES('Sunshine Public School','DEMO01','Lahore','0300-0000000')`).lastInsertRowid;
    run('INSERT INTO licenses(school_id,book_id,seats) VALUES(?,?,30)', school, book);
    run('INSERT INTO licenses(school_id,book_id,seats) VALUES(?,?,30)', school, math);
    run(`INSERT INTO users(school_id,role,username,password_hash,name,avatar) VALUES(?,'school','principal',?,'Principal','🏫')`, school, hash('school123'));
    const teacher = run(`INSERT INTO users(school_id,role,username,password_hash,name,avatar) VALUES(?,'teacher','teacher1',?,'Ms. Ayesha','🌻')`, school, hash('teacher123')).lastInsertRowid;
    const cls = run('INSERT INTO classes(school_id,name,teacher_id) VALUES(?,?,?)', school, 'KG - Rose', teacher).lastInsertRowid;
    run('INSERT INTO class_books VALUES(?,?)', cls, book);
    run('INSERT INTO class_books VALUES(?,?)', cls, math);
    const kids = [['student1', 'Ali', '🐯'], ['student2', 'Sara', '🦄'], ['student3', 'Zain', '🐼']];
    for (const [u, n, a] of kids)
      run(`INSERT INTO users(school_id,role,username,password_hash,name,avatar,class_id) VALUES(?,'student',?,?,?,?,?)`, school, u, hash('1234'), n, a, cls);
  });
  console.log('Seeded demo data (see README for logins).');
}

module.exports = { db, all, get, run, tx, hash, seed, DATA_DIR };
