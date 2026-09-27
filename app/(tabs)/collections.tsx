import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PromptSheet } from "@/components/PromptSheet";
import { Button, EmptyState, Icon, IconButton, ListRow } from "@/components/ui";
import { buildTree, createCollection, flattenTree, getAllCollections } from "@/db/collections";
import { plural } from "@/lib/format";
import { useQuery } from "@/lib/useQuery";
import { notifyLibraryChanged } from "@/state/store";
import { font, spacing, useTheme } from "@/theme";

export default function CollectionsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { data } = useQuery(getAllCollections, []);

  const rows = useMemo(() => {
    const flat = flattenTree(buildTree(data ?? []));
    const hidden = new Set<string>();
    return flat.filter((n) => {
      if (n.parentId && (collapsed.has(n.parentId) || hidden.has(n.parentId))) {
        hidden.add(n.id);
        return false;
      }
      return true;
    });
  }, [data, collapsed]);

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={rows}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
                Collections
              </Text>
              <Text style={{ color: t.textMuted, fontSize: font.small }}>Virtual shelves. Files stay where they are.</Text>
            </View>
            <IconButton icon="folder-plus-outline" label="New collection" onPress={() => setCreating(true)} />
          </View>
        }
        renderItem={({ item }) => (
          <ListRow
            indent={item.depth}
            icon={item.depth === 0 ? "bookshelf" : "folder-outline"}
            iconColor={item.depth === 0 ? t.primary : t.textMuted}
            title={item.name}
            subtitle={`${plural(item.totalCount, "document")}${item.children.length ? ` · ${plural(item.children.length, "sub-collection")}` : ""}`}
            onPress={() => router.push({ pathname: "/collection/[id]", params: { id: item.id } })}
            right={
              item.children.length ? (
                <IconButton
                  icon={collapsed.has(item.id) ? "chevron-down" : "chevron-up"}
                  label={collapsed.has(item.id) ? `Expand ${item.name}` : `Collapse ${item.name}`}
                  onPress={() => toggle(item.id)}
                  color={t.textFaint}
                />
              ) : (
                <Icon name="chevron-right" color={t.textFaint} />
              )
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: t.border }]} />}
        ListEmptyComponent={
          data ? (
            <EmptyState
              icon="folder-multiple-outline"
              title="Organize your way"
              message="Create collections like School → Physics → Mechanics. A document can live in as many collections as you like."
            >
              <Button label="Create a collection" icon="plus" variant="primary" onPress={() => setCreating(true)} />
            </EmptyState>
          ) : null
        }
      />
      <PromptSheet
        visible={creating}
        title="New collection"
        placeholder="e.g. School"
        confirmLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          try {
            const id = await createCollection(name);
            setCreating(false);
            notifyLibraryChanged();
            router.push({ pathname: "/collection/[id]", params: { id } });
          } catch (e) {
            Alert.alert("Collection", e instanceof Error ? e.message : "Could not create the collection");
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
    paddingBottom: spacing.md,
  },
  title: { fontSize: font.title, fontWeight: "700", fontFamily: font.display },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
});
