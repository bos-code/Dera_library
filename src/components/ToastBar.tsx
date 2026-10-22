import { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hideToast } from "@/services/toast";
import { useAppState } from "@/state/store";
import { corner, spacing, type, useTheme } from "@/theme";

const VISIBLE_MS = 5000;
/** Clears the floating tab bar on tab screens; harmless elsewhere. */
const BOTTOM_OFFSET = 72;

/** App-wide message bar with an optional action (usually Undo). */
export function ToastBar() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useAppState((s) => s.toast);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(hideToast, VISIBLE_MS);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;
  // Inverted colours so the bar stands out on any theme.
  return (
    <Animated.View
      key={toast.id}
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(150)}
      accessibilityLiveRegion="polite"
      style={[styles.bar, corner.leaf, { backgroundColor: t.text, bottom: insets.bottom + BOTTOM_OFFSET }]}
    >
      <Text style={[type.small, { color: t.background, flex: 1 }]} numberOfLines={2}>
        {toast.message}
      </Text>
      {toast.action ? (
        <Pressable
          onPress={async () => {
            hideToast();
            await toast.action?.();
          }}
          accessibilityRole="button"
          hitSlop={12}
          style={styles.action}
        >
          <Text style={[type.smallStrong, { color: t.dark ? t.primary : t.primarySoft }]}>{toast.actionLabel ?? "OK"}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    elevation: 12,
  },
  action: { minHeight: 36, justifyContent: "center", paddingHorizontal: spacing.xs },
});
