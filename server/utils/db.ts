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
        duration_seconds INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        category TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS skill_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        skill_id INTEGER NOT NULL,
        session_id INTEGER NOT NULL,
        score REAL NOT NULL,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (skill_id) REFERENCES skills(id),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
    `)
  }

  return db
}
