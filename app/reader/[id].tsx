import { FlashList, type FlashListRef, type ViewToken } from "@shopify/flash-list";
import { Stack, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { PromptSheet } from "@/components/PromptSheet";
import { Button, EmptyState, IconButton } from "@/components/ui";
import { ZoomablePage } from "@/components/ZoomablePage";
import { recordOpen } from "@/db/activity";
import { getDocument, setLastPage } from "@/db/documents";
import { addSession } from "@/db/reading";
import { docTitle } from "@/lib/title";
import { scanner } from "@/native/scanner";
import { logError } from "@/services/log";
import { openWithFeedback } from "@/services/documentActions";
import { notifyLibraryChanged } from "@/state/store";
import { spacing, type, useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";

const GAP = 10;
/** Shorter visits aren't logged as reading. */
const MIN_SESSION_MS = 30_000;

/** One page: rendered on demand at screen resolution, white placeholder until ready. */
const Page = memo(function Page({
  uri,
  index,
  width,
  aspect,
  onZoom,
}: {
  uri: string;
  index: number;
  width: number;
  aspect: number;
  onZoom: (index: number) => void;
}) {
  const t = useTheme();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    const px = Math.min(1800, Math.round(width * PixelRatio.get()));
    void scanner()
      .renderPdfPage(uri, index, px)
      .then((s) => alive && setSrc(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [uri, index, width]);
  return (
    <Pressable
      onPress={() => onZoom(index)}
      accessibilityRole="image"
      accessibilityLabel={`Page ${index + 1}. Tap to zoom`}
      style={{ width, height: width * aspect, backgroundColor: "#FFFFFF", marginBottom: GAP }}
    >
      {src ? (
        <Image source={{ uri: src }} style={StyleSheet.absoluteFill} fadeDuration={120} />
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator color={t.primary} />
        </View>
      )}
    </Pressable>
  );
});

/** Dera's built-in PDF reader: remembers the page and logs reading time exactly. */
export default function ReaderScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const list = useRef<FlashListRef<number>>(null);
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [pdf, setPdf] = useState<{ pageCount: number; sizes: Array<[number, number]> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState<{ index: number; uri: string | null } | null>(null);
  const [jumping, setJumping] = useState(false);
  const pagesSeen = useRef(new Set<number>());
  const activeMs = useRef(0);
  const activeSince = useRef<number | null>(Date.now());

  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await getDocument(Number(id));
      if (!alive) return;
      setDoc(d);
      if (!d) return;
      try {
        const info = await scanner().openPdf(d.uri);
        if (!alive) return;
        setPdf(info);
        setPage(Math.min(d.lastPage ?? 0, Math.max(0, info.pageCount - 1)));
        await recordOpen(d.id);
      } catch (e) {
        logError("Reader couldn't open PDF", e);
        setError("This PDF can't be shown here. It may be protected or damaged.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // Count only time the reader is actually on screen.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") activeSince.current = Date.now();
      else if (activeSince.current) {
        activeMs.current += Date.now() - activeSince.current;
        activeSince.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  // On leaving: save the page and log the session.
  useEffect(() => {
    return () => {
      if (activeSince.current) activeMs.current += Date.now() - activeSince.current;
      const d = docRef.current;
      void scanner()
        .closePdf()
        .catch(() => undefined);
      if (!d) return;
      void (async () => {
        await setLastPage(d.id, pageRef.current);
        if (activeMs.current >= MIN_SESSION_MS) {
          await addSession({
            documentId: d.id,
            documentName: docTitle(d),
            startedAt: Date.now() - activeMs.current,
            durationMs: activeMs.current,
            source: "reader",
            pages: pagesSeen.current.size,
          });
        }
        notifyLibraryChanged();
      })();
    };
  }, []);
  const docRef = useRef<DocumentRecord | null>(null);
  docRef.current = doc;
  const pageRef = useRef(0);
  pageRef.current = page;

  const onViewable = useCallback(({ viewableItems }: { viewableItems: Array<ViewToken<number>> }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index != null) setPage(first.index);
    for (const v of viewableItems) if (v.index != null) pagesSeen.current.add(v.index);
  }, []);

  const onZoom = useCallback(
    (index: number) => {
      if (!doc) return;
      setZoom({ index, uri: null });
      void scanner()
        .renderPdfPage(doc.uri, index, 2400)
        .then((uri) => setZoom((z) => (z && z.index === index ? { index, uri } : z)));
    },
    [doc],
  );

  if (doc === null && !error) return <View style={{ flex: 1 }} />;
  const title = doc ? docTitle(doc) : "";
  const pageWidth = width - 2 * spacing.sm;

  return (
    <View style={{ flex: 1, backgroundColor: t.dark ? "#0B0B0B" : "#E7E3DB" }}>
      <Stack.Screen
        options={{
          title,
          headerRight: () =>
            doc ? <IconButton icon="open-in-new" label="Open in another app" onPress={() => void openWithFeedback(doc)} /> : null,
        }}
      />
      {error ? (
        <EmptyState icon="file-alert-outline" title="Can't show this PDF" message={error}>
          {doc ? (
            <Button label="Open in another app" icon="open-in-new" variant="primary" onPress={() => void openWithFeedback(doc)} />
          ) : null}
        </EmptyState>
      ) : !pdf || !doc ? (
        <ActivityIndicator style={{ marginTop: 64 }} color={t.primary} />
      ) : (
        <>
          <FlashList
            ref={list}
            data={Array.from({ length: pdf.pageCount }, (_, i) => i)}
            keyExtractor={(i) => String(i)}
            initialScrollIndex={page}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
            contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: 80 }}
            renderItem={({ item }) => {
              const [w, h] = pdf.sizes[item] ?? [1, 1.41];
              return <Page uri={doc.uri} index={item} width={pageWidth} aspect={h / w} onZoom={onZoom} />;
            }}
          />
          <Pressable
            onPress={() => setJumping(true)}
            accessibilityRole="button"
            accessibilityLabel={`Page ${page + 1} of ${pdf.pageCount}. Tap to go to a page`}
            style={[styles.counter, { backgroundColor: t.text }]}
          >
            <Text style={[type.smallStrong, { color: t.background }]}>
              {page + 1} / {pdf.pageCount}
            </Text>
          </Pressable>
          <ZoomablePage
            uri={zoom?.uri ?? null}
            aspect={zoom ? (pdf.sizes[zoom.index]?.[1] ?? 1.41) / (pdf.sizes[zoom.index]?.[0] ?? 1) : 1.41}
            onClose={() => setZoom(null)}
          />
          <PromptSheet
            visible={jumping}
            title={`Go to page (1–${pdf.pageCount})`}
            initialValue={String(page + 1)}
            confirmLabel="Go"
            onClose={() => setJumping(false)}
            onSubmit={(value) => {
              const n = Math.min(pdf.pageCount, Math.max(1, Number.parseInt(value, 10) || 1)) - 1;
              setJumping(false);
              list.current?.scrollToIndex({ index: n, animated: false });
              setPage(n);
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  counter: {
    position: "absolute",
    alignSelf: "center",
    bottom: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    opacity: 0.88,
  },
});
