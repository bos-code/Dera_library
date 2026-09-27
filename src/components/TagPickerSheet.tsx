import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ensureTag, getTags, type Tag } from "@/db/tags";
import { font, radius, spacing, useTheme } from "@/theme";
import { Sheet } from "./Sheet";
import { Button, Icon } from "./ui";

const SUGGESTED = ["Important", "Exam", "Revision", "Read later", "Work"];

/** Chooses tags to apply; new tags can be typed in. Returns the chosen tag ids. */
export function TagPickerSheet({
  visible,
  title = "Add tags",
  initialSelected = [],
  onDone,
  onClose,
}: {
  visible: boolean;
  title?: string;
  initialSelected?: string[];
  onDone: (tagIds: string[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useTheme();
  const [tags, setTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set(initialSelected));
    setText("");
    void getTags().then(setTags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const add = async (name: string) => {
    try {
      const id = await ensureTag(name);
      setTags(await getTags());
      setSelected((s) => new Set(s).add(id));
      setText("");
    } catch (e) {
      Alert.alert("Tag", e instanceof Error ? e.message : "Could not create the tag");
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const existingNames = new Set(tags.map((x) => x.name.toLowerCase()));
  const suggestions = SUGGESTED.filter((s) => !existingNames.has(s.toLowerCase()));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button label="Cancel" onPress={onClose} style={{ flex: 1 }} />
          <Button label="Apply" variant="primary" onPress={() => onDone([...selected])} style={{ flex: 2 }} />
        </>
      }
    >
      <View style={[styles.inputRow, { borderColor: t.border, backgroundColor: t.background }]}>
        <Icon name="tag-plus-outline" color={t.textMuted} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Create a tag"
          placeholderTextColor={t.textFaint}
          maxLength={40}
          onSubmitEditing={() => text.trim() && add(text)}
          returnKeyType="done"
          accessibilityLabel="New tag name"
          style={[styles.input, { color: t.text }]}
        />
        {text.trim() ? <Button label="Add" variant="ghost" onPress={() => add(text)} /> : null}
      </View>
      <ScrollView contentContainerStyle={styles.wrap}>
        {tags.map((tag) => {
          const on = selected.has(tag.id);
          return (
            <Pressable
              key={tag.id}
              onPress={() => toggle(tag.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={tag.name}
              style={[styles.tag, { backgroundColor: on ? t.primary : t.surfaceAlt }]}
            >
              <Icon name={on ? "check" : "tag-outline"} size={16} color={on ? t.onPrimary : t.textMuted} />
              <Text style={{ color: on ? t.onPrimary : t.text, fontWeight: "600", fontSize: font.small }}>{tag.name}</Text>
            </Pressable>
          );
        })}
        {suggestions.map((name) => (
          <Pressable
            key={name}
            onPress={() => add(name)}
            accessibilityRole="button"
            accessibilityLabel={`Create tag ${name}`}
            style={[styles.tag, { borderWidth: 1, borderStyle: "dashed", borderColor: t.border }]}
          >
            <Icon name="plus" size={16} color={t.textFaint} />
            <Text style={{ color: t.textMuted, fontSize: font.small }}>{name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingLeft: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 50,
  },
  input: { flex: 1, fontSize: font.body },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, padding: spacing.lg },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: radius.pill },
});
