import { Text } from "react-native";
import { type, useTheme } from "@/theme";

/** Renders a search excerpt, emphasising the matched words (wrapped in \u0001 … \u0002 by the query). */
export function Snippet({ text, lines = 2 }: { text: string; lines?: number }) {
  const t = useTheme();
  const parts = text.split(/(\u0001[^\u0002]*\u0002)/g).filter(Boolean);
  return (
    <Text numberOfLines={lines} style={[type.tiny, { color: t.textMuted, fontStyle: "italic" }]}>
      {parts.map((p, i) =>
        p.startsWith("\u0001") ? (
          <Text key={i} style={{ color: t.text, fontStyle: "normal", fontFamily: type.smallStrong.fontFamily }}>
            {p.slice(1, -1)}
          </Text>
        ) : (
          p.replace(/\s+/g, " ")
        ),
      )}
    </Text>
  );
}
