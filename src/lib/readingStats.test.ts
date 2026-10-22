import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, buildCalendar, dayKey, formatDuration, heatLevel, streaks, totalsByDay } from "./readingStats.ts";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const MIN = 60_000;

test("sessions are bucketed by local day", () => {
  const totals = totalsByDay([
    { startedAt: at(2026, 10, 20, 9), durationMs: 10 * MIN },
    { startedAt: at(2026, 10, 20, 22), durationMs: 5 * MIN },
    { startedAt: at(2026, 10, 21, 1), durationMs: 7 * MIN },
  ]);
  assert.equal(totals.get("2026-10-20"), 15 * MIN);
  assert.equal(totals.get("2026-10-21"), 7 * MIN);
});

test("heat levels follow the goal", () => {
  const goal = 20 * MIN;
  assert.deepEqual(
    [0, 5, 12, 20, 39, 40].map((m) => heatLevel(m * MIN, goal)),
    [0, 1, 2, 3, 3, 4],
  );
});

test("current streak counts back from today, or from yesterday if today is still empty", () => {
  const days = (keys: string[]) => new Map(keys.map((k) => [k, 15 * MIN]));
  const now = at(2026, 10, 22, 8);
  assert.deepEqual(streaks(days(["2026-10-20", "2026-10-21", "2026-10-22"]), now).current, 3);
  assert.deepEqual(streaks(days(["2026-10-20", "2026-10-21"]), now).current, 2);
  assert.deepEqual(streaks(days(["2026-10-19", "2026-10-20"]), now).current, 0);
});

test("longest streak spans month boundaries and ignores sub-minute days", () => {
  const totals = new Map([
    ["2026-09-29", 5 * MIN],
    ["2026-09-30", 5 * MIN],
    ["2026-10-01", 5 * MIN],
    ["2026-10-02", 20_000],
    ["2026-10-10", 5 * MIN],
  ]);
  assert.equal(streaks(totals, at(2026, 10, 22)).longest, 3);
});

test("calendar ends with the week containing today and marks the future", () => {
  const now = at(2026, 10, 22); // a Thursday
  const cal = buildCalendar(now);
  assert.equal(cal.weeks.length, 53);
  const last = cal.weeks[52];
  assert.equal(new Date(last[0].ts).getDay(), 0);
  assert.ok(last.some((d) => d.key === dayKey(now) && !d.future));
  assert.ok(last.filter((d) => d.future).length === 2); // Fri, Sat
  assert.ok(cal.months.length >= 12);
});

test("addDays is calendar-based", () => {
  assert.equal(dayKey(addDays(at(2026, 3, 28), 2)), "2026-03-30");
  assert.equal(dayKey(addDays(at(2026, 1, 31), 1)), "2026-02-01");
});

test("durations read naturally", () => {
  assert.equal(formatDuration(20_000), "<1 min");
  assert.equal(formatDuration(45 * MIN), "45 min");
  assert.equal(formatDuration(80 * MIN), "1 h 20 min");
  assert.equal(formatDuration(120 * MIN), "2 h");
});

test("reading estimate prefers word count, falls back to pages", async () => {
  const { estimateReadingMs } = await import("./readingStats.ts");
  assert.equal(estimateReadingMs(2000, 40), 10 * MIN);
  assert.equal(estimateReadingMs(null, 30), 60 * MIN);
  assert.equal(estimateReadingMs(10, null), null);
});
