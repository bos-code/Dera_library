import { clearInbox } from "./inbox";
import { getDb, newId } from "./database";

export interface Collection {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Documents directly in this collection. */
  documentCount: number;
}

export interface CollectionNode extends Collection {
  children: CollectionNode[];
  depth: number;
  /** Distinct documents in this collection and all nested ones. */
  totalCount: number;
}

export async function getAllCollections(): Promise<Collection[]> {
  const db = await getDb();
  return db.getAllAsync<Collection>(
    `SELECT c.id, c.name, c.parent_id AS parentId, c.created_at AS createdAt, c.updated_at AS updatedAt,
            (SELECT COUNT(*) FROM collection_documents cd JOIN documents d ON d.id = cd.document_id
              WHERE cd.collection_id = c.id AND d.status = 'available') AS documentCount
     FROM collections c ORDER BY c.sort_order, c.name COLLATE NOCASE`,
  );
}

export function buildTree(all: Collection[]): CollectionNode[] {
  const nodes = new Map<string, CollectionNode>();
  for (const c of all) nodes.set(c.id, { ...c, children: [], depth: 0, totalCount: c.documentCount });
  const roots: CollectionNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const walk = (list: CollectionNode[], depth: number): number => {
    let sum = 0;
    for (const n of list) {
      n.depth = depth;
      n.totalCount = n.documentCount + walk(n.children, depth + 1);
      sum += n.totalCount;
    }
    return sum;
  };
  walk(roots, 0);
  return roots;
}

/** Depth-first flattening, used for pickers. */
export function flattenTree(roots: CollectionNode[]): CollectionNode[] {
  const out: CollectionNode[] = [];
  const visit = (n: CollectionNode) => {
    out.push(n);
    n.children.forEach(visit);
  };
  roots.forEach(visit);
  return out;
}

export async function getCollection(id: string): Promise<Collection | null> {
  const all = await getAllCollections();
  return all.find((c) => c.id === id) ?? null;
}

/** Ancestors from root to the collection itself, for breadcrumbs. */
export async function getCollectionPath(id: string): Promise<Collection[]> {
  const all = await getAllCollections();
  const byId = new Map(all.map((c) => [c.id, c]));
  const path: Collection[] = [];
  let cur = byId.get(id);
  while (cur && path.length < 64) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

export async function createCollection(name: string, parentId: string | null = null): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error("Collection name is required");
  const db = await getDb();
  const now = Date.now();
  const id = newId("col");
  await db.runAsync(
    "INSERT INTO collections(id,name,parent_id,created_at,updated_at) VALUES(?,?,?,?,?)",
    id,
    clean,
    parentId,
    now,
    now,
  );
  return id;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error("Collection name is required");
  const db = await getDb();
  await db.runAsync("UPDATE collections SET name=?, updated_at=? WHERE id=?", clean, Date.now(), id);
}

export async function moveCollection(id: string, newParentId: string | null): Promise<void> {
  if (newParentId === id) throw new Error("A collection can't be inside itself");
  const db = await getDb();
  if (newParentId) {
    const path = await getCollectionPath(newParentId);
    if (path.some((c) => c.id === id)) throw new Error("A collection can't be moved inside one of its own sub-collections");
  }
  await db.runAsync("UPDATE collections SET parent_id=?, updated_at=? WHERE id=?", newParentId, Date.now(), id);
}

/** Deletes the collection and its sub-collections. Documents and files are never affected. */
export async function deleteCollection(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM collections WHERE id=?", id);
}

export async function addDocumentsToCollection(collectionId: string, documentIds: number[]): Promise<void> {
  await clearInbox(documentIds);
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const docId of documentIds) {
      await db.runAsync(
        "INSERT OR IGNORE INTO collection_documents(collection_id,document_id,added_at) VALUES(?,?,?)",
        collectionId,
        docId,
        now,
      );
    }
  });
}

export async function removeDocumentsFromCollection(collectionId: string, documentIds: number[]): Promise<void> {
  if (!documentIds.length) return;
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM collection_documents WHERE collection_id=? AND document_id IN (${documentIds.map(() => "?").join(",")})`,
    collectionId,
    ...documentIds,
  );
}

export async function getDocumentCollectionIds(documentId: number): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(
    "SELECT collection_id AS id FROM collection_documents WHERE document_id=?",
    documentId,
  );
  return rows.map((r) => r.id);
}

/** Sets exactly which collections one document belongs to. */
export async function setDocumentCollections(documentId: number, collectionIds: string[]): Promise<void> {
  if (collectionIds.length) await clearInbox([documentId]);
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM collection_documents WHERE document_id=?", documentId);
    for (const cid of collectionIds) {
      await db.runAsync(
        "INSERT OR IGNORE INTO collection_documents(collection_id,document_id,added_at) VALUES(?,?,?)",
        cid,
        documentId,
        now,
      );
    }
  });
}

export interface CollectionSnapshot {
  /** Parent-first, so restoring never references a missing parent. */
  collections: Array<{
    id: string;
    name: string;
    parent_id: string | null;
    created_at: number;
    updated_at: number;
    sort_order: number;
  }>;
  links: Array<{ collection_id: string; document_id: number; added_at: number }>;
}

/** The collection, all its sub-collections and their memberships: everything deleting it removes. */
export async function snapshotCollection(id: string): Promise<CollectionSnapshot> {
  const db = await getDb();
  const all = await db.getAllAsync<CollectionSnapshot["collections"][number]>(
    "SELECT id, name, parent_id, created_at, updated_at, sort_order FROM collections",
  );
  const subtree: CollectionSnapshot["collections"] = [];
  const queue = all.filter((c) => c.id === id);
  while (queue.length) {
    const c = queue.shift()!;
    subtree.push(c);
    queue.push(...all.filter((x) => x.parent_id === c.id));
  }
  const ids = subtree.map((c) => c.id);
  const links = ids.length
    ? await db.getAllAsync<CollectionSnapshot["links"][number]>(
        `SELECT collection_id, document_id, added_at FROM collection_documents WHERE collection_id IN (${ids.map(() => "?").join(",")})`,
        ...ids,
      )
    : [];
  return { collections: subtree, links };
}

export async function restoreCollection(snapshot: CollectionSnapshot): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const c of snapshot.collections) {
      await db.runAsync(
        `INSERT OR IGNORE INTO collections(id,name,parent_id,created_at,updated_at,sort_order)
         SELECT ?,?,?,?,?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM collections WHERE id=?)`,
        c.id,
        c.name,
        c.parent_id,
        c.created_at,
        c.updated_at,
        c.sort_order,
        c.parent_id,
        c.parent_id,
      );
    }
    for (const l of snapshot.links) {
      await db.runAsync(
        "INSERT OR IGNORE INTO collection_documents(collection_id,document_id,added_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE id=?)",
        l.collection_id,
        l.document_id,
        l.added_at,
        l.document_id,
      );
    }
  });
}

/** Up to `per` most recently added available document ids per collection, for cover previews. */
export async function getCollectionPreviewIds(per = 3): Promise<Map<string, number[]>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ collection_id: string; document_id: number }>(
    `SELECT collection_id, document_id FROM (
       SELECT cd.collection_id, cd.document_id,
              ROW_NUMBER() OVER (PARTITION BY cd.collection_id ORDER BY cd.added_at DESC, cd.document_id) AS rn
       FROM collection_documents cd JOIN documents d ON d.id = cd.document_id
       WHERE d.status = 'available'
     ) WHERE rn <= ?`,
    per,
  );
  const out = new Map<string, number[]>();
  for (const r of rows) out.set(r.collection_id, [...(out.get(r.collection_id) ?? []), r.document_id]);
  return out;
}
