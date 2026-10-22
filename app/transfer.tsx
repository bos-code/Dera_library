import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, EmptyState, Icon, SectionTitle } from "@/components/ui";
import { insertDocuments, searchDocuments } from "@/db/documents";
import { plural } from "@/lib/format";
import { docTitle } from "@/lib/title";
import { isScannerAvailable, scanner, type ScannedItem } from "@/native/scanner";
import { logError } from "@/services/log";
import { notifyLibraryChanged } from "@/state/store";
import { corner, spacing, type, useTheme } from "@/theme";

/** Library documents in the computer's browser; files dropped there arrive in the Inbox. */
const MAX_LISTED = 2000;

/**
 * "Send to computer" over Wi-Fi: a local web page, no cloud, no cable. Runs only while this screen is open,
 * and every request needs the access code shown here.
 */
export default function TransferScreen() {
  const t = useTheme();
  const [state, setState] = useState<"starting" | "running" | "offline" | "error">("starting");
  const [info, setInfo] = useState<{ url: string; address: string; code: string } | null>(null);
  const [received, setReceived] = useState<string[]>([]);

  useEffect(() => {
    if (!isScannerAvailable) return setState("error");
    let alive = true;
    const sub = scanner().addListener("onTransferReceived", (item: ScannedItem) => {
      void insertDocuments([item], { inbox: true }).then(() => notifyLibraryChanged());
      setReceived((r) => [item.name, ...r]);
    });
    (async () => {
      try {
        const docs = await searchDocuments({ sort: "modified-desc", limit: MAX_LISTED });
        const started = await scanner().startTransfer(
          docs.map((d) => ({ id: d.id, name: d.name, title: docTitle(d), uri: d.uri, size: d.size, mimeType: d.mimeType })),
        );
        if (!alive) return;
        if (!started) return setState("offline");
        setInfo(started);
        setState("running");
      } catch (e) {
        logError("Wi-Fi transfer failed to start", e);
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
      sub.remove();
      try {
        scanner().stopTransfer();
      } catch {
        // Already stopped.
      }
    };
  }, []);

  if (state === "starting") return <ActivityIndicator style={{ marginTop: 64 }} color={t.primary} />;
  if (state === "offline")
    return (
      <EmptyState
        icon="wifi-off"
        title="Not on Wi-Fi"
        message="Connect this phone and your computer to the same Wi-Fi (or the phone's hotspot), then open this screen again."
      />
    );
  if (state === "error" || !info)
    return <EmptyState icon="alert-circle-outline" title="Couldn't start" message="Try again in a moment." />;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 }}>
      <Text style={[type.body, { color: t.textMuted }]}>
        On a computer connected to the same Wi-Fi, open this address in a browser:
      </Text>
      <View style={[styles.address, corner.hero, { backgroundColor: t.primarySoft }]}>
        <Text selectable style={[type.heading, { color: t.text, textAlign: "center" }]}>
          http://{info.address}
        </Text>
        <Text style={[type.small, { color: t.textMuted, textAlign: "center" }]}>then enter the access code</Text>
        <Text
          selectable
          accessibilityLabel={`Access code ${info.code.split("").join(" ")}`}
          style={[styles.code, { color: t.primary }]}
        >
          {info.code}
        </Text>
        <Text selectable style={[type.tiny, { color: t.textFaint, textAlign: "center" }]}>
          Or the full link: {info.url}
        </Text>
      </View>
      <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
        {[
          ["download", "Download any library document from the computer."],
          ["upload", "Drop files on the page to send them to this phone. They arrive in your Inbox."],
          ["shield-lock-outline", "Only on your local network, only while this screen is open, only with the code."],
        ].map(([icon, text]) => (
          <View key={icon} style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
            <Icon name={icon as "download"} color={t.primary} />
            <Text style={[type.small, { color: t.text, flex: 1 }]}>{text}</Text>
          </View>
        ))}
      </Card>
      {received.length ? (
        <>
          <SectionTitle>{`Received · ${plural(received.length, "file")}`}</SectionTitle>
          {received.map((name, i) => (
            <Text key={`${name}-${i}`} style={[type.small, { color: t.text }]}>
              ✓ {name}
            </Text>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  address: { padding: spacing.xl, gap: spacing.sm },
  code: {
    fontSize: 36,
    letterSpacing: 6,
    textAlign: "center",
    fontFamily: "monospace",
    fontWeight: "700",
    marginVertical: spacing.sm,
  },
});
