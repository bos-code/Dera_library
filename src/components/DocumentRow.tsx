import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatRelativeDate, formatSize } from "@/lib/format";
import { font, radius, spacing, useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";
import { TypeBadge } from "./TypeBadge";
import { Icon } from "./ui";

interface Props {
  doc: DocumentRecord;
  selected?: boolean;
  selecting?: boolean;
  onPress: (doc: DocumentRecord) => void;
  onLongPress?: (doc: DocumentRecord) => void;
}

function DocumentRowImpl({ doc, selected, selecting, onPress, onLongPress }: Props) {
  const t = useTheme();
  const unavailable = doc.status !== "available";
  const meta = [formatSize(doc.size), formatRelativeDate(doc.modifiedAt)].join(" · ");
  return (
    <Pressable
      onPress={() => onPress(doc)}
      onLongPress={onLongPress ? () => onLongPress(doc) : undefined}
      delayLongPress={300}
      android_ripple={{ color: t.border }}
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityState={selecting ? { checked: !!selected } : undefined}
      accessibilityLabel={`${doc.name}. ${meta}${doc.folder ? `. In ${doc.folder}` : ""}${doc.isFavorite ? ". Favorite" : ""}${
        unavailable ? `. ${doc.status === "missing" ? "Missing" : "No access"}` : ""
      }`}
      accessibilityHint={selecting ? "Toggles selection" : "Opens document details. Long press to select"}
      style={[styles.row, selected && { backgroundColor: t.primarySoft }]}
    >
      {selecting ? (
        <View
          style={[
            styles.check,
            { borderColor: selected ? t.primary : t.textFaint, backgroundColor: selected ? t.primary : "transparent" },
          ]}
        >
          {selected ? <Icon name="check" size={16} color={t.onPrimary} /> : null}
        </View>
      ) : null}
      <View style={{ opacity: unavailable ? 0.45 : 1 }}>
        <TypeBadge type={doc.type} extension={doc.extension} />
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={[styles.name, { color: unavailable ? t.textMuted : t.text }]}>
          {doc.name}
        </Text>
        <View style={styles.metaRow}>
          {doc.isFavorite ? <Icon name="star" size={14} color={t.warning} /> : null}
          {unavailable ? (
            <Text style={[styles.status, { color: t.warning, backgroundColor: t.warningSoft }]}>
              {doc.status === "missing" ? "Missing" : "No access"}
            </Text>
          ) : null}
          <Text numberOfLines={1} style={[styles.meta, { color: t.textMuted }]}>
            {meta}
          </Text>
        </View>
        {doc.folder ? (
          <Text numberOfLines={1} style={[styles.folder, { color: t.textFaint }]}>
            {doc.folder}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const DocumentRow = memo(DocumentRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    minHeight: 76,
  },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 2 },
  name: { fontSize: font.body, fontWeight: "600", lineHeight: 21 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontSize: font.small, flexShrink: 1 },
  folder: { fontSize: font.tiny },
  status: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
});
