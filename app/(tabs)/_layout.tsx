import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ColorValue } from "react-native";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useAppState } from "@/state/store";
import { useTheme } from "@/theme";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const icon =
  (focused: IconName, idle: IconName) =>
  ({ color, focused: isFocused }: { color: ColorValue; focused: boolean }) => (
    <MaterialCommunityIcons name={isFocused ? focused : idle} size={24} color={color as string} />
  );

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
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        sceneStyle: { backgroundColor: t.background },
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
