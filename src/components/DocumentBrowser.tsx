import { FlashList } from "@shopify/flash-list";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Alert, BackHandler, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setFavorite } from "@/db/activity";
import { addDocumentsToCollection } from "@/db/collections";
import { setReadingStatus } from "@/db/reading";
import { tagDocuments } from "@/db/tags";
import { plural } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTabBarHeight } from "@/lib/useTabBarHeight";
import { activateDocument, showDetails } from "@/services/documentActions";
import { notifyLibraryChanged, useAppState } from "@/state/store";
import { corner, spacing, type, useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";
import { CollectionPickerSheet } from "./CollectionPickerSheet";
import { DocumentCard } from "./DocumentCard";
import { DocumentRow } from "./DocumentRow";
import { TagPickerSheet } from "./TagPickerSheet";
import { Sheet } from "./Sheet";
import { IconButton, ListRow, type IconName } from "./ui";

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
  layout = "list",
}: {
  documents: DocumentRecord[];
  header?: ReactElement;
  empty?: ReactElement;
  refreshing?: boolean;
  onRefresh?: () => void;
  extraActions?: BulkAction[];
  /** "grid" shows covers in columns, like books on a shelf. */
  layout?: "list" | "grid";
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sheet, setSheet] = useState<"collections" | "tags" | "more" | null>(null);
  const selecting = selected.size > 0;
  const tapOpens = useAppState((s) => s.appearance.tapAction === "open");
  const { width: screenWidth } = useWindowDimensions();
  const grid = useMemo(() => {
    const edge = spacing.lg;
    const gap = spacing.md;
    const columns = Math.max(3, Math.floor((screenWidth - 2 * edge + gap) / (112 + gap)));
    const cardWidth = Math.floor((screenWidth - 2 * edge - (columns - 1) * gap) / columns);
    const slot = screenWidth / columns;
    // FlashList gives each column an equal slot; offset cards so outer margins and gutters are even.
    const offset = (col: number) => edge + col * (cardWidth + gap) - col * slot;
    return { columns, cardWidth, offset };
  }, [screenWidth]);

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
    haptic.select();
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
      else activateDocument(doc);
    },
    [selecting, toggle],
  );

  const ids = useMemo(() => [...selected], [selected]);
  const allFavorite = useMemo(
    () => ids.length > 0 && documents.filter((d) => selected.has(d.id)).every((d) => d.isFavorite),
    [documents, ids, selected],
  );

  // Actions available everywhere a document list is shown, behind the ⋯ button.
  const moreActions: BulkAction[] = [
    ...(["reading", "to-read", "done"] as const).map((status) => ({
      icon: (status === "reading"
        ? "book-open-variant"
        : status === "to-read"
          ? "bookmark-outline"
          : "check-circle-outline") as IconName,
      label: status === "reading" ? "Mark as reading" : status === "to-read" ? "Add to Up next" : "Mark as done",
      run: (docIds: number[]) => setReadingStatus(docIds, status),
    })),
  ];

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
        key={layout === "grid" ? `grid-${grid.columns}` : "list"}
        data={documents}
        keyExtractor={(d) => String(d.id)}
        extraData={selected}
        numColumns={layout === "grid" ? grid.columns : 1}
        renderItem={({ item, index }) =>
          layout === "grid" ? (
            <View style={{ paddingLeft: grid.offset(index % grid.columns), paddingBottom: spacing.lg }}>
              <DocumentCard
                doc={item}
                width={grid.cardWidth}
                selecting={selecting}
                selected={selected.has(item.id)}
                onPress={onPress}
                onLongPress={toggle}
                onInfo={tapOpens ? showDetails : undefined}
              />
            </View>
          ) : (
            <DocumentRow
              doc={item}
              selecting={selecting}
              selected={selected.has(item.id)}
              onPress={onPress}
              onLongPress={toggle}
              onInfo={tapOpens ? showDetails : undefined}
            />
          )
        }
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        // The tab bar floats over the list, so its height has to be paid back as padding.
        contentContainerStyle={{ paddingBottom: tabBarHeight + (selecting ? 120 : spacing.xxl) }}
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
          // Sits above the floating tab bar, which already accounts for the safe-area inset.
          style={[
            styles.bar,
            { backgroundColor: t.surface, borderColor: t.border, bottom: (tabBarHeight || insets.bottom) + spacing.md },
          ]}
        >
          <IconButton icon="close" label="Clear selection" onPress={() => setSelected(new Set())} />
          <Text style={[styles.count, { color: t.text }]} accessibilityLiveRegion="polite">
            {selected.size.toLocaleString()} selected
          </Text>
          <IconButton
            icon={allFavorite ? "star" : "star-outline"}
            label={allFavorite ? "Remove from favorites" : "Add to favorites"}
            onPress={() => run(() => setFavorite(ids, !allFavorite))}
          />
          <IconButton icon="folder-plus-outline" label="Add to collections" onPress={() => setSheet("collections")} />
          <IconButton icon="tag-plus-outline" label="Add tags" onPress={() => setSheet("tags")} />
          <IconButton icon="dots-vertical" label="More actions" onPress={() => setSheet("more")} />
        </Animated.View>
      ) : null}
      <Sheet visible={sheet === "more"} onClose={() => setSheet(null)} title={`${plural(ids.length, "document")} selected`}>
        <ListRow
          icon="select-all"
          title={`Select all ${documents.length.toLocaleString()}`}
          onPress={() => {
            setSelected(new Set(documents.map((d) => d.id)));
            setSheet(null);
          }}
        />
        {[...extraActions, ...moreActions].map((a) => (
          <ListRow
            key={a.label}
            icon={a.icon}
            title={a.label}
            onPress={() => {
              setSheet(null);
              void run(async () => {
                await a.run(ids);
                setSelected(new Set());
              });
            }}
          />
        ))}
      </Sheet>
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
    ...corner.leaf,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    paddingHorizontal: 4,
  },
  count: { flex: 1, ...type.smallStrong },
});
