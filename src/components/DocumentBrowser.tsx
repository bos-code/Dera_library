import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Alert, BackHandler, RefreshControl, StyleSheet, Text, View } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setFavorite } from "@/db/activity";
import { addDocumentsToCollection } from "@/db/collections";
import { tagDocuments } from "@/db/tags";
import { plural } from "@/lib/format";
import { notifyLibraryChanged } from "@/state/store";
import { font, radius, spacing, useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";
import { CollectionPickerSheet } from "./CollectionPickerSheet";
import { DocumentRow } from "./DocumentRow";
import { TagPickerSheet } from "./TagPickerSheet";
import { IconButton, type IconName } from "./ui";

export interface BulkAction {
  icon: IconName;
  label: string;
  run: (ids: number[]) => Promise<void>;
}

/**
 * The shared document list: virtualized rows, long-press multi-select and bulk organization
 * (favorite, add to collections, tag, plus screen-specific actions).
 */
export function DocumentBrowser({
  documents,
  header,
  empty,
  refreshing,
  onRefresh,
  extraActions = [],
}: {
  documents: DocumentRecord[];
  header?: ReactElement;
  empty?: ReactElement;
  refreshing?: boolean;
  onRefresh?: () => void;
  extraActions?: BulkAction[];
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sheet, setSheet] = useState<"collections" | "tags" | null>(null);
  const selecting = selected.size > 0;

  // Drop selections for rows that are no longer listed.
  useEffect(() => {
    if (!selecting) return;
    const visible = new Set(documents.map((d) => d.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [documents, selecting]);

  useEffect(() => {
    if (!selecting) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelected(new Set());
      return true;
    });
    return () => sub.remove();
  }, [selecting]);

  const toggle = useCallback((doc: DocumentRecord) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(doc.id)) next.delete(doc.id);
      else next.add(doc.id);
      return next;
    });
  }, []);

  const onPress = useCallback(
    (doc: DocumentRecord) => {
      if (selecting) toggle(doc);
      else router.push({ pathname: "/document/[id]", params: { id: String(doc.id) } });
    },
    [selecting, toggle],
  );

  const ids = useMemo(() => [...selected], [selected]);
  const allFavorite = useMemo(
    () => ids.length > 0 && documents.filter((d) => selected.has(d.id)).every((d) => d.isFavorite),
    [documents, ids, selected],
  );

  const run = async (task: () => Promise<void>) => {
    try {
      await task();
      notifyLibraryChanged();
    } catch (e) {
      Alert.alert("Something went wrong", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        data={documents}
        keyExtractor={(d) => String(d.id)}
        extraData={selected}
        renderItem={({ item }) => (
          <DocumentRow doc={item} selecting={selecting} selected={selected.has(item.id)} onPress={onPress} onLongPress={toggle} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: selecting ? 120 : 32 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              colors={[t.primary]}
              progressBackgroundColor={t.surface}
            />
          ) : undefined
        }
      />
      {selecting ? (
        <Animated.View
          entering={SlideInDown.duration(220)}
          exiting={SlideOutDown.duration(180)}
          style={[styles.bar, { backgroundColor: t.surface, borderColor: t.border, bottom: insets.bottom + spacing.md }]}
        >
          <IconButton icon="close" label="Clear selection" onPress={() => setSelected(new Set())} />
          <Text style={[styles.count, { color: t.text }]} accessibilityLiveRegion="polite">
            {selected.size.toLocaleString()} selected
          </Text>
          <IconButton icon="select-all" label="Select all" onPress={() => setSelected(new Set(documents.map((d) => d.id)))} />
          <IconButton
            icon={allFavorite ? "star" : "star-outline"}
            label={allFavorite ? "Remove from favorites" : "Add to favorites"}
            onPress={() => run(() => setFavorite(ids, !allFavorite))}
          />
          <IconButton icon="folder-plus-outline" label="Add to collections" onPress={() => setSheet("collections")} />
          <IconButton icon="tag-plus-outline" label="Add tags" onPress={() => setSheet("tags")} />
          {extraActions.map((a) => (
            <IconButton
              key={a.label}
              icon={a.icon}
              label={a.label}
              onPress={() =>
                run(async () => {
                  await a.run(ids);
                  setSelected(new Set());
                })
              }
            />
          ))}
        </Animated.View>
      ) : null}
      <CollectionPickerSheet
        visible={sheet === "collections"}
        title={`Add ${plural(ids.length, "document")} to…`}
        mode="multi"
        confirmLabel="Add"
        onClose={() => setSheet(null)}
        onDone={async (result) => {
          const cols = Array.isArray(result) ? result : [];
          await run(async () => {
            for (const c of cols) await addDocumentsToCollection(c, ids);
          });
          setSheet(null);
          setSelected(new Set());
        }}
      />
      <TagPickerSheet
        visible={sheet === "tags"}
        title={`Tag ${plural(ids.length, "document")}`}
        onClose={() => setSheet(null)}
        onDone={async (tagIds) => {
          await run(async () => {
            for (const tag of tagIds) await tagDocuments(tag, ids);
          });
          setSheet(null);
          setSelected(new Set());
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    paddingHorizontal: 4,
  },
  count: { flex: 1, fontSize: font.small, fontWeight: "700" },
});
