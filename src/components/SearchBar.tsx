import { forwardRef } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { font, radius, spacing, useTheme } from "@/theme";
import { Icon } from "./ui";

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const SearchBar = forwardRef<TextInput, Props>(function SearchBar({ value, onChangeText, placeholder, autoFocus }, ref) {
  const t = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Icon name="magnify" color={t.textMuted} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? "Search your library"}
        placeholderTextColor={t.textFaint}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search documents"
        style={[styles.input, { color: t.text }]}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => onChangeText("")}>
          <Icon name="close-circle" size={20} color={t.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: font.body, paddingVertical: 10 },
});
