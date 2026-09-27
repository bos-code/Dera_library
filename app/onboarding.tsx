import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon, type IconName } from "@/components/ui";
import { setMeta } from "@/db/database";
import { isScannerAvailable } from "@/native/scanner";
import { requestFullAccess } from "@/services/access";
import { addFolder, scanLibrary } from "@/services/scan";
import { setState, useAppState } from "@/state/store";
import { font, radius, spacing, useTheme } from "@/theme";

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
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 48,
        paddingBottom: insets.bottom + spacing.xl,
        paddingHorizontal: spacing.xl,
        gap: spacing.xl,
      }}
    >
      <Animated.View entering={FadeInDown.duration(400)} style={{ gap: spacing.sm }}>
        <View style={[styles.logo, { backgroundColor: t.primary }]}>
          <Icon name="bookshelf" size={36} color={t.onPrimary} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
          Dera Library
        </Text>
        <Text style={{ color: t.textMuted, fontSize: font.body, lineHeight: 24 }}>
          Every document on your phone, on one quiet, searchable shelf.
        </Text>
      </Animated.View>

      <View style={{ gap: spacing.lg }}>
        {POINTS.map((p, i) => (
          <Animated.View key={p.title} entering={FadeInDown.delay(120 + i * 90).duration(400)} style={styles.point}>
            <View style={[styles.pointIcon, { backgroundColor: t.primarySoft }]}>
              <Icon name={p.icon} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: font.body, fontWeight: "700" }}>{p.title}</Text>
              <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20 }}>{p.text}</Text>
            </View>
          </Animated.View>
        ))}
      </View>

      <Animated.View
        entering={FadeInDown.delay(450).duration(400)}
        style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
      >
        <Text style={{ color: t.text, fontSize: font.body, fontWeight: "700" }}>
          {granted ? "Storage access granted" : "Let Dera find your documents"}
        </Text>
        <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20 }}>
          {granted
            ? "You're all set. The first scan starts as soon as you continue."
            : access?.canRequestAllFilesAccess
              ? "Android hides most documents from apps. Turn on “All files access” for Dera Library on the next screen, then come back here."
              : "Allow storage access so Dera Library can list your documents."}
        </Text>
        {granted ? (
          <Button label="Continue" icon="arrow-right" variant="primary" onPress={finish} />
        ) : (
          <>
            <Button label="Allow access" icon="folder-key-outline" variant="primary" onPress={allow} />
            <Button label="Choose folders instead" icon="folder-plus-outline" busy={busy} onPress={pickFolder} />
            <Button label="Skip for now" variant="ghost" onPress={finish} />
          </>
        )}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: { fontSize: 34, fontWeight: "700", fontFamily: font.display },
  point: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  pointIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg, gap: spacing.md },
});
