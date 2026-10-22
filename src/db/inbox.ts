import { suggest, type Suggestion } from "@/lib/suggest";
import { getDb } from "./database";

export async function getInboxCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM documents WHERE inbox = 1 AND status = 'available'",
  );
  return row?.n ?? 0;
}

/** Marks documents as filed (out of the Inbox). */
export async function clearInbox(documentIds: number[]): Promise<void> {
  if (!documentIds.length) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE documents SET inbox = 0 WHERE inbox = 1 AND id IN (${documentIds.map(() => "?").join(",")})`,
    ...documentIds,
  );
}

export async function clearAllInbox(): Promise<number[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number }>("SELECT id FROM documents WHERE inbox = 1");
  await db.runAsync("UPDATE documents SET inbox = 0 WHERE inbox = 1");
  return rows.map((r) => r.id);
}

export async function restoreInbox(documentIds: number[]): Promise<void> {
  if (!documentIds.length) return;
  const db = await getDb();
  await db.runAsync(`UPDATE documents SET inbox = 1 WHERE id IN (${documentIds.map(() => "?").join(",")})`, ...documentIds);
}

export interface FilingSuggestions {
  collections: Suggestion[];
  tags: Suggestion[];
}

/** Collections and tags this document probably belongs in, from filing habits and name matches. */
export async function getSuggestions(doc: { id: number; name: string; folder: string | null }): Promise<FilingSuggestions> {
  const db = await getDb();
  const [collections, tags, colCounts, tagCounts] = await Promise.all([
    db.getAllAsync<{ id: string; name: string }>("SELECT id, name FROM collections"),
    db.getAllAsync<{ id: string; name: string }>("SELECT id, name FROM tags"),
    doc.folder
      ? db.getAllAsync<{ id: string; n: number }>(
          `SELECT cd.collection_id AS id, COUNT(*) AS n FROM collection_documents cd JOIN documents d ON d.id = cd.document_id
           WHERE d.folder = ? AND d.id != ? GROUP BY cd.collection_id`,
          doc.folder,
          doc.id,
        )
      : Promise.resolve([]),
    doc.folder
      ? db.getAllAsync<{ id: string; n: number }>(
          `SELECT dt.tag_id AS id, COUNT(*) AS n FROM document_tags dt JOIN documents d ON d.id = dt.document_id
           WHERE d.folder = ? AND d.id != ? GROUP BY dt.tag_id`,
          doc.folder,
          doc.id,
        )
      : Promise.resolve([]),
  ]);
  return {
    collections: suggest(doc, collections, new Map(colCounts.map((r) => [r.id, r.n])), 3),
    tags: suggest(doc, tags, new Map(tagCounts.map((r) => [r.id, r.n])), 2),
  };
}
