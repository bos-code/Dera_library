import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { addSession } from "@/db/reading";
import { formatDuration, startOfDay } from "@/lib/readingStats";
import { docTitle } from "@/lib/title";
import { discardReading, saveReading } from "@/services/readingSession";
import { notifyLibraryChanged, useAppState } from "@/state/store";
import { corner, spacing, type, useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";
import { Sheet } from "./Sheet";
import { Button, Chip, Icon, IconButton } from "./ui";

const PRESETS = [5, 10, 15, 20, 30, 45, 60, 90];

/** Minute stepper with quick presets. */
function DurationPicker({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.stepper}>
        <IconButton icon="minus" label="5 minutes less" onPress={() => onChange(Math.max(1, minutes - 5))} />
        <Text style={[styles.big, { color: t.text }]} accessibilityLiveRegion="polite" accessibilityLabel={`${minutes} minutes`}>
          {formatDuration(minutes * 60_000)}
        </Text>
        <IconButton icon="plus" label="5 minutes more" onPress={() => onChange(Math.min(600, minutes + 5))} />
      </View>
      <View style={styles.chips}>
        {PRESETS.map((m) => (
          <Chip key={m} label={`${m} min`} selected={minutes === m} onPress={() => onChange(m)} />
        ))}
      </View>
    </View>
  );
}

/** Shown when the user returns from reading in another app: confirm, adjust or discard the estimate. */
export function ReadingPromptSheet() {
  const t = useTheme();
  const prompt = useAppState((s) => s.readingPrompt);
  const [minutes, setMinutes] = useState(15);
  useEffect(() => {
    if (prompt) setMinutes(prompt.suggestedMs ? Math.max(1, Math.round(prompt.suggestedMs / 60_000)) : 15);
  }, [prompt]);
  if (!prompt) return null;
  const save = () => void saveReading(prompt, minutes * 60_000, prompt.suggestedMs ? "estimate" : "manual");
  return (
    <Sheet
      visible
      // Dismissing keeps the estimate: the user did read; "Discard" is the explicit opt-out.
      onClose={save}
      title={prompt.suggestedMs ? "Log this reading?" : "How long did you read?"}
      footer={
        <>
          <Button label="Discard" variant="ghost" onPress={discardReading} style={{ flex: 1 }} />
          <Button label="Save" icon="check" variant="primary" onPress={save} style={{ flex: 2 }} />
        </>
      }
    >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <View style={[styles.docRow, corner.petal, { backgroundColor: t.primarySoft }]}>
          <Icon name="book-open-variant" color={t.primary} />
          <Text numberOfLines={2} style={[type.bodyStrong, { color: t.text, flex: 1 }]}>
            {prompt.documentName}
          </Text>
        </View>
        <DurationPicker minutes={minutes} onChange={setMinutes} />
        <Text style={[type.tiny, { color: t.textFaint }]}>
          Estimated from the time you spent in the other app. Adjust it if you took a break.
        </Text>
      </View>
    </Sheet>
  );
}

/** Manual entry, from a document's page (fixed document) or the Reading tab (pick one). */
export function LogReadingSheet({
  visible,
  onClose,
  document,
  candidates = [],
}: {
  visible: boolean;
  onClose: () => void;
  document?: Pick<DocumentRecord, "id" | "name">;
  candidates?: DocumentRecord[];
}) {
  const t = useTheme();
  const [minutes, setMinutes] = useState(20);
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [picked, setPicked] = useState<Pick<DocumentRecord, "id" | "name"> | undefined>(document);
  useEffect(() => {
    if (!visible) return;
    setMinutes(20);
    setDay("today");
    setPicked(document ?? candidates[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const save = async () => {
    if (!picked) return;
    const durationMs = minutes * 60_000;
    // Place the session so it ends now (today) or at the same time yesterday.
    const end = day === "today" ? Date.now() : Date.now() - 86_400_000;
    const startedAt = Math.max(startOfDay(end), end - durationMs);
    await addSession({ documentId: picked.id, documentName: docTitle(picked), startedAt, durationMs, source: "manual" });
    notifyLibraryChanged();
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Log reading"
      footer={
        <>
          <Button label="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button label="Save" icon="check" variant="primary" disabled={!picked} onPress={save} style={{ flex: 2 }} />
        </>
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {document ? (
          <Text numberOfLines={2} style={[type.bodyStrong, { color: t.text }]}>
            {docTitle(document)}
          </Text>
        ) : candidates.length ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={[type.label, { color: t.textMuted }]}>DOCUMENT</Text>
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
                    {docTitle(d)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={[type.small, { color: t.textMuted }]}>Open a document first, then log time from its page.</Text>
        )}
        <View style={styles.chips}>
          <Chip label="Today" selected={day === "today"} onPress={() => setDay("today")} />
          <Chip label="Yesterday" selected={day === "yesterday"} onPress={() => setDay("yesterday")} />
        </View>
        <DurationPicker minutes={minutes} onChange={setMinutes} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.lg },
  big: { ...type.title, minWidth: 140, textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  docRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, minHeight: 48 },
});
