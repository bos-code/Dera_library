import { dayKey, startOfDay, streaks, totalsByDay } from "@/lib/readingStats";
import type { ReadingStatus } from "@/types/document";
import { getDb, getMeta, setMeta } from "./database";

export interface ReadingSession {
  id: number;
  documentId: number | null;
  documentName: string;
  startedAt: number;
  durationMs: number;
  source: "estimate" | "manual" | "reader";
  pages: number | null;
}

const SELECT_SESSION = `SELECT id, document_id AS documentId, document_name AS documentName, started_at AS startedAt,
  duration_ms AS durationMs, source, pages FROM reading_sessions`;

export const DEFAULT_GOAL_MIN = 20;

export async function getGoalMinutes(): Promise<number> {
  const v = Number(await getMeta("reading_goal_min"));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_GOAL_MIN;
}

export async function setGoalMinutes(minutes: number): Promise<void> {
  await setMeta("reading_goal_min", String(Math.round(minutes)));
}

export async function addSession(s: Omit<ReadingSession, "id" | "pages"> & { pages?: number | null }): Promise<void> {
  if (s.durationMs <= 0) return;
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO reading_sessions(document_id,document_name,started_at,duration_ms,source,pages) VALUES(?,?,?,?,?,?)",
    s.documentId,
    s.documentName,
    Math.round(s.startedAt),
    Math.round(s.durationMs),
    s.source,
    s.pages ?? null,
  );
}

export async function deleteSession(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM reading_sessions WHERE id=?", id);
}

export async function getSessions(from: number, to = Number.MAX_SAFE_INTEGER): Promise<ReadingSession[]> {
  const db = await getDb();
  return db.getAllAsync<ReadingSession>(
    `${SELECT_SESSION} WHERE started_at >= ? AND started_at < ? ORDER BY started_at DESC`,
    from,
    to,
  );
}

export interface ReadingSummary {
  goalMs: number;
  todayMs: number;
  weekMs: number;
  yearMs: number;
  daysRead: number;
  current: number;
  longest: number;
  totals: Map<string, number>;
  sessions: ReadingSession[];
}

/** Everything the Reading screen and the Library "today" card need, from one year of sessions. */
export async function getReadingSummary(now = Date.now()): Promise<ReadingSummary> {
  const [goalMin, sessions] = await Promise.all([getGoalMinutes(), getSessions(startOfDay(now) - 400 * 86_400_000)]);
  const totals = totalsByDay(sessions);
  const weekStart = startOfDay(now) - 6 * 86_400_000;
  const yearStart = startOfDay(now) - 364 * 86_400_000;
  const sum = (from: number) => sessions.filter((s) => s.startedAt >= from).reduce((a, s) => a + s.durationMs, 0);
  const { current, longest } = streaks(totals, now);
  return {
    goalMs: goalMin * 60_000,
    todayMs: totals.get(dayKey(now)) ?? 0,
    weekMs: sum(weekStart),
    yearMs: sum(yearStart),
    daysRead: [...totals.entries()].filter(([k, ms]) => ms > 0 && k >= dayKey(yearStart)).length,
    current,
    longest,
    totals,
    sessions,
  };
}

export interface DocumentReading {
  totalMs: number;
  sessions: number;
  lastReadAt: number | null;
}

export async function getDocumentReading(documentId: number): Promise<DocumentReading> {
  const db = await getDb();
  const row = await db.getFirstAsync<DocumentReading>(
    "SELECT coalesce(SUM(duration_ms),0) AS totalMs, COUNT(*) AS sessions, MAX(started_at) AS lastReadAt FROM reading_sessions WHERE document_id=?",
    documentId,
  );
  return row ?? { totalMs: 0, sessions: 0, lastReadAt: null };
}

export async function getTopDocuments(from: number, limit = 5) {
  const db = await getDb();
  return db.getAllAsync<{ documentId: number | null; documentName: string; totalMs: number }>(
    `SELECT document_id AS documentId, document_name AS documentName, SUM(duration_ms) AS totalMs
     FROM reading_sessions WHERE started_at >= ?
     GROUP BY coalesce(document_id, document_name) ORDER BY totalMs DESC LIMIT ?`,
    from,
    limit,
  );
}

export async function setReadingStatus(documentIds: number[], status: ReadingStatus | null): Promise<void> {
  if (!documentIds.length) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE documents SET reading_status=? WHERE id IN (${documentIds.map(() => "?").join(",")})`,
    status,
    ...documentIds,
  );
}
