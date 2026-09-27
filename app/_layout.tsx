import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getDb, getMeta } from "@/db/database";
import { refreshAccess } from "@/services/access";
import { scanLibrary } from "@/services/scan";
import { getState, setState, type ThemePreference } from "@/state/store";
import { font, spacing, ThemeProvider, useTheme } from "@/theme";

function ThemedStack() {
  const t = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(t.background);
  }, [t.background]);
  return (
    <>
      <StatusBar style={t.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.background },
          headerTintColor: t.text,
          headerTitleStyle: { fontFamily: font.display, fontWeight: "700" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen name="document/[id]" options={{ title: "" }} />
        <Stack.Screen name="collection/[id]" options={{ title: "Collection" }} />
        <Stack.Screen name="tag/[id]" options={{ title: "Tag" }} />
        <Stack.Screen name="add-documents" options={{ title: "Add documents", presentation: "modal" }} />
        <Stack.Screen name="missing" options={{ title: "Missing documents" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await getDb();
      const [onboarded, theme, lastScan] = await Promise.all([getMeta("onboarded"), getMeta("theme"), getMeta("last_scan_at")]);
      setState({
        onboarded: onboarded === "1",
        themePreference: (theme as ThemePreference | null) ?? "system",
        lastScanAt: lastScan ? Number(lastScan) : null,
      });
      refreshAccess();
      setReady(true);
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

    // Access can change in system settings while the app is in the background.
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      const before = getState().access?.allFilesAccess;
      const after = refreshAccess()?.allFilesAccess;
      // Returning from system settings with new access: find the newly visible documents right away.
      if (!before && after && getState().onboarded) void scanLibrary();
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>{error ? <StartupError message={error} /> : ready ? <ThemedStack /> : <Splash />}</ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Splash() {
  const t = useTheme();
  return <View style={{ flex: 1, backgroundColor: t.background }} />;
}

function StartupError({ message }: { message: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.background, justifyContent: "center", padding: spacing.xl, gap: spacing.md }}>
      <Text style={{ color: t.text, fontSize: font.heading, fontFamily: font.display, fontWeight: "700" }}>
        Dera Library couldn't start
      </Text>
      <Text selectable style={{ color: t.textMuted, fontSize: font.body }}>
        {message}
      </Text>
    </View>
  );
}
