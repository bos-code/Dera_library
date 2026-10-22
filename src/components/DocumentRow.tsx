import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatRelativeDate, formatSize } from "@/lib/format";
import { docTitle } from "@/lib/title";
import type { StackInfo } from "@/lib/versions";
import { radius, spacing, type, useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";
import { DocumentCover } from "./DocumentCover";
import { Snippet } from "./Snippet";
import { Icon, IconButton } from "./ui";

interface Props {
  doc: DocumentRecord;
  selected?: boolean;
  selecting?: boolean;
  onPress: (doc: DocumentRecord) => void;
  onLongPress?: (doc: DocumentRecord) => void;
  /** Version stack this row heads or belongs to (Library list only). */
  stack?: StackInfo;
  onToggleStack?: (key: string) => void;
  /** Shown as an ⓘ button when tapping the row opens the file instead of the details. */
  onInfo?: (doc: DocumentRecord) => void;
}

function DocumentRowImpl({ doc, selected, selecting, onPress, onLongPress, onInfo, stack, onToggleStack }: Props) {
  const t = useTheme();
  const unavailable = doc.status !== "available";
  const title = docTitle(doc);
  const compact = t.density === "compact";
  const meta = [formatSize(doc.size), formatRelativeDate(doc.modifiedAt)].join(" · ");
  return (
    <Pressable
      onPress={() => onPress(doc)}
      onLongPress={onLongPress ? () => onLongPress(doc) : undefined}
      delayLongPress={300}
      android_ripple={{ color: t.border }}
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityState={selecting ? { checked: !!selected } : undefined}
      accessibilityLabel={`${title}, ${doc.extension.toUpperCase()}. ${meta}${doc.folder ? `. In ${doc.folder}` : ""}${doc.isFavorite ? ". Favorite" : ""}${
        unavailable ? `. ${doc.status === "missing" ? "Missing" : "No access"}` : ""
      }`}
      accessibilityHint={
        selecting
          ? "Toggles selection"
          : onInfo
            ? "Opens the document. Long press to select"
            : "Opens document details. Long press to select"
      }
      style={[
        styles.row,
        compact && styles.compact,
        stack && !stack.head && { paddingLeft: spacing.lg + 24 },
        selected && { backgroundColor: t.primarySoft },
      ]}
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
      <DocumentCover doc={doc} width={compact ? 30 : 40} />
      <View style={styles.body}>
        <Text numberOfLines={compact ? 1 : 2} style={[styles.name, { color: unavailable ? t.textMuted : t.text }]}>
          {title}
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
        {doc.snippet ? <Snippet text={doc.snippet} /> : null}
        {stack?.head && onToggleStack ? (
          <Pressable
            onPress={() => onToggleStack(stack.key)}
            accessibilityRole="button"
            accessibilityState={{ expanded: stack.expanded }}
            accessibilityLabel={`${stack.count} versions. ${stack.expanded ? "Hide" : "Show"} older versions`}
            hitSlop={8}
            style={[styles.versions, { backgroundColor: t.surfaceAlt }]}
          >
            <Icon name="layers-outline" size={14} color={t.textMuted} />
            <Text style={[type.tiny, { color: t.textMuted }]}>{stack.count} versions</Text>
            <Icon name={stack.expanded ? "chevron-up" : "chevron-down"} size={14} color={t.textMuted} />
          </Pressable>
        ) : null}
        {doc.folder && !compact && !doc.snippet ? (
          <Text numberOfLines={1} style={[styles.folder, { color: t.textFaint }]}>
            {doc.folder}
          </Text>
        ) : null}
      </View>
      {onInfo && !selecting ? (
        <IconButton icon="information-outline" label={`Details for ${title}`} onPress={() => onInfo(doc)} color={t.textFaint} />
      ) : null}
    </Pressable>
  );
}

export const DocumentRow = memo(DocumentRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: 10,
    minHeight: 76,
  },
  versions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 2,
  },
  compact: { minHeight: 56, paddingVertical: 6 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 2 },
  name: { ...type.bodyStrong, lineHeight: 21 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { ...type.small, flexShrink: 1 },
  folder: { ...type.tiny },
  status: {
    ...type.tiny,
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
});
