import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { activateDocument, showDetails } from "@/services/documentActions";
import { useAppState } from "@/state/store";
import { spacing, type, useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";
import { DocumentCard } from "./DocumentCard";
import { Icon } from "./ui";

const CARD_WIDTH = 96;

/** A titled, horizontally scrolling row of covers (Continue reading, Favorites…). */
export function Shelf({ title, documents, onSeeAll }: { title: string; documents: DocumentRecord[]; onSeeAll?: () => void }) {
  const t = useTheme();
  const tapOpens = useAppState((s) => s.appearance.tapAction === "open");
  if (!documents.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[type.heading, { color: t.text, flex: 1 }]}>
          {title}
        </Text>
        {onSeeAll ? (
          <Pressable
            onPress={onSeeAll}
            accessibilityRole="button"
            accessibilityLabel={`See all ${title}`}
            hitSlop={8}
            style={styles.more}
          >
            <Text style={[type.smallStrong, { color: t.primary }]}>See all</Text>
            <Icon name="chevron-right" size={18} color={t.primary} />
          </Pressable>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={documents}
        keyExtractor={(d) => String(d.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => (
          <DocumentCard
            doc={item}
            width={CARD_WIDTH}
            compact
            onPress={activateDocument}
            onInfo={tapOpens ? showDetails : undefined}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg },
  more: { flexDirection: "row", alignItems: "center" },
  row: { gap: spacing.md, paddingHorizontal: spacing.lg },
});
