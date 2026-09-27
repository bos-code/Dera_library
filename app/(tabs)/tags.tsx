import { router } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PromptSheet } from "@/components/PromptSheet";
import { Button, EmptyState, Icon, IconButton } from "@/components/ui";
import { ensureTag, getTags } from "@/db/tags";
import { useQuery } from "@/lib/useQuery";
import { notifyLibraryChanged } from "@/state/store";
import { font, radius, spacing, useTheme } from "@/theme";

export default function TagsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);
  const { data } = useQuery(getTags, []);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(x) => x.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
                Tags
              </Text>
              <Text style={{ color: t.textMuted, fontSize: font.small }}>Labels that cut across collections.</Text>
            </View>
            <IconButton icon="tag-plus-outline" label="New tag" onPress={() => setCreating(true)} />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/tag/[id]", params: { id: item.id } })}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.documentCount} documents`}
            android_ripple={{ color: t.border }}
            style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
          >
            <Icon name="tag-outline" color={t.primary} />
            <Text numberOfLines={2} style={[styles.name, { color: t.text }]}>
              {item.name}
            </Text>
            <Text style={{ color: t.textMuted, fontSize: font.small }}>{item.documentCount.toLocaleString()} documents</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          data ? (
            <EmptyState
              icon="tag-multiple-outline"
              title="No tags yet"
              message="Tag documents as Exam, Important, Read later… then find them all in one tap."
            >
              <Button label="Create a tag" icon="plus" variant="primary" onPress={() => setCreating(true)} />
            </EmptyState>
          ) : null
        }
      />
      <PromptSheet
        visible={creating}
        title="New tag"
        placeholder="e.g. Read later"
        confirmLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          try {
            await ensureTag(name);
            setCreating(false);
            notifyLibraryChanged();
          } catch (e) {
            Alert.alert("Tag", e instanceof Error ? e.message : "Could not create the tag");
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: font.title, fontWeight: "700", fontFamily: font.display },
  card: {
    flex: 1,
    minHeight: 104,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: 6,
    overflow: "hidden",
  },
  name: { fontSize: font.body, fontWeight: "700" },
});
