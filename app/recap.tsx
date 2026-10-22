import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { Chip, EmptyState, SectionTitle } from "@/components/ui";
import { getSessions, getTopCollections } from "@/db/reading";
import { plural } from "@/lib/format";
import { addDays, dayKey, formatDuration, startOfDay, streaks, totalsByDay } from "@/lib/readingStats";
import { useQuery } from "@/lib/useQuery";
import { corner, spacing, type, useTheme } from "@/theme";

type Period = "month" | "year";

const CHART_W = 320;
const CHART_H = 110;

/** A month or year in reading: totals, rhythm and favourites. */
export default function RecapScreen() {
  const t = useTheme();
  const [period, setPeriod] = useState<Period>("month");
  const { data } = useQuery(async () => {
    const now = Date.now();
    const d = new Date(now);
    const from =
      period === "month" ? new Date(d.getFullYear(), d.getMonth(), 1).getTime() : new Date(d.getFullYear(), 0, 1).getTime();
    const to = startOfDay(now) + 86_400_000;
    const [sessions, collections] = await Promise.all([getSessions(from, to), getTopCollections(from, to, 5)]);
    return { now, from, sessions, collections };
  }, [period]);

  if (!data) return <View style={{ flex: 1 }} />;
  const { now, from, sessions, collections } = data;
  const totals = totalsByDay(sessions);
  const totalMs = sessions.reduce((a, s) => a + s.durationMs, 0);
  const days = [...totals.values()].filter((ms) => ms > 0).length;
  const longest = streaks(totals, now).longest;
  const byWeekday = Array.from({ length: 7 }, () => 0);
  for (const s of sessions) byWeekday[new Date(s.startedAt).getDay()] += s.durationMs;
  const topWeekday = byWeekday.indexOf(Math.max(...byWeekday));
  const perDoc = new Map<string, number>();
  for (const s of sessions) perDoc.set(s.documentName, (perDoc.get(s.documentName) ?? 0) + s.durationMs);
  const topDocs = [...perDoc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Day bars for a month, month bars for a year.
  const bars: number[] = [];
  if (period === "month") {
    for (let ts = from; ts <= now; ts = addDays(ts, 1)) bars.push(totals.get(dayKey(ts)) ?? 0);
  } else {
    for (let m = 0; m <= new Date(now).getMonth(); m++) {
      bars.push(sessions.filter((s) => new Date(s.startedAt).getMonth() === m).reduce((a, s) => a + s.durationMs, 0));
    }
  }
  const maxBar = Math.max(1, ...bars);
  const slot = CHART_W / Math.max(1, bars.length);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={styles.row}>
        <Chip label="This month" selected={period === "month"} onPress={() => setPeriod("month")} />
        <Chip label="This year" selected={period === "year"} onPress={() => setPeriod("year")} />
      </View>
      {!sessions.length ? (
        <EmptyState icon="chart-bar" title="Nothing read yet" message="Your recap fills in as you read." />
      ) : (
        <>
          <View style={[styles.hero, corner.hero, { backgroundColor: t.primary }]}>
            <Text style={[type.label, { color: t.onPrimary, opacity: 0.85 }]}>
              {period === "month"
                ? new Date(now).toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase()
                : String(new Date(now).getFullYear())}
            </Text>
            <Text style={[type.hero, { color: t.onPrimary }]}>{formatDuration(totalMs)}</Text>
            <Text style={[type.body, { color: t.onPrimary }]}>
              read on {plural(days, "day")}, across {plural(sessions.length, "session")}
            </Text>
          </View>
          <View style={styles.stats}>
            {(
              [
                ["Average reading day", formatDuration(days ? totalMs / days : 0)],
                ["Longest streak", plural(longest, "day")],
                // 1 Jan 2023 was a Sunday, so day 1 + weekday index names the weekday.
                ["Favourite day", new Date(2023, 0, 1 + topWeekday).toLocaleDateString(undefined, { weekday: "long" })],
                ["Documents read", String(perDoc.size)],
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={[styles.stat, corner.petal, { backgroundColor: t.surfaceAlt }]}>
                <Text style={[type.heading, { color: t.text }]}>{value}</Text>
                <Text style={[type.tiny, { color: t.textMuted }]}>{label}</Text>
              </View>
            ))}
          </View>

          <SectionTitle>{period === "month" ? "Day by day" : "Month by month"}</SectionTitle>
          <View
            style={{ paddingHorizontal: spacing.lg }}
            accessible
            accessibilityLabel={`Bar chart of reading ${period === "month" ? "per day this month" : "per month this year"}`}
          >
            <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
              {bars.map((ms, i) => {
                const h = ms ? Math.max(3, (ms / maxBar) * (CHART_H - 6)) : 2;
                return (
                  <Rect
                    key={i}
                    x={i * slot + slot * 0.15}
                    y={CHART_H - h}
                    width={slot * 0.7}
                    height={h}
                    rx={Math.min(3, slot * 0.3)}
                    fill={ms ? t.primary : t.surfaceAlt}
                  />
                );
              })}
            </Svg>
          </View>

          {topDocs.length ? (
            <>
              <SectionTitle>Most read</SectionTitle>
              {topDocs.map(([name, ms], i) => (
                <View key={name} style={styles.line}>
                  <Text style={[type.smallStrong, { color: t.textFaint, width: 22 }]}>{i + 1}</Text>
                  <Text numberOfLines={1} style={[type.small, { color: t.text, flex: 1 }]}>
                    {name}
                  </Text>
                  <Text style={[type.smallStrong, { color: t.primary }]}>{formatDuration(ms)}</Text>
                </View>
              ))}
            </>
          ) : null}

          {collections.length ? (
            <>
              <SectionTitle>Top collections</SectionTitle>
              {collections.map((c) => (
                <View key={c.id} style={styles.line}>
                  <Text numberOfLines={1} style={[type.small, { color: t.text, flex: 1 }]}>
                    {c.name}
                  </Text>
                  <Text style={[type.smallStrong, { color: t.primary }]}>{formatDuration(c.totalMs)}</Text>
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 },
  hero: { margin: spacing.lg, padding: spacing.xl, gap: 4 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.lg },
  stat: { flexBasis: "47%", flexGrow: 1, padding: spacing.md, gap: 2 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
