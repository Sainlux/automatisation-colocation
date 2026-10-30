import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { hashPin } from './auth.js';

// Élèves de départ (carnet de bord). Seul Samuel est administrateur.
export const SEED_STUDENTS = [
  { name: 'Samuel', level: '6eme', avatar: '🦊', isAdmin: true },
  { name: 'Élie', level: '6eme', avatar: '🐼' },
  { name: 'Zoé', level: '6eme', avatar: '🦄' },
  { name: 'Nathan', level: '6eme', avatar: '🐯' },
  { name: 'Paul', level: '6eme', avatar: '🐸' },
  { name: 'Terry', level: '5eme', avatar: '🦁' },
  { name: 'Isaë', level: '5eme', avatar: '🐬' },
  { name: 'Noémi', level: '4eme', avatar: '🦋' },
  { name: 'Noha', level: '3eme', avatar: '🦉' },
  { name: 'Eliesia', level: '3eme', avatar: '🌸' },
  { name: 'Sarah', level: '3eme', avatar: '🐨' }
];

export const DEFAULT_PIN = '0000';

export function openDb(dataDir = process.env.DATA_DIR || 'data') {
  if (dataDir !== ':memory:') mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dataDir === ':memory:' ? ':memory:' : join(dataDir, 'prep-college.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      level TEXT NOT NULL CHECK (level IN ('6eme','5eme','4eme','3eme')),
      avatar TEXT NOT NULL DEFAULT '🙂',
      pin_hash TEXT NOT NULL,
      must_change_pin INTEGER NOT NULL DEFAULT 1,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session (
      token TEXT PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    -- Une ligne = une question (entraînement) ou une série (sprint, flashcards).
    CREATE TABLE IF NOT EXISTS attempt (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
      level TEXT NOT NULL,
      subject TEXT NOT NULL,
      module TEXT NOT NULL,
      skill TEXT,
      correct INTEGER NOT NULL,
      total INTEGER NOT NULL,
      hints INTEGER NOT NULL DEFAULT 0,
      duration_s INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attempt_student ON attempt(student_id, created_at);
  `);

  const count = db.prepare('SELECT COUNT(*) AS n FROM student').get().n;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO student (name, level, avatar, pin_hash, is_admin) VALUES (?, ?, ?, ?, ?)');
    for (const s of SEED_STUDENTS) {
      const pin = s.isAdmin && process.env.ADMIN_PIN ? process.env.ADMIN_PIN : DEFAULT_PIN;
      insert.run(s.name, s.level, s.avatar, hashPin(pin), s.isAdmin ? 1 : 0);
    }
  }
  return db;
}

const PUBLIC_COLS = 'id, name, level, avatar, is_admin AS isAdmin, must_change_pin AS mustChangePin';

export function createRepo(db) {
  const q = {
    listStudents: db.prepare(`SELECT ${PUBLIC_COLS} FROM student ORDER BY name COLLATE NOCASE`),
    getStudent: db.prepare(`SELECT ${PUBLIC_COLS} FROM student WHERE id = ?`),
    getPinHash: db.prepare('SELECT pin_hash AS pinHash FROM student WHERE id = ?'),
    createStudent: db.prepare('INSERT INTO student (name, level, avatar, pin_hash) VALUES (?, ?, ?, ?)'),
    updateStudent: db.prepare('UPDATE student SET name = ?, level = ?, avatar = ? WHERE id = ?'),
    setAvatar: db.prepare('UPDATE student SET avatar = ? WHERE id = ?'),
    setPin: db.prepare('UPDATE student SET pin_hash = ?, must_change_pin = ? WHERE id = ?'),
    deleteStudent: db.prepare('DELETE FROM student WHERE id = ? AND is_admin = 0'),
    createSession: db.prepare('INSERT INTO session (token, student_id, expires_at) VALUES (?, ?, ?)'),
    getSession: db.prepare('SELECT student_id AS studentId FROM session WHERE token = ? AND expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM session WHERE token = ?'),
    deleteSessionsOf: db.prepare('DELETE FROM session WHERE student_id = ?'),
    purgeSessions: db.prepare('DELETE FROM session WHERE expires_at <= ?'),
    addAttempt: db.prepare(`INSERT INTO attempt (student_id, level, subject, module, skill, correct, total, hints, duration_s)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    history: db.prepare(`SELECT id, level, subject, module, skill, correct, total, hints, duration_s AS durationS, created_at AS createdAt
                         FROM attempt WHERE student_id = ? ORDER BY id DESC LIMIT ?`),
    allAttempts: db.prepare(`SELECT level, subject, module, skill, correct, total, hints, created_at AS createdAt
                             FROM attempt WHERE student_id = ? ORDER BY id`),
    clearHistory: db.prepare('DELETE FROM attempt WHERE student_id = ?'),
    overview: db.prepare(`SELECT s.id, s.name, s.level, s.avatar, s.is_admin AS isAdmin,
                                 COALESCE(SUM(a.correct), 0) AS correct, COALESCE(SUM(a.total), 0) AS total,
                                 MAX(a.created_at) AS lastActivity
                          FROM student s LEFT JOIN attempt a ON a.student_id = s.id
                          GROUP BY s.id ORDER BY s.name COLLATE NOCASE`)
  };

  const toBool = (s) => s && { ...s, isAdmin: !!s.isAdmin, mustChangePin: !!s.mustChangePin };

  return {
    listStudents: () => q.listStudents.all().map(toBool),
    getStudent: (id) => toBool(q.getStudent.get(id)),
    getPinHash: (id) => q.getPinHash.get(id)?.pinHash,
    createStudent: ({ name, level, avatar }) =>
      Number(q.createStudent.run(name, level, avatar, hashPin(DEFAULT_PIN)).lastInsertRowid),
    updateStudent: (id, { name, level, avatar }) => q.updateStudent.run(name, level, avatar, id).changes > 0,
    setAvatar: (id, avatar) => q.setAvatar.run(avatar, id),
    setPin: (id, pin, mustChange = false) => q.setPin.run(hashPin(pin), mustChange ? 1 : 0, id),
    deleteStudent: (id) => q.deleteStudent.run(id).changes > 0,
    createSession: (token, studentId, ttlMs) => q.createSession.run(token, studentId, Date.now() + ttlMs),
    getSessionStudent: (token) => q.getSession.get(token, Date.now())?.studentId,
    deleteSession: (token) => q.deleteSession.run(token),
    deleteSessionsOf: (id) => q.deleteSessionsOf.run(id),
    purgeSessions: () => q.purgeSessions.run(Date.now()),
    addAttempt: (studentId, a) =>
      q.addAttempt.run(studentId, a.level, a.subject, a.module, a.skill, a.correct, a.total, a.hints, a.durationS),
    history: (studentId, limit = 200) => q.history.all(studentId, limit),
    allAttempts: (studentId) => q.allAttempts.all(studentId),
    clearHistory: (studentId) => q.clearHistory.run(studentId),
    overview: () => q.overview.all().map((r) => ({ ...r, isAdmin: !!r.isAdmin }))
  };
}
