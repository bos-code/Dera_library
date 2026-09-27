import { typeForExtension } from "@/lib/fileTypes";
import type { ScannedItem } from "@/native/scanner";
import type { DocumentRecord, DocumentStatus, DocumentType, LibraryView, SortMode } from "@/types/document";
import { getDb, getMeta } from "./database";
import { planReconcile, type IndexedDoc, type ReconcileInput } from "./reconcile";

const SELECT_DOCUMENT = `
  SELECT d.id, d.uri, d.path, d.name, d.extension, d.mime_type AS mimeType, d.size, d.modified_at AS modifiedAt,
         d.folder, d.type, d.source_id AS sourceId, d.status, d.missing_since AS missingSince,
         d.last_opened_at AS lastOpenedAt, (f.document_id IS NOT NULL) AS isFavorite
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
  limit?: number;
}

let ftsAvailable: boolean | null = null;

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
  const words = terms(q.text ?? "");
  if (words.length) {
    if (words.every((w) => w.length >= 3) && (await useFts())) {
      // Each term quoted as a phrase so user punctuation can't form FTS syntax.
      where.push("d.id IN (SELECT rowid FROM documents_fts WHERE documents_fts MATCH ?)");
      args.push(words.map((w) => `"${w.replace(/"/g, '""')}"`).join(" "));
    } else {
      for (const w of words) {
        where.push("(d.name LIKE ? ESCAPE '\\' OR d.folder LIKE ? ESCAPE '\\')");
        const like = `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        args.push(like, like);
      }
    }
  }
  const order =
    q.view === "recent"
      ? "d.last_opened_at DESC"
      : q.sort === "name-asc"
        ? "d.name COLLATE NOCASE ASC"
        : q.sort === "size-desc"
          ? "d.size DESC"
          : "d.modified_at DESC";
  const sql = `${SELECT_DOCUMENT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order}${
    q.limit ? ` LIMIT ${Math.floor(q.limit)}` : ""
  }`;
  return db.getAllAsync<DocumentRecord>(sql, ...args);
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
export async function applyScan(input: ReconcileInput) {
  const db = await getDb();
  const plan = planReconcile(await loadIndex(), input);
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    const insert = await db.prepareAsync(
      `INSERT INTO documents(uri,path,name,extension,mime_type,size,modified_at,folder,type,source_id,status,first_seen_at,last_seen_at)
       VALUES($uri,$path,$name,$ext,$mime,$size,$mod,$folder,$type,$source,'available',$now,$now)
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
      for (const item of plan.inserts) await insert.executeAsync(params(item));
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
