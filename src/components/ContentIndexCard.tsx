import { Switch, Text, View } from "react-native";
import { clearContentIndex, getContentSettings, getIndexStats, setContentSetting } from "@/db/contentIndex";
import { plural } from "@/lib/format";
import { useQuery } from "@/lib/useQuery";
import { contentSettingsChanged, runTextIndexer } from "@/services/textIndexer";
import { showToast } from "@/services/toast";
import { notifyLibraryChanged, useAppState } from "@/state/store";
import { spacing, type, useTheme } from "@/theme";
import { Button, Card } from "./ui";

/** Settings for search-inside-documents: on/off, text recognition, progress and rebuild. */
export function ContentIndexCard() {
  const t = useTheme();
  const indexing = useAppState((s) => s.indexing);
  const { data } = useQuery(async () => ({ settings: await getContentSettings(), stats: await getIndexStats() }), []);
  if (!data) return null;
  const { settings, stats } = data;

  if (!settings.available) {
    return (
      <Card style={{ marginHorizontal: spacing.lg, padding: spacing.lg }}>
        <Text style={[type.small, { color: t.textMuted }]}>Search inside documents isn't available on this device.</Text>
      </Card>
    );
  }

  const toggle = async (key: "content_index" | "ocr", on: boolean) => {
    await setContentSetting(key, on);
    contentSettingsChanged();
    notifyLibraryChanged();
    if (on) void runTextIndexer();
  };

  const progress = indexing ?? stats;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 100;

  return (
    <Card style={{ marginHorizontal: spacing.lg, padding: spacing.lg, gap: spacing.md }}>
      <Row
        title="Search inside documents"
        subtitle="Reads the text of PDFs, Word, PowerPoint, Excel, EPUB and text files on this phone, so search finds words in them."
        value={settings.enabled}
        onChange={(v) => toggle("content_index", v)}
      />
      <Row
        title="Read scanned PDFs"
        subtitle="Uses on-device text recognition for PDFs that are only images (first 12 pages). Slower; works offline."
        value={settings.ocr}
        disabled={!settings.enabled}
        onChange={(v) => toggle("ocr", v)}
      />
      {settings.enabled ? (
        <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
          <Text style={[type.smallStrong, { color: t.text }]}>
            {indexing ? `Reading documents… ${pct}%` : pct >= 100 ? "All documents read" : `${pct}% read`}
          </Text>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, overflow: "hidden" }}>
            <View style={{ height: 6, width: `${pct}%`, backgroundColor: t.primary }} />
          </View>
          <Text style={[type.tiny, { color: t.textFaint }]}>
            {plural(stats.withText, "document")} searchable by content · {progress.done.toLocaleString()} of{" "}
            {progress.total.toLocaleString()} checked
          </Text>
        </View>
      ) : null}
      {settings.enabled ? (
        <Button
          label="Read everything again"
          icon="database-refresh-outline"
          variant="ghost"
          disabled={!!indexing}
          onPress={async () => {
            await clearContentIndex();
            notifyLibraryChanged();
            showToast("Text index cleared; documents are being read again");
            void runTextIndexer();
          }}
        />
      ) : null}
    </Card>
  );
}

function Row({
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center", opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyStrong, { color: t.text }]}>{title}</Text>
        <Text style={[type.tiny, { color: t.textMuted }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ true: t.primary, false: t.surfaceAlt }}
        thumbColor={t.surface}
      />
    </View>
  );
}
