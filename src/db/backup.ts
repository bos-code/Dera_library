import { typeForExtension } from "@/lib/fileTypes";
import { getDb } from "./database";
import { ensureTag } from "./tags";

const FORMAT = "dera-library-backup";
const FORMAT_VERSION = 1;

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
}

interface Backup {
  format: typeof FORMAT;
  version: number;
  exportedAt: number;
  collections: Array<{ id: string; name: string; parentId: string | null; createdAt: number }>;
  tags: Array<{ id: string; name: string }>;
  documents: BackupDocument[];
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
            d.folder, d.last_opened_at AS lastOpenedAt, (f.document_id IS NOT NULL) AS favorite
     FROM documents d LEFT JOIN favorites f ON f.document_id = d.id
     WHERE f.document_id IS NOT NULL
        OR d.id IN (SELECT document_id FROM document_tags)
        OR d.id IN (SELECT document_id FROM collection_documents)`,
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
    })),
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
  });
  return result;
}
