import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { font, radius, spacing, useTheme } from "@/theme";
import { Sheet } from "./Sheet";
import { Button } from "./ui";

/** Text-entry dialog (Android has no Alert.prompt). */
export function PromptSheet({
  visible,
  title,
  placeholder,
  initialValue = "",
  confirmLabel = "Save",
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useTheme();
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);
  const submit = async () => {
    if (!value.trim()) return;
    await onSubmit(value.trim());
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button label="Cancel" onPress={onClose} style={{ flex: 1 }} />
          <Button label={confirmLabel} variant="primary" onPress={submit} disabled={!value.trim()} style={{ flex: 1 }} />
        </>
      }
    >
      <View style={{ paddingHorizontal: spacing.lg }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={t.textFaint}
          autoFocus
          maxLength={80}
          onSubmitEditing={submit}
          accessibilityLabel={title}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.background }]}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: { fontSize: font.body, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 50 },
});
