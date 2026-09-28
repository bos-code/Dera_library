import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlatGlass, Glass } from "@/components/glass";
import { Button, Icon, type IconName } from "@/components/ui";
import { setMeta } from "@/db/database";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { isScannerAvailable } from "@/native/scanner";
import { requestFullAccess } from "@/services/access";
import { addFolder, scanLibrary } from "@/services/scan";
import { setState, useAppState } from "@/state/store";
import { corner, skew, spacing, type, useTheme } from "@/theme";

const POINTS: Array<{ icon: IconName; title: string; text: string }> = [
  {
    icon: "magnify-scan",
    title: "Finds your documents",
    text: "PDFs, Word, Excel, PowerPoint, EPUB, text and more, wherever they are on your phone.",
  },
  {
    icon: "file-lock-outline",
    title: "Leaves files where they are",
    text: "Nothing is copied, moved or uploaded. Dera builds a private index on this device.",
  },
  {
    icon: "folder-multiple-outline",
    title: "Organize your way",
    text: "Nested collections, tags, favorites and recents, without touching the real files.",
  },
];

export default function Onboarding() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const access = useAppState((s) => s.access);
  const [busy, setBusy] = useState(false);
  const reduceMotion = useReducedMotion();

  /** Entering animations are decorative; skip them entirely when the OS asks us to. */
  const enter = (delay: number) => (reduceMotion ? undefined : FadeInDown.delay(delay).duration(420));

  const finish = async () => {
    await setMeta("onboarded", "1");
    setState({ onboarded: true });
    router.replace("/");
    void scanLibrary();
  };

  const allow = async () => {
    if (!isScannerAvailable) {
      Alert.alert("Development build required", "Storage scanning needs the Dera Library Android build, not Expo Go.");
      return;
    }
    const granted = await requestFullAccess();
    // On Android 11+ the user is sent to system settings; they'll come back and tap Continue.
    if (granted) await finish();
  };

  const pickFolder = async () => {
    setBusy(true);
    try {
      if (await addFolder()) await finish();
    } catch (e) {
      Alert.alert("Folder", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const granted = !!access?.allFilesAccess;

  return (
    // The canvas and aurora come from the root layout; this screen just sits on them.
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.xxl,
          paddingHorizontal: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------------------------------------------------- masthead */}
        <Animated.View entering={enter(0)}>
          <View style={styles.eyebrowRow}>
            <View style={[styles.eyebrowRule, { backgroundColor: t.primary, transform: [{ skewX: skew.accent }] }]} />
            <Text style={[type.label, { color: t.primary }]}>ON DEVICE · OFFLINE</Text>
          </View>

          <Text accessibilityRole="header" style={[type.hero, styles.headline, { color: t.text }]}>
            Every document{"\n"}on your phone,{"\n"}
            <Text style={{ color: t.primary }}>one shelf.</Text>
          </Text>

          <Text style={[type.body, { color: t.textMuted, marginTop: spacing.md, maxWidth: 420 }]}>
            Dera reads what is already there and builds a private, searchable index. Nothing leaves this device.
          </Text>
        </Animated.View>

        {/* ------------------------------------------------------------ points */}
        <View style={{ marginTop: spacing.xxl, gap: spacing.md }}>
          {POINTS.map((p, i) => {
            const even = i % 2 === 0;
            return (
              <Animated.View key={p.title} entering={enter(120 + i * 90)}>
                <FlatGlass
                  shape={even ? "leaf" : "petal"}
                  // Alternating inset breaks the stacked-identical-cards look.
                  style={{ marginLeft: even ? 0 : spacing.lg, marginRight: even ? spacing.lg : 0 }}
                  contentStyle={styles.pointBody}
                >
                  <View style={[styles.pointIcon, { backgroundColor: t.primarySoft }, even ? corner.shelf : corner.nib]}>
                    <Icon name={p.icon} size={20} color={t.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyStrong, { color: t.text }]}>{p.title}</Text>
                    <Text style={[type.small, { color: t.textMuted, marginTop: 2 }]}>{p.text}</Text>
                  </View>
                  {/* Oversized numeral, set low and faint: editorial marker, not a badge. */}
                  <Text style={[styles.numeral, { color: t.text, fontFamily: t.fonts.display }]}>{i + 1}</Text>
                </FlatGlass>
              </Animated.View>
            );
          })}
        </View>

        {/* ------------------------------------------------------------ action */}
        <Animated.View entering={enter(450)} style={{ marginTop: spacing.xxl }}>
          <Glass shape="hero" contentStyle={{ padding: spacing.xl, gap: spacing.md }}>
            <Text style={[type.heading, { color: t.text }]}>
              {granted ? "Storage access granted" : "Let Dera find your documents"}
            </Text>
            <Text style={[type.small, { color: t.textMuted }]}>
              {granted
                ? "You're all set. The first scan starts as soon as you continue."
                : access?.canRequestAllFilesAccess
                  ? "Android hides most documents from apps. Turn on “All files access” for Dera Library on the next screen, then come back here."
                  : "Allow storage access so Dera Library can list your documents."}
            </Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              {granted ? (
                <Button label="Continue" icon="arrow-right" variant="primary" onPress={finish} />
              ) : (
                <>
                  <Button label="Allow access" icon="folder-key-outline" variant="primary" onPress={allow} />
                  <Button label="Choose folders instead" icon="folder-plus-outline" busy={busy} onPress={pickFolder} />
                  <Button label="Skip for now" variant="ghost" onPress={finish} />
                </>
              )}
            </View>
          </Glass>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  eyebrowRule: { width: 26, height: 3, borderRadius: 2 },
  headline: { marginTop: spacing.xs },
  pointBody: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.lg },
  pointIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  numeral: { fontSize: 30, lineHeight: 34, opacity: 0.14, marginTop: -2 },
});
