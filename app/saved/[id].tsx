import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { DocumentBrowser } from "@/components/DocumentBrowser";
import { PromptSheet } from "@/components/PromptSheet";
import { Sheet } from "@/components/Sheet";
import { EmptyState, IconButton, ListRow } from "@/components/ui";
import { deleteSavedSearch, getSavedSearch, renameSavedSearch, restoreSavedSearch, runSavedSearch } from "@/db/savedSearches";
import { plural } from "@/lib/format";
import { useQuery } from "@/lib/useQuery";
import { showUndo } from "@/services/toast";
import { notifyLibraryChanged, useAppState } from "@/state/store";
import { spacing, type, useTheme } from "@/theme";

export default function SavedSearchScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const layout = useAppState((s) => s.library.layout);
  const [dialog, setDialog] = useState<"menu" | "rename" | null>(null);
  const { data } = useQuery(async () => {
    const saved = await getSavedSearch(id);
    return saved ? { saved, docs: await runSavedSearch(saved.query) } : null;
  }, [id]);

  if (data === null)
    return <EmptyState icon="magnify-close" title="Smart collection not found" message="It may have been deleted." />;
  const q = data?.saved.query;
  const summary = q
    ? [
        q.text ? `“${q.text}”` : null,
        q.type && q.type !== "all" ? q.type.toUpperCase() : null,
        q.view && q.view !== "all" ? q.view : null,
        q.shelf,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <>
      <Stack.Screen
        options={{
          title: data?.saved.name ?? "",
          headerRight: () => (
            <IconButton icon="dots-vertical" label="Smart collection options" onPress={() => setDialog("menu")} />
          ),
        }}
      />
      <DocumentBrowser
        documents={data?.docs ?? []}
        layout={layout}
        header={
          <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
            <Text style={[type.tiny, { color: t.textMuted }]}>
              Updates by itself{summary ? ` · ${summary}` : ""}
              {data ? ` · ${plural(data.docs.length, "document")}` : ""}
            </Text>
          </View>
        }
        empty={
          data ? (
            <EmptyState icon="magnify" title="Nothing matches right now" message="Documents appear here as soon as they match." />
          ) : undefined
        }
      />
      <Sheet visible={dialog === "menu"} onClose={() => setDialog(null)} title={data?.saved.name ?? "Smart collection"}>
        <ListRow icon="pencil-outline" title="Rename" onPress={() => setDialog("rename")} />
        <ListRow
          icon="delete-outline"
          iconColor={t.danger}
          title="Delete smart collection"
          subtitle="Documents are not affected"
          onPress={async () => {
            setDialog(null);
            const removed = await deleteSavedSearch(id);
            notifyLibraryChanged();
            router.back();
            if (removed) showUndo(`“${removed.name}” deleted`, () => restoreSavedSearch(removed));
          }}
        />
      </Sheet>
      <PromptSheet
        visible={dialog === "rename"}
        title="Rename smart collection"
        initialValue={data?.saved.name}
        onClose={() => setDialog(null)}
        onSubmit={async (name) => {
          try {
            await renameSavedSearch(id, name);
            setDialog(null);
            notifyLibraryChanged();
          } catch (e) {
            Alert.alert("Rename", e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </>
  );
}
