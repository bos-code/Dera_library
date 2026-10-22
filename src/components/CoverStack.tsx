import { View } from "react-native";
import { useTheme } from "@/theme";
import type { DocumentRecord } from "@/types/document";
import { DocumentCover } from "./DocumentCover";
import { Icon, type IconName } from "./ui";

const WIDTH = 30;
const STEP = 10;

/** Up to three covers fanned like books leaning on a shelf; an icon when the collection is empty. */
export function CoverStack({
  documents,
  fallbackIcon,
  fallbackColor,
}: {
  documents: DocumentRecord[];
  fallbackIcon: IconName;
  fallbackColor?: string;
}) {
  const t = useTheme();
  const docs = documents.slice(0, 3);
  if (!docs.length) {
    return (
      <View style={{ width: WIDTH + 2 * STEP, alignItems: "center" }}>
        <Icon name={fallbackIcon} color={fallbackColor ?? t.textMuted} />
      </View>
    );
  }
  return (
    <View style={{ width: WIDTH + 2 * STEP, height: Math.round(WIDTH * 1.36) }} importantForAccessibility="no-hide-descendants">
      {docs
        .map((doc, i) => (
          <View
            key={doc.id}
            style={{
              position: "absolute",
              left: i * STEP,
              transform: [{ rotate: `${(i - 1) * 4}deg` }],
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 2,
              elevation: 2,
            }}
          >
            <DocumentCover doc={doc} width={WIDTH} showExtension={false} />
          </View>
        ))
        .reverse()}
    </View>
  );
}
