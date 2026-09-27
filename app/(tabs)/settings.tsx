import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScanBanner } from "@/components/ScanBanner";
import { Button, Card, Chip, Icon, IconButton, ListRow, SectionTitle } from "@/components/ui";
import { clearHistory } from "@/db/activity";
import { exportLibrary, importLibrary } from "@/db/backup";
import { setMeta } from "@/db/database";
import { getLibraryStats } from "@/db/documents";
import { getSources, removeSource, type Source } from "@/db/sources";
import { formatRelativeDate, plural } from "@/lib/format";
import { useQuery } from "@/lib/useQuery";
import { scanner } from "@/native/scanner";
import { requestFullAccess } from "@/services/access";
import { addFiles, addFolder, scanLibrary } from "@/services/scan";
import { notifyLibraryChanged, setState, useAppState, type ThemePreference } from "@/state/store";
import { font, spacing, useTheme } from "@/theme";

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const access = useAppState((s) => s.access);
  const scanning = useAppState((s) => s.scanning);
  const lastScanAt = useAppState((s) => s.lastScanAt);
  const theme = useAppState((s) => s.themePreference);
  const { data: sources } = useQuery(getSources, []);
  const { data: stats } = useQuery(getLibraryStats, []);
  const [busy, setBusy] = useState<string | null>(null);

  const guard = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    try {
      await task();
    } catch (e) {
      Alert.alert("Something went wrong", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmRemove = (s: Source) =>
    Alert.alert(
      "Remove folder?",
      `Documents from “${s.label}” will be hidden from the library. Their collections and tags are kept in case you add the folder again. No files are deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            guard("remove", async () => {
              if (s.uri)
                await scanner()
                  .releaseUri(s.uri)
                  .catch(() => undefined);
              await removeSource(s.id);
              notifyLibraryChanged();
            }),
        },
      ],
    );

  const exportBackup = () =>
    guard("export", async () => {
      const backup = await exportLibrary();
      const date = new Date().toISOString().slice(0, 10);
      const uri = await scanner().createExportFile(`dera-library-${date}.json`);
      if (!uri) return;
      await scanner().writeText(uri, backup.json);
      Alert.alert(
        "Backup saved",
        `Saved ${plural(backup.collections, "collection")}, ${plural(backup.tags, "tag")} and the organization of ${plural(backup.documents, "document")}.`,
      );
    });

  const importBackup = () =>
    guard("import", async () => {
      const uri = await scanner().pickImportFile();
      if (!uri) return;
      const result = await importLibrary(await scanner().readText(uri));
      notifyLibraryChanged();
      Alert.alert(
        "Backup restored",
        `${plural(result.matched, "document")} matched on this phone.` +
          (result.pending
            ? ` ${plural(result.pending, "document")} weren't found yet; they'll reconnect automatically when a scan finds them.`
            : ""),
      );
    });

  const fullAccess = !!access?.allFilesAccess;

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 48 }}>
      <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
        Settings
      </Text>

      <SectionTitle>Storage access</SectionTitle>
      <Card style={styles.card}>
        <View style={styles.accessRow}>
          <Icon
            name={fullAccess ? "shield-check-outline" : "shield-alert-outline"}
            size={28}
            color={fullAccess ? t.primary : t.warning}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: t.text }]}>
              {fullAccess ? "Full storage access is on" : "Limited storage access"}
            </Text>
            <Text style={[styles.cardText, { color: t.textMuted }]}>
              {fullAccess
                ? "Dera Library can find documents anywhere on this phone, including Downloads, WhatsApp and Telegram folders."
                : access?.canRequestAllFilesAccess
                  ? "Android only shows this app a few documents. Turn on “All files access” to find everything automatically, or add folders below."
                  : "Allow storage access so Dera Library can find your documents."}
            </Text>
          </View>
        </View>
        {!fullAccess ? (
          <Button
            label={access?.canRequestAllFilesAccess ? "Allow all files access" : "Allow storage access"}
            icon="folder-key-outline"
            variant="primary"
            onPress={async () => {
              if (await requestFullAccess()) void scanLibrary();
            }}
          />
        ) : null}
        <Text style={[styles.fine, { color: t.textFaint }]}>
          Files are only read to build the index. Nothing is uploaded, moved or changed.
        </Text>
      </Card>

      <SectionTitle>Folders</SectionTitle>
      <Card style={{ marginHorizontal: spacing.lg }}>
        {(sources ?? []).map((s) => (
          <ListRow
            key={s.id}
            icon={s.kind === "tree" ? "folder-outline" : "file-multiple-outline"}
            title={s.label}
            subtitle={
              s.status === "ok"
                ? `${plural(s.documentCount, "document")}${s.lastScanAt ? ` · scanned ${formatRelativeDate(s.lastScanAt).toLowerCase()}` : ""}`
                : "Access lost. Add the folder again."
            }
            iconColor={s.status === "ok" ? t.textMuted : t.warning}
            right={<IconButton icon="close" label={`Remove ${s.label}`} onPress={() => confirmRemove(s)} color={t.textFaint} />}
          />
        ))}
        <View style={styles.buttons}>
          <Button
            label="Add folder"
            icon="folder-plus-outline"
            onPress={() => guard("folder", async () => void (await addFolder()))}
            busy={busy === "folder"}
            style={{ flex: 1 }}
          />
          <Button
            label="Add files"
            icon="file-plus-outline"
            onPress={() => guard("files", async () => void (await addFiles()))}
            busy={busy === "files"}
            style={{ flex: 1 }}
          />
        </View>
        <Text style={[styles.fine, { color: t.textFaint, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }]}>
          Use folders for places the device scan can't see, like SD cards or cloud drives. Android doesn't allow picking the whole
          Download folder; pick a sub-folder or add files instead.
        </Text>
      </Card>

      <SectionTitle>Library</SectionTitle>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <ScanBanner onDismiss={() => setState({ lastSummary: null, scanError: null })} />
      </View>
      <Card style={[styles.card, { marginTop: spacing.md }]}>
        <Text style={[styles.cardText, { color: t.textMuted }]}>
          {stats ? `${plural(stats.available, "document")} indexed` : " "}
          {lastScanAt ? ` · last scan ${formatRelativeDate(lastScanAt).toLowerCase()}` : ""}
        </Text>
        <Button label="Rescan now" icon="magnify-scan" onPress={() => void scanLibrary()} busy={scanning} />
        <Button
          label="Full rescan"
          icon="database-refresh-outline"
          variant="ghost"
          disabled={scanning}
          accessibilityHint="Marks every document that wasn't found as missing, even if many disappeared at once"
          onPress={() =>
            Alert.alert(
              "Full rescan",
              "Normally, if a scan suddenly can't find many documents, they're kept in case storage is temporarily unavailable. A full rescan marks everything it doesn't find as missing. Collections and tags are always kept.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Rescan", onPress: () => void scanLibrary({ force: true }) },
              ],
            )
          }
        />
      </Card>
      <Card style={[{ marginHorizontal: spacing.lg, marginTop: spacing.md }]}>
        <ListRow
          icon="file-question-outline"
          title="Missing documents"
          subtitle={stats ? `${plural(stats.missing + stats.revoked, "document")} can't be reached` : undefined}
          onPress={() => router.push("/missing")}
          right={<Icon name="chevron-right" color={t.textFaint} />}
        />
      </Card>

      <SectionTitle>Appearance</SectionTitle>
      <View style={styles.chips}>
        {THEMES.map((th) => (
          <Chip
            key={th.value}
            label={th.label}
            selected={theme === th.value}
            onPress={() => {
              setState({ themePreference: th.value });
              void setMeta("theme", th.value);
            }}
          />
        ))}
      </View>

      <SectionTitle>Backup</SectionTitle>
      <Card style={styles.card}>
        <Text style={[styles.cardText, { color: t.textMuted }]}>
          Your collections, tags and favorites live only on this phone. Save a backup file to keep them safe or move them to a new
          phone.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button label="Export" icon="export" onPress={exportBackup} busy={busy === "export"} style={{ flex: 1 }} />
          <Button label="Import" icon="import" onPress={importBackup} busy={busy === "import"} style={{ flex: 1 }} />
        </View>
      </Card>

      <SectionTitle>Privacy</SectionTitle>
      <Card style={styles.card}>
        <Text style={[styles.cardText, { color: t.textMuted }]}>
          Dera Library works fully offline. There's no account and no server. Your index stays on this device.
        </Text>
        <Button
          label="Clear reading history"
          icon="history"
          variant="danger"
          onPress={() =>
            Alert.alert("Clear history?", "Recent documents will be emptied. Favorites, collections and tags stay.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Clear",
                style: "destructive",
                onPress: () =>
                  guard("history", async () => {
                    await clearHistory();
                    notifyLibraryChanged();
                  }),
              },
            ])
          }
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: "700", fontFamily: font.display, paddingHorizontal: spacing.lg },
  card: { marginHorizontal: spacing.lg, padding: spacing.lg, gap: spacing.md },
  accessRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  cardTitle: { fontSize: font.body, fontWeight: "700" },
  cardText: { fontSize: font.small, lineHeight: 20 },
  fine: { fontSize: font.tiny, lineHeight: 17 },
  buttons: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  chips: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg },
});
