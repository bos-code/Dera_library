import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatSize } from "@/lib/format";
import { docTitle } from "@/lib/title";
import { spacing, type, useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";
import { DocumentCover } from "./DocumentCover";
import { Icon } from "./ui";

interface Props {
  doc: DocumentRecord;
  width: number;
  selected?: boolean;
  selecting?: boolean;
  onPress: (doc: DocumentRecord) => void;
  onLongPress?: (doc: DocumentRecord) => void;
  /** Shown as an ⓘ button when tapping the card opens the file. */
  onInfo?: (doc: DocumentRecord) => void;
  /** Hide size line, e.g. on compact shelves. */
  compact?: boolean;
}

/** Grid/shelf tile: cover on top, title underneath. */
function DocumentCardImpl({ doc, width, selected, selecting, onPress, onLongPress, onInfo, compact }: Props) {
  const t = useTheme();
  const title = docTitle(doc);
  return (
    <Pressable
      onPress={() => onPress(doc)}
      onLongPress={onLongPress ? () => onLongPress(doc) : undefined}
      delayLongPress={300}
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityState={selecting ? { checked: !!selected } : undefined}
      accessibilityLabel={`${title}, ${doc.extension.toUpperCase()}, ${formatSize(doc.size)}${doc.isFavorite ? ", favorite" : ""}${
        doc.status !== "available" ? (doc.status === "missing" ? ", missing" : ", no access") : ""
      }`}
      accessibilityHint={selecting ? "Toggles selection" : "Opens document details. Long press to select"}
      style={({ pressed }) => [styles.card, { width, opacity: pressed ? 0.85 : 1 }]}
    >
      <View>
        <DocumentCover doc={doc} width={width} style={selected ? { borderWidth: 2, borderColor: t.primary } : undefined} />
        {doc.isFavorite ? (
          <View style={[styles.badge, styles.fav, { backgroundColor: t.surface }]}>
            <Icon name="star" size={14} color={t.warning} />
          </View>
        ) : null}
        {onInfo && !selecting ? (
          <Pressable
            onPress={() => onInfo(doc)}
            accessibilityRole="button"
            accessibilityLabel={`Details for ${title}`}
            hitSlop={10}
            style={[styles.badge, styles.info, { backgroundColor: t.surface }]}
          >
            <Icon name="information-variant" size={14} color={t.textMuted} />
          </Pressable>
        ) : null}
        {selecting ? (
          <View
            style={[
              styles.badge,
              styles.check,
              { borderColor: selected ? t.primary : t.surface, backgroundColor: selected ? t.primary : "rgba(0,0,0,0.25)" },
            ]}
          >
            {selected ? <Icon name="check" size={14} color={t.onPrimary} /> : null}
          </View>
        ) : null}
      </View>
      <Text numberOfLines={2} style={[styles.title, { color: doc.status === "available" ? t.text : t.textMuted }]}>
        {title}
      </Text>
      {compact ? null : <Text style={[styles.meta, { color: t.textFaint }]}>{formatSize(doc.size)}</Text>}
    </Pressable>
  );
}

export const DocumentCard = memo(DocumentCardImpl);

const styles = StyleSheet.create({
  card: { gap: 6 },
  title: { ...type.smallStrong, lineHeight: 18 },
  meta: { ...type.tiny, marginTop: -4 },
  badge: { position: "absolute", width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  fav: { right: spacing.xs, top: spacing.xs },
  info: { right: spacing.xs, bottom: spacing.xs },
  check: { left: spacing.xs, top: spacing.xs, borderWidth: 2 },
});
