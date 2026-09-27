import * as SQLite from "expo-sqlite";
import { migrate } from "./migrations";

let ready: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens the library database once, runs pending migrations, and shares the connection. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!ready) {
    ready = (async () => {
      const db = await SQLite.openDatabaseAsync("dera-library.db");
      await db.execAsync("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
      await migrate(db);
      return db;
    })();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>("SELECT value FROM app_meta WHERE key=?", key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)", key, value);
}

export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
