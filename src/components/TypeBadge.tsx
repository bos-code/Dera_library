import { StyleSheet, Text, View } from "react-native";
import { TYPE_LABEL } from "@/lib/fileTypes";
import { useTheme } from "@/theme";
import type { DocumentType } from "@/types/document";
import { Icon, type IconName } from "./ui";

const ICONS: Record<DocumentType, IconName> = {
  pdf: "file-pdf-box",
  word: "file-word-box",
  sheet: "file-table-box",
  slides: "file-presentation-box",
  epub: "book-open-page-variant",
  text: "file-document-outline",
  other: "file-outline",
};

export function TypeBadge({ type, extension, size = 48 }: { type: DocumentType; extension: string; size?: number }) {
  const t = useTheme();
  const color = t.type[type];
  return (
    <View
      accessible
      accessibilityLabel={`${TYPE_LABEL[type]}, ${extension.toUpperCase()}`}
      style={[styles.badge, { width: size, height: size, backgroundColor: color + (t.dark ? "26" : "1A") }]}
    >
      <Icon name={ICONS[type]} size={size * 0.5} color={color} />
      <Text numberOfLines={1} style={[styles.ext, { color, fontSize: Math.max(9, size * 0.2) }]}>
        {extension.toUpperCase().slice(0, 4)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 10, alignItems: "center", justifyContent: "center" },
  ext: { fontWeight: "800", letterSpacing: 0.5, marginTop: -1 },
});
