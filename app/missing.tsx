import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { DocumentBrowser } from "@/components/DocumentBrowser";
import { Button, EmptyState } from "@/components/ui";
import { forgetDocuments, searchDocuments } from "@/db/documents";
import { useQuery } from "@/lib/useQuery";
import { scanLibrary } from "@/services/scan";
import { notifyLibraryChanged, useAppState } from "@/state/store";
import { font, spacing, useTheme } from "@/theme";

/** Documents the index can't reach any more, kept so their organization isn't lost. */
export default function MissingScreen() {
  const t = useTheme();
  const scanning = useAppState((s) => s.scanning);
  const [removing, setRemoving] = useState(false);
  const { data: missing } = useQuery(() => searchDocuments({ status: "missing" }), []);
  const { data: revoked } = useQuery(() => searchDocuments({ status: "revoked" }), []);
  const docs = [...(missing ?? []), ...(revoked ?? [])];

  const removeAll = () =>
    Alert.alert(
      "Remove all from library?",
      "These entries and their collections and tags will be removed from Dera Library. No files are touched.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove all",
          style: "destructive",
          onPress: async () => {
            setRemoving(true);
            await forgetDocuments(docs.map((d) => d.id));
            setRemoving(false);
            notifyLibraryChanged();
          },
        },
      ],
    );

  return (
    <DocumentBrowser
      documents={docs}
      header={
        docs.length ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20 }}>
              These documents were moved, deleted, or are in places the app can no longer read. They're kept with their
              collections and tags, and reconnect automatically if a scan finds them. Entries without any organization are cleaned
              up after 30 days.
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button label="Rescan" icon="magnify-scan" busy={scanning} onPress={() => void scanLibrary()} style={{ flex: 1 }} />
              <Button
                label="Remove all"
                icon="delete-sweep-outline"
                variant="danger"
                busy={removing}
                onPress={removeAll}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : undefined
      }
      empty={
        missing && revoked ? (
          <EmptyState icon="check-circle-outline" title="Everything is reachable" message="No missing documents." />
        ) : undefined
      }
      extraActions={[{ icon: "delete-outline", label: "Remove from library", run: forgetDocuments }]}
    />
  );
}
