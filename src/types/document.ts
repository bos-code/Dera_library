export type DocumentType = "pdf" | "word" | "sheet" | "slides" | "text" | "epub" | "other";
export type DocumentStatus = "available" | "missing" | "revoked";
export type SortMode =
  "modified-desc" | "modified-asc" | "name-asc" | "name-desc" | "size-desc" | "size-asc" | "opened-desc" | "added-desc";
export type LibraryView = "all" | "favorites" | "recent";
export type ReadingStatus = "to-read" | "reading" | "done";

export interface DocumentRecord {
  id: number;
  uri: string;
  path: string | null;
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  modifiedAt: number;
  folder: string | null;
  type: DocumentType;
  sourceId: string;
  status: DocumentStatus;
  missingSince: number | null;
  lastOpenedAt: number | null;
  isFavorite: number;
  readingStatus: ReadingStatus | null;
  pageCount: number | null;
  /** The user's own title; the file itself is never renamed. */
  customTitle: string | null;
  note: string | null;
  /** 1 while a newly found document waits in the Inbox to be filed. */
  inbox: number;
  wordCount: number | null;
  /** Excerpt around a text match, with matches wrapped in \u0001 … \u0002. Only set by text searches. */
  snippet?: string;
}

export interface ScanSummary {
  added: number;
  updated: number;
  relinked: number;
  missing: number;
  restored: number;
  skipped: boolean;
  warning: string | null;
}
