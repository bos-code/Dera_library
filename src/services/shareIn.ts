import { router } from "expo-router";
import { insertDocuments } from "@/db/documents";
import { isScannerAvailable, scanner, type ScannedItem } from "@/native/scanner";
import { notifyLibraryChanged } from "@/state/store";
import { showToast } from "./toast";

let busy = false;

/**
 * Picks up documents another app shared to Dera ("Share → Dera Library"). Shared links only stay readable
 * briefly, so each file is saved into Documents/Dera Library and added to the Inbox for filing.
 */
export async function handleIncomingShares(): Promise<void> {
  if (!isScannerAvailable || busy) return;
  busy = true;
  try {
    const uris = scanner().takeSharedUris();
    if (!uris.length) return;
    const saved: ScannedItem[] = [];
    for (const uri of uris) {
      const item = await scanner().saveSharedFile(uri);
      if (item) saved.push(item);
    }
    if (!saved.length) {
      showToast("Couldn't read the shared file");
      return;
    }
    await insertDocuments(saved, { inbox: true });
    notifyLibraryChanged();
    showToast(`${saved.length === 1 ? `“${saved[0].name}”` : `${saved.length} documents`} added to your Inbox`, {
      label: "Open",
      run: () => router.push("/inbox"),
    });
  } catch (e) {
    showToast(e instanceof Error ? e.message : "Couldn't add the shared file");
  } finally {
    busy = false;
  }
}
