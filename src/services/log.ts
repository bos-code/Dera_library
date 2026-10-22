import Constants from "expo-constants";
import { Platform } from "react-native";
import { getDb } from "@/db/database";

/**
 * A small, local-only diagnostics log. Nothing is sent anywhere: the user can look at it in Settings and
 * export it as a file to share when something goes wrong.
 */

const KEEP = 500;

export type LogLevel = "error" | "warn" | "info";

export interface LogEntry {
  id: number;
  at: number;
  level: LogLevel;
  message: string;
  detail: string | null;
}

export function log(level: LogLevel, message: string, detail?: unknown): void {
  const text =
    detail instanceof Error ? `${detail.name}: ${detail.message}\n${detail.stack ?? ""}` : detail == null ? null : String(detail);
  void (async () => {
    try {
      const db = await getDb();
      await db.runAsync(
        "INSERT INTO app_log(at,level,message,detail) VALUES(?,?,?,?)",
        Date.now(),
        level,
        message.slice(0, 500),
        text?.slice(0, 4000) ?? null,
      );
      await db.runAsync("DELETE FROM app_log WHERE id <= (SELECT MAX(id) FROM app_log) - ?", KEEP);
    } catch {
      // Logging must never cause a failure of its own.
    }
  })();
}

export const logError = (message: string, e?: unknown) => log("error", message, e);

export async function getLog(limit = 200): Promise<LogEntry[]> {
  const db = await getDb();
  return db.getAllAsync<LogEntry>("SELECT id, at, level, message, detail FROM app_log ORDER BY id DESC LIMIT ?", limit);
}

export async function clearLog(): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM app_log");
}

/** Plain-text report: app and device versions, then the log, newest first. */
export async function buildReport(): Promise<string> {
  const entries = await getLog(KEEP);
  const c = Platform.constants as { Brand?: string; Model?: string; Release?: string };
  const header = [
    "Dera Library diagnostics",
    `App ${Constants.expoConfig?.version ?? "?"} · Android ${c.Release ?? Platform.Version} (API ${Platform.Version}) · ${[c.Brand, c.Model].filter(Boolean).join(" ")}`,
    `Exported ${new Date().toISOString()}`,
    "",
  ];
  const lines = entries.map(
    (e) =>
      `[${new Date(e.at).toISOString()}] ${e.level.toUpperCase()} ${e.message}${e.detail ? `\n    ${e.detail.replace(/\n/g, "\n    ")}` : ""}`,
  );
  return [...header, ...(lines.length ? lines : ["(no entries)"])].join("\n");
}

let installed = false;

/** Records uncaught JavaScript errors before React Native's default handling. */
export function installGlobalErrorLogging(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as {
    ErrorUtils?: {
      getGlobalHandler(): (e: unknown, fatal?: boolean) => void;
      setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void;
    };
  };
  const utils = g.ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, fatal) => {
    log("error", fatal ? "Fatal error" : "Unhandled error", error);
    previous(error, fatal);
  });
}
