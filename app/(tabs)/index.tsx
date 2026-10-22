import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DocumentBrowser } from "@/components/DocumentBrowser";
import { FocusCard } from "@/components/Focus";
import { GoalRing } from "@/components/ReadingCharts";
import { Shelf } from "@/components/Shelf";
import { getInboxCount } from "@/db/inbox";
import { getReadingSummary } from "@/db/reading";
import { saveSearch } from "@/db/savedSearches";
import { showToast } from "@/services/toast";
import { ScanBanner } from "@/components/ScanBanner";
import { SearchBar } from "@/components/SearchBar";
import { PromptSheet } from "@/components/PromptSheet";
import { Sheet } from "@/components/Sheet";
import { Button, Chip, EmptyState, Icon, IconButton, ListRow, type IconName } from "@/components/ui";
import { setMeta } from "@/db/database";
import { getLibraryStats, getShelfCounts, searchDocuments, SMART_SHELVES, type SmartShelf } from "@/db/documents";
import { TYPE_FILTERS } from "@/lib/fileTypes";
import { plural } from "@/lib/format";
import { useDebounced, useQuery } from "@/lib/useQuery";
import { stackVersions } from "@/lib/versions";
import { scanLibrary } from "@/services/scan";
import { getState, notifyLibraryChanged, setState, useAppState } from "@/state/store";
import { corner, spacing, type, useTheme } from "@/theme";
import type { LibraryView, SortMode } from "@/types/document";

const SORTS: Array<{ value: SortMode; label: string; icon: IconName }> = [
  { value: "modified-desc", label: "Recently modified", icon: "clock-outline" },
  { value: "modified-asc", label: "Oldest modified", icon: "clock-start" },
  { value: "opened-desc", label: "Recently opened", icon: "history" },
  { value: "added-desc", label: "Recently added", icon: "new-box" },
  { value: "name-asc", label: "Name A–Z", icon: "sort-alphabetical-ascending" },
  { value: "name-desc", label: "Name Z–A", icon: "sort-alphabetical-descending" },
  { value: "size-desc", label: "Largest first", icon: "sort-numeric-descending" },
  { value: "size-asc", label: "Smallest first", icon: "sort-numeric-ascending" },
];

const VIEWS: Array<{ value: LibraryView; label: string; icon: "bookshelf" | "star-outline" | "history" }> = [
  { value: "all", label: "All", icon: "bookshelf" },
  { value: "favorites", label: "Favorites", icon: "star-outline" },
  { value: "recent", label: "Recent", icon: "history" },
];

const SHELF_INFO: Record<SmartShelf, { label: string; icon: IconName }> = {
  whatsapp: { label: "WhatsApp", icon: "whatsapp" },
  telegram: { label: "Telegram", icon: "send-outline" },
  downloads: { label: "Downloads", icon: "download-outline" },
  large: { label: "Large files", icon: "weight" },
  untouched: { label: "Not opened in a year", icon: "sleep" },
  duplicates: { label: "Duplicates", icon: "content-duplicate" },
};

/** Rescan automatically on launch when the last scan is older than this. */
const AUTO_SCAN_AFTER_MS = 10 * 60_000;

export default function LibraryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const filters = useAppState((s) => s.library);
  const scanning = useAppState((s) => s.scanning);
  const access = useAppState((s) => s.access);
  const [text, setText] = useState(filters.text);
  const searchRef = useRef<TextInput>(null);
  // "Search" app-icon shortcut: deralibrary:///?search=1 lands here with the keyboard up.
  const { search } = useLocalSearchParams<{ search?: string }>();
  useEffect(() => {
    if (search !== "1") return;
    const id = setTimeout(() => searchRef.current?.focus(), 300);
    router.setParams({ search: undefined });
    return () => clearTimeout(id);
  }, [search]);
  const debounced = useDebounced(text, 120);
  const setFilters = (patch: Partial<typeof filters>) => setState((s) => ({ library: { ...s.library, ...patch } }));

  useEffect(() => setFilters({ text: debounced }), [debounced]);

  useEffect(() => {
    const last = getState().lastScanAt;
    if (!last || Date.now() - last > AUTO_SCAN_AFTER_MS) void scanLibrary();
  }, []);

  const { data: docs } = useQuery(
    () =>
      searchDocuments({ text: filters.text, type: filters.type, sort: filters.sort, view: filters.view, shelf: filters.shelf }),
    [filters.text, filters.type, filters.sort, filters.view, filters.shelf],
  );
  const { data: stats } = useQuery(getLibraryStats, []);
  // The home state (nothing searched or filtered) leads with shelves before the full list.
  const home = !filters.text && filters.type === "all" && filters.view === "all" && !filters.shelf;
  const { data: shelves } = useQuery(
    async () =>
      home
        ? {
            reading: await searchDocuments({ readingStatus: "reading", sort: "name-asc", limit: 12 }),
            upNext: await searchDocuments({ readingStatus: "to-read", sort: "name-asc", limit: 12 }),
            today: await getReadingSummary(),
            inboxCount: await getInboxCount(),
            added: await searchDocuments({ recentlyAdded: true, sort: "added-desc", limit: 12 }),
            recent: await searchDocuments({ view: "recent", limit: 12 }),
            favorites: await searchDocuments({ view: "favorites", sort: "name-asc", limit: 12 }),
            counts: await getShelfCounts(),
          }
        : null,
    [home],
  );
  const toggleLayout = () => {
    const layout = filters.layout === "grid" ? "list" : "grid";
    setFilters({ layout });
    void setMeta("library_layout", layout);
  };

  const sort = SORTS.find((s) => s.value === filters.sort) ?? SORTS[0];
  const [sorting, setSorting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedStacks, setExpandedStacks] = useState<Set<string>>(new Set());
  const listed = useMemo(
    () => (docs && filters.stackVersions && filters.layout === "list" ? stackVersions(docs, expandedStacks) : (docs ?? [])),
    [docs, filters.stackVersions, filters.layout, expandedStacks],
  );
  const toggleStack = useCallback(
    (key: string) =>
      setExpandedStacks((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  const filtered = !home;
  const noAccess = access && !access.allFilesAccess;

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.sm, paddingTop: spacing.xs }}>
      <FocusCard />
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <ScanBanner onDismiss={() => setState({ lastSummary: null, scanError: null })} />
        {noAccess && !scanning ? (
          <Pressable
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            style={[styles.notice, { backgroundColor: t.surfaceAlt }]}
          >
            <Icon name="folder-lock-outline" size={20} color={t.textMuted} />
            <Text style={[type.small, { flex: 1, color: t.textMuted }]}>
              Some documents may be hidden. Allow all-files access or add folders to find everything.
            </Text>
            <Icon name="chevron-right" size={20} color={t.textFaint} />
          </Pressable>
        ) : null}
      </View>
      {home && shelves ? (
        <View style={{ gap: spacing.lg, paddingVertical: spacing.xs }}>
          {shelves.inboxCount ? (
            <Pressable
              onPress={() => router.push("/inbox")}
              accessibilityRole="button"
              accessibilityLabel={`Inbox: ${plural(shelves.inboxCount, "new document")} to file`}
              style={[styles.today, { backgroundColor: t.primarySoft }]}
            >
              <Icon name="inbox-arrow-down" color={t.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[type.smallStrong, { color: t.text }]}>{plural(shelves.inboxCount, "new document")} to file</Text>
                <Text style={[type.tiny, { color: t.textMuted }]}>Found since your last scan</Text>
              </View>
              <Icon name="chevron-right" size={20} color={t.textFaint} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.push("/reading")}
            accessibilityRole="button"
            accessibilityLabel={`Reading today: ${Math.round(shelves.today.todayMs / 60_000)} of ${Math.round(
              shelves.today.goalMs / 60_000,
            )} minutes. ${shelves.today.current} day streak`}
            style={[styles.today, { backgroundColor: t.surfaceAlt }]}
          >
            <GoalRing progress={shelves.today.todayMs / shelves.today.goalMs} size={40} stroke={5} />
            <View style={{ flex: 1 }}>
              <Text style={[type.smallStrong, { color: t.text }]}>
                {Math.round(shelves.today.todayMs / 60_000)} / {Math.round(shelves.today.goalMs / 60_000)} min today
              </Text>
              <Text style={[type.tiny, { color: t.textMuted }]}>
                {shelves.today.current ? `${plural(shelves.today.current, "day")} streak` : "Read a little to start a streak"}
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color={t.textFaint} />
          </Pressable>
          <Shelf title="Currently reading" documents={shelves.reading} />
          <Shelf title="Continue reading" documents={shelves.recent} onSeeAll={() => setFilters({ view: "recent" })} />
          <Shelf title="Up next" documents={shelves.upNext} />
          <Shelf title="Recently added" documents={shelves.added} onSeeAll={() => setFilters({ sort: "added-desc" })} />
          <Shelf title="Favorites" documents={shelves.favorites} onSeeAll={() => setFilters({ view: "favorites" })} />
          {SMART_SHELVES.some((k) => shelves.counts[k] > 0) ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {SMART_SHELVES.filter((k) => shelves.counts[k] > 0).map((k) => (
                <Chip
                  key={k}
                  label={SHELF_INFO[k].label}
                  icon={SHELF_INFO[k].icon}
                  count={shelves.counts[k]}
                  onPress={() => setFilters({ shelf: k })}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
      {filters.shelf ? (
        <View style={styles.activeShelf}>
          <Icon name={SHELF_INFO[filters.shelf].icon} color={t.primary} />
          <Text accessibilityRole="header" style={[type.heading, { color: t.text, flex: 1 }]}>
            {SHELF_INFO[filters.shelf].label}
          </Text>
          <IconButton icon="close" label="Close shelf" onPress={() => setFilters({ shelf: null })} />
        </View>
      ) : null}
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
        <Text style={[type.small, { color: t.textMuted, flex: 1 }]}>
          {docs ? plural(docs.length, home ? "document" : "result") : " "}
        </Text>
        {filters.view !== "recent" ? (
          <Pressable
            onPress={() => setSorting(true)}
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${sort.label}. Tap to choose`}
            style={styles.sort}
            hitSlop={8}
          >
            <Icon name={sort.icon} size={18} color={t.primary} />
            <Text style={[type.smallStrong, { color: t.primary }]}>{sort.label}</Text>
          </Pressable>
        ) : null}
        {!home ? (
          <IconButton
            icon="bookmark-plus-outline"
            label="Save as smart collection"
            onPress={() => setSaving(true)}
            color={t.primary}
          />
        ) : null}
        <IconButton
          icon={filters.layout === "grid" ? "view-list-outline" : "view-grid-outline"}
          label={filters.layout === "grid" ? "Show as list" : "Show as covers"}
          onPress={toggleLayout}
          color={t.primary}
        />
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
    <View style={{ flex: 1 }}>
      {/* Pinned: the title and search stay put while the library scrolls underneath. */}
      <View style={{ paddingTop: insets.top + spacing.sm, gap: spacing.sm, paddingBottom: spacing.sm }}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
              Library
            </Text>
            <Text style={[type.small, { color: t.textMuted }]}>
              {stats ? plural(stats.available, "document") : " "}
              {stats?.missing ? ` · ${stats.missing + stats.revoked} unavailable` : ""}
            </Text>
          </View>
          <IconButton icon="refresh" label="Rescan device" onPress={() => void scanLibrary()} />
        </View>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <SearchBar ref={searchRef} value={text} onChangeText={setText} />
        </View>
      </View>
      <DocumentBrowser
        documents={listed}
        onToggleStack={toggleStack}
        header={header}
        empty={empty}
        layout={filters.layout}
        refreshing={false}
        onRefresh={() => void scanLibrary()}
      />
      <PromptSheet
        visible={saving}
        title="Save as smart collection"
        placeholder={filters.text ? `“${filters.text}”` : "e.g. Physics PDFs"}
        initialValue={filters.text}
        confirmLabel="Save"
        onClose={() => setSaving(false)}
        onSubmit={async (name) => {
          const id = await saveSearch(name, {
            text: filters.text || undefined,
            type: filters.type,
            view: filters.view,
            shelf: filters.shelf,
            sort: filters.sort,
          });
          setSaving(false);
          notifyLibraryChanged();
          showToast(`Saved “${name}” to Collections`, {
            label: "Open",
            run: () => router.push({ pathname: "/saved/[id]", params: { id } }),
          });
        }}
      />
      <Sheet visible={sorting} onClose={() => setSorting(false)} title="Sort by">
        <ListRow
          icon="layers-outline"
          title="Group versions"
          subtitle="Show “Report v1, v2, final” as one row"
          onPress={() => setFilters({ stackVersions: !filters.stackVersions })}
          right={
            <Icon
              name={filters.stackVersions ? "toggle-switch" : "toggle-switch-off-outline"}
              size={32}
              color={filters.stackVersions ? t.primary : t.textFaint}
            />
          }
        />
        {SORTS.map((o) => (
          <ListRow
            key={o.value}
            icon={o.icon}
            iconColor={o.value === sort.value ? t.primary : undefined}
            title={o.label}
            onPress={() => {
              setFilters({ sort: o.value });
              setSorting(false);
            }}
            right={o.value === sort.value ? <Icon name="check" color={t.primary} /> : undefined}
          />
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingRight: spacing.xs },
  title: { ...type.title },
  notice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, ...corner.petal },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  divider: { width: 1, height: 24, marginHorizontal: 2 },
  listMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    minHeight: 40,
  },
  sort: { flexDirection: "row", alignItems: "center", gap: 4 },
  today: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    ...corner.petal,
  },
  activeShelf: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.xs },
});
