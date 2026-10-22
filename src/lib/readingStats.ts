/** Pure date and statistics helpers for the reading tracker. All "days" are in the phone's local time. */

export interface SessionLike {
  startedAt: number;
  durationMs: number;
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-22" in local time. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar-day arithmetic that stays correct across daylight-saving changes. */
export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function totalsByDay(sessions: SessionLike[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const s of sessions) totals.set(dayKey(s.startedAt), (totals.get(dayKey(s.startedAt)) ?? 0) + s.durationMs);
  return totals;
}

/** GitHub-style intensity: 1 = some reading, 2 = half the goal, 3 = goal met, 4 = double the goal. */
export function heatLevel(ms: number, goalMs: number): HeatLevel {
  if (ms <= 0) return 0;
  if (ms < goalMs * 0.5) return 1;
  if (ms < goalMs) return 2;
  if (ms < goalMs * 2) return 3;
  return 4;
}

/** Minimum reading for a day to count towards a streak. */
export const STREAK_MIN_MS = 60_000;

/**
 * Current and longest run of consecutive days with reading. Today not being read yet doesn't break the
 * current streak; it is counted from yesterday until the day is over.
 */
export function streaks(totals: Map<string, number>, now: number): { current: number; longest: number } {
  const read = (ts: number) => (totals.get(dayKey(ts)) ?? 0) >= STREAK_MIN_MS;
  let current = 0;
  let cursor = read(now) ? startOfDay(now) : addDays(startOfDay(now), -1);
  while (read(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const days = [...totals.entries()]
    .filter(([, ms]) => ms >= STREAK_MIN_MS)
    .map(([k]) => k)
    .sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of days) {
    const [y, m, d] = k.split("-").map(Number);
    const dayBefore = dayKey(addDays(new Date(y, m - 1, d).getTime(), -1));
    run = prev === dayBefore ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  }
  return { current, longest: Math.max(longest, current) };
}

export interface CalendarDay {
  key: string;
  ts: number;
  future: boolean;
}

export interface Calendar {
  /** Columns of seven days, Sunday first; the last column contains today. */
  weeks: CalendarDay[][];
  /** Month labels and the column where each month starts. */
  months: Array<{ label: string; column: number }>;
}

export function buildCalendar(now: number, weekCount = 53): Calendar {
  const today = startOfDay(now);
  const firstSunday = addDays(today, -new Date(today).getDay() - (weekCount - 1) * 7);
  const weeks: CalendarDay[][] = [];
  const months: Calendar["months"] = [];
  let lastMonth = -1;
  for (let w = 0; w < weekCount; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const ts = addDays(firstSunday, w * 7 + d);
      week.push({ key: dayKey(ts), ts, future: ts > today });
    }
    const month = new Date(week[0].ts).getMonth();
    if (month !== lastMonth) {
      // Skip a label squeezed into the very first column when the month started earlier.
      if (!(w === 0 && new Date(week[0].ts).getDate() > 7)) {
        months.push({ label: new Date(week[0].ts).toLocaleDateString(undefined, { month: "short" }), column: w });
      }
      lastMonth = month;
    }
    weeks.push(week);
  }
  return { weeks, months };
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (ms > 0 && minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
