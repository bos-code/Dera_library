import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { buildTree, createCollection, flattenTree, getAllCollections, type CollectionNode } from "@/db/collections";
import { font, spacing, useTheme } from "@/theme";
import { PromptSheet } from "./PromptSheet";
import { Sheet } from "./Sheet";
import { Button, Icon } from "./ui";

const ROOT = "__root__";

/**
 * Picks collections from the nested tree.
 * multi: returns every checked collection. single: returns one id, or null for "Top level" when allowRoot.
 */
export function CollectionPickerSheet({
  visible,
  title,
  mode,
  initialSelected = [],
  excludeSubtreeOf,
  allowRoot,
  confirmLabel = "Done",
  onDone,
  onClose,
}: {
  visible: boolean;
  title: string;
  mode: "multi" | "single";
  initialSelected?: string[];
  excludeSubtreeOf?: string;
  allowRoot?: boolean;
  confirmLabel?: string;
  onDone: (ids: string[] | (string | null)) => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useTheme();
  const [nodes, setNodes] = useState<CollectionNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const load = async () => setNodes(flattenTree(buildTree(await getAllCollections())));
  useEffect(() => {
    if (!visible) return;
    setSelected(new Set(initialSelected));
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const excluded = useMemo(() => {
    const out = new Set<string>();
    if (!excludeSubtreeOf) return out;
    for (const n of nodes) {
      if (n.id === excludeSubtreeOf || (n.parentId && out.has(n.parentId))) out.add(n.id);
    }
    return out;
  }, [nodes, excludeSubtreeOf]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (mode === "single") return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const done = async () => {
    if (mode === "multi") await onDone([...selected]);
    else {
      const [id] = [...selected];
      await onDone(id === ROOT || id === undefined ? null : id);
    }
  };

  const row = (id: string, name: string, depth: number, count?: number) => {
    const on = selected.has(id);
    return (
      <Pressable
        key={id}
        onPress={() => toggle(id)}
        accessibilityRole={mode === "multi" ? "checkbox" : "radio"}
        accessibilityState={mode === "multi" ? { checked: on } : { selected: on }}
        accessibilityLabel={name}
        android_ripple={{ color: t.border }}
        style={[styles.row, { paddingLeft: spacing.lg + depth * 22 }]}
      >
        <Icon
          name={
            mode === "multi" ? (on ? "checkbox-marked" : "checkbox-blank-outline") : on ? "radiobox-marked" : "radiobox-blank"
          }
          color={on ? t.primary : t.textFaint}
        />
        <Icon name={id === ROOT ? "home-outline" : "folder-outline"} size={20} color={t.textMuted} />
        <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
          {name}
        </Text>
        {count != null ? <Text style={{ color: t.textFaint, fontSize: font.small }}>{count}</Text> : null}
      </Pressable>
    );
  };

  return (
    <>
      <Sheet
        visible={visible && !creating}
        onClose={onClose}
        title={title}
        footer={
          <>
            <Button label="New" icon="plus" onPress={() => setCreating(true)} style={{ flex: 1 }} />
            <Button
              label={confirmLabel}
              variant="primary"
              onPress={done}
              disabled={mode === "single" && selected.size === 0}
              style={{ flex: 2 }}
            />
          </>
        }
      >
        <ScrollView>
          {allowRoot ? row(ROOT, "Top level", 0) : null}
          {nodes.filter((n) => !excluded.has(n.id)).map((n) => row(n.id, n.name, n.depth, n.documentCount))}
          {nodes.length === 0 ? (
            <View style={{ padding: spacing.xl }}>
              <Text style={{ color: t.textMuted, textAlign: "center", fontSize: font.body }}>
                No collections yet. Create one to start organizing.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </Sheet>
      <PromptSheet
        visible={visible && creating}
        title="New collection"
        placeholder="e.g. School, Physics, Books"
        confirmLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          try {
            const id = await createCollection(name);
            await load();
            toggle(id);
            setCreating(false);
          } catch (e) {
            Alert.alert("Collection", e instanceof Error ? e.message : "Could not create the collection");
          }
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingRight: spacing.lg },
  name: { flex: 1, fontSize: font.body },
});
