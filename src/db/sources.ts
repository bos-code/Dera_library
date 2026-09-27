import { getDb, newId } from "./database";

export interface Source {
  id: string;
  kind: "tree" | "files";
  uri: string | null;
  label: string;
  addedAt: number;
  lastScanAt: number | null;
  status: "ok" | "revoked" | "missing";
  documentCount: number;
}

/** All individually picked files share this source. */
export const PICKED_SOURCE_ID = "picked";

export async function getSources(): Promise<Source[]> {
  const db = await getDb();
  return db.getAllAsync<Source>(
    `SELECT s.id, s.kind, s.uri, s.label, s.added_at AS addedAt, s.last_scan_at AS lastScanAt, s.status,
            (SELECT COUNT(*) FROM documents d WHERE d.source_id = s.id AND d.status = 'available') AS documentCount
     FROM sources s ORDER BY s.added_at`,
  );
}

export async function addTreeSource(uri: string, label: string): Promise<string> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>("SELECT id FROM sources WHERE uri=?", uri);
  if (existing) {
    await db.runAsync("UPDATE sources SET status='ok', label=? WHERE id=?", label, existing.id);
    return existing.id;
  }
  const id = newId("src");
  await db.runAsync("INSERT INTO sources(id,kind,uri,label,added_at) VALUES(?,?,?,?,?)", id, "tree", uri, label, Date.now());
  return id;
}

export async function ensurePickedSource(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR IGNORE INTO sources(id,kind,uri,label,added_at) VALUES(?,?,NULL,?,?)",
    PICKED_SOURCE_ID,
    "files",
    "Individually added files",
    Date.now(),
  );
}

export async function getPickedUris(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ uri: string }>("SELECT uri FROM documents WHERE source_id=?", PICKED_SOURCE_ID);
  return rows.map((r) => r.uri);
}

export async function markSourceScanned(id: string, status: Source["status"]): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sources SET last_scan_at=?, status=? WHERE id=?", Date.now(), status, id);
}

/**
 * Removes a folder source. Its documents stay in the library as "revoked" so their collections and tags survive
 * if the folder is added again or the device scan finds the same files.
 */
export async function removeSource(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE documents SET status='revoked', missing_since=coalesce(missing_since, ?) WHERE source_id=? AND status='available'",
      Date.now(),
      id,
    );
    await db.runAsync("DELETE FROM sources WHERE id=?", id);
  });
}
