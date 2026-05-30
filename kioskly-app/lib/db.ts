import * as SQLite from "expo-sqlite";

let _db: SQLite.SQLiteDatabase | null = null;
let _initPromise: Promise<void> | null = null;

async function initialize(): Promise<void> {
  _db = await SQLite.openDatabaseAsync("kioscify.db");
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sync_queue (
      client_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'POST',
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      server_id TEXT,
      retries INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      error_message TEXT
    );
  `);
}

export function initDb(): void {
  if (!_initPromise) {
    _initPromise = initialize().catch((e) => {
      console.error("[db] Failed to initialize SQLite:", e);
      _initPromise = null;
    });
  }
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_initPromise) initDb();
  await _initPromise;
  if (!_db) throw new Error("Database failed to initialize");
  return _db;
}
