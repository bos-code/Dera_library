import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BlurView } from "expo-blur";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { StyleSheet, View, type ColorValue } from "react-native";
import { useAppState } from "@/state/store";
import { font, useTheme } from "@/theme";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const icon =
  (focused: IconName, idle: IconName) =>
  ({ color, focused: isFocused }: { color: ColorValue; focused: boolean }) => (
    <MaterialCommunityIcons name={isFocused ? focused : idle} size={24} color={color as string} />
  );

/**
 * The one place a full-width blur is worth its cost: it is composited once per frame and the
 * library scrolling underneath it is what makes the glass read.
 */
function GlassTabBar() {
  const t = useTheme();
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={t.glass.intensity} tint={t.glass.mode} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.glass.tint }]} />
      <View style={[styles.hairline, { backgroundColor: t.glass.border }]} />
    </View>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const onboarded = useAppState((s) => s.onboarded);
  if (onboarded === false) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textMuted,
        tabBarBackground: () => <GlassTabBar />,
        // Transparent so the blur above is what paints the bar.
        tabBarStyle: { backgroundColor: "transparent", borderTopWidth: 0, elevation: 0, position: "absolute" },
        tabBarLabelStyle: { fontFamily: font.sansSemi, fontSize: 12 },
        sceneStyle: { backgroundColor: "transparent" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Library", tabBarIcon: icon("bookshelf", "bookshelf") }} />
      <Tabs.Screen
        name="collections"
        options={{ title: "Collections", tabBarIcon: icon("folder-multiple", "folder-multiple-outline") }}
      />
      <Tabs.Screen name="tags" options={{ title: "Tags", tabBarIcon: icon("tag-multiple", "tag-multiple-outline") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: icon("cog", "cog-outline") }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  hairline: { position: "absolute", top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
});
