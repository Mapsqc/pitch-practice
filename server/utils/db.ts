import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'

let db: Database.Database | null = null

export function useDb(): Database.Database {
  if (!db) {
    const dbPath = join(process.cwd(), 'data', 'pitch-practice.db')

    mkdirSync(join(process.cwd(), 'data'), { recursive: true })

    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        client_type TEXT NOT NULL,
        transcript TEXT DEFAULT '[]',
        feedback TEXT DEFAULT '',
        feedback_json TEXT,
        score_global INTEGER,
        duration_seconds INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS session_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        competence TEXT NOT NULL,
        score INTEGER,
        commentaire TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
    `)

    // Migration: add columns if they don't exist (for existing DBs)
    try { db.exec('ALTER TABLE sessions ADD COLUMN feedback_json TEXT') } catch {}
    try { db.exec('ALTER TABLE sessions ADD COLUMN score_global INTEGER') } catch {}
  }

  return db
}
