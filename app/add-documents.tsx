import { FlashList } from "@shopify/flash-list";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DocumentRow } from "@/components/DocumentRow";
import { SearchBar } from "@/components/SearchBar";
import { Button, Chip, EmptyState } from "@/components/ui";
import { addDocumentsToCollection, getCollection } from "@/db/collections";
import { searchDocuments } from "@/db/documents";
import { TYPE_FILTERS } from "@/lib/fileTypes";
import { plural } from "@/lib/format";
import { useDebounced, useQuery } from "@/lib/useQuery";
import { notifyLibraryChanged } from "@/state/store";
import { spacing, useTheme } from "@/theme";
import type { DocumentRecord, DocumentType } from "@/types/document";

/** Searchable multi-select for adding library documents to a collection. */
export default function AddDocumentsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();
  const [text, setText] = useState("");
  const [type, setType] = useState<DocumentType | "all">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const query = useDebounced(text, 120);

  const { data: collection } = useQuery(() => getCollection(collectionId), [collectionId]);
  const { data: docs } = useQuery(() => searchDocuments({ text: query, type }), [query, type]);
  const { data: already } = useQuery(
    async () => new Set((await searchDocuments({ collectionId })).map((d) => d.id)),
    [collectionId],
  );

  const toggle = useCallback((doc: DocumentRecord) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(doc.id)) next.delete(doc.id);
      else next.add(doc.id);
      return next;
    });
  }, []);

  const save = async () => {
    setSaving(true);
    await addDocumentsToCollection(collectionId, [...selected]);
    notifyLibraryChanged();
    router.back();
  };

  const list = (docs ?? []).filter((d) => !already?.has(d.id));

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: collection ? `Add to ${collection.name}` : "Add documents" }} />
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <SearchBar value={text} onChangeText={setText} autoFocus />
        <View style={styles.chips}>
          {TYPE_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} selected={type === f.value} onPress={() => setType(f.value)} />
          ))}
        </View>
      </View>
      <FlashList
        data={list}
        extraData={selected}
        keyExtractor={(d) => String(d.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <DocumentRow doc={item} selecting selected={selected.has(item.id)} onPress={toggle} />}
        ListEmptyComponent={
          docs ? <EmptyState icon="file-search-outline" title="Nothing to add" message="No other documents match." /> : null
        }
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + spacing.md, backgroundColor: t.background, borderTopColor: t.border },
        ]}
      >
        <Button
          label={selected.size ? `Add ${plural(selected.size, "document")}` : "Select documents"}
          icon="check"
          variant="primary"
          disabled={!selected.size}
          busy={saving}
          onPress={save}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
