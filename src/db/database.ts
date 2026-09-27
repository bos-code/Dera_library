import * as SQLite from "expo-sqlite";
let db: SQLite.SQLiteDatabase | null = null;
export async function database(){ if(!db) db=await SQLite.openDatabaseAsync("dera-library.db"); return db; }
export async function initDatabase(){
 const d=await database();
 await d.execAsync(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS documents(uri TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,extension TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,modified_at INTEGER NOT NULL,folder TEXT,type TEXT NOT NULL,indexed_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_documents_name ON documents(name COLLATE NOCASE); CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type); CREATE INDEX IF NOT EXISTS idx_documents_modified ON documents(modified_at DESC);
 CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,parent_id TEXT REFERENCES collections(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id);
 CREATE TABLE IF NOT EXISTS collection_documents(collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,added_at INTEGER NOT NULL,PRIMARY KEY(collection_id,document_uri));
 CREATE INDEX IF NOT EXISTS idx_collection_documents_document ON collection_documents(document_uri);`);
}
