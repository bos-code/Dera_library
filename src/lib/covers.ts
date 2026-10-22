import { useEffect, useState } from "react";
import { isScannerAvailable, scanner } from "@/native/scanner";
import type { DocumentRecord } from "@/types/document";

/** Formats the native module can pull a cover from. */
const COVER_EXTENSIONS = new Set(["pdf", "epub", "docx", "xlsx", "pptx", "odt", "ods", "odp"]);
/** Covers are rendered at one width and scaled down on screen, so each file is rendered once. */
const COVER_WIDTH = 360;
const MAX_CONCURRENT = 2;

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
const queue: Array<() => void> = [];
let running = 0;

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++;
      task()
        .then(resolve, reject)
        .finally(() => {
          running--;
          queue.shift()?.();
        });
    };
    if (running < MAX_CONCURRENT) run();
    else queue.push(run);
  });
}

export function supportsCover(doc: Pick<DocumentRecord, "extension">): boolean {
  return COVER_EXTENSIONS.has(doc.extension.toLowerCase());
}

function coverKey(doc: DocumentRecord) {
  return `${doc.id}-${doc.size}-${Math.floor(doc.modifiedAt / 1000)}`;
}

export function loadCover(doc: DocumentRecord): Promise<string | null> {
  if (!isScannerAvailable || !supportsCover(doc) || doc.status !== "available") return Promise.resolve(null);
  const key = coverKey(doc);
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  let pending = inflight.get(key);
  if (!pending) {
    pending = schedule(() => scanner().getThumbnail(doc.uri, doc.extension, key, COVER_WIDTH))
      .catch(() => null)
      .then((uri) => {
        cache.set(key, uri);
        inflight.delete(key);
        return uri;
      });
    inflight.set(key, pending);
  }
  return pending;
}

/**
 * Cover image URI for a document: undefined while loading, null when it has none.
 * Keyed state so a recycled list cell never shows the previous document's cover.
 */
export function useCover(doc: DocumentRecord): string | null | undefined {
  const key = coverKey(doc);
  const supported = supportsCover(doc) && doc.status === "available";
  const [loaded, setLoaded] = useState<{ key: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!supported || cache.has(key)) return;
    let alive = true;
    void loadCover(doc).then((uri) => alive && setLoaded({ key, uri }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, supported]);
  if (!supported) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  return loaded?.key === key ? loaded.uri : undefined;
}

export async function clearCovers(): Promise<void> {
  cache.clear();
  if (isScannerAvailable) await scanner().clearThumbnails();
}
