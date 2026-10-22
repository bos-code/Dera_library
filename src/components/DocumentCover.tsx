import { memo } from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useCover } from "@/lib/covers";
import { corner, type, useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";
import { TYPE_ICONS } from "./TypeBadge";
import { Icon } from "./ui";

/**
 * A document's cover: the rendered first page / book cover when available, otherwise a tinted
 * placeholder in the document type's colour. Portrait, like a book on a shelf.
 */
function DocumentCoverImpl({
  doc,
  width,
  style,
  showExtension = true,
}: {
  doc: DocumentRecord;
  width: number;
  style?: StyleProp<ViewStyle>;
  showExtension?: boolean;
}) {
  const t = useTheme();
  const uri = useCover(doc);
  const color = t.type[doc.type];
  const height = Math.round(width * 1.36);
  const small = width < 64;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.frame,
        corner.shelf,
        { width, height, backgroundColor: color + (t.dark ? "26" : "1A"), borderColor: t.border },
        doc.status !== "available" && { opacity: 0.45 },
        style,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={150} />
      ) : (
        <View style={styles.placeholder}>
          <Icon name={TYPE_ICONS[doc.type]} size={Math.round(width * (small ? 0.5 : 0.36))} color={color} />
        </View>
      )}
      {showExtension && !small ? (
        <View style={[styles.ext, { backgroundColor: color }]}>
          <Text style={[styles.extText, { color: t.dark ? t.background : "#FFFFFF" }]}>
            {doc.extension.toUpperCase().slice(0, 4)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export const DocumentCover = memo(DocumentCoverImpl);

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  ext: { position: "absolute", left: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 2, borderTopRightRadius: 6 },
  extText: { ...type.label, fontSize: 9, lineHeight: 12, letterSpacing: 0.6 },
});
