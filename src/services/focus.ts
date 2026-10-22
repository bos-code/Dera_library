import { PermissionsAndroid, Platform } from "react-native";
import { getDocument } from "@/db/documents";
import { getMeta, setMeta } from "@/db/database";
import { addSession } from "@/db/reading";
import { haptic } from "@/lib/haptics";
import { docTitle } from "@/lib/title";
import { isScannerAvailable, scanner } from "@/native/scanner";
import { getState, notifyLibraryChanged, setState, type FocusSession } from "@/state/store";
import type { DocumentRecord } from "@/types/document";
import { openDocument, type OpenResult } from "./open";

const KEY = "focus_session";
/** A forgotten timer shouldn't log a whole night. */
const MAX_MS = 4 * 60 * 60_000;

/** Restores a running session after Dera was closed or killed. */
export async function loadFocus(): Promise<void> {
  const raw = await getMeta(KEY);
  if (!raw) return;
  try {
    setState({ focus: JSON.parse(raw) as FocusSession });
  } catch {
    await setMeta(KEY, null);
  }
}

/** Android 13+ asks before an app may post notifications. Declining still lets the in-app timer work. */
async function allowNotifications(): Promise<void> {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) return;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) return;
  await PermissionsAndroid.request(permission, {
    title: "Show the focus timer?",
    message: "Dera shows a countdown while you read in another app and tells you when the session is over.",
    buttonPositive: "Allow",
    buttonNegative: "Not now",
  });
}

function showNotification(focus: FocusSession) {
  if (!isScannerAvailable) return;
  try {
    scanner().startFocusNotification(
      focus.documentName,
      focus.startedAt,
      focus.plannedMs ? focus.startedAt + focus.plannedMs : null,
    );
  } catch {
    // Notifications are a convenience; the in-app timer still works.
  }
}

function hideNotification() {
  if (!isScannerAvailable) return;
  try {
    scanner().stopFocusNotification();
  } catch {
    // Nothing to hide.
  }
}

export async function startFocus(doc: DocumentRecord, plannedMs: number | null): Promise<OpenResult> {
  await allowNotifications();
  const focus: FocusSession = { documentId: doc.id, documentName: docTitle(doc), startedAt: Date.now(), plannedMs };
  setState({ focus });
  await setMeta(KEY, JSON.stringify(focus));
  showNotification(focus);
  const result = await openDocument(doc, { trackReading: false });
  if (!result.ok) await clearFocus();
  return result;
}

/** Re-opens the document of the running session without restarting the timer. */
export async function resumeFocus(): Promise<OpenResult | null> {
  const focus = getState().focus;
  if (!focus) return null;
  const doc = await getDocument(focus.documentId);
  if (!doc) return { ok: false, title: "Document unavailable", message: "It's no longer in your library." };
  return openDocument(doc, { trackReading: false });
}

/** Stops the timer and logs the session. Returns the saved duration (0 when discarded or too short). */
export async function stopFocus(save = true): Promise<number> {
  const focus = getState().focus;
  await clearFocus();
  if (!focus || !save) return 0;
  const durationMs = Math.min(Date.now() - focus.startedAt, MAX_MS);
  if (durationMs < 30_000) return 0;
  haptic.success();
  await addSession({
    documentId: focus.documentId,
    documentName: focus.documentName,
    startedAt: focus.startedAt,
    durationMs,
    source: "manual",
  });
  notifyLibraryChanged();
  return durationMs;
}

async function clearFocus() {
  hideNotification();
  setState({ focus: null });
  await setMeta(KEY, null);
}
