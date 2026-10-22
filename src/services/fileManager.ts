import { Alert } from "react-native";
import { findDocumentByPath, setDocumentStatus, updateDocumentFile } from "@/db/documents";
import { haptic } from "@/lib/haptics";
import { isScannerAvailable, scanner, type Conflict, type FileOpResult } from "@/native/scanner";
import { getState, notifyLibraryChanged } from "@/state/store";
import type { DocumentRecord } from "@/types/document";
import { showToast, showUndo } from "./toast";

/** Trash older than this is emptied for good (matches how long missing documents are kept). */
export const TRASH_DAYS = 30;

/** Real file operations need the file's path and All files access (or legacy storage). */
export function canManageFiles(doc: Pick<DocumentRecord, "path" | "status">): boolean {
  return isScannerAvailable && !!doc.path && doc.status === "available" && !!getState().access?.allFilesAccess;
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function askConflict(name: string): Promise<Conflict | null> {
  return new Promise((resolve) =>
    Alert.alert(`“${name}” already exists`, "There's already a file with this name in that folder.", [
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
      { text: "Replace", style: "destructive", onPress: () => resolve("replace") },
      { text: "Keep both", onPress: () => resolve("rename") },
    ]),
  );
}

/** Runs an operation, asking what to do if the target name is taken. Null when the user cancels. */
async function withConflict(name: string, op: (c: Conflict) => Promise<FileOpResult>): Promise<FileOpResult | null> {
  const first = await op("fail");
  if (first.status !== "exists") return first;
  const choice = await askConflict(name);
  return choice ? op(choice) : null;
}

function explain(r: FileOpResult): string {
  switch (r.status) {
    case "missing":
      return "The file is no longer there.";
    case "forbidden":
      return "Dera can't change files in that location.";
    case "invalid":
      return r.message ?? "That name can't be used.";
    default:
      return r.message ?? "Something went wrong.";
  }
}

async function relink(id: number, path: string): Promise<void> {
  const item = await scanner().describeFile(path);
  if (item) await updateDocumentFile(id, item);
}

/** Renames the real file. The extension is kept unless the user typed one. */
export async function renameDocumentFile(doc: DocumentRecord, newName: string): Promise<void> {
  if (!doc.path) return;
  const ext = `.${doc.extension}`;
  const name = newName.trim().toLowerCase().endsWith(ext.toLowerCase()) ? newName.trim() : `${newName.trim()}${ext}`;
  const oldName = baseName(doc.path);
  const r = await withConflict(name, (c) => scanner().renameFile(doc.path!, name, c));
  if (!r) return;
  if (r.status !== "ok" || !r.path) return void Alert.alert("Couldn't rename", explain(r));
  await relink(doc.id, r.path);
  haptic.success();
  notifyLibraryChanged();
  const newPath = r.path;
  showUndo(`Renamed to “${baseName(newPath)}”`, async () => {
    const back = await scanner().renameFile(newPath, oldName, "rename");
    if (back.status === "ok" && back.path) await relink(doc.id, back.path);
  });
}

/** Moves real files into a folder; their library entries (and organization) follow. */
export async function moveDocumentFiles(docs: DocumentRecord[], destDir: string): Promise<void> {
  const moved: Array<{ id: number; from: string; to: string }> = [];
  for (const doc of docs) {
    if (!doc.path) continue;
    const r = await withConflict(baseName(doc.path), (c) => scanner().moveFile(doc.path!, destDir, c));
    if (!r) continue;
    if (r.status !== "ok" || !r.path) {
      Alert.alert(`Couldn't move “${baseName(doc.path)}”`, explain(r));
      continue;
    }
    if (r.path !== doc.path) {
      await relink(doc.id, r.path);
      moved.push({ id: doc.id, from: dirOf(doc.path), to: r.path });
    }
  }
  if (!moved.length) return;
  haptic.success();
  notifyLibraryChanged();
  showUndo(
    `Moved ${moved.length === 1 ? `“${baseName(moved[0].to)}”` : `${moved.length} files`} to ${baseName(destDir)}`,
    async () => {
      for (const m of moved) {
        const back = await scanner().moveFile(m.to, m.from, "rename");
        if (back.status === "ok" && back.path) await relink(m.id, back.path);
      }
    },
  );
}

/** Moves real files to Dera's trash (restorable for 30 days). Their entries are kept, hidden, with organization. */
export async function trashDocumentFiles(docs: DocumentRecord[]): Promise<void> {
  const trashed: Array<{ id: number; trashPath: string }> = [];
  for (const doc of docs) {
    if (!doc.path) continue;
    const r = await scanner().trashFile(doc.path);
    if (r.status !== "ok" || !r.path) {
      Alert.alert(`Couldn't move “${baseName(doc.path)}” to trash`, explain(r));
      continue;
    }
    await setDocumentStatus(doc.id, "missing");
    trashed.push({ id: doc.id, trashPath: r.path });
  }
  if (!trashed.length) return;
  haptic.tap();
  notifyLibraryChanged();
  showUndo(`${trashed.length === 1 ? "1 file" : `${trashed.length} files`} moved to trash`, async () => {
    for (const t of trashed) {
      const back = await scanner().restoreFromTrash(t.trashPath, "rename");
      if (back.status === "ok" && back.path) await relink(t.id, back.path);
    }
  });
}

/** Restores from the Trash screen; reconnects the library entry if there is one. */
export async function restoreTrashItem(trashPath: string, name: string): Promise<boolean> {
  const r = await withConflict(name, (c) => scanner().restoreFromTrash(trashPath, c));
  if (!r) return false;
  if (r.status !== "ok" || !r.path) {
    Alert.alert("Couldn't restore", explain(r));
    return false;
  }
  const existing = await findDocumentByPath(r.path);
  if (existing) await relink(existing.id, r.path);
  notifyLibraryChanged();
  showToast(`Restored “${baseName(r.path)}”`);
  return true;
}

export async function createFolderIn(parent: string, name: string): Promise<string | null> {
  const r = await scanner().createFolder(parent, name);
  if (r.status === "ok" && r.path) return r.path;
  Alert.alert("Couldn't create the folder", r.status === "exists" ? "A folder with that name already exists." : explain(r));
  return null;
}

/** Permanently removes trash older than 30 days. Runs quietly at startup. */
export async function emptyOldTrash(): Promise<void> {
  if (!isScannerAvailable || !getState().access?.allFilesAccess) return;
  try {
    await scanner().emptyTrash(TRASH_DAYS * 86_400_000);
  } catch {
    // Housekeeping only.
  }
}

export function shareDocuments(docs: DocumentRecord[]): void {
  const available = docs.filter((d) => d.status === "available");
  if (!available.length) return;
  try {
    scanner().shareDocuments(
      available.map((d) => d.uri),
      available.map((d) => d.mimeType),
    );
  } catch (e) {
    Alert.alert("Couldn't share", e instanceof Error ? e.message : String(e));
  }
}

/** PDFs go to Android's print system; other formats print from the app that opens them. */
export async function printDocument(doc: DocumentRecord, title: string, openIt: () => void): Promise<void> {
  if (doc.extension.toLowerCase() !== "pdf") {
    Alert.alert("Print from its app", "Dera prints PDFs directly. For this format, open it and use that app's Print option.", [
      { text: "Cancel", style: "cancel" },
      { text: "Open", onPress: openIt },
    ]);
    return;
  }
  const r = await scanner().printPdf(doc.uri, title);
  if (r !== "ok") Alert.alert("Printing isn't available", "Android's print service couldn't be reached.");
}
