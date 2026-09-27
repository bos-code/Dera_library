import { ActivityIndicator, StyleSheet, Text } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { plural } from "@/lib/format";
import { useAppState } from "@/state/store";
import { font, radius, spacing, useTheme } from "@/theme";
import { Icon } from "./ui";

/** Shows scan progress, then a short summary of what changed. */
export function ScanBanner({ onDismiss }: { onDismiss?: () => void }) {
  const t = useTheme();
  const scanning = useAppState((s) => s.scanning);
  const progress = useAppState((s) => s.progress);
  const summary = useAppState((s) => s.lastSummary);
  const error = useAppState((s) => s.scanError);

  let content: { icon?: "alert-circle-outline" | "check-circle-outline"; text: string; tone: "info" | "warn" } | null = null;
  if (scanning) {
    content = {
      text: `Scanning${progress?.folder ? ` ${progress.folder}` : ""}… ${plural(progress?.found ?? 0, "document")} found`,
      tone: "info",
    };
  } else if (error) {
    content = { icon: "alert-circle-outline", text: error, tone: "warn" };
  } else if (summary?.warning) {
    content = { icon: "alert-circle-outline", text: summary.warning, tone: "warn" };
  } else if (summary && (summary.added || summary.missing || summary.relinked || summary.restored)) {
    const parts = [
      summary.added && `${summary.added.toLocaleString()} new`,
      summary.relinked && `${summary.relinked} moved`,
      summary.restored && `${summary.restored} back`,
      summary.missing && `${summary.missing} missing`,
    ].filter(Boolean);
    content = { icon: "check-circle-outline", text: `Library updated: ${parts.join(", ")}`, tone: "info" };
  }
  if (!content) return null;
  const warn = content.tone === "warn";
  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: warn ? t.warningSoft : t.primarySoft }]}
    >
      {scanning ? (
        <ActivityIndicator size="small" color={t.primary} />
      ) : (
        <Icon name={content.icon!} size={20} color={warn ? t.warning : t.primary} />
      )}
      <Text style={[styles.text, { color: warn ? t.warning : t.text }]} numberOfLines={3}>
        {content.text}
      </Text>
      {!scanning && onDismiss ? (
        <Text accessibilityRole="button" onPress={onDismiss} style={[styles.dismiss, { color: t.primary }]}>
          OK
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  text: { flex: 1, fontSize: font.small, lineHeight: 19 },
  dismiss: { fontWeight: "700", fontSize: font.small, paddingHorizontal: spacing.sm, paddingVertical: 4 },
});
