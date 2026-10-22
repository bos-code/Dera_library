import { requireOptionalNativeModule } from "expo";

interface EventSubscription {
  remove(): void;
}

export interface ScannedItem {
  uri: string;
  path: string | null;
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  modifiedAt: number;
  folder: string | null;
}

export interface StorageAccess {
  sdk: number;
  allFilesAccess: boolean;
  canRequestAllFilesAccess: boolean;
  needsReadPermission: boolean;
  readPermissionGranted: boolean;
}

export type DeviceScanMode = "all-files" | "mediastore";
export type TreeScanStatus = "ok" | "revoked" | "missing";
export type AccessStatus = "ok" | "missing" | "revoked";
export type OpenStatus = "opened" | "missing" | "revoked" | "no_viewer" | "unsupported";

/** What to do when the target name already exists. */
export type Conflict = "fail" | "rename" | "replace";

export interface FileOpResult {
  status: "ok" | "exists" | "missing" | "forbidden" | "invalid" | "error";
  path: string | null;
  message: string | null;
}

export interface TrashItem {
  path: string;
  name: string;
  originalPath: string | null;
  trashedAt: number;
  size: number;
}

export interface ScanProgress {
  found: number;
  folder: string | null;
}

interface NativeScanner {
  getStorageAccess(): StorageAccess;
  openAllFilesAccessSettings(): boolean;
  scanDevice(): Promise<{ mode: DeviceScanMode; items: ScannedItem[] }>;
  scanTree(treeUri: string): Promise<{ status: TreeScanStatus; items: ScannedItem[] }>;
  describeUris(uris: string[]): Promise<ScannedItem[]>;
  pickFolder(): Promise<{ uri: string; label: string } | null>;
  pickFiles(): Promise<string[] | null>;
  releaseUri(uri: string): Promise<boolean>;
  checkDocument(uri: string): Promise<AccessStatus>;
  openDocument(uri: string, mimeType: string): Promise<OpenStatus>;
  createExportFile(fileName: string): Promise<string | null>;
  pickImportFile(): Promise<string | null>;
  writeText(uri: string, text: string): Promise<boolean>;
  readText(uri: string): Promise<string>;
  getThumbnail(uri: string, extension: string, key: string, width: number): Promise<string | null>;
  clearThumbnails(): Promise<boolean>;
  extractText(
    uri: string,
    extension: string,
    maxChars: number,
    ocrPages: number,
  ): Promise<{ status: "ok" | "empty" | "unsupported" | "error"; text: string; pages: number | null; ocr: boolean }>;
  startFocusNotification(title: string, startedAt: number, endsAt: number | null): boolean;
  stopFocusNotification(): boolean;
  // Manage files
  getStorageRoots(): Array<{ path: string; label: string }>;
  listDirectories(path: string): Promise<Array<{ name: string; path: string }>>;
  describeFile(path: string): Promise<Omit<ScannedItem, "mimeType"> | null>;
  renameFile(path: string, name: string, conflict: Conflict): Promise<FileOpResult>;
  moveFile(path: string, destDir: string, conflict: Conflict): Promise<FileOpResult>;
  createFolder(parent: string, name: string): Promise<FileOpResult>;
  trashFile(path: string): Promise<FileOpResult>;
  listTrash(): Promise<TrashItem[]>;
  restoreFromTrash(path: string, conflict: Conflict): Promise<FileOpResult>;
  deleteFromTrash(path: string): Promise<FileOpResult>;
  emptyTrash(olderThanMs: number): Promise<number>;
  // Share and print
  shareDocuments(uris: string[], mimeTypes: string[]): string;
  takeSharedUris(): string[];
  saveSharedFile(uri: string): Promise<ScannedItem | null>;
  printPdf(uri: string, jobName: string): Promise<"ok" | "unavailable">;
  addListener(event: "onScanProgress", listener: (p: ScanProgress) => void): EventSubscription;
  addListener(event: "onShare", listener: () => void): EventSubscription;
}

const native = requireOptionalNativeModule<NativeScanner>("DeraDocumentScanner");

export class NativeUnavailableError extends Error {
  constructor() {
    super("Dera Library needs its Android development build. Expo Go and web are not supported.");
  }
}

export function scanner(): NativeScanner {
  if (!native) throw new NativeUnavailableError();
  return native;
}

export const isScannerAvailable = native != null;
