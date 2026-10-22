import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { CollectionPickerSheet } from "@/components/CollectionPickerSheet";
import { DocumentCover } from "@/components/DocumentCover";
import { Button, EmptyState, Icon } from "@/components/ui";
import { addDocumentsToCollection } from "@/db/collections";
import { searchDocuments } from "@/db/documents";
import { clearAllInbox, clearInbox, getSuggestions, restoreInbox, type FilingSuggestions } from "@/db/inbox";
import { tagDocuments } from "@/db/tags";
import { formatRelativeDate, formatSize, plural } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { docTitle } from "@/lib/title";
import { useQuery } from "@/lib/useQuery";
import { activateDocument } from "@/services/documentActions";
import { showUndo } from "@/services/toast";
import { notifyLibraryChanged } from "@/state/store";
import { corner, spacing, type, useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";

/** Newly found documents, filed one at a time: suggestions first, then a picker, or "done". */
export default function InboxScreen() {
  const t = useTheme();
  const [filing, setFiling] = useState<DocumentRecord | null>(null);
  const { data } = useQuery(async () => {
    const docs = await searchDocuments({ inbox: true, sort: "added-desc" });
    const suggestions = new Map<number, FilingSuggestions>();
    // Suggestions for the first screenful; the rest load as the inbox shrinks.
    for (const d of docs.slice(0, 30)) suggestions.set(d.id, await getSuggestions(d));
    return { docs, suggestions };
  }, []);

  const done = async (doc: DocumentRecord) => {
    haptic.select();
    await clearInbox([doc.id]);
    notifyLibraryChanged();
  };

  const allDone = async () => {
    const ids = await clearAllInbox();
    notifyLibraryChanged();
    showUndo(`${plural(ids.length, "document")} marked as filed`, () => restoreInbox(ids));
  };

  return (
    <>
      <FlatList
        data={data?.docs ?? []}
        keyExtractor={(d) => String(d.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}
        ListHeaderComponent={
          data?.docs.length ? (
            <View style={styles.head}>
              <Text style={[type.small, { color: t.textMuted, flex: 1 }]}>
                {plural(data.docs.length, "new document")} found since your last visit. File each one, or mark it done.
              </Text>
              <Button label="All done" variant="ghost" onPress={allDone} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          data ? (
            <EmptyState
              icon="inbox-outline"
              title="Inbox zero"
              message="New documents Dera finds on your phone appear here to be filed."
            />
          ) : null
        }
        renderItem={({ item }) => {
          const s = data?.suggestions.get(item.id);
          return (
            <View style={[styles.card, corner.leaf, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Pressable onPress={() => activateDocument(item)} accessibilityRole="button" style={styles.top}>
                <DocumentCover doc={item} width={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={2} style={[type.bodyStrong, { color: t.text }]}>
                    {docTitle(item)}
                  </Text>
                  <Text numberOfLines={1} style={[type.tiny, { color: t.textFaint }]}>
                    {[formatSize(item.size), formatRelativeDate(item.modifiedAt), item.folder].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </Pressable>
              {s && (s.collections.length || s.tags.length) ? (
                <View style={styles.chips}>
                  {s.collections.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={async () => {
                        haptic.tap();
                        await addDocumentsToCollection(c.id, [item.id]);
                        notifyLibraryChanged();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Add to ${c.name}${c.reason === "folder" ? ", where similar documents are" : ""}`}
                      style={[styles.chip, { backgroundColor: t.primarySoft }]}
                    >
                      <Icon name="folder-plus-outline" size={16} color={t.primary} />
                      <Text style={[type.smallStrong, { color: t.text }]}>{c.name}</Text>
                    </Pressable>
                  ))}
                  {s.tags.map((tag) => (
                    <Pressable
                      key={tag.id}
                      onPress={async () => {
                        haptic.tap();
                        await tagDocuments(tag.id, [item.id]);
                        notifyLibraryChanged();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Tag ${tag.name}`}
                      style={[styles.chip, { backgroundColor: t.surfaceAlt }]}
                    >
                      <Icon name="tag-plus-outline" size={16} color={t.textMuted} />
                      <Text style={[type.smallStrong, { color: t.text }]}>{tag.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={styles.actions}>
                <Button label="File…" icon="folder-move-outline" onPress={() => setFiling(item)} style={{ flex: 1 }} />
                <Button label="Done" icon="check" variant="ghost" onPress={() => done(item)} style={{ flex: 1 }} />
              </View>
            </View>
          );
        }}
      />
      <CollectionPickerSheet
        visible={!!filing}
        title={filing ? `File “${docTitle(filing)}”` : "File"}
        mode="multi"
        confirmLabel="File"
        onClose={() => setFiling(null)}
        onDone={async (result) => {
          const doc = filing;
          setFiling(null);
          if (!doc) return;
          for (const c of Array.isArray(result) ? result : []) await addDocumentsToCollection(c, [doc.id]);
          notifyLibraryChanged();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: spacing.xs },
  card: { borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.md },
  top: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: 999 },
  actions: { flexDirection: "row", gap: spacing.sm },
});
