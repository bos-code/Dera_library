import { getDb } from "./database";

const HISTORY_LIMIT = 1000;

export async function setFavorite(documentIds: number[], favorite: boolean): Promise<void> {
  if (!documentIds.length) return;
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const id of documentIds) {
      if (favorite) await db.runAsync("INSERT OR IGNORE INTO favorites(document_id,created_at) VALUES(?,?)", id, now);
      else await db.runAsync("DELETE FROM favorites WHERE document_id=?", id);
    }
  });
}

export async function recordOpen(documentId: number): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync("INSERT INTO history(document_id,opened_at) VALUES(?,?)", documentId, now);
    await db.runAsync("UPDATE documents SET last_opened_at=? WHERE id=?", now, documentId);
    await db.runAsync(
      "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY opened_at DESC LIMIT ?)",
      HISTORY_LIMIT,
    );
  });
}

export async function getOpenCount(documentId: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM history WHERE document_id=?", documentId);
  return row?.n ?? 0;
}

export async function clearHistory(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM history");
    await db.runAsync("UPDATE documents SET last_opened_at=NULL");
  });
}
