import { router } from "expo-router";
import { Alert } from "react-native";
import { getState } from "@/state/store";
import type { DocumentRecord } from "@/types/document";
import { openDocument } from "./open";

export function showDetails(doc: Pick<DocumentRecord, "id">): void {
  router.push({ pathname: "/document/[id]", params: { id: String(doc.id) } });
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
