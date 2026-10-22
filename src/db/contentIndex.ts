import { getDb, getMeta, setMeta } from "./database";

/** Bump to re-read every document after improving extraction. */
export const EXTRACTOR_VERSION = 1;
export const TEXT_EXTENSIONS = [
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "odt",
  "ods",
  "odp",
  "epub",
  "txt",
  "md",
  "markdown",
  "csv",
  "rtf",
];

export interface PendingDocument {
  id: number;
  uri: string;
  extension: string;
}

/** Next documents to read: recently opened and favorites first, then newest. */
export async function nextPending(limit: number): Promise<PendingDocument[]> {
  const db = await getDb();
  return db.getAllAsync<PendingDocument>(
    `SELECT d.id, d.uri, d.extension FROM documents d
     LEFT JOIN document_content c ON c.document_id = d.id
     LEFT JOIN favorites f ON f.document_id = d.id
     WHERE d.status = 'available' AND d.extension IN (${TEXT_EXTENSIONS.map(() => "?").join(",")})
       AND (c.document_id IS NULL OR c.extractor_version < ?)
     ORDER BY d.last_opened_at IS NULL, d.last_opened_at DESC, f.document_id IS NULL, d.modified_at DESC
     LIMIT ?`,
    ...TEXT_EXTENSIONS,
    EXTRACTOR_VERSION,
    limit,
  );
}

export async function saveExtraction(
  documentId: number,
  result: { status: string; text: string; pages: number | null },
  ocr: boolean,
): Promise<void> {
  const db = await getDb();
  const words = result.text ? result.text.split(/\s+/).filter(Boolean).length : 0;
  await db.withTransactionAsync(async () => {
    // Replacing the content row fires the trigger that clears any previous text for this document.
    await db.runAsync("DELETE FROM document_content WHERE document_id=?", documentId);
    await db.runAsync(
      "INSERT INTO document_content(document_id,status,extractor_version,extracted_at,error) VALUES(?,?,?,?,?)",
      documentId,
      result.status,
      EXTRACTOR_VERSION,
      Date.now(),
      ocr ? "ocr" : null,
    );
    if (result.text) await db.runAsync("INSERT INTO content_fts(rowid,body) VALUES(?,?)", documentId, result.text);
    await db.runAsync(
      "UPDATE documents SET page_count=coalesce(?, page_count), word_count=? WHERE id=?",
      result.pages,
      words || null,
      documentId,
    );
  });
}

export interface IndexStats {
  total: number;
  done: number;
  withText: number;
}

export async function getIndexStats(): Promise<IndexStats> {
  const db = await getDb();
  const row = await db.getFirstAsync<IndexStats>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN c.document_id IS NOT NULL AND c.extractor_version >= ? THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN c.status = 'ok' THEN 1 ELSE 0 END) AS withText
     FROM documents d LEFT JOIN document_content c ON c.document_id = d.id
     WHERE d.status = 'available' AND d.extension IN (${TEXT_EXTENSIONS.map(() => "?").join(",")})`,
    EXTRACTOR_VERSION,
    ...TEXT_EXTENSIONS,
  );
  return { total: row?.total ?? 0, done: row?.done ?? 0, withText: row?.withText ?? 0 };
}

/** Drops all extracted text (the trigger empties the search index); documents are read again later. */
export async function clearContentIndex(): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM document_content");
  await db.runAsync("UPDATE documents SET word_count=NULL");
}

export async function getContentSettings(): Promise<{ enabled: boolean; ocr: boolean; available: boolean }> {
  const [enabled, ocr, available] = await Promise.all([getMeta("content_index"), getMeta("ocr"), getMeta("content_fts")]);
  return { enabled: enabled !== "0", ocr: ocr !== "0", available: available === "1" };
}

export async function setContentSetting(key: "content_index" | "ocr", on: boolean): Promise<void> {
  await setMeta(key, on ? "1" : "0");
}

export async function getContentStatus(documentId: number): Promise<{ status: string; ocr: boolean } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ status: string; error: string | null }>(
    "SELECT status, error FROM document_content WHERE document_id=?",
    documentId,
  );
  return row ? { status: row.status, ocr: row.error === "ocr" } : null;
}
