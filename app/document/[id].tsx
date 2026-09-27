import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from "react-native-reanimated";
import { CollectionPickerSheet } from "@/components/CollectionPickerSheet";
import { TagPickerSheet } from "@/components/TagPickerSheet";
import { TypeBadge } from "@/components/TypeBadge";
import { Button, Card, EmptyState, Icon, SectionTitle } from "@/components/ui";
import { getOpenCount, setFavorite } from "@/db/activity";
import { getAllCollections, getDocumentCollectionIds, setDocumentCollections } from "@/db/collections";
import { forgetDocuments, getDocument } from "@/db/documents";
import { getDocumentTags, tagDocuments, untagDocument } from "@/db/tags";
import { TYPE_LABEL } from "@/lib/fileTypes";
import { formatDateTime, formatSize } from "@/lib/format";
import { useQuery } from "@/lib/useQuery";
import { openDocument } from "@/services/open";
import { scanLibrary } from "@/services/scan";
import { notifyLibraryChanged } from "@/state/store";
import { font, radius, spacing, useTheme } from "@/theme";

export default function DocumentScreen() {
  const t = useTheme();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const [sheet, setSheet] = useState<"collections" | "tags" | null>(null);
  const [opening, setOpening] = useState(false);
  const starScale = useSharedValue(1);
  const starStyle = useAnimatedStyle(() => ({ transform: [{ scale: starScale.value }] }));

  const { data } = useQuery(async () => {
    const doc = await getDocument(id);
    if (!doc) return null;
    const [tags, collectionIds, collections, opens] = await Promise.all([
      getDocumentTags(id),
      getDocumentCollectionIds(id),
      getAllCollections(),
      getOpenCount(id),
    ]);
    const byId = new Map(collections.map((c) => [c.id, c]));
    const pathOf = (cid: string) => {
      const names: string[] = [];
      let cur = byId.get(cid);
      while (cur && names.length < 16) {
        names.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return names.join(" › ");
    };
    return {
      doc,
      tags,
      collectionIds,
      collections: collectionIds.map((cid) => ({ id: cid, label: pathOf(cid) })).sort((a, b) => a.label.localeCompare(b.label)),
      opens,
    };
  }, [id]);

  if (data === undefined) return <Stack.Screen options={{ title: "" }} />;
  if (data === null) {
    return (
      <>
        <Stack.Screen options={{ title: "Not found" }} />
        <EmptyState
          icon="file-remove-outline"
          title="Document not in library"
          message="It may have been removed from the index."
        />
      </>
    );
  }
  const { doc, tags, collections, collectionIds, opens } = data;
  const unavailable = doc.status !== "available";

  const open = async () => {
    setOpening(true);
    const result = await openDocument(doc);
    setOpening(false);
    if (!result.ok) Alert.alert(result.title ?? "Couldn't open", result.message);
  };

  const toggleFavorite = async () => {
    starScale.value = withSequence(withSpring(1.35, { damping: 6 }), withSpring(1));
    await setFavorite([doc.id], !doc.isFavorite);
    notifyLibraryChanged();
  };

  const forget = () =>
    Alert.alert(
      "Remove from library?",
      "This removes the entry and its collections and tags from Dera Library. The file itself is not touched.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await forgetDocuments([doc.id]);
            notifyLibraryChanged();
            router.back();
          },
        },
      ],
    );

  const details: Array<[string, string]> = [
    ["Type", `${TYPE_LABEL[doc.type]} (.${doc.extension})`],
    ["Size", formatSize(doc.size)],
    ["Modified", doc.modifiedAt ? formatDateTime(doc.modifiedAt) : "Unknown"],
    ["Location", doc.folder || "Unknown"],
    ["Last opened", doc.lastOpenedAt ? formatDateTime(doc.lastOpenedAt) : "Never"],
    ["Times opened", String(opens)],
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerRight: () => (
            <Pressable
              onPress={toggleFavorite}
              accessibilityRole="button"
              accessibilityLabel={doc.isFavorite ? "Remove from favorites" : "Add to favorites"}
              hitSlop={12}
              style={{ padding: 8 }}
            >
              <Animated.View style={starStyle}>
                <Icon name={doc.isFavorite ? "star" : "star-outline"} size={26} color={doc.isFavorite ? t.warning : t.text} />
              </Animated.View>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={styles.hero}>
          <TypeBadge type={doc.type} extension={doc.extension} size={72} />
          <Text selectable accessibilityRole="header" style={[styles.name, { color: t.text }]}>
            {doc.name}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: font.small }}>
            {formatSize(doc.size)} · {doc.folder || "Unknown folder"}
          </Text>
        </View>

        {unavailable ? (
          <View style={[styles.warning, { backgroundColor: t.warningSoft }]}>
            <Icon name="alert-circle-outline" color={t.warning} />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text style={{ color: t.warning, fontWeight: "700", fontSize: font.body }}>
                {doc.status === "missing" ? "This file can't be found" : "Access to this file was lost"}
              </Text>
              <Text style={{ color: t.text, fontSize: font.small, lineHeight: 20 }}>
                {doc.status === "missing"
                  ? "It may have been moved, renamed or deleted. If it's still on the phone, a rescan reconnects it and keeps its collections and tags."
                  : "Storage permission was removed or the folder is no longer shared. Restore access in Settings, then rescan."}
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button label="Rescan" icon="magnify-scan" onPress={() => void scanLibrary()} style={{ flex: 1 }} />
                <Button label="Remove" icon="delete-outline" variant="danger" onPress={forget} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Open"
            icon="open-in-new"
            variant="primary"
            busy={opening}
            onPress={open}
            style={{ flex: 1 }}
            accessibilityHint="Opens the document in another app"
          />
          <Button
            label={doc.isFavorite ? "Favorited" : "Favorite"}
            icon={doc.isFavorite ? "star" : "star-outline"}
            onPress={toggleFavorite}
            style={{ flex: 1 }}
          />
        </View>

        <SectionTitle action={<Button label="Edit" variant="ghost" onPress={() => setSheet("collections")} />}>
          Collections
        </SectionTitle>
        <View style={styles.chips}>
          {collections.length ? (
            collections.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push({ pathname: "/collection/[id]", params: { id: c.id } })}
                accessibilityRole="link"
                style={[styles.chip, { backgroundColor: t.primarySoft }]}
              >
                <Icon name="folder-outline" size={16} color={t.primary} />
                <Text style={{ color: t.text, fontSize: font.small, fontWeight: "600" }}>{c.label}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={{ color: t.textFaint, fontSize: font.small }}>Not in any collection yet.</Text>
          )}
        </View>

        <SectionTitle action={<Button label="Edit" variant="ghost" onPress={() => setSheet("tags")} />}>Tags</SectionTitle>
        <View style={styles.chips}>
          {tags.length ? (
            tags.map((tag) => (
              <Pressable
                key={tag.id}
                onPress={() => router.push({ pathname: "/tag/[id]", params: { id: tag.id } })}
                onLongPress={async () => {
                  await untagDocument(tag.id, doc.id);
                  notifyLibraryChanged();
                }}
                accessibilityRole="link"
                accessibilityHint="Long press to remove this tag"
                style={[styles.chip, { backgroundColor: t.surfaceAlt }]}
              >
                <Icon name="tag-outline" size={16} color={t.textMuted} />
                <Text style={{ color: t.text, fontSize: font.small, fontWeight: "600" }}>{tag.name}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={{ color: t.textFaint, fontSize: font.small }}>No tags yet.</Text>
          )}
        </View>

        <SectionTitle>Details</SectionTitle>
        <Card style={{ marginHorizontal: spacing.lg }}>
          {details.map(([label, value], i) => (
            <View
              key={label}
              style={[styles.detail, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}
            >
              <Text style={{ color: t.textMuted, fontSize: font.small, width: 104 }}>{label}</Text>
              <Text selectable style={{ color: t.text, fontSize: font.small, flex: 1 }}>
                {value}
              </Text>
            </View>
          ))}
          <View style={[styles.detail, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
            <Text style={{ color: t.textMuted, fontSize: font.small, width: 104 }}>Content URI</Text>
            <Text selectable style={{ color: t.textFaint, fontSize: font.tiny, flex: 1 }}>
              {doc.uri}
            </Text>
          </View>
        </Card>
      </ScrollView>

      <CollectionPickerSheet
        visible={sheet === "collections"}
        title="Collections"
        mode="multi"
        initialSelected={collectionIds}
        onClose={() => setSheet(null)}
        onDone={async (result) => {
          await setDocumentCollections(doc.id, Array.isArray(result) ? result : []);
          setSheet(null);
          notifyLibraryChanged();
        }}
      />
      <TagPickerSheet
        visible={sheet === "tags"}
        title="Tags"
        initialSelected={tags.map((x) => x.id)}
        onClose={() => setSheet(null)}
        onDone={async (tagIds) => {
          const next = new Set(tagIds);
          for (const tag of tags) if (!next.has(tag.id)) await untagDocument(tag.id, doc.id);
          for (const tagId of next) await tagDocuments(tagId, [doc.id]);
          setSheet(null);
          notifyLibraryChanged();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  name: { fontSize: 22, lineHeight: 30, fontWeight: "700", textAlign: "center", fontFamily: font.display, marginTop: spacing.sm },
  warning: {
    flexDirection: "row",
    gap: spacing.md,
    margin: spacing.lg,
    marginBottom: 0,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: radius.pill },
  detail: { flexDirection: "row", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
});
