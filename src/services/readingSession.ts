import { getMeta, setMeta } from "@/db/database";
import { addSession } from "@/db/reading";
import { haptic } from "@/lib/haptics";
import { displayTitle } from "@/lib/title";
import { getState, notifyLibraryChanged, setState } from "@/state/store";
import type { DocumentRecord } from "@/types/document";

/**
 * Estimates reading time for documents opened in other apps: the clock starts when Dera hands the file over
 * and stops when the user comes back. Android doesn't report what happens inside the other app, so the user
 * confirms or adjusts the estimate before it's saved.
 */

const KEY = "reading_pending";
/** Shorter trips (a quick peek, an accidental open) aren't worth asking about. */
const MIN_MS = 10_000;
/** Longest believable single session; anything above is capped. */
const CAP_MS = 2 * 60 * 60_000;
/** Beyond this the phone was probably left alone; ask instead of guessing. */
const UNKNOWN_AFTER_MS = 3 * 60 * 60_000;

interface Pending {
  documentId: number;
  documentName: string;
  startedAt: number;
}

let pending: Pending | null = null;

export async function beginReading(doc: DocumentRecord): Promise<void> {
  pending = { documentId: doc.id, documentName: displayTitle(doc.name), startedAt: Date.now() };
  // Persisted too: Android may kill Dera while the other app is in front.
  await setMeta(KEY, JSON.stringify(pending));
}

/** Call when Dera returns to the foreground (and on launch). Raises the confirm prompt if a session ended. */
export async function finishReading(now = Date.now()): Promise<void> {
  let p = pending;
  if (!p) {
    const raw = await getMeta(KEY);
    if (raw) {
      try {
        p = JSON.parse(raw) as Pending;
      } catch {
        p = null;
      }
    }
  }
  if (!p) return;
  pending = null;
  await setMeta(KEY, null);
  const elapsed = now - p.startedAt;
  if (elapsed < MIN_MS) return;
  // A running focus session is already timing this reading; don't count it twice.
  if (getState().focus) return;
  setState({
    readingPrompt: { ...p, suggestedMs: elapsed > UNKNOWN_AFTER_MS ? null : Math.min(elapsed, CAP_MS) },
  });
}

export async function saveReading(prompt: Pending, durationMs: number, source: "estimate" | "manual" = "estimate") {
  setState({ readingPrompt: null });
  haptic.success();
  await addSession({ ...prompt, durationMs, source });
  notifyLibraryChanged();
}

export function discardReading(): void {
  setState({ readingPrompt: null });
}
