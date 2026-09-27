import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CollectionPickerSheet } from "@/components/CollectionPickerSheet";
import { DocumentBrowser } from "@/components/DocumentBrowser";
import { PromptSheet } from "@/components/PromptSheet";
import { SearchBar } from "@/components/SearchBar";
import { Sheet } from "@/components/Sheet";
import { Button, EmptyState, Icon, IconButton, ListRow, SectionTitle } from "@/components/ui";
import {
  buildTree,
  createCollection,
  deleteCollection,
  getAllCollections,
  moveCollection,
  removeDocumentsFromCollection,
  renameCollection,
  type CollectionNode,
} from "@/db/collections";
import { searchDocuments } from "@/db/documents";
import { plural } from "@/lib/format";
import { useDebounced, useQuery } from "@/lib/useQuery";
import { notifyLibraryChanged } from "@/state/store";
import { font, spacing, useTheme } from "@/theme";

type Dialog = "menu" | "rename" | "new-child" | "move" | null;

function findNode(nodes: CollectionNode[], id: string): CollectionNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
}

export default function CollectionScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const query = useDebounced(text, 120);

  const { data: tree } = useQuery(async () => {
    const all = await getAllCollections();
    const byId = new Map(all.map((c) => [c.id, c]));
    const trail = [];
    let cur = byId.get(id);
    while (cur && trail.length < 32) {
      trail.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return { node: findNode(buildTree(all), id), trail };
  }, [id]);
  const { data: docs } = useQuery(() => searchDocuments({ collectionId: id, text: query, sort: "name-asc" }), [id, query]);

  const node = tree?.node;
  if (tree && !node) {
    return <EmptyState icon="folder-remove-outline" title="Collection not found" message="It may have been deleted." />;
  }

  const act = async (task: () => Promise<void>) => {
    try {
      await task();
      setDialog(null);
      notifyLibraryChanged();
    } catch (e) {
      Alert.alert("Collection", e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = () => {
    setDialog(null);
    if (!node) return;
    const nested = node.children.length ? ` and its ${plural(node.children.length, "sub-collection")}` : "";
    Alert.alert(
      `Delete “${node.name}”?`,
      `This deletes the collection${nested}. Your documents and files are not deleted; they stay in your library.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            act(async () => {
              await deleteCollection(node.id);
              router.back();
            }),
        },
      ],
    );
  };

  const header = node ? (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
      {tree && tree.trail.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.crumbs}>
          {tree.trail.map((c, i) => (
            <View key={c.id} style={styles.crumbItem}>
              {i > 0 ? <Icon name="chevron-right" size={16} color={t.textFaint} /> : null}
              <Pressable
                disabled={c.id === id}
                onPress={() => router.dismissTo({ pathname: "/collection/[id]", params: { id: c.id } })}
                accessibilityRole="link"
              >
                <Text style={{ color: c.id === id ? t.text : t.primary, fontSize: font.small, fontWeight: "600" }}>{c.name}</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Add documents"
          icon="file-plus-outline"
          variant="primary"
          onPress={() => router.push({ pathname: "/add-documents", params: { collectionId: id } })}
          style={{ flex: 1 }}
        />
        <Button label="Sub-collection" icon="folder-plus-outline" onPress={() => setDialog("new-child")} style={{ flex: 1 }} />
      </View>
      {node.children.length ? (
        <>
          <SectionTitle>Sub-collections</SectionTitle>
          {node.children.map((c) => (
            <ListRow
              key={c.id}
              icon="folder-outline"
              title={c.name}
              subtitle={plural(c.totalCount, "document")}
              onPress={() => router.push({ pathname: "/collection/[id]", params: { id: c.id } })}
              right={<Icon name="chevron-right" color={t.textFaint} />}
            />
          ))}
        </>
      ) : null}
      <SectionTitle>{`Documents${docs ? ` · ${docs.length.toLocaleString()}` : ""}`}</SectionTitle>
      {node.documentCount > 8 || text ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <SearchBar value={text} onChangeText={setText} placeholder={`Search in ${node.name}`} />
        </View>
      ) : null}
    </View>
  ) : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          title: node?.name ?? "",
          headerRight: () => <IconButton icon="dots-vertical" label="Collection options" onPress={() => setDialog("menu")} />,
        }}
      />
      <DocumentBrowser
        documents={docs ?? []}
        header={header}
        empty={
          docs && !text ? (
            <EmptyState
              icon="file-document-multiple-outline"
              title="No documents here yet"
              message="Add documents from your library. They stay where they are on your phone."
            />
          ) : docs ? (
            <EmptyState icon="file-search-outline" title="No matches" />
          ) : undefined
        }
        extraActions={[
          {
            icon: "folder-remove-outline",
            label: "Remove from this collection",
            run: (ids) => removeDocumentsFromCollection(id, ids),
          },
        ]}
      />

      <Sheet visible={dialog === "menu"} onClose={() => setDialog(null)} title={node?.name ?? "Collection"}>
        <ListRow icon="pencil-outline" title="Rename" onPress={() => setDialog("rename")} />
        <ListRow icon="folder-move-outline" title="Move to…" onPress={() => setDialog("move")} />
        <ListRow
          icon="delete-outline"
          iconColor={t.danger}
          title="Delete collection"
          subtitle="Documents are never deleted"
          onPress={confirmDelete}
        />
      </Sheet>
      <PromptSheet
        visible={dialog === "rename"}
        title="Rename collection"
        initialValue={node?.name}
        onClose={() => setDialog(null)}
        onSubmit={(name) => act(() => renameCollection(id, name))}
      />
      <PromptSheet
        visible={dialog === "new-child"}
        title={`New collection in ${node?.name ?? ""}`}
        placeholder="e.g. Mechanics"
        confirmLabel="Create"
        onClose={() => setDialog(null)}
        onSubmit={(name) => act(async () => void (await createCollection(name, id)))}
      />
      <CollectionPickerSheet
        visible={dialog === "move"}
        title={`Move “${node?.name ?? ""}” to…`}
        mode="single"
        allowRoot
        excludeSubtreeOf={id}
        initialSelected={node?.parentId ? [node.parentId] : ["__root__"]}
        confirmLabel="Move"
        onClose={() => setDialog(null)}
        onDone={(result) => act(() => moveCollection(id, Array.isArray(result) ? null : result))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  crumbs: { paddingHorizontal: spacing.lg, alignItems: "center" },
  crumbItem: { flexDirection: "row", alignItems: "center", gap: 2, paddingRight: 2 },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
