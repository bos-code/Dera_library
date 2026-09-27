export type DocumentType = "pdf" | "word" | "sheet" | "slides" | "text" | "epub" | "other";
export type DocumentStatus = "available" | "missing" | "revoked";
export type SortMode = "modified-desc" | "name-asc" | "size-desc";
export type LibraryView = "all" | "favorites" | "recent";

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
