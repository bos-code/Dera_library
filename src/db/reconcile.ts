import type { ScannedItem } from "../native/scanner";
import type { DocumentStatus, ScanSummary } from "../types/document";

/** The slice of a stored document the planner needs. */
export interface IndexedDoc {
  id: number;
  uri: string;
  path: string | null;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
  sourceId: string;
  status: DocumentStatus;
}

export interface ReconcileInput {
  /** Scope being rescanned: "device" or a source id. Only documents owned by this scope can go missing. */
  sourceId: string;
  items: ScannedItem[];
  /**
   * Device scans only. In "mediastore" mode the app lacks full storage access, so file:// documents that were
   * not seen are marked "revoked" (access lost) rather than "missing" (deleted).
   */
  deviceMode?: "all-files" | "mediastore";
  /** Apply missing-marking even when the scan looks suspiciously small. */
  force?: boolean;
}

export interface ReconcilePlan {
  inserts: ScannedItem[];
  updates: Array<{ id: number; item: ScannedItem }>;
  markMissing: number[];
  markRevoked: number[];
  summary: ScanSummary;
}

/** A scan that loses more than this share of a scope's documents is treated as suspect. */
const SHRINK_GUARD_RATIO = 0.5;
const SHRINK_GUARD_MIN_DOCS = 10;

const keyOf = (item: { uri: string; path: string | null }) => item.path ?? item.uri;
const sameSecond = (a: number, b: number) => Math.floor(a / 1000) === Math.floor(b / 1000);

/**
 * Decides how a scan result changes the index without ever deleting a document row. Deleting rows would cascade
 * into collections, tags, favorites and history, so vanished documents are only flagged; purging is separate.
 *
 * Matching order: same URI, then same filesystem path (the same file seen through another API), then a relink of a
 * vanished document by name+size (moved) or size+mtime+extension (renamed).
 */
export function planReconcile(existing: IndexedDoc[], input: ReconcileInput): ReconcilePlan {
  const { sourceId } = input;
  const summary: ScanSummary = { added: 0, updated: 0, relinked: 0, missing: 0, restored: 0, skipped: false, warning: null };
  const byUri = new Map<string, IndexedDoc>();
  const byPath = new Map<string, IndexedDoc>();
  for (const doc of existing) {
    byUri.set(doc.uri, doc);
    if (doc.path) byPath.set(doc.path, doc);
  }

  // The same file can be reported twice (e.g. stale MediaStore rows); keep the first sighting.
  const seenKeys = new Set<string>();
  const items = input.items.filter((item) => {
    const key = keyOf(item);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const claimed = new Set<number>();
  const updates: ReconcilePlan["updates"] = [];
  const unmatched: ScannedItem[] = [];

  const claim = (doc: IndexedDoc, item: ScannedItem) => {
    claimed.add(doc.id);
    updates.push({ id: doc.id, item });
    if (doc.status !== "available") summary.restored++;
    else if (changed(doc, item)) summary.updated++;
  };

  for (const item of items) {
    const match = byUri.get(item.uri) ?? (item.path ? byPath.get(item.path) : undefined);
    if (!match || claimed.has(match.id)) {
      if (!match) unmatched.push(item);
      continue;
    }
    // Another scope already tracks this file and can still reach it: don't steal it, don't duplicate it.
    if (match.sourceId !== sourceId && match.status === "available" && match.uri !== item.uri) continue;
    claim(match, item);
  }

  // Documents this scan could plausibly be re-finding under a new location.
  const vanished = existing.filter((doc) => !claimed.has(doc.id) && (doc.sourceId === sourceId || doc.status !== "available"));
  const otherAvailable = existing.filter((doc) => doc.sourceId !== sourceId && doc.status === "available");

  const inserts: ScannedItem[] = [];
  for (const item of unmatched) {
    const pool = vanished.filter((doc) => !claimed.has(doc.id));
    const moved = pool.filter((doc) => doc.name === item.name && doc.size === item.size);
    const renamed = pool.filter(
      (doc) => doc.size === item.size && doc.extension === item.extension && sameSecond(doc.modifiedAt, item.modifiedAt),
    );
    const relink = moved.length === 1 ? moved[0] : moved.length === 0 && renamed.length === 1 ? renamed[0] : undefined;
    if (relink) {
      claimed.add(relink.id);
      updates.push({ id: relink.id, item });
      summary.relinked++;
      continue;
    }
    // Picked/SAF URIs without a path can duplicate a file another scope already has.
    const duplicate =
      !item.path &&
      otherAvailable.some(
        (doc) => doc.name === item.name && doc.size === item.size && sameSecond(doc.modifiedAt, item.modifiedAt),
      );
    if (duplicate) continue;
    inserts.push(item);
    summary.added++;
  }

  const gone = existing.filter((doc) => doc.sourceId === sourceId && doc.status === "available" && !claimed.has(doc.id));
  const markRevoked: number[] = [];
  const markMissing: number[] = [];
  for (const doc of gone) {
    if (input.deviceMode === "mediastore" && doc.uri.startsWith("file://")) markRevoked.push(doc.id);
    else markMissing.push(doc.id);
  }

  const availableBefore = existing.filter((doc) => doc.sourceId === sourceId && doc.status === "available").length;
  const suspicious =
    (items.length === 0 && availableBefore > 0) ||
    (availableBefore >= SHRINK_GUARD_MIN_DOCS && markMissing.length > availableBefore * SHRINK_GUARD_RATIO);
  if (suspicious && !input.force) {
    summary.skipped = true;
    summary.warning = `${markMissing.length} of ${availableBefore} documents were not found. They were kept in your library in case storage is temporarily unavailable.`;
    markMissing.length = 0;
  }
  summary.missing = markMissing.length + markRevoked.length;

  return { inserts, updates, markMissing, markRevoked, summary };
}

function changed(doc: IndexedDoc, item: ScannedItem): boolean {
  return (
    doc.uri !== item.uri ||
    doc.name !== item.name ||
    doc.size !== item.size ||
    !sameSecond(doc.modifiedAt, item.modifiedAt) ||
    doc.path !== item.path
  );
}
