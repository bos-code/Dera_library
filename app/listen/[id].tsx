import * as Speech from "expo-speech";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Chip, EmptyState, Icon, type IconName } from "@/components/ui";
import { getDocumentText } from "@/db/contentIndex";
import { getDocument } from "@/db/documents";
import { addSession } from "@/db/reading";
import { speechChunks } from "@/lib/speechChunks";
import { docTitle } from "@/lib/title";
import { useQuery } from "@/lib/useQuery";
import { notifyLibraryChanged } from "@/state/store";
import { corner, spacing, type, useTheme } from "@/theme";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
/** Shorter listens aren't logged as reading. */
const MIN_SESSION_MS = 30_000;

/** Reads a document's text aloud with the phone's own voice, piece by piece; works offline. */
export default function ListenScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useQuery(async () => {
    const [doc, text] = await Promise.all([getDocument(Number(id)), getDocumentText(Number(id))]);
    return { doc, text };
  }, [id]);
  const chunks = useMemo(() => speechChunks(data?.text ?? ""), [data?.text]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  // Bumped on every stop/restart so callbacks from an utterance we cancelled are ignored.
  const generation = useRef(0);
  const listenedMs = useRef(0);
  const playingSince = useRef<number | null>(null);

  const markStopped = () => {
    if (playingSince.current) listenedMs.current += Date.now() - playingSince.current;
    playingSince.current = null;
  };

  useEffect(() => {
    if (!playing || !chunks[index]) return;
    const gen = ++generation.current;
    playingSince.current ??= Date.now();
    Speech.speak(chunks[index], {
      rate,
      onDone: () => {
        if (gen !== generation.current) return;
        if (index + 1 < chunks.length) setIndex(index + 1);
        else {
          markStopped();
          setPlaying(false);
          setIndex(0);
        }
      },
      onError: () => {
        if (gen !== generation.current) return;
        markStopped();
        setPlaying(false);
      },
    });
    return () => {
      generation.current++;
      void Speech.stop();
    };
  }, [playing, index, rate, chunks]);

  // On leaving: stop talking and log the listen as reading time.
  const docRef = useRef(data?.doc ?? null);
  docRef.current = data?.doc ?? null;
  useEffect(
    () => () => {
      void Speech.stop();
      markStopped();
      const d = docRef.current;
      if (!d || listenedMs.current < MIN_SESSION_MS) return;
      void addSession({
        documentId: d.id,
        documentName: docTitle(d),
        startedAt: Date.now() - listenedMs.current,
        durationMs: listenedMs.current,
        source: "listen",
      }).then(() => notifyLibraryChanged());
    },
    [],
  );

  if (!data) return <ActivityIndicator style={{ marginTop: 64 }} color={t.primary} />;
  if (!data.doc || !chunks.length)
    return (
      <EmptyState
        icon="text-box-remove-outline"
        title="Nothing to read aloud"
        message="Dera hasn't found text in this document yet. Turn on “Search inside documents” in Settings and give it a moment."
      />
    );

  const toggle = () => {
    if (playing) markStopped();
    setPlaying((p) => !p);
  };
  const go = (to: number) => setIndex(Math.min(chunks.length - 1, Math.max(0, to)));
  const control = (icon: IconName, label: string, onPress: () => void, big = false) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={[big ? styles.big : styles.small, { backgroundColor: big ? t.primary : t.surfaceAlt }]}
    >
      <Icon name={icon} size={big ? 36 : 26} color={big ? t.onPrimary : t.text} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: docTitle(data.doc) }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={[type.small, { color: t.textMuted }]}>
          Part {index + 1} of {chunks.length}
        </Text>
        <View style={[styles.passage, corner.leaf, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text selectable style={[type.body, { color: t.text, lineHeight: 26 }]}>
            {chunks[index]}
          </Text>
        </View>
      </ScrollView>
      <View style={[styles.bar, { borderTopColor: t.border, backgroundColor: t.background }]}>
        <View style={[styles.track, { backgroundColor: t.border }]}>
          <View style={{ width: `${((index + 1) / chunks.length) * 100}%`, height: "100%", backgroundColor: t.primary }} />
        </View>
        <View style={styles.controls}>
          {control("skip-previous", "Previous part", () => go(index - 1))}
          {control(playing ? "pause" : "play", playing ? "Pause" : "Play", toggle, true)}
          {control("skip-next", "Next part", () => go(index + 1))}
        </View>
        <View style={styles.speeds}>
          {SPEEDS.map((s) => (
            <Chip key={s} label={`${s}×`} selected={rate === s} onPress={() => setRate(s)} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  passage: { padding: spacing.lg, borderWidth: StyleSheet.hairlineWidth },
  bar: { padding: spacing.lg, gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xl },
  speeds: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, flexWrap: "wrap" },
  big: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  small: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});
