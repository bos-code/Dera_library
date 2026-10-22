import type { SQLiteDatabase } from "expo-sqlite";

interface Migration {
  version: number;
  /** When true a failure is recorded but does not block the app (used for optional SQLite features). */
  optional?: boolean;
  /** Runs with foreign keys disabled (needed when rebuilding referenced tables). */
  rebuildsTables?: boolean;
  up(db: SQLiteDatabase): Promise<void>;
}

/** v0.1 schema. Kept verbatim so existing installs and fresh installs converge on the same history. */
const v1 = `
CREATE TABLE IF NOT EXISTS documents(uri TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,extension TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,modified_at INTEGER NOT NULL,folder TEXT,type TEXT NOT NULL,indexed_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,parent_id TEXT REFERENCES collections(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id);
CREATE TABLE IF NOT EXISTS collection_documents(collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,added_at INTEGER NOT NULL,PRIMARY KEY(collection_id,document_uri));
CREATE TABLE IF NOT EXISTS tags(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL COLLATE NOCASE UNIQUE,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS document_tags(document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,PRIMARY KEY(document_uri,tag_id));
CREATE TABLE IF NOT EXISTS favorites(document_uri TEXT PRIMARY KEY NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT,document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,opened_at INTEGER NOT NULL);
`;

/**
 * v2: documents get a stable integer id and a lifecycle status, so user organization is attached to the id and
 * survives files disappearing, moving or being renamed. Existing organization is carried across.
 */
const v2 = `
CREATE TABLE documents_v2(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uri TEXT NOT NULL UNIQUE,
  path TEXT,
  name TEXT NOT NULL,
  extension TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  folder TEXT,
  type TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT 'device',
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','missing','revoked')),
  missing_since INTEGER,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_opened_at INTEGER
);
INSERT INTO documents_v2(uri,path,name,extension,mime_type,size,modified_at,folder,type,source_id,status,first_seen_at,last_seen_at)
  SELECT uri,NULL,name,extension,mime_type,size,modified_at,folder,type,'device','available',indexed_at,indexed_at FROM documents;

CREATE TABLE collection_documents_v2(
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents_v2(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL,
  PRIMARY KEY(collection_id,document_id)
);
INSERT INTO collection_documents_v2 SELECT cd.collection_id,d.id,cd.added_at FROM collection_documents cd JOIN documents_v2 d ON d.uri=cd.document_uri;

CREATE TABLE document_tags_v2(
  document_id INTEGER NOT NULL REFERENCES documents_v2(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(document_id,tag_id)
);
INSERT INTO document_tags_v2(document_id,tag_id) SELECT d.id,dt.tag_id FROM document_tags dt JOIN documents_v2 d ON d.uri=dt.document_uri;

CREATE TABLE favorites_v2(
  document_id INTEGER PRIMARY KEY NOT NULL REFERENCES documents_v2(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
INSERT INTO favorites_v2 SELECT d.id,f.created_at FROM favorites f JOIN documents_v2 d ON d.uri=f.document_uri;

CREATE TABLE history_v2(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents_v2(id) ON DELETE CASCADE,
  opened_at INTEGER NOT NULL
);
INSERT INTO history_v2(document_id,opened_at) SELECT d.id,h.opened_at FROM history h JOIN documents_v2 d ON d.uri=h.document_uri;
UPDATE documents_v2 SET last_opened_at=(SELECT MAX(opened_at) FROM history_v2 h WHERE h.document_id=documents_v2.id);

DROP TABLE collection_documents;
DROP TABLE document_tags;
DROP TABLE favorites;
DROP TABLE history;
DROP TABLE documents;
ALTER TABLE documents_v2 RENAME TO documents;
ALTER TABLE collection_documents_v2 RENAME TO collection_documents;
ALTER TABLE document_tags_v2 RENAME TO document_tags;
ALTER TABLE favorites_v2 RENAME TO favorites;
ALTER TABLE history_v2 RENAME TO history;

CREATE INDEX idx_documents_name ON documents(name COLLATE NOCASE);
CREATE INDEX idx_documents_type ON documents(type);
CREATE INDEX idx_documents_modified ON documents(modified_at DESC);
CREATE INDEX idx_documents_path ON documents(path);
CREATE INDEX idx_documents_status_source ON documents(status,source_id);
CREATE INDEX idx_documents_opened ON documents(last_opened_at DESC);
CREATE INDEX idx_collection_documents_document ON collection_documents(document_id);
CREATE INDEX idx_document_tags_tag ON document_tags(tag_id);
CREATE INDEX idx_history_opened ON history(opened_at DESC);

ALTER TABLE collections ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE sources(
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('tree','files')),
  uri TEXT UNIQUE,
  label TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  last_scan_at INTEGER,
  status TEXT NOT NULL DEFAULT 'ok'
);

CREATE TABLE app_meta(key TEXT PRIMARY KEY NOT NULL, value TEXT);

-- Reserved for full-text extraction. Extracted text is stored in documents_fts.body.
CREATE TABLE document_content(
  document_id INTEGER PRIMARY KEY NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  extractor_version INTEGER NOT NULL DEFAULT 0,
  extracted_at INTEGER,
  error TEXT
);
`;

/** v3: trigram FTS5 index over name + folder (+ future body text), kept in sync by triggers. */
const v3 = `
CREATE VIRTUAL TABLE documents_fts USING fts5(name, folder, body, tokenize='trigram');
INSERT INTO documents_fts(rowid,name,folder,body) SELECT id,name,coalesce(folder,''),'' FROM documents;
CREATE TRIGGER documents_fts_insert AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid,name,folder,body) VALUES(new.id,new.name,coalesce(new.folder,''),'');
END;
CREATE TRIGGER documents_fts_update AFTER UPDATE OF name,folder ON documents BEGIN
  UPDATE documents_fts SET name=new.name, folder=coalesce(new.folder,'') WHERE rowid=new.id;
END;
CREATE TRIGGER documents_fts_delete AFTER DELETE ON documents BEGIN
  DELETE FROM documents_fts WHERE rowid=old.id;
END;
INSERT OR REPLACE INTO app_meta(key,value) VALUES('fts','1');
`;

/** v4: lookup index for the duplicates shelf and backup matching (name + size). */
const v4 = `CREATE INDEX IF NOT EXISTS idx_documents_name_size ON documents(name, size);`;

/**
 * v5: reading tracker. Sessions keep the document's name and survive the document being removed from the
 * index (document_id is set to NULL), so the reading history and heatmap are never rewritten after the fact.
 */
const v5 = `
CREATE TABLE reading_sessions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  document_name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL CHECK(duration_ms > 0),
  source TEXT NOT NULL DEFAULT 'estimate' CHECK(source IN ('estimate','manual','reader')),
  pages INTEGER
);
CREATE INDEX idx_reading_started ON reading_sessions(started_at);
CREATE INDEX idx_reading_document ON reading_sessions(document_id);
ALTER TABLE documents ADD COLUMN reading_status TEXT CHECK(reading_status IN ('to-read','reading','done'));
`;

/** v6: page and word counts (reading estimates); stale extracted text is dropped when a file changes. */
const v6 = `
ALTER TABLE documents ADD COLUMN page_count INTEGER;
ALTER TABLE documents ADD COLUMN word_count INTEGER;
CREATE TRIGGER document_content_reset AFTER UPDATE OF size, modified_at ON documents
WHEN old.size IS NOT new.size OR old.modified_at IS NOT new.modified_at
BEGIN
  DELETE FROM document_content WHERE document_id = new.id;
END;
`;

/**
 * v7 (optional, needs FTS5): word index over document text for search-inside-documents. Word-based
 * (unicode61) rather than trigram: a fraction of the size, which matters once thousands of documents are indexed.
 */
const v7 = `
CREATE VIRTUAL TABLE content_fts USING fts5(body, tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER content_fts_document_delete AFTER DELETE ON documents BEGIN
  DELETE FROM content_fts WHERE rowid = old.id;
END;
CREATE TRIGGER content_fts_reset AFTER DELETE ON document_content BEGIN
  DELETE FROM content_fts WHERE rowid = old.document_id;
END;
INSERT OR REPLACE INTO app_meta(key,value) VALUES('content_fts','1');
`;

/**
 * v8: organization.
 * - inbox: newly discovered documents waiting to be filed
 * - custom_title / note: the user's own title and notes (the file is never renamed)
 * - saved_searches: filters saved as self-updating smart collections
 */
const v8 = `
ALTER TABLE documents ADD COLUMN inbox INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_documents_inbox ON documents(inbox) WHERE inbox = 1;
ALTER TABLE documents ADD COLUMN custom_title TEXT;
ALTER TABLE documents ADD COLUMN note TEXT;
CREATE TABLE saved_searches(
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
`;

/** v9 (optional, needs the v3 FTS table): custom titles and notes become searchable via its spare body column. */
const v9 = `
CREATE TRIGGER documents_fts_personal AFTER UPDATE OF custom_title, note ON documents BEGIN
  UPDATE documents_fts SET body = trim(coalesce(new.custom_title, '') || ' ' || coalesce(new.note, '')) WHERE rowid = new.id;
END;
`;

/** v10: local-only diagnostics log (never sent anywhere; the user can export it). */
const v10 = `
CREATE TABLE app_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT
);
`;

export const migrations: Migration[] = [
  { version: 1, up: (db) => db.execAsync(v1) },
  { version: 2, rebuildsTables: true, up: (db) => db.execAsync(v2) },
  { version: 3, optional: true, up: (db) => db.execAsync(v3) },
  { version: 4, up: (db) => db.execAsync(v4) },
  { version: 5, up: (db) => db.execAsync(v5) },
  { version: 6, up: (db) => db.execAsync(v6) },
  { version: 7, optional: true, up: (db) => db.execAsync(v7) },
  { version: 8, up: (db) => db.execAsync(v8) },
  { version: 9, optional: true, up: (db) => db.execAsync(v9) },
  { version: 10, up: (db) => db.execAsync(v10) },
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let current = row?.user_version ?? 0;
  for (const m of migrations) {
    if (m.version <= current) continue;
    if (m.rebuildsTables) await db.execAsync("PRAGMA foreign_keys=OFF");
    try {
      // Runs on the main connection: foreign_keys is per-connection, and nothing else touches the db yet.
      await db.withTransactionAsync(async () => {
        await m.up(db);
        await db.execAsync(`PRAGMA user_version=${m.version}`);
      });
    } catch (e) {
      if (!m.optional) throw e;
      console.warn(`Optional migration ${m.version} skipped`, e);
      await db.execAsync(`PRAGMA user_version=${m.version}`);
    } finally {
      if (m.rebuildsTables) await db.execAsync("PRAGMA foreign_keys=ON");
    }
    current = m.version;
  }
}
