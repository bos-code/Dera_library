import { exportLibrary } from "@/db/backup";
import { getMeta, setMeta } from "@/db/database";
import { isScannerAvailable, scanner } from "@/native/scanner";
import { logError } from "./log";

const WEEK_MS = 7 * 86_400_000;
/** Newest backups kept in the folder; older ones are removed. */
const KEEP = 4;

export interface AutoBackupState {
  folderUri: string | null;
  folderLabel: string | null;
  lastAt: number | null;
  lastError: string | null;
}

export async function getAutoBackup(): Promise<AutoBackupState> {
  const [folderUri, folderLabel, lastAt, lastError] = await Promise.all([
    getMeta("backup_tree_uri"),
    getMeta("backup_tree_label"),
    getMeta("backup_last_at"),
    getMeta("backup_error"),
  ]);
  return { folderUri, folderLabel, lastAt: lastAt ? Number(lastAt) : null, lastError };
}

/** Lets the user choose the backup folder, then writes the first backup right away. */
export async function chooseBackupFolder(): Promise<boolean> {
  const picked = await scanner().pickBackupFolder();
  if (!picked) return false;
  await setMeta("backup_tree_uri", picked.uri);
  await setMeta("backup_tree_label", picked.label);
  await backupNow();
  return true;
}

export async function turnOffAutoBackup(): Promise<void> {
  await setMeta("backup_tree_uri", null);
  await setMeta("backup_tree_label", null);
  await setMeta("backup_error", null);
}

export async function backupNow(): Promise<"ok" | "revoked" | "error" | "off"> {
  const uri = await getMeta("backup_tree_uri");
  if (!uri || !isScannerAvailable) return "off";
  try {
    const { json } = await exportLibrary();
    const date = new Date().toISOString().slice(0, 10);
    const result = await scanner().writeBackup(uri, `dera-library-${date}-${Date.now() % 100000}.json`, json, KEEP);
    if (result === "ok") {
      await setMeta("backup_last_at", String(Date.now()));
      await setMeta("backup_error", null);
    } else {
      await setMeta(
        "backup_error",
        result === "revoked" ? "Dera lost access to the backup folder. Choose it again." : "The last backup couldn't be written.",
      );
    }
    return result;
  } catch (e) {
    logError("Automatic backup failed", e);
    await setMeta("backup_error", "The last backup couldn't be written.");
    return "error";
  }
}

/** Weekly, quietly, when the app starts. */
export async function maybeAutoBackup(): Promise<void> {
  const state = await getAutoBackup();
  if (!state.folderUri) return;
  if (state.lastAt && Date.now() - state.lastAt < WEEK_MS) return;
  await backupNow();
}
