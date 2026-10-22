import { useSyncExternalStore } from "react";
import type { ScanProgress, StorageAccess } from "@/native/scanner";
import type { SmartShelf } from "@/db/documents";
import type { DocumentType, LibraryView, ScanSummary, SortMode } from "@/types/document";

export type ThemePreference = "system" | "light" | "dark";

export interface Appearance {
  mode: ThemePreference;
  /** Preset ids used in light and dark mode. */
  light: string;
  dark: string;
  /** Accent id overriding the preset's own colour, or null. */
  accent: string | null;
  surfaces: "glass" | "solid";
  density: "comfortable" | "compact";
}

export interface ReadingPrompt {
  documentId: number;
  documentName: string;
  startedAt: number;
  /** Measured time away, capped; null when too long ago to guess (the user picks). */
  suggestedMs: number | null;
}

export interface FocusSession {
  documentId: number;
  documentName: string;
  startedAt: number;
  /** Target length, or null for an open-ended session. */
  plannedMs: number | null;
}

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "system",
  light: "paper",
  dark: "ink",
  accent: null,
  surfaces: "glass",
  density: "comfortable",
};

export interface AppState {
  /** Bumped after any change to the index or organization; screens re-query when it changes. */
  libraryVersion: number;
  onboarded: boolean | null;
  appearance: Appearance;
  /** A finished out-of-app reading session waiting for the user to confirm its length. */
  readingPrompt: ReadingPrompt | null;
  /** A running focus session (timer the user starts and stops explicitly). */
  focus: FocusSession | null;
  access: StorageAccess | null;
  scanning: boolean;
  progress: ScanProgress | null;
  lastSummary: ScanSummary | null;
  lastScanAt: number | null;
  scanError: string | null;
  library: {
    text: string;
    type: DocumentType | "all";
    sort: SortMode;
    view: LibraryView;
    shelf: SmartShelf | null;
    layout: "list" | "grid";
  };
}

let state: AppState = {
  libraryVersion: 0,
  onboarded: null,
  appearance: DEFAULT_APPEARANCE,
  readingPrompt: null,
  focus: null,
  access: null,
  scanning: false,
  progress: null,
  lastSummary: null,
  lastScanAt: null,
  scanError: null,
  library: { text: "", type: "all", sort: "modified-desc", view: "all", shelf: null, layout: "list" },
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
