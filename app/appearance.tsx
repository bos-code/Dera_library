import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { Button, Chip, Icon, SectionTitle } from "@/components/ui";
import { updateAppearance } from "@/services/appearance";
import { DEFAULT_APPEARANCE, useAppState, type ThemePreference } from "@/state/store";
import { corner, spacing, type, useTheme } from "@/theme";
import { ACCENTS, buildPalette, PRESETS, type ThemePreset } from "@/theme/presets";

const MODES: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "Match phone" },
  { value: "light", label: "Always light" },
  { value: "dark", label: "Always dark" },
];

/** A theme rendered in its own colours: the card is the preview. */
function PresetCard({ preset, selected, onPress }: { preset: ThemePreset; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  const a = useAppState((s) => s.appearance);
  const p = buildPalette(preset, { accent: a.accent, solid: a.surfaces === "solid" });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${preset.name} theme. ${preset.description}`}
      style={[
        styles.card,
        corner.leaf,
        { backgroundColor: p.background, borderColor: selected ? t.primary : p.border, borderWidth: selected ? 2 : 1 },
      ]}
    >
      <View style={[styles.cardSurface, corner.petal, { backgroundColor: p.surface, borderColor: p.border }]}>
        <View style={[styles.cardCover, { backgroundColor: p.type.pdf + "33" }]} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={[styles.line, { backgroundColor: p.text, width: "80%" }]} />
          <View style={[styles.line, { backgroundColor: p.textFaint, width: "55%" }]} />
        </View>
      </View>
      <View style={styles.cardFoot}>
        <Text style={[type.smallStrong, { color: p.text, flex: 1 }]} numberOfLines={1}>
          {preset.name}
        </Text>
        <Svg width={4 * 9} height={8}>
          {p.heat.slice(1).map((c, i) => (
            <Rect key={i} x={i * 9} y={0} width={7} height={7} rx={2} fill={c} />
          ))}
        </Svg>
      </View>
      <Text style={[type.tiny, { color: p.textMuted }]} numberOfLines={1}>
        {preset.description}
      </Text>
      {selected ? (
        <View style={[styles.check, { backgroundColor: t.primary }]}>
          <Icon name="check" size={14} color={t.onPrimary} />
        </View>
      ) : null}
    </Pressable>
  );
}

export default function AppearanceScreen() {
  const t = useTheme();
  const system = useColorScheme();
  const a = useAppState((s) => s.appearance);
  const activeMode = a.mode === "system" ? (system === "dark" ? "dark" : "light") : a.mode;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Live sample of the current theme. */}
      <View style={[styles.preview, corner.hero, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[type.heading, { color: t.text }]}>The quiet reading room</Text>
        <Text style={[type.small, { color: t.textMuted }]}>
          Body text, secondary text and links stay readable in every combination.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <Chip label="PDF" selected onPress={() => undefined} />
          <Chip label="Docs" onPress={() => undefined} />
          <Chip label="Favorites" icon="star-outline" onPress={() => undefined} />
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {t.heat.map((c, i) => (
            <View
              key={i}
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                backgroundColor: c,
                borderWidth: i ? 0 : 0.5,
                borderColor: t.border,
              }}
            />
          ))}
        </View>
      </View>

      <SectionTitle>Mode</SectionTitle>
      <View style={styles.row}>
        {MODES.map((m) => (
          <Chip key={m.value} label={m.label} selected={a.mode === m.value} onPress={() => updateAppearance({ mode: m.value })} />
        ))}
      </View>

      {(["light", "dark"] as const).map((mode) => (
        <View key={mode}>
          <SectionTitle>{mode === "light" ? "Light theme" : "Dark theme"}</SectionTitle>
          {activeMode !== mode ? (
            <Text style={[type.tiny, styles.hint, { color: t.textFaint }]}>
              Used when your {a.mode === "system" ? "phone switches to" : "mode is"} {mode} mode.
            </Text>
          ) : null}
          <View style={styles.grid}>
            {PRESETS.filter((p) => p.mode === mode).map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                selected={(mode === "light" ? a.light : a.dark) === p.id}
                onPress={() =>
                  updateAppearance(
                    mode === "light"
                      ? { light: p.id, ...(a.mode === "dark" ? { mode: "light" } : {}) }
                      : { dark: p.id, ...(a.mode === "light" ? { mode: "dark" } : {}) },
                  )
                }
              />
            ))}
          </View>
        </View>
      ))}

      <SectionTitle>Accent colour</SectionTitle>
      <View style={styles.row}>
        <Pressable
          onPress={() => updateAppearance({ accent: null })}
          accessibilityRole="radio"
          accessibilityState={{ selected: a.accent === null }}
          accessibilityLabel="Theme default accent"
          style={[styles.swatch, { borderColor: a.accent === null ? t.text : t.border, backgroundColor: t.surfaceAlt }]}
        >
          <Icon name="auto-fix" size={18} color={t.textMuted} />
        </Pressable>
        {ACCENTS.map((acc) => {
          const color = activeMode === "dark" ? acc.dark : acc.light;
          const on = a.accent === acc.id;
          return (
            <Pressable
              key={acc.id}
              onPress={() => updateAppearance({ accent: acc.id })}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${acc.name} accent`}
              style={[styles.swatch, { borderColor: on ? t.text : "transparent" }]}
            >
              <View style={[styles.swatchFill, { backgroundColor: color }]}>
                {on ? <Icon name="check" size={16} color={t.dark ? "#000000" : "#FFFFFF"} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={[type.tiny, styles.hint, { color: t.textFaint }]}>
        Accents are adjusted automatically so links and buttons keep enough contrast on every theme.
      </Text>

      <SectionTitle>Surfaces</SectionTitle>
      <View style={styles.row}>
        <Chip
          label="Glass"
          icon="blur"
          selected={a.surfaces === "glass"}
          onPress={() => updateAppearance({ surfaces: "glass" })}
        />
        <Chip
          label="Solid"
          icon="square-rounded-outline"
          selected={a.surfaces === "solid"}
          onPress={() => updateAppearance({ surfaces: "solid" })}
        />
      </View>
      <Text style={[type.tiny, styles.hint, { color: t.textFaint }]}>
        Solid turns off blur and the background glow: crisper text, smoother on older phones, easier on the battery.
      </Text>

      <SectionTitle>Library density</SectionTitle>
      <View style={styles.row}>
        <Chip
          label="Comfortable"
          selected={a.density === "comfortable"}
          onPress={() => updateAppearance({ density: "comfortable" })}
        />
        <Chip label="Compact" selected={a.density === "compact"} onPress={() => updateAppearance({ density: "compact" })} />
      </View>

      <SectionTitle>Open PDFs in</SectionTitle>
      <View style={styles.row}>
        <Chip
          label="Dera reader"
          icon="book-open-page-variant"
          selected={a.pdfReader === "dera"}
          onPress={() => updateAppearance({ pdfReader: "dera" })}
        />
        <Chip
          label="Another app"
          icon="open-in-new"
          selected={a.pdfReader === "external"}
          onPress={() => updateAppearance({ pdfReader: "external" })}
        />
      </View>
      <Text style={[type.tiny, styles.hint, { color: t.textFaint }]}>
        Dera's reader remembers your page and times your reading exactly. Other formats always open in their own app.
      </Text>

      <SectionTitle>Tapping a document</SectionTitle>
      <View style={styles.row}>
        <Chip
          label="Opens it"
          icon="open-in-new"
          selected={a.tapAction === "open"}
          onPress={() => updateAppearance({ tapAction: "open" })}
        />
        <Chip
          label="Shows details"
          icon="information-outline"
          selected={a.tapAction === "details"}
          onPress={() => updateAppearance({ tapAction: "details" })}
        />
      </View>
      <Text style={[type.tiny, styles.hint, { color: t.textFaint }]}>
        The other action stays one tap away on the ⓘ button. Long-press always selects.
      </Text>

      <View style={{ padding: spacing.lg }}>
        <Button label="Reset to defaults" icon="restore" variant="ghost" onPress={() => updateAppearance(DEFAULT_APPEARANCE)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  preview: { margin: spacing.lg, padding: spacing.lg, gap: spacing.md, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg },
  hint: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  card: { flexBasis: "47%", flexGrow: 1, padding: spacing.md, gap: 6, minHeight: 132 },
  cardSurface: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  cardCover: { width: 18, height: 24, borderRadius: 3 },
  line: { height: 5, borderRadius: 3 },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4 },
  check: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  swatchFill: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
