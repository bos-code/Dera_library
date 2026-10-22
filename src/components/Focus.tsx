import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatDuration } from "@/lib/readingStats";
import { displayTitle } from "@/lib/title";
import { resumeFocus, startFocus, stopFocus } from "@/services/focus";
import { useAppState } from "@/state/store";
import { corner, spacing, type, useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";
import { Sheet } from "./Sheet";
import { Button, Chip, Icon } from "./ui";

const LENGTHS: Array<{ label: string; ms: number | null }> = [
  { label: "15 min", ms: 15 * 60_000 },
  { label: "25 min", ms: 25 * 60_000 },
  { label: "45 min", ms: 45 * 60_000 },
  { label: "60 min", ms: 60 * 60_000 },
  { label: "No limit", ms: null },
];

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Live card for the running focus session. Renders nothing when no session is running. */
export function FocusCard() {
  const t = useTheme();
  const focus = useAppState((s) => s.focus);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!focus) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [focus]);
  if (!focus) return null;

  const elapsed = now - focus.startedAt;
  const done = focus.plannedMs != null && elapsed >= focus.plannedMs;
  const progress = focus.plannedMs ? Math.min(1, elapsed / focus.plannedMs) : null;

  const stop = async () => {
    const saved = await stopFocus(true);
    Alert.alert(
      saved ? "Session saved" : "Session too short",
      saved ? `${formatDuration(saved)} of reading logged.` : "Sessions under 30 seconds aren't logged.",
    );
  };
  const resume = async () => {
    const r = await resumeFocus();
    if (r && !r.ok) Alert.alert(r.title ?? "Couldn't open", r.message);
  };

  return (
    <View
      style={[styles.card, corner.leaf, { backgroundColor: done ? t.warningSoft : t.primarySoft }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row}>
        <Icon name={done ? "bell-ring-outline" : "timer-outline"} color={done ? t.warning : t.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[type.label, { color: done ? t.warning : t.primary }]}>{done ? "TIME'S UP" : "FOCUS SESSION"}</Text>
          <Text numberOfLines={1} style={[type.smallStrong, { color: t.text }]}>
            {focus.documentName}
          </Text>
        </View>
        <Text
          style={[type.title, { color: t.text, fontVariant: ["tabular-nums"] }]}
          accessibilityLabel={`${formatDuration(elapsed)} elapsed`}
        >
          {clock(elapsed)}
        </Text>
      </View>
      {progress != null ? (
        <View style={[styles.track, { backgroundColor: t.surface }]}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: done ? t.warning : t.primary }]} />
        </View>
      ) : null}
      <View style={styles.row}>
        <Button label="Back to document" icon="open-in-new" onPress={resume} style={{ flex: 1 }} />
        <Button label="Stop & save" icon="stop-circle-outline" variant="primary" onPress={stop} style={{ flex: 1 }} />
      </View>
      <Pressable onPress={() => void stopFocus(false)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "center" }}>
        <Text style={[type.tiny, { color: t.textMuted }]}>Discard session</Text>
      </Pressable>
    </View>
  );
}

/** Starts a focus session: pick a document (unless fixed) and a length, then the document opens. */
export function FocusSheet({
  visible,
  onClose,
  document,
  candidates = [],
}: {
  visible: boolean;
  onClose: () => void;
  document?: DocumentRecord;
  candidates?: DocumentRecord[];
}) {
  const t = useTheme();
  const [length, setLength] = useState<number | null>(25 * 60_000);
  const [picked, setPicked] = useState<DocumentRecord | undefined>(document);
  useEffect(() => {
    if (visible) setPicked(document ?? candidates[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const start = async () => {
    if (!picked) return;
    onClose();
    const r = await startFocus(picked, length);
    if (!r.ok) Alert.alert(r.title ?? "Couldn't open", r.message);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Focus session"
      footer={
        <>
          <Button label="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button label="Start & open" icon="play" variant="primary" disabled={!picked} onPress={start} style={{ flex: 2 }} />
        </>
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <Text style={[type.small, { color: t.textMuted }]}>
          The document opens and a timer runs here. Come back and tap Stop & save: the exact time is logged.
        </Text>
        {document ? (
          <Text numberOfLines={2} style={[type.bodyStrong, { color: t.text }]}>
            {displayTitle(document.name)}
          </Text>
        ) : candidates.length ? (
          <View style={{ gap: spacing.sm }}>
            {candidates.slice(0, 6).map((d) => {
              const on = picked?.id === d.id;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => setPicked(d)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[styles.option, corner.petal, { backgroundColor: on ? t.primarySoft : t.surfaceAlt }]}
                >
                  <Icon name={on ? "radiobox-marked" : "radiobox-blank"} color={on ? t.primary : t.textFaint} />
                  <Text numberOfLines={1} style={[type.small, { color: t.text, flex: 1 }]}>
                    {displayTitle(d.name)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={[type.small, { color: t.textMuted }]}>Open a document once, or start from a document's page.</Text>
        )}
        <View style={styles.chips}>
          {LENGTHS.map((l) => (
            <Chip key={l.label} label={l.label} selected={length === l.ms} onPress={() => setLength(l.ms)} />
          ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, padding: spacing.md, gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, minHeight: 48 },
});
