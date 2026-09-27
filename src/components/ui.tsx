import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { font, radius, spacing, useTheme } from "@/theme";

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={color ?? t.text} />;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  icon,
  variant = "secondary",
  disabled,
  busy,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.primary : variant === "secondary" ? t.surfaceAlt : "transparent";
  const fg = variant === "primary" ? t.onPrimary : variant === "danger" ? t.danger : variant === "ghost" ? t.primary : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      android_ripple={{ color: t.border }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "danger" && { borderWidth: StyleSheet.hairlineWidth, borderColor: t.danger },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color,
  active,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  active?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      hitSlop={8}
      android_ripple={{ color: t.border, borderless: true, radius: 24 }}
      style={styles.iconButton}
    >
      <Icon name={icon} color={color ?? (active ? t.primary : t.text)} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  count,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  count?: number;
  icon?: IconName;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? t.primary : t.surface,
          borderColor: selected ? t.primary : t.border,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? t.onPrimary : t.textMuted} /> : null}
      <Text style={[styles.chipText, { color: selected ? t.onPrimary : t.text }]}>{label}</Text>
      {count != null ? (
        <Text style={[styles.chipCount, { color: selected ? t.onPrimary : t.textFaint }]}>{count.toLocaleString()}</Text>
      ) : null}
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  children,
}: {
  icon: IconName;
  title: string;
  message?: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.empty} accessibilityRole="summary">
      <View style={[styles.emptyIcon, { backgroundColor: t.surfaceAlt }]}>
        <Icon name={icon} size={36} color={t.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: t.text }]}>{title}</Text>
      {message ? <Text style={[styles.emptyMessage, { color: t.textMuted }]}>{message}</Text> : null}
      {children ? <View style={{ gap: spacing.sm, marginTop: spacing.md, alignSelf: "stretch" }}>{children}</View> : null}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text accessibilityRole="header" style={[styles.section, { color: t.textMuted }]}>
        {children.toUpperCase()}
      </Text>
      {action}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>;
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  onPress,
  onLongPress,
  right,
  indent = 0,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  right?: ReactNode;
  indent?: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: t.border }}
      style={[styles.listRow, { paddingLeft: spacing.lg + indent * 20 }]}
    >
      {icon ? <Icon name={icon} color={iconColor ?? t.textMuted} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.listTitle, { color: t.text }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.listSubtitle, { color: t.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  buttonText: { fontSize: font.body, fontWeight: "600" },
  iconButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipText: { fontSize: font.small, fontWeight: "600" },
  chipCount: { fontSize: font.tiny, fontWeight: "600" },
  empty: { alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: 48, gap: spacing.sm },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: font.heading, fontWeight: "700", textAlign: "center", fontFamily: font.display },
  emptyMessage: { fontSize: font.body, textAlign: "center", lineHeight: 22 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  section: { fontSize: font.tiny, fontWeight: "700", letterSpacing: 1 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  listRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
  },
  listTitle: { fontSize: font.body, fontWeight: "600" },
  listSubtitle: { fontSize: font.small, marginTop: 2 },
});
