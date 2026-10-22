import type { DocumentType, LibraryView, ReadingStatus, SortMode } from "@/types/document";
import { getDb, newId } from "./database";
import { searchDocuments, type SmartShelf } from "./documents";

/** The Library filters a saved search remembers. */
export interface SavedQuery {
  text?: string;
  type?: DocumentType | "all";
  view?: LibraryView;
  shelf?: SmartShelf | null;
  sort?: SortMode;
  readingStatus?: ReadingStatus;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: SavedQuery;
  createdAt: number;
}

interface Row {
  id: string;
  name: string;
  query: string;
  created_at: number;
}

const parse = (r: Row): SavedSearch => {
  let query: SavedQuery = {};
  try {
    query = JSON.parse(r.query) as SavedQuery;
  } catch {
    // A damaged entry shows everything rather than breaking the screen.
  }
  return { id: r.id, name: r.name, query, createdAt: r.created_at };
};

export async function getSavedSearches(): Promise<SavedSearch[]> {
  const db = await getDb();
  return (
    await db.getAllAsync<Row>("SELECT id, name, query, created_at FROM saved_searches ORDER BY sort_order, name COLLATE NOCASE")
  ).map(parse);
}

export async function getSavedSearch(id: string): Promise<SavedSearch | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>("SELECT id, name, query, created_at FROM saved_searches WHERE id=?", id);
  return row ? parse(row) : null;
}

export async function saveSearch(name: string, query: SavedQuery): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error("Give the smart collection a name");
  const db = await getDb();
  const id = newId("ss");
  await db.runAsync(
    "INSERT INTO saved_searches(id,name,query,created_at) VALUES(?,?,?,?)",
    id,
    clean,
    JSON.stringify(query),
    Date.now(),
  );
  return id;
}

export async function renameSavedSearch(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error("Name is required");
  const db = await getDb();
  await db.runAsync("UPDATE saved_searches SET name=? WHERE id=?", clean, id);
}

export async function deleteSavedSearch(id: string): Promise<SavedSearch | null> {
  const existing = await getSavedSearch(id);
  const db = await getDb();
  await db.runAsync("DELETE FROM saved_searches WHERE id=?", id);
  return existing;
}

export async function restoreSavedSearch(s: SavedSearch): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR IGNORE INTO saved_searches(id,name,query,created_at) VALUES(?,?,?,?)",
    s.id,
    s.name,
    JSON.stringify(s.query),
    s.createdAt,
  );
}

export function runSavedSearch(q: SavedQuery) {
  return searchDocuments({
    text: q.text,
    type: q.type,
    view: q.view,
    shelf: q.shelf,
    sort: q.sort,
    readingStatus: q.readingStatus,
  });
}

/** Live counts for the Collections tab. */
export async function getSavedSearchCounts(searches: SavedSearch[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const s of searches) counts.set(s.id, (await runSavedSearch(s.query)).length);
  return counts;
}
