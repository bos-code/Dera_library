import { recordOpen } from "@/db/activity";
import { setDocumentStatus } from "@/db/documents";
import { NativeUnavailableError, scanner } from "@/native/scanner";
import { notifyLibraryChanged } from "@/state/store";
import type { DocumentRecord } from "@/types/document";

export interface OpenResult {
  ok: boolean;
  title?: string;
  message?: string;
}

const VIEWER_HINT: Record<string, string> = {
  pdf: "a PDF reader such as Google PDF Viewer or Adobe Acrobat",
  word: "an office app such as Microsoft Word, Google Docs or WPS Office",
  sheet: "a spreadsheet app such as Microsoft Excel, Google Sheets or WPS Office",
  slides: "a presentation app such as Microsoft PowerPoint, Google Slides or WPS Office",
  epub: "an e-book reader such as Google Play Books or ReadEra",
  text: "a text editor or office app",
};

/** Opens a document in another app, updating its status and history. Never throws. */
export async function openDocument(doc: DocumentRecord): Promise<OpenResult> {
  try {
    const status = await scanner().openDocument(doc.uri, doc.mimeType);
    switch (status) {
      case "opened":
        await recordOpen(doc.id);
        if (doc.status !== "available") await setDocumentStatus(doc.id, "available");
        notifyLibraryChanged();
        return { ok: true };
      case "missing":
        await setDocumentStatus(doc.id, "missing");
        notifyLibraryChanged();
        return {
          ok: false,
          title: "File not found",
          message: `“${doc.name}” was moved or deleted. Its collections and tags are kept, and a rescan will reconnect it if it turns up elsewhere.`,
        };
      case "revoked":
        await setDocumentStatus(doc.id, "revoked");
        notifyLibraryChanged();
        return {
          ok: false,
          title: "Access was removed",
          message: "Dera Library can no longer read this file. Grant storage access again in Settings → Storage access.",
        };
      case "no_viewer":
        return {
          ok: false,
          title: "No app can open this",
          message: `Install ${VIEWER_HINT[doc.type] ?? "an app that opens ." + doc.extension + " files"}, then try again.`,
        };
      default:
        return { ok: false, title: "Unsupported document", message: "This document can't be handed to another app." };
    }
  } catch (e) {
    if (e instanceof NativeUnavailableError) return { ok: false, title: "Not available", message: e.message };
    return { ok: false, title: "Couldn't open document", message: e instanceof Error ? e.message : "Unknown error" };
  }
}
