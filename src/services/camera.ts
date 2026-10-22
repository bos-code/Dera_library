import { router } from "expo-router";
import { Alert } from "react-native";
import { findDocumentByPath, insertDocuments } from "@/db/documents";
import { haptic } from "@/lib/haptics";
import { isScannerAvailable, scanner } from "@/native/scanner";
import { notifyLibraryChanged } from "@/state/store";
import { logError } from "./log";
import { runTextIndexer } from "./textIndexer";

/** Paper to PDF with the camera; the scan joins the library and opens so it can be filed. */
export async function scanWithCamera(): Promise<void> {
  if (!isScannerAvailable) return;
  try {
    const item = await scanner().scanDocument();
    if (!item) return;
    const [id] = await insertDocuments([item], { inbox: false });
    const docId = id ?? (item.path ? (await findDocumentByPath(item.path))?.id : undefined);
    haptic.success();
    notifyLibraryChanged();
    // Scans have no text layer: text recognition makes them searchable in the background.
    void runTextIndexer();
    if (docId) router.push({ pathname: "/document/[id]", params: { id: String(docId) } });
  } catch (e) {
    logError("Camera scan failed", e);
    Alert.alert(
      "Scanner not available",
      "The document scanner needs Google Play services. If it was just installed, try again in a moment.",
    );
  }
}
