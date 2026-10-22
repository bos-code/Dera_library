import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { useAppState } from "@/state/store";
import type { DocumentType } from "@/types/document";
import { buildPalette, DEFAULT_LIGHT, findPreset } from "./presets";

/**
 * Token architecture: primitives (below) -> semantic palette (light/dark) -> component styles.
 * Themes vary colour and type only; spacing, radii and skew are shared so layout never shifts
 * between themes.
 */

// ---------------------------------------------------------------- primitives

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, xxl: 36, pill: 999 };

/**
 * Asymmetric corner presets. A single radius reads as a default; unequal corners give each
 * surface a direction and keep stacked cards from looking like one repeated rectangle.
 */
export const corner = {
  /** Sweeps top-left to bottom-right. The workhorse for content cards. */
  leaf: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.sm,
    borderBottomRightRadius: radius.xl,
    borderBottomLeftRadius: radius.sm,
  },
  /** Mirror of leaf, for alternating rhythm down a list. */
  petal: {
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.xl,
    borderBottomRightRadius: radius.sm,
    borderBottomLeftRadius: radius.xl,
  },
  /** Big soft top, clipped bottom-right. Hero and feature surfaces. */
  hero: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderBottomRightRadius: radius.md,
    borderBottomLeftRadius: radius.xxl,
  },
  /** Rounded top, near-square base: sits on a surface like a book on a shelf. */
  shelf: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.xs,
    borderBottomLeftRadius: radius.xs,
  },
  /** Gentle, near-symmetric. Sheets and modals. */
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
  },
  /** Lozenge with one squared corner, for chips and badges. */
  nib: {
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
    borderBottomLeftRadius: radius.xs,
  },
} as const;

/** Skew is decorative only: applied to backdrop shapes and accents, never to text containers. */
export const skew = { subtle: "-1.5deg", card: "-3deg", accent: "-8deg", strong: "-12deg" } as const;

export const font = {
  /** Display face. Kept under this key because screens already reference it as a fontFamily. */
  display: "Fraunces_700Bold",
  displaySoft: "Fraunces_600SemiBold",
  sans: "Manrope_400Regular",
  sansMedium: "Manrope_500Medium",
  sansSemi: "Manrope_600SemiBold",
  sansBold: "Manrope_700Bold",
  // Sizes.
  title: 28,
  heading: 20,
  body: 16,
  small: 14,
  tiny: 12,
};

/** Ready-made type styles. Pair a family with its size so weight never relies on synthetic bold. */
export const type = {
  hero: { fontFamily: font.display, fontSize: 38, lineHeight: 42, letterSpacing: -0.8 },
  title: { fontFamily: font.display, fontSize: font.title, lineHeight: 34, letterSpacing: -0.5 },
  heading: { fontFamily: font.displaySoft, fontSize: font.heading, lineHeight: 26, letterSpacing: -0.2 },
  bodyStrong: { fontFamily: font.sansSemi, fontSize: font.body, lineHeight: 24 },
  body: { fontFamily: font.sans, fontSize: font.body, lineHeight: 24 },
  small: { fontFamily: font.sans, fontSize: font.small, lineHeight: 20 },
  smallStrong: { fontFamily: font.sansSemi, fontSize: font.small, lineHeight: 20 },
  label: { fontFamily: font.sansBold, fontSize: font.tiny, lineHeight: 16, letterSpacing: 1.2 },
  tiny: { fontFamily: font.sansMedium, fontSize: font.tiny, lineHeight: 16 },
} as const;

// ------------------------------------------------------------------ palettes

export interface Glass {
  /** Fill painted over the blur. Carries most of the legibility. */
  tint: string;
  border: string;
  /** Top specular edge that makes the pane read as glass rather than a flat scrim. */
  highlight: string;
  shadow: string;
  /** expo-blur intensity. Higher costs more on mid-range Android. */
  intensity: number;
  mode: "light" | "dark";
  /** Fill for surfaces that must not pay for a real blur (list rows, dense grids). */
  flat: string;
}

export interface Gradients {
  /** Full-screen backdrop wash. */
  canvas: readonly [string, string, string];
  /** Saturated brand gradient for hero shapes. */
  hero: readonly [string, string, string];
  /** Fades content into the canvas behind sticky bars. */
  veil: readonly [string, string];
}

export interface Palette {
  /** Preset id, e.g. "paper". */
  id: string;
  dark: boolean;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  danger: string;
  warning: string;
  warningSoft: string;
  overlay: string;
  type: Record<DocumentType, string>;
  glass: Glass;
  gradient: Gradients;
  /** Five-step ramp for the reading heatmap, empty to strongest. */
  heat: readonly [string, string, string, string, string];
  /** Opaque surfaces only: components skip blur, aurora and translucency. */
  solid: boolean;
  density: "comfortable" | "compact";
  /** Type is themeable, so a future theme can ship its own pairing. */
  fonts: { display: string; displaySoft: string; sans: string; sansMedium: string; sansSemi: string; sansBold: string };
}

// ------------------------------------------------------------------ provider

const ThemeContext = createContext<Palette>(buildPalette(findPreset(DEFAULT_LIGHT, "light")));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const a = useAppState((s) => s.appearance);
  const palette = useMemo(() => {
    const mode = a.mode === "system" ? (system === "dark" ? "dark" : "light") : a.mode;
    const preset = findPreset(mode === "dark" ? a.dark : a.light, mode);
    return buildPalette(preset, { accent: a.accent, solid: a.surfaces === "solid", density: a.density });
  }, [a, system]);
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
