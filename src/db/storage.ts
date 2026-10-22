import type { DocumentRecord, DocumentType } from "@/types/document";
import { getDb } from "./database";
import { getDocumentsByIds } from "./documents";

export interface StorageInsights {
  totalBytes: number;
  count: number;
  byType: Array<{ type: DocumentType; bytes: number; count: number }>;
  byFolder: Array<{ folder: string; bytes: number; count: number }>;
  largest: DocumentRecord[];
  untouched: { bytes: number; count: number; docs: DocumentRecord[] };
  duplicates: { wastedBytes: number; groups: number };
}

const YEAR_MS = 365 * 86_400_000;
const LARGE = 5 * 1024 * 1024;

/** Where document space goes, from the index (no files are read). */
export async function getStorageInsights(now = Date.now()): Promise<StorageInsights> {
  const db = await getDb();
  const total = await db.getFirstAsync<{ bytes: number | null; n: number }>(
    "SELECT SUM(size) AS bytes, COUNT(*) AS n FROM documents WHERE status = 'available'",
  );
  const byType = await db.getAllAsync<{ type: DocumentType; bytes: number; count: number }>(
    "SELECT type, SUM(size) AS bytes, COUNT(*) AS count FROM documents WHERE status = 'available' GROUP BY type ORDER BY bytes DESC",
  );
  const folders = await db.getAllAsync<{ folder: string | null; bytes: number; count: number }>(
    "SELECT folder, SUM(size) AS bytes, COUNT(*) AS count FROM documents WHERE status = 'available' GROUP BY folder",
  );
  // Roll sub-folders up to two levels ("WhatsApp/Media/…" → "WhatsApp/Media") so the list stays readable.
  const rolled = new Map<string, { bytes: number; count: number }>();
  for (const f of folders) {
    const key = (f.folder ?? "Unknown").split("/").filter(Boolean).slice(0, 2).join("/") || "Storage root";
    const cur = rolled.get(key) ?? { bytes: 0, count: 0 };
    rolled.set(key, { bytes: cur.bytes + f.bytes, count: cur.count + f.count });
  }
  const largestIds = await db.getAllAsync<{ id: number }>(
    "SELECT id FROM documents WHERE status = 'available' ORDER BY size DESC LIMIT 15",
  );
  const untouchedRows = await db.getAllAsync<{ id: number; size: number }>(
    `SELECT id, size FROM documents WHERE status = 'available' AND size >= ? AND last_opened_at IS NULL AND modified_at < ?
     ORDER BY size DESC`,
    LARGE,
    now - YEAR_MS,
  );
  const dup = await db.getFirstAsync<{ wasted: number | null; groups: number }>(
    `SELECT SUM(size * (n - 1)) AS wasted, COUNT(*) AS groups FROM (
       SELECT size, COUNT(*) AS n FROM documents WHERE status = 'available' GROUP BY name, size HAVING n > 1
     )`,
  );
  const order = (ids: number[], docs: DocumentRecord[]) => {
    const byId = new Map(docs.map((d) => [d.id, d]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  };
  const largest = order(
    largestIds.map((r) => r.id),
    await getDocumentsByIds(largestIds.map((r) => r.id)),
  );
  const untouchedTop = untouchedRows.slice(0, 15).map((r) => r.id);
  return {
    totalBytes: total?.bytes ?? 0,
    count: total?.n ?? 0,
    byType,
    byFolder: [...rolled.entries()]
      .map(([folder, v]) => ({ folder, ...v }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 10),
    largest,
    untouched: {
      bytes: untouchedRows.reduce((a, r) => a + r.size, 0),
      count: untouchedRows.length,
      docs: order(untouchedTop, await getDocumentsByIds(untouchedTop)),
    },
    duplicates: { wastedBytes: dup?.wasted ?? 0, groups: dup?.groups ?? 0 },
  };
}
