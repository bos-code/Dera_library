import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { scanner } from "@/native/scanner";
import { createFolderIn } from "@/services/fileManager";
import { spacing, type, useTheme } from "@/theme";
import { PromptSheet } from "./PromptSheet";
import { Sheet } from "./Sheet";
import { Button, Icon, ListRow } from "./ui";

/** Browse real folders on the phone and pick a destination. */
export function FolderPickerSheet({
  visible,
  title,
  confirmLabel = "Move here",
  startPath,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  confirmLabel?: string;
  startPath?: string | null;
  onPick: (path: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useTheme();
  const [roots, setRoots] = useState<Array<{ path: string; label: string }>>([]);
  const [path, setPath] = useState<string | null>(null);
  const [dirs, setDirs] = useState<Array<{ name: string; path: string }> | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const r = scanner().getStorageRoots();
    setRoots(r);
    const start = startPath && r.some((x) => startPath.startsWith(x.path)) ? startPath : (r[0]?.path ?? null);
    setPath(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    setDirs(null);
    void scanner()
      .listDirectories(path)
      .then((d) => alive && setDirs(d));
    return () => {
      alive = false;
    };
  }, [path]);

  const root = roots.find((r) => path?.startsWith(r.path));
  const crumbs = root && path ? [root.label, ...path.slice(root.path.length).split("/").filter(Boolean)] : [];
  const up = () => {
    if (!path || !root || path === root.path) return setPath(null);
    setPath(path.slice(0, path.lastIndexOf("/")));
  };

  return (
    <>
      <Sheet
        visible={visible && !creating}
        onClose={onClose}
        title={title}
        footer={
          <>
            <Button
              label="New folder"
              icon="folder-plus-outline"
              disabled={!path}
              onPress={() => setCreating(true)}
              style={{ flex: 1 }}
            />
            <Button
              label={confirmLabel}
              icon="check"
              variant="primary"
              disabled={!path}
              onPress={() => path && onPick(path)}
              style={{ flex: 1 }}
            />
          </>
        }
      >
        <View style={styles.crumbRow}>
          {path ? (
            <Pressable onPress={up} accessibilityRole="button" accessibilityLabel="Up one folder" hitSlop={10} style={styles.up}>
              <Icon name="arrow-up" size={20} color={t.primary} />
            </Pressable>
          ) : null}
          <Text numberOfLines={1} style={[type.smallStrong, { color: t.textMuted, flex: 1 }]} accessibilityLiveRegion="polite">
            {path ? crumbs.join(" › ") : "Choose a storage location"}
          </Text>
        </View>
        <ScrollView style={{ maxHeight: 420 }}>
          {!path ? (
            roots.map((r) => (
              <ListRow
                key={r.path}
                icon={r.label === "SD card" ? "sd" : "cellphone"}
                title={r.label}
                onPress={() => setPath(r.path)}
              />
            ))
          ) : dirs === null ? (
            <ActivityIndicator style={{ padding: spacing.xl }} color={t.primary} />
          ) : dirs.length ? (
            dirs.map((d) => (
              <ListRow
                key={d.path}
                icon="folder-outline"
                title={d.name}
                onPress={() => setPath(d.path)}
                right={<Icon name="chevron-right" color={t.textFaint} />}
              />
            ))
          ) : (
            <Text style={[type.small, { color: t.textFaint, padding: spacing.lg }]}>No folders here. You can create one.</Text>
          )}
        </ScrollView>
      </Sheet>
      <PromptSheet
        visible={visible && creating}
        title="New folder"
        placeholder="e.g. Exams 2026"
        confirmLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          if (!path) return;
          const created = await createFolderIn(path, name);
          setCreating(false);
          if (created) setPath(created);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  crumbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  up: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
