import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { useAppState } from "@/state/store";
import type { DocumentType } from "@/types/document";

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
  /** Type is themeable, so a future theme can ship its own pairing. */
  fonts: { display: string; displaySoft: string; sans: string; sansMedium: string; sansSemi: string; sansBold: string };
}

const fonts = {
  display: font.display,
  displaySoft: font.displaySoft,
  sans: font.sans,
  sansMedium: font.sansMedium,
  sansSemi: font.sansSemi,
  sansBold: font.sansBold,
};

/** Paper: warm, low-glare, reading-room light. Body colours clear 4.5:1 on background. */
const light: Palette = {
  dark: false,
  background: "#F2EEE6",
  surface: "#FFFFFF",
  surfaceAlt: "#E9E4D9",
  border: "#DCD5C7",
  text: "#17160F",
  textMuted: "#56514A",
  textFaint: "#6E6759",
  primary: "#2C5A4C",
  onPrimary: "#FFFFFF",
  primarySoft: "#D6E6DE",
  danger: "#A8231C",
  warning: "#7A4E00",
  warningSoft: "#F4E4C2",
  overlay: "rgba(18,16,12,0.50)",
  type: {
    pdf: "#B8322A",
    word: "#2551C4",
    sheet: "#186E3B",
    slides: "#B85408",
    epub: "#6D3390",
    text: "#4C525A",
    other: "#6B4E3E",
  },
  glass: {
    tint: "rgba(255,255,255,0.62)",
    border: "rgba(255,255,255,0.78)",
    highlight: "rgba(255,255,255,0.95)",
    shadow: "#2A2417",
    intensity: 26,
    mode: "light",
    flat: "rgba(255,255,255,0.72)",
  },
  gradient: {
    canvas: ["#F7F4ED", "#EFEBE1", "#E6EDE7"],
    hero: ["#2C5A4C", "#3E7A63", "#74AE90"],
    veil: ["rgba(242,238,230,0)", "rgba(242,238,230,0.94)"],
  },
  fonts,
};

/** Ink: deep, slightly green-black so the brand still reads in the shadows. */
const dark: Palette = {
  dark: true,
  background: "#0D0F0D",
  surface: "#191B18",
  surfaceAlt: "#232621",
  border: "#32362F",
  text: "#F2EFE6",
  textMuted: "#ADA99E",
  textFaint: "#837F74",
  primary: "#8FD0B6",
  onPrimary: "#08211A",
  primarySoft: "#1B332B",
  danger: "#F0AFA9",
  warning: "#E6BE77",
  warningSoft: "#372C17",
  overlay: "rgba(0,0,0,0.65)",
  type: {
    pdf: "#F4938A",
    word: "#93B9FA",
    sheet: "#87CE9A",
    slides: "#FDB577",
    epub: "#DBB5FC",
    text: "#C3C7CC",
    other: "#DCBFAC",
  },
  glass: {
    tint: "rgba(28,32,29,0.62)",
    border: "rgba(255,255,255,0.12)",
    highlight: "rgba(255,255,255,0.18)",
    shadow: "#000000",
    intensity: 34,
    mode: "dark",
    flat: "rgba(38,42,38,0.72)",
  },
  gradient: {
    canvas: ["#0D0F0D", "#131916", "#0F1412"],
    hero: ["#123028", "#1E4F40", "#2F7059"],
    veil: ["rgba(13,15,13,0)", "rgba(13,15,13,0.94)"],
  },
  fonts,
};

// ------------------------------------------------------------------ provider

const ThemeContext = createContext<Palette>(light);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const pref = useAppState((s) => s.themePreference);
  const palette = useMemo(() => {
    const isDark = pref === "system" ? system === "dark" : pref === "dark";
    return isDark ? dark : light;
  }, [pref, system]);
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
