import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlatGlass, Glass } from "@/components/glass";
import { GoalRing, HeatLegend, ReadingHeatmap } from "@/components/ReadingCharts";
import { FocusCard, FocusSheet } from "@/components/Focus";
import { LogReadingSheet } from "@/components/ReadingSheets";
import { Chip, EmptyState, Icon, IconButton, SectionTitle, type IconName } from "@/components/ui";
import { searchDocuments } from "@/db/documents";
import { deleteSession, getReadingSummary, getTopDocuments, setGoalMinutes, type ReadingSession } from "@/db/reading";
import { plural } from "@/lib/format";
import { dayKey, formatDuration, heatLevel } from "@/lib/readingStats";
import { useQuery } from "@/lib/useQuery";
import { useTabBarHeight } from "@/lib/useTabBarHeight";
import { notifyLibraryChanged } from "@/state/store";
import { spacing, type, useTheme } from "@/theme";

/** The day before/after a "YYYY-MM-DD" key, in local time. */
function shiftDay(key: string, by: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + by, 12).getTime());
}

const GOALS = [10, 15, 20, 30, 45, 60];

const SOURCE_ICON: Record<ReadingSession["source"], IconName> = {
  estimate: "timer-sand",
  manual: "pencil-outline",
  reader: "book-open-page-variant",
};

export default function ReadingScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabBar = useTabBarHeight();
  const [logging, setLogging] = useState(false);
  const [focusing, setFocusing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const { data } = useQuery(async () => {
    const now = Date.now();
    const monthStart = now - 30 * 86_400_000;
    const [summary, top, recent] = await Promise.all([
      getReadingSummary(now),
      getTopDocuments(monthStart, 5),
      searchDocuments({ view: "recent", limit: 6 }),
    ]);
    return { now, summary, top, recent };
  }, []);

  if (!data) return <View style={{ flex: 1 }} />;
  const { now, summary, top, recent } = data;
  const goalMin = Math.round(summary.goalMs / 60_000);
  const todayKey = dayKey(now);
  const dayShown = selected ?? todayKey;
  const daySessions = summary.sessions.filter((s) => dayKey(s.startedAt) === dayShown);
  const goalDays = [...summary.totals.values()].filter((ms) => heatLevel(ms, summary.goalMs) >= 3).length;
  const hasAny = summary.sessions.length > 0;
  const topMax = Math.max(1, ...top.map((d) => d.totalMs));

  const removeSession = (s: ReadingSession) =>
    Alert.alert("Delete this session?", `${s.documentName} · ${formatDuration(s.durationMs)}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteSession(s.id);
          notifyLibraryChanged();
        },
      },
    ]);

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: tabBar + spacing.xxl }}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={[type.title, { color: t.text }]}>
              Reading
            </Text>
            <Text style={[type.small, { color: t.textMuted }]}>Your reading year, one square a day</Text>
          </View>
          <IconButton icon="timer-outline" label="Start a focus session" onPress={() => setFocusing(true)} />
          <IconButton icon="plus" label="Log reading" onPress={() => setLogging(true)} />
        </View>

        <View style={{ marginBottom: spacing.md }}>
          <FocusCard />
        </View>

        {/* Today */}
        <Glass shape="hero" style={styles.hero} contentStyle={styles.heroContent}>
          <View>
            <GoalRing progress={summary.todayMs / summary.goalMs} size={104} stroke={11} />
            <View style={styles.ringCenter} pointerEvents="none">
              <Text style={[type.heading, { color: t.text }]}>{Math.round(summary.todayMs / 60_000)}</Text>
              <Text style={[type.tiny, { color: t.textMuted }]}>min</Text>
            </View>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[type.label, { color: t.textMuted }]}>TODAY</Text>
            <Text style={[type.bodyStrong, { color: t.text }]}>
              {summary.todayMs >= summary.goalMs
                ? "Daily goal reached"
                : `${formatDuration(Math.max(0, summary.goalMs - summary.todayMs))} to your ${goalMin}-min goal`}
            </Text>
            <View style={[styles.pill, { backgroundColor: summary.current ? t.warningSoft : t.surfaceAlt }]}>
              <Icon name="fire" size={16} color={summary.current ? t.warning : t.textFaint} />
              <Text style={[type.smallStrong, { color: summary.current ? t.warning : t.textMuted }]}>
                {summary.current ? `${plural(summary.current, "day")} streak` : "Start a streak today"}
              </Text>
            </View>
          </View>
        </Glass>

        <Pressable
          onPress={() => router.push("/recap")}
          accessibilityRole="button"
          style={[styles.recapLink, { borderColor: t.border }]}
        >
          <Icon name="chart-bar" color={t.primary} />
          <Text style={[type.smallStrong, { color: t.text, flex: 1 }]}>Your month and year in reading</Text>
          <Icon name="chevron-right" color={t.textFaint} />
        </Pressable>

        {/* Stats */}
        <View style={styles.stats}>
          {(
            [
              ["fire", "Current streak", plural(summary.current, "day")],
              ["trophy-outline", "Longest streak", plural(summary.longest, "day")],
              ["calendar-week", "Last 7 days", formatDuration(summary.weekMs)],
              ["calendar-check-outline", "Days read (year)", String(summary.daysRead)],
            ] as Array<[IconName, string, string]>
          ).map(([icon, label, value]) => (
            <FlatGlass key={label} shape="petal" style={styles.stat} contentStyle={{ padding: spacing.md, gap: 2 }}>
              <Icon name={icon} size={18} color={t.primary} />
              <Text style={[type.heading, { color: t.text }]}>{value}</Text>
              <Text style={[type.tiny, { color: t.textMuted }]}>{label}</Text>
            </FlatGlass>
          ))}
        </View>

        {/* Year heatmap */}
        <SectionTitle action={<HeatLegend />}>Last 12 months</SectionTitle>
        <FlatGlass shape="leaf" style={{ marginHorizontal: spacing.lg }} contentStyle={{ padding: spacing.md, gap: spacing.sm }}>
          <ReadingHeatmap
            totals={summary.totals}
            goalMs={summary.goalMs}
            now={now}
            selectedKey={dayShown}
            onSelect={setSelected}
          />
          <Text style={[type.tiny, { color: t.textMuted }]}>
            {formatDuration(summary.yearMs)} across {plural(summary.daysRead, "day")} · goal met on {plural(goalDays, "day")}
          </Text>
        </FlatGlass>

        {/* Selected day */}
        <SectionTitle
          action={
            // Step through days without tapping 13dp squares (and with a screen reader).
            <View style={{ flexDirection: "row" }}>
              <IconButton icon="chevron-left" label="Previous day" onPress={() => setSelected(shiftDay(dayShown, -1))} />
              <IconButton
                icon="chevron-right"
                label="Next day"
                onPress={() => dayShown < todayKey && setSelected(shiftDay(dayShown, 1))}
                color={dayShown < todayKey ? undefined : t.textFaint}
              />
            </View>
          }
        >
          {dayShown === todayKey
            ? "Today"
            : new Date(`${dayShown}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </SectionTitle>
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {daySessions.length ? (
            daySessions.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => s.documentId && router.push({ pathname: "/document/[id]", params: { id: String(s.documentId) } })}
                onLongPress={() => removeSession(s)}
                accessibilityRole="button"
                accessibilityLabel={`${s.documentName}, ${formatDuration(s.durationMs)}`}
                accessibilityHint="Long press to delete this session"
                style={[styles.session, { borderColor: t.border }]}
              >
                <Icon name={SOURCE_ICON[s.source]} size={18} color={t.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[type.smallStrong, { color: t.text }]}>
                    {s.documentName}
                  </Text>
                  <Text style={[type.tiny, { color: t.textFaint }]}>
                    {new Date(s.startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </Text>
                </View>
                <Text style={[type.smallStrong, { color: t.primary }]}>{formatDuration(s.durationMs)}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={[type.small, { color: t.textFaint }]}>
              No reading logged{dayShown === todayKey ? " yet today" : " this day"}.
            </Text>
          )}
        </View>

        {/* Goal */}
        <SectionTitle>Daily goal</SectionTitle>
        <View style={styles.chips}>
          {GOALS.map((g) => (
            <Chip
              key={g}
              label={`${g} min`}
              selected={goalMin === g}
              onPress={async () => {
                await setGoalMinutes(g);
                notifyLibraryChanged();
              }}
            />
          ))}
        </View>

        {/* Top documents */}
        {top.length ? (
          <>
            <SectionTitle>Most read, last 30 days</SectionTitle>
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
              {top.map((d) => (
                <Pressable
                  key={`${d.documentId}-${d.documentName}`}
                  disabled={!d.documentId}
                  onPress={() => router.push({ pathname: "/document/[id]", params: { id: String(d.documentId) } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.documentName}, ${formatDuration(d.totalMs)}`}
                  style={{ gap: 4 }}
                >
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Text numberOfLines={1} style={[type.small, { color: t.text, flex: 1 }]}>
                      {d.documentName}
                    </Text>
                    <Text style={[type.smallStrong, { color: t.textMuted }]}>{formatDuration(d.totalMs)}</Text>
                  </View>
                  <View style={[styles.track, { backgroundColor: t.surfaceAlt }]}>
                    <View style={[styles.bar, { backgroundColor: t.primary, width: `${(d.totalMs / topMax) * 100}%` }]} />
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {!hasAny ? (
          <EmptyState
            icon="book-clock-outline"
            title="Your reading year starts here"
            message="Open a document from your library. When you come back, Dera asks how long you read, and each day fills a square. You can also log time by hand."
          />
        ) : null}
      </ScrollView>
      <LogReadingSheet visible={logging} onClose={() => setLogging(false)} candidates={recent} />
      <FocusSheet visible={focusing} onClose={() => setFocusing(false)} candidates={recent} />
    </>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingBottom: spacing.md,
  },
  hero: { marginHorizontal: spacing.lg },
  heroContent: { flexDirection: "row", alignItems: "center", gap: spacing.lg, padding: spacing.lg },
  ringCenter: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 4,
  },
  recapLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
  },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  stat: { flexBasis: "47%", flexGrow: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg },
  session: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
});
