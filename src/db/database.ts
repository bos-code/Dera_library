import * as SQLite from "expo-sqlite";
let db:SQLite.SQLiteDatabase|null=null;
export async function database(){if(!db)db=await SQLite.openDatabaseAsync("dera-library.db");return db}
export async function initDatabase(){const d=await database();await d.execAsync(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS documents(uri TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,extension TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,modified_at INTEGER NOT NULL,folder TEXT,type TEXT NOT NULL,indexed_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_documents_name ON documents(name COLLATE NOCASE); CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type); CREATE INDEX IF NOT EXISTS idx_documents_modified ON documents(modified_at DESC);`)}
