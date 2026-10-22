import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { radius, spacing, type, useTheme } from "@/theme";
import { Sheet } from "./Sheet";
import { Button } from "./ui";

/** Multi-line notes editor. */
export function NoteSheet({
  visible,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: string;
  onSave: (text: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useTheme();
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Notes"
      footer={
        <>
          <Button label="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button label="Save" icon="check" variant="primary" onPress={() => onSave(text)} style={{ flex: 2 }} />
        </>
      }
    >
      <View style={{ paddingHorizontal: spacing.lg }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="What is this document, why does it matter, what to remember…"
          placeholderTextColor={t.textFaint}
          multiline
          autoFocus
          maxLength={4000}
          textAlignVertical="top"
          accessibilityLabel="Notes"
          style={[styles.input, type.body, { color: t.text, borderColor: t.border, backgroundColor: t.background }]}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 160, maxHeight: 320, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
});
