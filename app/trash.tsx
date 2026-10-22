import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { Button, EmptyState, IconButton } from "@/components/ui";
import { formatRelativeDate, formatSize, plural } from "@/lib/format";
import { useQuery } from "@/lib/useQuery";
import { scanner } from "@/native/scanner";
import { restoreTrashItem, TRASH_DAYS } from "@/services/fileManager";
import { notifyLibraryChanged } from "@/state/store";
import { spacing, type, useTheme } from "@/theme";

/** Files Dera moved to its trash. Restorable until they're emptied after 30 days. */
export default function TrashScreen() {
  const t = useTheme();
  const { data: items, reload } = useQuery(() => scanner().listTrash(), []);

  const deleteForever = (path: string, name: string) =>
    Alert.alert(`Delete “${name}” forever?`, "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await scanner().deleteFromTrash(path);
          reload();
        },
      },
    ]);

  const emptyAll = () =>
    Alert.alert("Empty trash?", `${plural(items?.length ?? 0, "file")} will be deleted for good. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Empty trash",
        style: "destructive",
        onPress: async () => {
          await scanner().emptyTrash(-1);
          notifyLibraryChanged();
          reload();
        },
      },
    ]);

  return (
    <FlatList
      data={items ?? []}
      keyExtractor={(i) => i.path}
      contentContainerStyle={{ paddingBottom: 48 }}
      ListHeaderComponent={
        items?.length ? (
          <View style={styles.head}>
            <Text style={[type.small, { color: t.textMuted, flex: 1 }]}>
              Files you moved to trash from Dera. They're removed for good after {TRASH_DAYS} days.
            </Text>
            <Button label="Empty" variant="danger" onPress={emptyAll} />
          </View>
        ) : null
      }
      ListEmptyComponent={items ? <EmptyState icon="trash-can-outline" title="Trash is empty" /> : null}
      renderItem={({ item }) => {
        const daysLeft = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - item.trashedAt) / 86_400_000));
        return (
          <View style={[styles.row, { borderBottomColor: t.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={2} style={[type.bodyStrong, { color: t.text }]}>
                {item.name}
              </Text>
              <Text numberOfLines={1} style={[type.tiny, { color: t.textFaint }]}>
                {formatSize(item.size)} · deleted {formatRelativeDate(item.trashedAt).toLowerCase()} · {plural(daysLeft, "day")}{" "}
                left
              </Text>
              {item.originalPath ? (
                <Text numberOfLines={1} style={[type.tiny, { color: t.textFaint }]}>
                  From {item.originalPath.split("/").slice(-3, -1).join("/")}
                </Text>
              ) : null}
            </View>
            <IconButton
              icon="delete-restore"
              label={`Restore ${item.name}`}
              color={t.primary}
              onPress={async () => {
                if (await restoreTrashItem(item.path, item.name)) reload();
              }}
            />
            <IconButton
              icon="delete-forever-outline"
              label={`Delete ${item.name} forever`}
              color={t.danger}
              onPress={() => deleteForever(item.path, item.name)}
            />
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
