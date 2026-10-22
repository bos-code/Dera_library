import { ScrollView, StyleSheet, Text, View } from "react-native";
import { DocumentRow } from "@/components/DocumentRow";
import { EmptyState, SectionTitle } from "@/components/ui";
import { getStorageInsights } from "@/db/storage";
import { TYPE_LABEL } from "@/lib/fileTypes";
import { formatSize, plural } from "@/lib/format";
import { useQuery } from "@/lib/useQuery";
import { activateDocument } from "@/services/documentActions";
import { setState } from "@/state/store";
import { router } from "expo-router";
import { corner, spacing, type, useTheme } from "@/theme";

/** Where the space goes. Read-only: nothing here deletes files. */
export default function StorageScreen() {
  const t = useTheme();
  const { data } = useQuery(() => getStorageInsights(), []);
  if (!data) return <View style={{ flex: 1 }} />;
  if (!data.count) return <EmptyState icon="harddisk" title="No documents yet" message="Scan your phone first." />;
  const maxType = Math.max(1, ...data.byType.map((x) => x.bytes));
  const maxFolder = Math.max(1, ...data.byFolder.map((x) => x.bytes));

  const bar = (bytes: number, max: number, color: string) => (
    <View style={[styles.track, { backgroundColor: t.surfaceAlt }]}>
      <View style={[styles.fill, { width: `${Math.max(2, (bytes / max) * 100)}%`, backgroundColor: color }]} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={[styles.hero, corner.hero, { backgroundColor: t.surfaceAlt }]}>
        <Text style={[type.hero, { color: t.text }]}>{formatSize(data.totalBytes)}</Text>
        <Text style={[type.small, { color: t.textMuted }]}>in {plural(data.count, "document")} on this phone</Text>
      </View>

      <View style={styles.tiles}>
        <View style={[styles.tile, corner.petal, { backgroundColor: t.warningSoft }]}>
          <Text style={[type.heading, { color: t.text }]}>{formatSize(data.duplicates.wastedBytes)}</Text>
          <Text style={[type.tiny, { color: t.textMuted }]}>
            in duplicate copies ({plural(data.duplicates.groups, "document")})
          </Text>
        </View>
        <View style={[styles.tile, corner.petal, { backgroundColor: t.surfaceAlt }]}>
          <Text style={[type.heading, { color: t.text }]}>{formatSize(data.untouched.bytes)}</Text>
          <Text style={[type.tiny, { color: t.textMuted }]}>large files untouched for a year ({data.untouched.count})</Text>
        </View>
      </View>
      {data.duplicates.groups ? (
        <Text
          onPress={() => {
            setState((s) => ({ library: { ...s.library, shelf: "duplicates", text: "", type: "all", view: "all" } }));
            router.navigate("/");
          }}
          accessibilityRole="link"
          style={[type.smallStrong, styles.link, { color: t.primary }]}
        >
          Review duplicates in the library →
        </Text>
      ) : null}

      <SectionTitle>By type</SectionTitle>
      {data.byType.map((x) => (
        <View key={x.type} style={styles.line}>
          <View style={styles.lineHead}>
            <Text style={[type.small, { color: t.text, flex: 1 }]}>{TYPE_LABEL[x.type]}</Text>
            <Text style={[type.smallStrong, { color: t.textMuted }]}>
              {formatSize(x.bytes)} · {x.count.toLocaleString()}
            </Text>
          </View>
          {bar(x.bytes, maxType, t.type[x.type])}
        </View>
      ))}

      <SectionTitle>By folder</SectionTitle>
      {data.byFolder.map((x) => (
        <View key={x.folder} style={styles.line}>
          <View style={styles.lineHead}>
            <Text numberOfLines={1} style={[type.small, { color: t.text, flex: 1 }]}>
              {x.folder}
            </Text>
            <Text style={[type.smallStrong, { color: t.textMuted }]}>
              {formatSize(x.bytes)} · {x.count.toLocaleString()}
            </Text>
          </View>
          {bar(x.bytes, maxFolder, t.primary)}
        </View>
      ))}

      <SectionTitle>Largest documents</SectionTitle>
      {data.largest.map((d) => (
        <DocumentRow key={d.id} doc={d} onPress={activateDocument} />
      ))}

      {data.untouched.docs.length ? (
        <>
          <SectionTitle>Large and untouched for a year</SectionTitle>
          {data.untouched.docs.map((d) => (
            <DocumentRow key={d.id} doc={d} onPress={activateDocument} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { margin: spacing.lg, padding: spacing.xl, gap: 4 },
  tiles: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg },
  tile: { flex: 1, padding: spacing.md, gap: 2 },
  link: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  line: { paddingHorizontal: spacing.lg, paddingVertical: 6, gap: 4 },
  lineHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
});
