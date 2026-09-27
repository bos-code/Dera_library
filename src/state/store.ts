import { useSyncExternalStore } from "react";
import type { ScanProgress, StorageAccess } from "@/native/scanner";
import type { DocumentType, LibraryView, ScanSummary, SortMode } from "@/types/document";

export type ThemePreference = "system" | "light" | "dark";

export interface AppState {
  /** Bumped after any change to the index or organization; screens re-query when it changes. */
  libraryVersion: number;
  onboarded: boolean | null;
  themePreference: ThemePreference;
  access: StorageAccess | null;
  scanning: boolean;
  progress: ScanProgress | null;
  lastSummary: ScanSummary | null;
  lastScanAt: number | null;
  scanError: string | null;
  library: { text: string; type: DocumentType | "all"; sort: SortMode; view: LibraryView };
}

let state: AppState = {
  libraryVersion: 0,
  onboarded: null,
  themePreference: "system",
  access: null,
  scanning: false,
  progress: null,
  lastSummary: null,
  lastScanAt: null,
  scanError: null,
  library: { text: "", type: "all", sort: "modified-desc", view: "all" },
};

const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export function notifyLibraryChanged(): void {
  setState((s) => ({ libraryVersion: s.libraryVersion + 1 }));
}

export const useLibraryVersion = () => useAppState((s) => s.libraryVersion);
