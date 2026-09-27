import { getDb, newId } from "./database";

export interface Tag {
  id: string;
  name: string;
  documentCount: number;
}

export async function getTags(): Promise<Tag[]> {
  const db = await getDb();
  return db.getAllAsync<Tag>(
    `SELECT t.id, t.name,
            (SELECT COUNT(*) FROM document_tags dt JOIN documents d ON d.id = dt.document_id
              WHERE dt.tag_id = t.id AND d.status = 'available') AS documentCount
     FROM tags t ORDER BY t.name COLLATE NOCASE`,
  );
}

export async function getTag(id: string): Promise<Tag | null> {
  return (await getTags()).find((t) => t.id === id) ?? null;
}

export async function getDocumentTags(documentId: number): Promise<Array<{ id: string; name: string }>> {
  const db = await getDb();
  return db.getAllAsync(
    "SELECT t.id, t.name FROM tags t JOIN document_tags dt ON dt.tag_id = t.id WHERE dt.document_id = ? ORDER BY t.name COLLATE NOCASE",
    documentId,
  );
}

/** Returns the id of the tag with this name, creating it if needed (names are case-insensitive). */
export async function ensureTag(name: string): Promise<string> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Tag name is required");
  if (clean.length > 40) throw new Error("Tag names can be at most 40 characters");
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>("SELECT id FROM tags WHERE name = ? COLLATE NOCASE", clean);
  if (existing) return existing.id;
  const id = newId("tag");
  await db.runAsync("INSERT INTO tags(id,name,created_at) VALUES(?,?,?)", id, clean, Date.now());
  return id;
}

export async function tagDocuments(tagId: string, documentIds: number[]): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const docId of documentIds) {
      await db.runAsync("INSERT OR IGNORE INTO document_tags(document_id,tag_id,added_at) VALUES(?,?,?)", docId, tagId, now);
    }
  });
}

export async function untagDocument(tagId: string, documentId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM document_tags WHERE document_id=? AND tag_id=?", documentId, tagId);
}

export async function renameTag(id: string, name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Tag name is required");
  const db = await getDb();
  const clash = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id != ?",
    clean,
    id,
  );
  if (clash) throw new Error(`A tag named “${clean}” already exists`);
  await db.runAsync("UPDATE tags SET name=? WHERE id=?", clean, id);
}

/** Deletes the tag and its assignments. Documents are unaffected. */
export async function deleteTag(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM tags WHERE id=?", id);
}
