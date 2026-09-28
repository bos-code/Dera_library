import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { corner, skew, spacing, useTheme } from "@/theme";

type Corner = keyof typeof corner;

/**
 * Full-screen gradient wash. Sits behind everything; the blur panes above it are what make the
 * gradient read as depth rather than wallpaper. One instance per screen, at the root.
 */
export function GradientCanvas({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: t.background }, style]}>
      <LinearGradient
        colors={[...t.gradient.canvas]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

/**
 * Two large skewed, blurred colour fields drifting behind the canvas. This is what gives the
 * background its "image" quality without shipping any image files: no decode cost, no download,
 * and it recolours itself per theme.
 */
export function AuroraField({ intensity = 1 }: { intensity?: number }) {
  const t = useTheme();
  const [a, b, c] = t.gradient.hero;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[a, b, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.blob,
          {
            top: -160,
            left: -110,
            opacity: (t.dark ? 0.5 : 0.26) * intensity,
            transform: [{ skewY: skew.accent }, { rotate: "-12deg" }],
          },
        ]}
      />
      <LinearGradient
        colors={["transparent", c, b]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.blob,
          {
            bottom: -220,
            right: -140,
            opacity: (t.dark ? 0.42 : 0.2) * intensity,
            transform: [{ skewY: skew.strong }, { rotate: "8deg" }],
          },
        ]}
      />
    </View>
  );
}

/**
 * A frosted pane. Real blur costs real GPU time on mid-range Android, so this is for hero
 * surfaces, sheets and bars only. For anything that repeats in a list, use FlatGlass.
 */
export function Glass({
  children,
  shape = "leaf",
  style,
  contentStyle,
  elevated = true,
}: {
  children?: ReactNode;
  shape?: Corner;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  elevated?: boolean;
}) {
  const t = useTheme();
  const shapeStyle = corner[shape];
  return (
    <View
      style={[
        shapeStyle,
        elevated && {
          shadowColor: t.glass.shadow,
          shadowOpacity: t.dark ? 0.5 : 0.14,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 7,
        },
        style,
      ]}
    >
      <View style={[shapeStyle, styles.clip]}>
        <BlurView intensity={t.glass.intensity} tint={t.glass.mode} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.glass.tint }]} />
        {/* Specular top edge: the single detail that sells it as glass. */}
        <LinearGradient
          colors={[t.glass.highlight, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.sheen}
          pointerEvents="none"
        />
        <View
          style={[StyleSheet.absoluteFill, shapeStyle, { borderWidth: 1, borderColor: t.glass.border }]}
          pointerEvents="none"
        />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    </View>
  );
}

/**
 * Glass-looking surface with no BlurView: a translucent fill plus the same edge treatment.
 * Visually consistent with Glass, but cheap enough to render hundreds of times in a list.
 */
export function FlatGlass({
  children,
  shape = "leaf",
  style,
  contentStyle,
}: {
  children?: ReactNode;
  shape?: Corner;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const shapeStyle = corner[shape];
  return (
    <View
      style={[shapeStyle, styles.clip, { backgroundColor: t.glass.flat, borderWidth: 1, borderColor: t.glass.border }, style]}
    >
      <LinearGradient
        colors={[t.glass.highlight, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.sheen}
        pointerEvents="none"
      />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

/** Skewed gradient slab used behind headers and hero blocks. */
export function HeroSlab({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <LinearGradient
      colors={[...t.gradient.hero]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.slab, { transform: [{ skewY: skew.card }] }, style]}
      pointerEvents="none"
    />
  );
}

/** Fades a scrolling list out beneath a sticky bar instead of cutting it off. */
export function Veil({ height = 72, bottom = false }: { height?: number; bottom?: boolean }) {
  const t = useTheme();
  const colors = bottom ? ([...t.gradient.veil].reverse() as [string, string]) : ([...t.gradient.veil] as [string, string]);
  return (
    <LinearGradient colors={colors} style={[styles.veil, bottom ? { bottom: 0 } : { top: 0 }, { height }]} pointerEvents="none" />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  clip: { overflow: "hidden" },
  content: { padding: spacing.lg },
  sheen: { position: "absolute", top: 0, left: 0, right: 0, height: 1.5, opacity: 0.9 },
  slab: { position: "absolute", left: -40, right: -40, top: -60, height: 260 },
  blob: { position: "absolute", width: 420, height: 420, borderRadius: 210 },
  veil: { position: "absolute", left: 0, right: 0 },
});
