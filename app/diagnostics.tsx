import { useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { Button, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useQuery } from "@/lib/useQuery";
import { scanner } from "@/native/scanner";
import { buildReport, clearLog, getLog } from "@/services/log";
import { showToast } from "@/services/toast";
import { spacing, type, useTheme } from "@/theme";

/** The private error log. Stays on the phone unless the user exports it. */
export default function DiagnosticsScreen() {
  const t = useTheme();
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data: entries, reload } = useQuery(() => getLog(200), []);

  const exportLog = async () => {
    try {
      const uri = await scanner().createExportFile(`dera-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`, "text/plain");
      if (!uri) return;
      await scanner().writeText(uri, await buildReport());
      showToast("Diagnostics saved");
    } catch (e) {
      Alert.alert("Couldn't export", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <FlatList
      data={entries ?? []}
      keyExtractor={(e) => String(e.id)}
      contentContainerStyle={{ paddingBottom: 48 }}
      ListHeaderComponent={
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={[type.small, { color: t.textMuted }]}>
            Errors Dera ran into, kept only on this phone. Export the log to send it to whoever helps you fix a problem.
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button label="Export" icon="export" onPress={exportLog} style={{ flex: 1 }} />
            <Button
              label="Clear"
              icon="delete-outline"
              variant="ghost"
              disabled={!entries?.length}
              onPress={async () => {
                await clearLog();
                reload();
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      }
      ListEmptyComponent={entries ? <EmptyState icon="check-circle-outline" title="No problems recorded" /> : null}
      renderItem={({ item }) => (
        <Text
          onPress={() => setExpanded(expanded === item.id ? null : item.id)}
          selectable
          style={[styles.row, { borderBottomColor: t.border }]}
        >
          <Text style={[type.tiny, { color: item.level === "error" ? t.danger : t.warning }]}>{item.level.toUpperCase()} </Text>
          <Text style={[type.tiny, { color: t.textFaint }]}>
            {formatDateTime(item.at)}
            {"\n"}
          </Text>
          <Text style={[type.small, { color: t.text }]}>{item.message}</Text>
          {expanded === item.id && item.detail ? (
            <Text style={[type.tiny, { color: t.textMuted }]}>{`\n${item.detail}`}</Text>
          ) : null}
        </Text>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
