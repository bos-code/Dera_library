import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { DocumentBrowser } from "@/components/DocumentBrowser";
import { PromptSheet } from "@/components/PromptSheet";
import { Sheet } from "@/components/Sheet";
import { EmptyState, IconButton, ListRow } from "@/components/ui";
import { searchDocuments } from "@/db/documents";
import { deleteTag, getTag, renameTag, untagDocument } from "@/db/tags";
import { plural } from "@/lib/format";
import { useQuery } from "@/lib/useQuery";
import { notifyLibraryChanged } from "@/state/store";
import { spacing, useTheme } from "@/theme";

export default function TagScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [dialog, setDialog] = useState<"menu" | "rename" | null>(null);
  const { data: tag } = useQuery(() => getTag(id), [id]);
  const { data: docs } = useQuery(() => searchDocuments({ tagId: id }), [id]);

  if (tag === null) return <EmptyState icon="tag-off-outline" title="Tag not found" message="It may have been deleted." />;

  const confirmDelete = () => {
    setDialog(null);
    Alert.alert(`Delete tag “${tag?.name}”?`, "The tag is removed from all documents. Documents themselves are not affected.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteTag(id);
          notifyLibraryChanged();
          router.back();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: tag?.name ?? "",
          headerRight: () => <IconButton icon="dots-vertical" label="Tag options" onPress={() => setDialog("menu")} />,
        }}
      />
      <DocumentBrowser
        documents={docs ?? []}
        header={<View style={{ height: spacing.sm }} />}
        empty={
          docs ? (
            <EmptyState
              icon="tag-outline"
              title="No documents with this tag"
              message="Select documents in your library and tap the tag icon."
            />
          ) : undefined
        }
        extraActions={[
          {
            icon: "tag-remove-outline",
            label: "Remove this tag",
            run: async (ids) => {
              for (const docId of ids) await untagDocument(id, docId);
            },
          },
        ]}
      />
      <Sheet visible={dialog === "menu"} onClose={() => setDialog(null)} title={tag?.name ?? "Tag"}>
        <ListRow icon="pencil-outline" title="Rename" onPress={() => setDialog("rename")} />
        <ListRow
          icon="delete-outline"
          iconColor={t.danger}
          title="Delete tag"
          subtitle={docs ? `Used on ${plural(docs.length, "document")}` : undefined}
          onPress={confirmDelete}
        />
      </Sheet>
      <PromptSheet
        visible={dialog === "rename"}
        title="Rename tag"
        initialValue={tag?.name}
        onClose={() => setDialog(null)}
        onSubmit={async (name) => {
          try {
            await renameTag(id, name);
            setDialog(null);
            notifyLibraryChanged();
          } catch (e) {
            Alert.alert("Tag", e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </>
  );
}
