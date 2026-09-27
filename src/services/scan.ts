import { applyScan, markSourceRevoked, purgeStaleMissing } from "@/db/documents";
import { setMeta } from "@/db/database";
import { addTreeSource, ensurePickedSource, getPickedUris, getSources, markSourceScanned, PICKED_SOURCE_ID } from "@/db/sources";
import { scanner } from "@/native/scanner";
import { getState, notifyLibraryChanged, setState } from "@/state/store";
import type { ScanSummary } from "@/types/document";
import { refreshAccess } from "./access";

const emptySummary = (): ScanSummary => ({
  added: 0,
  updated: 0,
  relinked: 0,
  missing: 0,
  restored: 0,
  skipped: false,
  warning: null,
});

function merge(total: ScanSummary, part: ScanSummary): void {
  total.added += part.added;
  total.updated += part.updated;
  total.relinked += part.relinked;
  total.missing += part.missing;
  total.restored += part.restored;
  total.skipped ||= part.skipped;
  total.warning = [total.warning, part.warning].filter(Boolean).join("\n") || null;
}

async function withScanState(task: (total: ScanSummary) => Promise<void>): Promise<ScanSummary | null> {
  if (getState().scanning) return null;
  setState({ scanning: true, progress: { found: 0, folder: null }, scanError: null });
  const total = emptySummary();
  let sub: { remove(): void } | null = null;
  try {
    sub = scanner().addListener("onScanProgress", (progress) => setState({ progress }));
    await task(total);
    const now = Date.now();
    await setMeta("last_scan_at", String(now));
    setState({ lastSummary: total, lastScanAt: now });
    return total;
  } catch (e) {
    setState({ scanError: e instanceof Error ? e.message : "The scan failed." });
    return null;
  } finally {
    sub?.remove();
    setState({ scanning: false, progress: null });
    notifyLibraryChanged();
  }
}

async function scanSource(
  source: { id: string; kind: "tree" | "files"; uri: string | null },
  total: ScanSummary,
  force: boolean,
) {
  if (source.kind === "files") {
    const uris = await getPickedUris();
    const items = await scanner().describeUris(uris);
    merge(total, await applyScan({ sourceId: PICKED_SOURCE_ID, items, force }));
    await markSourceScanned(source.id, "ok");
    return;
  }
  if (!source.uri) return;
  const res = await scanner().scanTree(source.uri);
  if (res.status !== "ok") {
    await markSourceRevoked(source.id);
    await markSourceScanned(source.id, res.status);
    return;
  }
  merge(total, await applyScan({ sourceId: source.id, items: res.items, force }));
  await markSourceScanned(source.id, "ok");
}

/** Scans device storage and every added folder, then reconciles each into the index. */
export function scanLibrary(options: { force?: boolean } = {}) {
  const force = !!options.force;
  return withScanState(async (total) => {
    refreshAccess();
    const device = await scanner().scanDevice();
    merge(total, await applyScan({ sourceId: "device", items: device.items, deviceMode: device.mode, force }));
    for (const source of await getSources()) await scanSource(source, total, force);
    await purgeStaleMissing();
  });
}

/** Lets the user grant a folder through the system picker, then indexes it. Returns false if cancelled. */
export async function addFolder(): Promise<boolean> {
  const picked = await scanner().pickFolder();
  if (!picked) return false;
  const id = await addTreeSource(picked.uri, picked.label);
  await withScanState(async (total) => scanSource({ id, kind: "tree", uri: picked.uri }, total, false));
  return true;
}

/** Adds individually picked files (useful for folders Android won't share, like the Download root). */
export async function addFiles(): Promise<number> {
  const uris = await scanner().pickFiles();
  if (!uris?.length) return 0;
  await ensurePickedSource();
  await withScanState(async (total) => {
    const known = await getPickedUris();
    const items = await scanner().describeUris([...new Set([...known, ...uris])]);
    merge(total, await applyScan({ sourceId: PICKED_SOURCE_ID, items }));
  });
  return uris.length;
}
