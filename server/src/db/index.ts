import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const DB_DIR = path.join(os.homedir(), '.sporeling');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'sporeling.db');
export const db = new Database(DB_PATH);

// Enable WAL mode and foreign keys for high-performance concurrent local operation
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_state (
      id TEXT PRIMARY KEY DEFAULT 'primary_familiar',
      name TEXT NOT NULL DEFAULT 'Sporeling',
      level INTEGER NOT NULL DEFAULT 1,
      exp INTEGER NOT NULL DEFAULT 0,
      hunger REAL NOT NULL DEFAULT 85.0,
      hydration REAL NOT NULL DEFAULT 85.0,
      vitality REAL NOT NULL DEFAULT 95.0,
      affinity TEXT NOT NULL DEFAULT 'arboreal',
      total_steps INTEGER NOT NULL DEFAULT 0,
      last_tick_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ingestions (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      affinity TEXT NOT NULL,
      nutrition_granted REAL NOT NULL,
      hydration_granted REAL NOT NULL,
      is_authentic INTEGER NOT NULL,
      dialogue_log TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS walk_sessions (
      id TEXT PRIMARY KEY,
      duration_seconds INTEGER NOT NULL,
      distance_meters REAL NOT NULL,
      step_count INTEGER NOT NULL,
      vitality_restored REAL NOT NULL,
      completed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,            -- fungi | plant | tree | moss | lichen | water | rock | animal | other | invalid
      common_name TEXT,
      scientific_name TEXT,
      confidence REAL,
      tags TEXT NOT NULL DEFAULT '[]',   -- JSON array of descriptive tags
      is_authentic INTEGER NOT NULL,
      is_duplicate INTEGER NOT NULL DEFAULT 0,
      dhash TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      gps_accuracy REAL,
      altitude REAL,
      heading REAL,
      taken_at INTEGER NOT NULL,         -- device capture timestamp
      received_at INTEGER NOT NULL,      -- server receipt timestamp
      camera_label TEXT,
      facing_mode TEXT,
      zoom REAL,
      width INTEGER,
      height INTEGER,
      exif TEXT,                         -- JSON of any embedded EXIF
      weather TEXT,                      -- JSON snapshot (temp/humidity) at capture
      dialogue TEXT,
      image_path TEXT NOT NULL,
      thumb_path TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_captures_category ON captures(category, is_authentic, is_duplicate);

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      unlocked_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // Idempotent column migrations
  const cols = new Set((db.prepare('PRAGMA table_info(captures)').all() as { name: string }[]).map((c) => c.name));
  const addCol = (name: string, def: string) => { if (!cols.has(name)) db.exec(`ALTER TABLE captures ADD COLUMN ${name} ${def}`); };
  addCol('is_night', 'INTEGER NOT NULL DEFAULT 0');
  addCol('stars_visible', 'INTEGER NOT NULL DEFAULT 0');
  addCol('sky_report', 'TEXT');
  addCol('audio_path', 'TEXT');

  // Ensure default pet state row exists
  const existing = db.prepare('SELECT id FROM pet_state WHERE id = ?').get('primary_familiar');
  if (!existing) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO pet_state (id, name, level, exp, hunger, hydration, vitality, affinity, total_steps, last_tick_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('primary_familiar', 'Sporeling', 1, 0, 85.0, 85.0, 95.0, 'arboreal', 0, now, now);
  }
}
