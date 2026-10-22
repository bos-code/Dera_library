import { typeForExtension } from "@/lib/fileTypes";
import type { ScannedItem } from "@/native/scanner";
import type { DocumentRecord, DocumentStatus, DocumentType, LibraryView, ReadingStatus, SortMode } from "@/types/document";
import { getDb, getMeta } from "./database";
import { planReconcile, type IndexedDoc, type ReconcileInput } from "./reconcile";

const SELECT_DOCUMENT = `
  SELECT d.id, d.uri, d.path, d.name, d.extension, d.mime_type AS mimeType, d.size, d.modified_at AS modifiedAt,
         d.folder, d.type, d.source_id AS sourceId, d.status, d.missing_since AS missingSince,
         d.last_opened_at AS lastOpenedAt, (f.document_id IS NOT NULL) AS isFavorite,
         d.reading_status AS readingStatus, d.page_count AS pageCount, d.word_count AS wordCount,
         d.custom_title AS customTitle, d.note, d.inbox
  FROM documents d LEFT JOIN favorites f ON f.document_id = d.id`;

/** Documents missing for longer than this, with no user organization attached, are purged. */
const PURGE_AFTER_MS = 30 * 86_400_000;

export interface DocumentQuery {
  text?: string;
  type?: DocumentType | "all";
  sort?: SortMode;
  view?: LibraryView;
  tagId?: string;
  collectionId?: string;
  status?: DocumentStatus | "any";
  shelf?: SmartShelf | null;
  readingStatus?: ReadingStatus;
  /** Only documents waiting in the Inbox. */
  inbox?: boolean;
  /** Only documents first seen after the initial scan, newest first via sort "added-desc". */
  recentlyAdded?: boolean;
  /** Also match text inside documents (default true when the index is on). */
  content?: boolean;
  limit?: number;
}

/** Automatic shelves built from what the index already knows: folder, size, history and duplicates. */
export type SmartShelf = "whatsapp" | "telegram" | "downloads" | "large" | "untouched" | "duplicates";

const LARGE_BYTES = 20 * 1024 * 1024;
const UNTOUCHED_MS = 365 * 86_400_000;

function shelfCondition(shelf: SmartShelf, now: number): { sql: string; args: Array<string | number> } {
  switch (shelf) {
    case "whatsapp":
      return { sql: "d.folder LIKE '%whatsapp%'", args: [] };
    case "telegram":
      return { sql: "d.folder LIKE '%telegram%'", args: [] };
    case "downloads":
      return { sql: "(d.folder LIKE 'download%' OR d.folder LIKE '%/download%')", args: [] };
    case "large":
      return { sql: "d.size >= ?", args: [LARGE_BYTES] };
    case "untouched":
      return { sql: "(d.last_opened_at IS NULL AND d.modified_at < ?)", args: [now - UNTOUCHED_MS] };
    case "duplicates":
      return {
        sql: "EXISTS (SELECT 1 FROM documents x WHERE x.status = 'available' AND x.name = d.name AND x.size = d.size AND x.id != d.id)",
        args: [],
      };
  }
}

export const SMART_SHELVES: SmartShelf[] = ["whatsapp", "telegram", "downloads", "large", "untouched", "duplicates"];

/** Available-document counts per smart shelf, in one pass. */
export async function getShelfCounts(now = Date.now()): Promise<Record<SmartShelf, number>> {
  const db = await getDb();
  const parts = SMART_SHELVES.map((shelf) => ({ shelf, ...shelfCondition(shelf, now) }));
  const row = await db.getFirstAsync<Record<SmartShelf, number | null>>(
    `SELECT ${parts.map((p) => `SUM(CASE WHEN ${p.sql} THEN 1 ELSE 0 END) AS ${p.shelf}`).join(", ")}
     FROM documents d WHERE d.status = 'available'`,
    ...parts.flatMap((p) => p.args),
  );
  return Object.fromEntries(SMART_SHELVES.map((shelf) => [shelf, row?.[shelf] ?? 0])) as Record<SmartShelf, number>;
}

/** ORDER BY for each sort; ties broken by name so results never shuffle between queries. */
const SORT_SQL: Record<SortMode, string> = {
  "modified-desc": "d.modified_at DESC, d.name COLLATE NOCASE",
  "modified-asc": "d.modified_at ASC, d.name COLLATE NOCASE",
  "name-asc": "d.name COLLATE NOCASE ASC",
  "name-desc": "d.name COLLATE NOCASE DESC",
  "size-desc": "d.size DESC, d.name COLLATE NOCASE",
  "size-asc": "d.size ASC, d.name COLLATE NOCASE",
  // Never-opened documents sink to the bottom, newest first among them.
  "opened-desc": "d.last_opened_at IS NULL, d.last_opened_at DESC, d.modified_at DESC",
  "added-desc": "d.first_seen_at DESC, d.name COLLATE NOCASE",
};

let ftsAvailable: boolean | null = null;
let contentIndexEnabled: boolean | null = null;

/** Whether search-inside-documents is available (FTS5 present) and switched on. */
export async function useContentIndex(): Promise<boolean> {
  if (contentIndexEnabled === null) {
    contentIndexEnabled = (await getMeta("content_fts")) === "1" && (await getMeta("content_index")) !== "0";
  }
  return contentIndexEnabled;
}

export function invalidateContentIndexSetting(): void {
  contentIndexEnabled = null;
}

/** Every word must appear; each may be the start of a longer word ("newt" finds "Newton"). */
function contentMatchQuery(words: string[]): string {
  return words.map((w) => `"${w.replace(/"/g, '""')}"*`).join(" ");
}

/** Adds a short excerpt around the matched words, for documents that matched inside their text. */
async function attachSnippets(rows: DocumentRecord[], query: string): Promise<void> {
  const db = await getDb();
  const ids = rows.slice(0, 300).map((r) => r.id);
  const snippets = await db.getAllAsync<{ id: number; snippet: string }>(
    `SELECT rowid AS id, snippet(content_fts, 0, '\u0001', '\u0002', '…', 14) AS snippet
     FROM content_fts WHERE content_fts MATCH ? AND rowid IN (${ids.map(() => "?").join(",")})`,
    query,
    ...ids,
  );
  const byId = new Map(snippets.map((s) => [s.id, s.snippet]));
  for (const r of rows) {
    const snippet = byId.get(r.id);
    if (snippet) r.snippet = snippet;
  }
}

async function useFts(): Promise<boolean> {
  if (ftsAvailable === null) ftsAvailable = (await getMeta("fts")) === "1";
  return ftsAvailable;
}

/** Splits a search box value into terms; trigram FTS needs 3+ characters per term. */
function terms(text: string): string[] {
  return text.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
}

export async function searchDocuments(q: DocumentQuery = {}): Promise<DocumentRecord[]> {
  const db = await getDb();
  const where: string[] = [];
  const args: Array<string | number> = [];
  const status = q.status ?? "available";
  if (status !== "any") {
    where.push("d.status = ?");
    args.push(status);
  }
  if (q.type && q.type !== "all") {
    where.push("d.type = ?");
    args.push(q.type);
  }
  if (q.view === "favorites") where.push("f.document_id IS NOT NULL");
  if (q.view === "recent") where.push("d.last_opened_at IS NOT NULL");
  if (q.tagId) {
    where.push("d.id IN (SELECT document_id FROM document_tags WHERE tag_id = ?)");
    args.push(q.tagId);
  }
  if (q.collectionId) {
    where.push("d.id IN (SELECT document_id FROM collection_documents WHERE collection_id = ?)");
    args.push(q.collectionId);
  }
  if (q.inbox) where.push("d.inbox = 1");
  // The first scan stamps everything at once; "recently added" means found after that.
  if (q.recentlyAdded) where.push("d.first_seen_at > (SELECT MIN(first_seen_at) FROM documents) + 600000");
  if (q.readingStatus) {
    where.push("d.reading_status = ?");
    args.push(q.readingStatus);
  }
  if (q.shelf) {
    const cond = shelfCondition(q.shelf, Date.now());
    where.push(cond.sql);
    args.push(...cond.args);
  }
  const words = terms(q.text ?? "");
  // Name/folder match (trigram FTS, LIKE fallback for very short terms) …
  let nameMatch: { sql: string; args: string[] } | null = null;
  if (words.length) {
    if (words.every((w) => w.length >= 3) && (await useFts())) {
      // Each term quoted as a phrase so user punctuation can't form FTS syntax.
      nameMatch = {
        sql: "d.id IN (SELECT rowid FROM documents_fts WHERE documents_fts MATCH ?)",
        args: [words.map((w) => `"${w.replace(/"/g, '""')}"`).join(" ")],
      };
    } else {
      const likes = words.map((w) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      nameMatch = {
        sql: likes
          .map(
            () =>
              "(d.name LIKE ? ESCAPE '\\' OR d.folder LIKE ? ESCAPE '\\' OR d.custom_title LIKE ? ESCAPE '\\' OR d.note LIKE ? ESCAPE '\\')",
          )
          .join(" AND "),
        args: likes.flatMap((l) => [l, l, l, l]),
      };
    }
  }
  // … or a match inside the document's text (word prefixes, all words required).
  const contentQuery = words.length && q.content !== false && (await useContentIndex()) ? contentMatchQuery(words) : null;
  if (nameMatch) {
    if (contentQuery) {
      where.push(`(${nameMatch.sql} OR d.id IN (SELECT rowid FROM content_fts WHERE content_fts MATCH ?))`);
      args.push(...nameMatch.args, contentQuery);
    } else {
      where.push(nameMatch.sql);
      args.push(...nameMatch.args);
    }
  }
  const baseOrder = q.view === "recent" ? SORT_SQL["opened-desc"] : SORT_SQL[q.sort ?? "modified-desc"];
  // Title matches rank above matches found only inside the text.
  const order = nameMatch && contentQuery ? `CASE WHEN ${nameMatch.sql} THEN 0 ELSE 1 END, ${baseOrder}` : baseOrder;
  if (nameMatch && contentQuery) args.push(...nameMatch.args);
  const sql = `${SELECT_DOCUMENT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order}${
    q.limit ? ` LIMIT ${Math.floor(q.limit)}` : ""
  }`;
  const rows = await db.getAllAsync<DocumentRecord>(sql, ...args);
  if (contentQuery && rows.length) await attachSnippets(rows, contentQuery);
  return rows;
}

export async function getDocument(id: number): Promise<DocumentRecord | null> {
  const db = await getDb();
  return db.getFirstAsync<DocumentRecord>(`${SELECT_DOCUMENT} WHERE d.id = ?`, id);
}

export async function getDocumentsByIds(ids: number[]): Promise<DocumentRecord[]> {
  if (!ids.length) return [];
  const db = await getDb();
  return db.getAllAsync<DocumentRecord>(`${SELECT_DOCUMENT} WHERE d.id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

export interface LibraryStats {
  available: number;
  missing: number;
  revoked: number;
  byType: Partial<Record<DocumentType, number>>;
}

export async function getLibraryStats(): Promise<LibraryStats> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ status: DocumentStatus; type: DocumentType; n: number }>(
    "SELECT status, type, COUNT(*) AS n FROM documents GROUP BY status, type",
  );
  const stats: LibraryStats = { available: 0, missing: 0, revoked: 0, byType: {} };
  for (const r of rows) {
    stats[r.status] += r.n;
    if (r.status === "available") stats.byType[r.type] = (stats.byType[r.type] ?? 0) + r.n;
  }
  return stats;
}

export async function setDocumentStatus(id: number, status: DocumentStatus): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE documents SET status = ?, missing_since = CASE WHEN ? = 'available' THEN NULL ELSE coalesce(missing_since, ?) END WHERE id = ?",
    status,
    status,
    Date.now(),
    id,
  );
}

/** Removes an index entry (and its organization). Never touches the file itself. */
export async function forgetDocuments(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  await db.runAsync(`DELETE FROM documents WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function loadIndex(): Promise<IndexedDoc[]> {
  const db = await getDb();
  return db.getAllAsync<IndexedDoc>(
    "SELECT id, uri, path, name, extension, size, modified_at AS modifiedAt, source_id AS sourceId, status FROM documents",
  );
}

/** Reconciles one scan scope into the index inside a single transaction. */
/** Bigger batches (e.g. a folder just granted) skip the Inbox instead of flooding it. */
const INBOX_MAX_BATCH = 200;

/**
 * @param options.inbox put newly found documents in the Inbox (false for the first scan and for folders the
 *   user just added, where everything is "new").
 */
export async function applyScan(input: ReconcileInput, options: { inbox?: boolean } = {}) {
  const db = await getDb();
  const plan = planReconcile(await loadIndex(), input);
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    const insert = await db.prepareAsync(
      `INSERT INTO documents(uri,path,name,extension,mime_type,size,modified_at,folder,type,source_id,status,first_seen_at,last_seen_at,inbox)
       VALUES($uri,$path,$name,$ext,$mime,$size,$mod,$folder,$type,$source,'available',$now,$now,$inbox)
       ON CONFLICT(uri) DO UPDATE SET status='available', missing_since=NULL, last_seen_at=$now, source_id=$source`,
    );
    const update = await db.prepareAsync(
      `UPDATE documents SET uri=$uri, path=$path, name=$name, extension=$ext, mime_type=$mime, size=$size, modified_at=$mod,
       folder=$folder, type=$type, source_id=$source, status='available', missing_since=NULL, last_seen_at=$now WHERE id=$id`,
    );
    const params = (item: ScannedItem) => ({
      $uri: item.uri,
      $path: item.path,
      $name: item.name,
      $ext: item.extension,
      $mime: item.mimeType,
      $size: Math.round(item.size),
      $mod: Math.round(item.modifiedAt),
      $folder: item.folder,
      $type: typeForExtension(item.extension),
      $source: input.sourceId,
      $now: now,
    });
    try {
      for (const { id, item } of plan.updates) await update.executeAsync({ ...params(item), $id: id });
      const inbox = options.inbox && plan.inserts.length <= INBOX_MAX_BATCH ? 1 : 0;
      for (const item of plan.inserts) await insert.executeAsync({ ...params(item), $inbox: inbox });
    } finally {
      await insert.finalizeAsync();
      await update.finalizeAsync();
    }
    await markStatus(plan.markMissing, "missing", now);
    await markStatus(plan.markRevoked, "revoked", now);
  });
  return plan.summary;
}

async function markStatus(ids: number[], status: DocumentStatus, now: number) {
  const db = await getDb();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    await db.runAsync(
      `UPDATE documents SET status = ?, missing_since = coalesce(missing_since, ?) WHERE id IN (${chunk.map(() => "?").join(",")})`,
      status,
      now,
      ...chunk,
    );
  }
}

/** Marks every document from a source as revoked, e.g. when its folder permission is gone. */
export async function markSourceRevoked(sourceId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE documents SET status='revoked', missing_since=coalesce(missing_since, ?) WHERE source_id=? AND status='available'",
    Date.now(),
    sourceId,
  );
}

/** Deletes long-missing entries that carry no collections, tags or favorite. Returns the number purged. */
export async function purgeStaleMissing(now = Date.now()): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    `DELETE FROM documents WHERE status != 'available' AND missing_since < ?
       AND id NOT IN (SELECT document_id FROM collection_documents)
       AND id NOT IN (SELECT document_id FROM document_tags)
       AND id NOT IN (SELECT document_id FROM favorites)`,
    now - PURGE_AFTER_MS,
  );
  return res.changes;
}

/** The user's own title and note. Only the library changes; the file is never renamed. */
export async function setPersonal(id: number, fields: { customTitle?: string | null; note?: string | null }): Promise<void> {
  const db = await getDb();
  if (fields.customTitle !== undefined) {
    await db.runAsync("UPDATE documents SET custom_title=? WHERE id=?", fields.customTitle?.trim() || null, id);
  }
  if (fields.note !== undefined) {
    await db.runAsync("UPDATE documents SET note=? WHERE id=?", fields.note?.trim() || null, id);
  }
}
