import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DocumentBrowser } from "@/components/DocumentBrowser";
import { ScanBanner } from "@/components/ScanBanner";
import { SearchBar } from "@/components/SearchBar";
import { Button, Chip, EmptyState, Icon, IconButton } from "@/components/ui";
import { getLibraryStats, searchDocuments } from "@/db/documents";
import { TYPE_FILTERS } from "@/lib/fileTypes";
import { plural } from "@/lib/format";
import { useDebounced, useQuery } from "@/lib/useQuery";
import { scanLibrary } from "@/services/scan";
import { getState, setState, useAppState } from "@/state/store";
import { font, spacing, useTheme } from "@/theme";
import type { LibraryView, SortMode } from "@/types/document";

const SORTS: Array<{
  value: SortMode;
  label: string;
  icon: "clock-outline" | "sort-alphabetical-ascending" | "sort-numeric-descending";
}> = [
  { value: "modified-desc", label: "Recently modified", icon: "clock-outline" },
  { value: "name-asc", label: "Name", icon: "sort-alphabetical-ascending" },
  { value: "size-desc", label: "Largest first", icon: "sort-numeric-descending" },
];

const VIEWS: Array<{ value: LibraryView; label: string; icon: "bookshelf" | "star-outline" | "history" }> = [
  { value: "all", label: "All", icon: "bookshelf" },
  { value: "favorites", label: "Favorites", icon: "star-outline" },
  { value: "recent", label: "Recent", icon: "history" },
];

/** Rescan automatically on launch when the last scan is older than this. */
const AUTO_SCAN_AFTER_MS = 10 * 60_000;

export default function LibraryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const filters = useAppState((s) => s.library);
  const scanning = useAppState((s) => s.scanning);
  const access = useAppState((s) => s.access);
  const [text, setText] = useState(filters.text);
  const debounced = useDebounced(text, 120);
  const setFilters = (patch: Partial<typeof filters>) => setState((s) => ({ library: { ...s.library, ...patch } }));

  useEffect(() => setFilters({ text: debounced }), [debounced]);

  useEffect(() => {
    const last = getState().lastScanAt;
    if (!last || Date.now() - last > AUTO_SCAN_AFTER_MS) void scanLibrary();
  }, []);

  const { data: docs } = useQuery(
    () => searchDocuments({ text: filters.text, type: filters.type, sort: filters.sort, view: filters.view }),
    [filters.text, filters.type, filters.sort, filters.view],
  );
  const { data: stats } = useQuery(getLibraryStats, []);

  const sort = SORTS.find((s) => s.value === filters.sort) ?? SORTS[0];
  const cycleSort = () => setFilters({ sort: SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length].value });
  const filtered = !!filters.text || filters.type !== "all" || filters.view !== "all";
  const noAccess = access && !access.allFilesAccess;

  const header = (
    <View style={{ paddingTop: insets.top + spacing.sm, gap: spacing.md, paddingBottom: spacing.sm }}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
            Library
          </Text>
          <Text style={{ color: t.textMuted, fontSize: font.small }}>
            {stats ? plural(stats.available, "document") : " "}
            {stats?.missing ? ` · ${stats.missing + stats.revoked} unavailable` : ""}
          </Text>
        </View>
        <IconButton icon="refresh" label="Rescan device" onPress={() => void scanLibrary()} />
      </View>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <SearchBar value={text} onChangeText={setText} />
        <ScanBanner onDismiss={() => setState({ lastSummary: null, scanError: null })} />
        {noAccess && !scanning ? (
          <Pressable
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            style={[styles.notice, { backgroundColor: t.surfaceAlt }]}
          >
            <Icon name="folder-lock-outline" size={20} color={t.textMuted} />
            <Text style={{ flex: 1, color: t.textMuted, fontSize: font.small }}>
              Some documents may be hidden. Allow all-files access or add folders to find everything.
            </Text>
            <Icon name="chevron-right" size={20} color={t.textFaint} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {VIEWS.map((v) => (
          <Chip
            key={v.value}
            label={v.label}
            icon={v.icon}
            selected={filters.view === v.value}
            onPress={() => setFilters({ view: v.value })}
          />
        ))}
        <View style={[styles.divider, { backgroundColor: t.border }]} />
        {TYPE_FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            count={f.value === "all" ? undefined : (stats?.byType[f.value] ?? 0)}
            selected={filters.type === f.value}
            onPress={() => setFilters({ type: f.value })}
          />
        ))}
      </ScrollView>
      <View style={styles.listMeta}>
        <Text style={{ color: t.textMuted, fontSize: font.small }}>{docs ? plural(docs.length, "result") : " "}</Text>
        {filters.view !== "recent" ? (
          <Pressable
            onPress={cycleSort}
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${sort.label}. Tap to change`}
            style={styles.sort}
            hitSlop={8}
          >
            <Icon name={sort.icon} size={18} color={t.primary} />
            <Text style={{ color: t.primary, fontWeight: "600", fontSize: font.small }}>{sort.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const empty = useMemo(() => {
    if (!docs) return undefined;
    if (scanning && !filtered)
      return <EmptyState icon="magnify-scan" title="Looking for documents…" message="This takes a moment the first time." />;
    if (filters.view === "favorites" && !filters.text)
      return <EmptyState icon="star-outline" title="No favorites yet" message="Tap the star on any document to keep it here." />;
    if (filters.view === "recent" && !filters.text)
      return (
        <EmptyState
          icon="history"
          title="Nothing opened yet"
          message="Documents you open appear here so you can get back to them."
        />
      );
    if (filtered)
      return <EmptyState icon="file-search-outline" title="No matches" message="Try a different word or clear the filters." />;
    return (
      <EmptyState
        icon="bookshelf"
        title="Your library is empty"
        message="Dera Library lists documents already on your phone. Nothing is copied or moved."
      >
        <Button label="Scan device" icon="magnify-scan" variant="primary" onPress={() => void scanLibrary()} />
        <Button label="Storage access" icon="folder-key-outline" onPress={() => router.push("/settings")} />
      </EmptyState>
    );
  }, [docs, scanning, filtered, filters.view, filters.text]);

  return (
    <DocumentBrowser
      documents={docs ?? []}
      header={header}
      empty={empty}
      refreshing={false}
      onRefresh={() => void scanLibrary()}
    />
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingRight: spacing.xs },
  title: { fontSize: font.title, fontWeight: "700", fontFamily: font.display },
  notice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: 12 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  divider: { width: 1, height: 24, marginHorizontal: 2 },
  listMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    minHeight: 32,
  },
  sort: { flexDirection: "row", alignItems: "center", gap: 4 },
});
