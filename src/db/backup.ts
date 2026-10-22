import { typeForExtension } from "@/lib/fileTypes";
import type { ReadingStatus } from "@/types/document";
import { getDb, getMeta, setMeta } from "./database";
import { ensureTag } from "./tags";

const FORMAT = "dera-library-backup";
/** v2 adds reading status, reading sessions and the daily goal. v1 files still import. */
const FORMAT_VERSION = 2;

interface BackupSession {
  documentName: string;
  startedAt: number;
  durationMs: number;
  source: string;
  pages: number | null;
}

interface BackupDocument {
  uri: string;
  path: string | null;
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  modifiedAt: number;
  folder: string | null;
  favorite: boolean;
  lastOpenedAt: number | null;
  tags: string[];
  collections: string[];
  readingStatus?: ReadingStatus | null;
  sessions?: BackupSession[];
}

interface Backup {
  format: typeof FORMAT;
  version: number;
  exportedAt: number;
  collections: Array<{ id: string; name: string; parentId: string | null; createdAt: number }>;
  tags: Array<{ id: string; name: string }>;
  documents: BackupDocument[];
  /** Sessions whose document was removed from the library. */
  orphanSessions?: BackupSession[];
  readingGoalMin?: number;
}

/** Serializes user organization (not files) for safekeeping. */
export async function exportLibrary(): Promise<{ json: string; documents: number; collections: number; tags: number }> {
  const db = await getDb();
  const collections = await db.getAllAsync<Backup["collections"][number]>(
    "SELECT id, name, parent_id AS parentId, created_at AS createdAt FROM collections",
  );
  const tags = await db.getAllAsync<Backup["tags"][number]>("SELECT id, name FROM tags");
  const rows = await db.getAllAsync<Omit<BackupDocument, "tags" | "collections" | "favorite"> & { id: number; favorite: number }>(
    `SELECT d.id, d.uri, d.path, d.name, d.extension, d.mime_type AS mimeType, d.size, d.modified_at AS modifiedAt,
            d.folder, d.last_opened_at AS lastOpenedAt, (f.document_id IS NOT NULL) AS favorite,
            d.reading_status AS readingStatus
     FROM documents d LEFT JOIN favorites f ON f.document_id = d.id
     WHERE f.document_id IS NOT NULL
        OR d.reading_status IS NOT NULL
        OR d.id IN (SELECT document_id FROM document_tags)
        OR d.id IN (SELECT document_id FROM collection_documents)
        OR d.id IN (SELECT document_id FROM reading_sessions WHERE document_id IS NOT NULL)`,
  );
  const tagLinks = await db.getAllAsync<{ document_id: number; tag_id: string }>("SELECT document_id, tag_id FROM document_tags");
  const colLinks = await db.getAllAsync<{ document_id: number; collection_id: string }>(
    "SELECT document_id, collection_id FROM collection_documents",
  );
  const group = <T>(links: T[], key: (l: T) => number, val: (l: T) => string) => {
    const m = new Map<number, string[]>();
    for (const l of links) m.set(key(l), [...(m.get(key(l)) ?? []), val(l)]);
    return m;
  };
  const tagsByDoc = group(
    tagLinks,
    (l) => l.document_id,
    (l) => l.tag_id,
  );
  const colsByDoc = group(
    colLinks,
    (l) => l.document_id,
    (l) => l.collection_id,
  );
  const sessionRows = await db.getAllAsync<BackupSession & { documentId: number | null }>(
    `SELECT document_id AS documentId, document_name AS documentName, started_at AS startedAt, duration_ms AS durationMs,
            source, pages FROM reading_sessions ORDER BY started_at`,
  );
  const sessionsByDoc = new Map<number, BackupSession[]>();
  const orphanSessions: BackupSession[] = [];
  for (const { documentId, ...session } of sessionRows) {
    if (documentId == null) orphanSessions.push(session);
    else sessionsByDoc.set(documentId, [...(sessionsByDoc.get(documentId) ?? []), session]);
  }
  const goal = Number(await getMeta("reading_goal_min"));
  const backup: Backup = {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: Date.now(),
    collections,
    tags,
    documents: rows.map(({ id, favorite, ...d }) => ({
      ...d,
      favorite: !!favorite,
      tags: tagsByDoc.get(id) ?? [],
      collections: colsByDoc.get(id) ?? [],
      sessions: sessionsByDoc.get(id) ?? [],
    })),
    orphanSessions,
    ...(goal > 0 ? { readingGoalMin: goal } : {}),
  };
  return {
    json: JSON.stringify(backup, null, 1),
    documents: backup.documents.length,
    collections: collections.length,
    tags: tags.length,
  };
}

export interface ImportResult {
  matched: number;
  pending: number;
  collections: number;
  tags: number;
}

/**
 * Merges a backup into the library. Documents are matched by URI, then path, then name + size. Unmatched
 * documents are kept as "missing" entries carrying their organization; the next scan relinks them if found.
 */
export async function importLibrary(json: string): Promise<ImportResult> {
  let data: Backup;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("This file isn't a valid Dera Library backup.");
  }
  if (data?.format !== FORMAT || !Array.isArray(data.documents)) throw new Error("This file isn't a Dera Library backup.");
  if (data.version > FORMAT_VERSION) throw new Error("This backup was made by a newer version of Dera Library.");

  const db = await getDb();
  const tagIdMap = new Map<string, string>();
  for (const t of data.tags ?? []) tagIdMap.set(t.id, await ensureTag(t.name));

  const result: ImportResult = { matched: 0, pending: 0, collections: 0, tags: tagIdMap.size };
  const now = Date.now();
  /** Skips sessions already present, so importing the same backup twice doesn't double the history. */
  const insertSession = async (documentId: number | null, s: BackupSession) => {
    if (!(s.durationMs > 0)) return;
    await db.runAsync(
      `INSERT INTO reading_sessions(document_id,document_name,started_at,duration_ms,source,pages)
       SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM reading_sessions WHERE started_at=? AND document_name=?)`,
      documentId,
      s.documentName,
      s.startedAt,
      s.durationMs,
      ["estimate", "manual", "reader"].includes(s.source) ? s.source : "manual",
      s.pages ?? null,
      s.startedAt,
      s.documentName,
    );
  };

  await db.withTransactionAsync(async () => {
    for (const c of data.collections ?? []) {
      const r = await db.runAsync(
        "INSERT OR IGNORE INTO collections(id,name,parent_id,created_at,updated_at) VALUES(?,?,NULL,?,?)",
        c.id,
        c.name,
        c.createdAt ?? now,
        now,
      );
      result.collections += r.changes;
    }
    for (const c of data.collections ?? []) {
      if (c.parentId) await db.runAsync("UPDATE collections SET parent_id=? WHERE id=? AND parent_id IS NULL", c.parentId, c.id);
    }

    for (const d of data.documents) {
      const match =
        (await db.getFirstAsync<{ id: number }>("SELECT id FROM documents WHERE uri=?", d.uri)) ??
        (d.path ? await db.getFirstAsync<{ id: number }>("SELECT id FROM documents WHERE path=?", d.path) : null) ??
        (await db.getFirstAsync<{ id: number }>("SELECT id FROM documents WHERE name=? AND size=?", d.name, d.size));
      let id = match?.id;
      if (id) result.matched++;
      else {
        const r = await db.runAsync(
          `INSERT INTO documents(uri,path,name,extension,mime_type,size,modified_at,folder,type,source_id,status,missing_since,first_seen_at,last_seen_at)
           VALUES(?,?,?,?,?,?,?,?,?,'device','missing',?,?,?)`,
          d.uri,
          d.path,
          d.name,
          d.extension,
          d.mimeType,
          d.size,
          d.modifiedAt,
          d.folder,
          typeForExtension(d.extension),
          now,
          now,
          now,
        );
        id = r.lastInsertRowId;
        result.pending++;
      }
      if (d.favorite) await db.runAsync("INSERT OR IGNORE INTO favorites(document_id,created_at) VALUES(?,?)", id, now);
      if (d.lastOpenedAt) {
        await db.runAsync("UPDATE documents SET last_opened_at=max(coalesce(last_opened_at,0),?) WHERE id=?", d.lastOpenedAt, id);
      }
      for (const t of d.tags) {
        const tagId = tagIdMap.get(t);
        if (tagId)
          await db.runAsync("INSERT OR IGNORE INTO document_tags(document_id,tag_id,added_at) VALUES(?,?,?)", id, tagId, now);
      }
      if (d.readingStatus) {
        await db.runAsync("UPDATE documents SET reading_status=? WHERE id=? AND reading_status IS NULL", d.readingStatus, id);
      }
      for (const session of d.sessions ?? []) await insertSession(id, session);
      for (const c of d.collections) {
        await db.runAsync(
          "INSERT OR IGNORE INTO collection_documents(collection_id,document_id,added_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM collections WHERE id=?)",
          c,
          id,
          now,
          c,
        );
      }
    }
    for (const session of data.orphanSessions ?? []) await insertSession(null, session);
    if (data.readingGoalMin && !(await getMeta("reading_goal_min"))) {
      await setMeta("reading_goal_min", String(data.readingGoalMin));
    }
  });
  return result;
}
