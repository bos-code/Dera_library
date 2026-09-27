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
  addListener(event: "onScanProgress", listener: (p: ScanProgress) => void): EventSubscription;
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
