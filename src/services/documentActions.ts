import { router } from "expo-router";
import { Alert } from "react-native";
import { getState } from "@/state/store";
import type { DocumentRecord } from "@/types/document";
import { openDocument } from "./open";

export function showDetails(doc: Pick<DocumentRecord, "id">): void {
  router.push({ pathname: "/document/[id]", params: { id: String(doc.id) } });
}

/** PDFs open in Dera's reader unless the user prefers another app. */
export function opensInReader(doc: Pick<DocumentRecord, "extension" | "status">): boolean {
  return doc.extension.toLowerCase() === "pdf" && doc.status === "available" && getState().appearance.pdfReader === "dera";
}

/** The main "Open" action: built-in reader for PDFs (per setting), otherwise another app. */
export function openDocumentPreferred(doc: DocumentRecord): void {
  if (opensInReader(doc)) router.push({ pathname: "/reader/[id]", params: { id: String(doc.id) } });
  else openDocumentPreferred(doc);
}

export async function openWithFeedback(doc: DocumentRecord): Promise<void> {
  const result = await openDocument(doc);
  if (!result.ok) Alert.alert(result.title ?? "Couldn't open", result.message);
}

/** Tap on a document anywhere in the app: opens it or shows details, per the user's setting. */
export function activateDocument(doc: DocumentRecord): void {
  // Documents that can't be reached go to details, where the problem is explained.
  if (getState().appearance.tapAction === "details" || doc.status !== "available") showDetails(doc);
  else void openWithFeedback(doc);
}
