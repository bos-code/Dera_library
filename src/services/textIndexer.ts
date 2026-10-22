import { getContentSettings, getIndexStats, nextPending, saveExtraction } from "@/db/contentIndex";
import { invalidateContentIndexSetting } from "@/db/documents";
import { isScannerAvailable, scanner } from "@/native/scanner";
import { notifyLibraryChanged, setState } from "@/state/store";

/** Plenty for search (roughly 75 pages of prose) while keeping the index small. */
const MAX_CHARS = 150_000;
/** Scanned PDFs: how many pages text recognition reads. */
const OCR_PAGES = 12;
const BATCH = 10;

let running = false;
let paused = false;

/**
 * Reads document text in the background, one file at a time, so search can look inside documents.
 * Safe to call often: only one run happens at a time, and it stops when there's nothing left or the app pauses it.
 */
export async function runTextIndexer(): Promise<void> {
  if (running || !isScannerAvailable) return;
  const settings = await getContentSettings();
  if (!settings.available || !settings.enabled) return;
  running = true;
  paused = false;
  try {
    let stats = await getIndexStats();
    let sinceRefresh = 0;
    while (!paused) {
      const batch = await nextPending(BATCH);
      if (!batch.length) break;
      setState({ indexing: { done: stats.done, total: stats.total } });
      for (const doc of batch) {
        if (paused) break;
        const result = await scanner().extractText(doc.uri, doc.extension, MAX_CHARS, settings.ocr ? OCR_PAGES : 0);
        await saveExtraction(doc.id, result, result.ocr);
        stats = { ...stats, done: stats.done + 1 };
        setState({ indexing: { done: stats.done, total: stats.total } });
        // Refresh visible lists now and then so page counts and search results appear as they're ready.
        if (++sinceRefresh >= 25) {
          sinceRefresh = 0;
          notifyLibraryChanged();
        }
      }
    }
  } catch (e) {
    console.warn("Text indexing stopped", e);
  } finally {
    running = false;
    setState({ indexing: null });
    notifyLibraryChanged();
  }
}

/** Called when the app goes to the background; the next run resumes where it left off. */
export function pauseTextIndexer(): void {
  paused = true;
}

export function contentSettingsChanged(): void {
  invalidateContentIndexSetting();
}
