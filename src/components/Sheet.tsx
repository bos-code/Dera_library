import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { corner, spacing, type, useTheme } from "@/theme";

/** Bottom sheet built on Modal: slides up, dismisses on backdrop tap or back button. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { backgroundColor: t.surface, paddingBottom: insets.bottom + spacing.md }]}>
          <View style={[styles.handle, { backgroundColor: t.border }]} />
          <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
            {title}
          </Text>
          <View style={{ flexShrink: 1 }}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    marginTop: "auto",
    maxHeight: "85%",
    ...corner.sheet,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: spacing.sm },
  title: {
    ...type.heading,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  footer: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
