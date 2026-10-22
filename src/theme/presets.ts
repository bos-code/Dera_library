import type { DocumentType } from "../types/document";
import { ensureContrast, mix, readableOn, withAlpha } from "./color.ts";
import type { Glass, Gradients, Palette } from "./index";

/** The hand-picked colours a theme is built from. Everything else is derived. */
interface Seed {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  danger: string;
  warning: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  mode: "light" | "dark";
  seed: Seed;
  /** Opaque surfaces only: no blur or aurora (high contrast, true black). */
  forceSolid?: boolean;
  /** Exact glass/gradient values for presets tuned by hand. Ignored when the user picks another accent. */
  tuned?: { glass?: Glass; gradient?: Gradients };
  /** Overrides document-type colours (e.g. for high contrast). */
  typeColors?: Record<DocumentType, string>;
}

export interface Accent {
  id: string;
  name: string;
  light: string;
  dark: string;
}

const TYPE_LIGHT: Record<DocumentType, string> = {
  pdf: "#B8322A",
  word: "#2551C4",
  sheet: "#186E3B",
  slides: "#B85408",
  epub: "#6D3390",
  text: "#4C525A",
  other: "#6B4E3E",
};

const TYPE_DARK: Record<DocumentType, string> = {
  pdf: "#F4938A",
  word: "#93B9FA",
  sheet: "#87CE9A",
  slides: "#FDB577",
  epub: "#DBB5FC",
  text: "#C3C7CC",
  other: "#DCBFAC",
};

export const PRESETS: ThemePreset[] = [
  {
    id: "paper",
    name: "Paper",
    description: "Warm, low-glare reading room",
    mode: "light",
    seed: {
      background: "#F2EEE6",
      surface: "#FFFFFF",
      surfaceAlt: "#E9E4D9",
      border: "#DCD5C7",
      text: "#17160F",
      textMuted: "#56514A",
      textFaint: "#6E6759",
      primary: "#2C5A4C",
      danger: "#A8231C",
      warning: "#7A4E00",
    },
    tuned: {
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
    },
  },
  {
    id: "sepia",
    name: "Sepia",
    description: "Old-book cream and terracotta",
    mode: "light",
    seed: {
      background: "#F4ECD8",
      surface: "#FBF6EA",
      surfaceAlt: "#EADFC6",
      border: "#DCCFB0",
      text: "#2B2116",
      textMuted: "#5B4A37",
      textFaint: "#6E5B45",
      primary: "#8A4B2A",
      danger: "#A0281E",
      warning: "#7A4A00",
    },
  },
  {
    id: "porcelain",
    name: "Porcelain",
    description: "Cool, crisp and bright",
    mode: "light",
    seed: {
      background: "#F3F5F8",
      surface: "#FFFFFF",
      surfaceAlt: "#E6EAF0",
      border: "#D5DBE4",
      text: "#11161D",
      textMuted: "#47505E",
      textFaint: "#5B6474",
      primary: "#2F55C8",
      danger: "#B42318",
      warning: "#7A4D00",
    },
  },
  {
    id: "blossom",
    name: "Blossom",
    description: "Soft rose and plum",
    mode: "light",
    seed: {
      background: "#F8F1F1",
      surface: "#FFFFFF",
      surfaceAlt: "#EFE3E3",
      border: "#E2D2D2",
      text: "#1F1416",
      textMuted: "#594649",
      textFaint: "#6D5A5E",
      primary: "#9C3D5A",
      danger: "#A8231C",
      warning: "#7A4E00",
    },
  },
  {
    id: "contrast-light",
    name: "High contrast",
    description: "Maximum legibility, no transparency",
    mode: "light",
    forceSolid: true,
    seed: {
      background: "#FFFFFF",
      surface: "#FFFFFF",
      surfaceAlt: "#EDEDED",
      border: "#767676",
      text: "#000000",
      textMuted: "#1F1F1F",
      textFaint: "#333333",
      primary: "#00513F",
      danger: "#8E0000",
      warning: "#5C3A00",
    },
    typeColors: {
      pdf: "#8E1B14",
      word: "#123C9C",
      sheet: "#0B4F25",
      slides: "#7F3A00",
      epub: "#4E1F6B",
      text: "#2B2F33",
      other: "#4A3428",
    },
  },
  {
    id: "ink",
    name: "Ink",
    description: "Deep green-black",
    mode: "dark",
    seed: {
      background: "#0D0F0D",
      surface: "#191B18",
      surfaceAlt: "#232621",
      border: "#32362F",
      text: "#F2EFE6",
      textMuted: "#ADA99E",
      textFaint: "#8F8B80",
      primary: "#8FD0B6",
      danger: "#F0AFA9",
      warning: "#E6BE77",
    },
    tuned: {
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
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Navy night sky",
    mode: "dark",
    seed: {
      background: "#0B1020",
      surface: "#141B2E",
      surfaceAlt: "#1C2540",
      border: "#2A3556",
      text: "#EAF0FF",
      textMuted: "#A7B3D1",
      textFaint: "#8E9AB9",
      primary: "#8DB4FF",
      danger: "#FFB4AB",
      warning: "#F2C46D",
    },
  },
  {
    id: "espresso",
    name: "Espresso",
    description: "Warm coffee-house dark",
    mode: "dark",
    seed: {
      background: "#16110D",
      surface: "#211A14",
      surfaceAlt: "#2B221A",
      border: "#3B3026",
      text: "#F3E9DC",
      textMuted: "#C2B29E",
      textFaint: "#A39380",
      primary: "#E8A87C",
      danger: "#F4A9A0",
      warning: "#EBC27A",
    },
  },
  {
    id: "amoled",
    name: "True black",
    description: "Pure black, saves battery on OLED",
    mode: "dark",
    forceSolid: true,
    seed: {
      background: "#000000",
      surface: "#0B0B0B",
      surfaceAlt: "#161616",
      border: "#262626",
      text: "#F5F5F5",
      textMuted: "#B5B5B5",
      textFaint: "#949494",
      primary: "#7EE0C3",
      danger: "#FFB4AB",
      warning: "#F2C46D",
    },
  },
  {
    id: "contrast-dark",
    name: "High contrast dark",
    description: "Maximum legibility on black",
    mode: "dark",
    forceSolid: true,
    seed: {
      background: "#000000",
      surface: "#000000",
      surfaceAlt: "#1A1A1A",
      border: "#9A9A9A",
      text: "#FFFFFF",
      textMuted: "#E6E6E6",
      textFaint: "#D0D0D0",
      primary: "#9FF0D4",
      danger: "#FFC2BA",
      warning: "#FFD98A",
    },
    typeColors: {
      pdf: "#FFB3AB",
      word: "#B5CEFF",
      sheet: "#A8EDBA",
      slides: "#FFC999",
      epub: "#E8CCFF",
      text: "#E3E6EA",
      other: "#F0D6C5",
    },
  },
];

export const ACCENTS: Accent[] = [
  { id: "emerald", name: "Emerald", light: "#2C5A4C", dark: "#8FD0B6" },
  { id: "teal", name: "Teal", light: "#0F6E77", dark: "#7FD6DA" },
  { id: "blue", name: "Blue", light: "#2551C4", dark: "#93B9FA" },
  { id: "indigo", name: "Indigo", light: "#4338CA", dark: "#A5B4FC" },
  { id: "violet", name: "Violet", light: "#6D3390", dark: "#D7AEFB" },
  { id: "rose", name: "Rose", light: "#B42350", dark: "#F7A8C0" },
  { id: "amber", name: "Amber", light: "#9A5B00", dark: "#F5C26B" },
  { id: "graphite", name: "Graphite", light: "#3F4652", dark: "#C9CED6" },
];

export const DEFAULT_LIGHT = "paper";
export const DEFAULT_DARK = "ink";

export function findPreset(id: string, mode: "light" | "dark"): ThemePreset {
  return (
    PRESETS.find((p) => p.id === id && p.mode === mode) ??
    PRESETS.find((p) => p.id === (mode === "light" ? DEFAULT_LIGHT : DEFAULT_DARK))!
  );
}

export interface BuildOptions {
  accent?: string | null;
  solid?: boolean;
  density?: "comfortable" | "compact";
}

/** Expands a preset (+ optional accent and preferences) into the full palette every component reads. */
export function buildPalette(preset: ThemePreset, options: BuildOptions = {}): Palette {
  const dark = preset.mode === "dark";
  const s = preset.seed;
  const accent = options.accent ? ACCENTS.find((a) => a.id === options.accent) : undefined;
  const primary = accent ? ensureContrast(dark ? accent.dark : accent.light, s.background, 4.5) : s.primary;
  const solid = !!options.solid || !!preset.forceSolid;
  const useTuned = !accent && !solid;

  const derivedGlass: Glass = {
    tint: withAlpha(dark ? mix(s.surface, s.surfaceAlt, 0.4) : s.surface, 0.62),
    border: dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.78)",
    highlight: dark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.95)",
    shadow: dark ? "#000000" : mix(s.text, s.background, 0.15),
    intensity: dark ? 34 : 26,
    mode: dark ? "dark" : "light",
    flat: withAlpha(dark ? s.surfaceAlt : s.surface, 0.72),
  };
  const solidGlass: Glass = {
    ...derivedGlass,
    tint: s.surface,
    flat: s.surface,
    border: s.border,
    highlight: "rgba(0,0,0,0)",
    intensity: 0,
  };
  const white = "#FFFFFF";
  const black = "#000000";
  const derivedGradient: Gradients = {
    canvas: dark
      ? [s.background, mix(s.background, primary, 0.06), s.background]
      : [mix(s.background, white, 0.4), s.background, mix(s.background, primary, 0.07)],
    hero: dark
      ? [mix(primary, black, 0.78), mix(primary, black, 0.62), mix(primary, black, 0.45)]
      : [primary, mix(primary, white, 0.18), mix(primary, white, 0.45)],
    veil: [withAlpha(s.background, 0), withAlpha(s.background, 0.94)],
  };

  const surfaceAlt = s.surfaceAlt;
  return {
    id: preset.id,
    dark,
    background: s.background,
    surface: s.surface,
    surfaceAlt,
    border: s.border,
    text: s.text,
    textMuted: s.textMuted,
    textFaint: s.textFaint,
    primary,
    onPrimary: readableOn(primary),
    primarySoft: mix(s.background, primary, dark ? 0.22 : 0.14),
    danger: s.danger,
    warning: s.warning,
    warningSoft: mix(s.background, s.warning, dark ? 0.2 : 0.16),
    overlay: dark ? "rgba(0,0,0,0.65)" : withAlpha(mix(s.text, black, 0.3), 0.5),
    type: preset.typeColors ?? (dark ? TYPE_DARK : TYPE_LIGHT),
    glass: solid ? solidGlass : useTuned && preset.tuned?.glass ? preset.tuned.glass : derivedGlass,
    gradient: useTuned && preset.tuned?.gradient ? preset.tuned.gradient : derivedGradient,
    // GitHub-style intensity ramp from "no reading" to "goal smashed".
    heat: [surfaceAlt, mix(surfaceAlt, primary, 0.3), mix(surfaceAlt, primary, 0.55), mix(surfaceAlt, primary, 0.8), primary],
    solid,
    density: options.density ?? "comfortable",
    fonts: FONTS,
  };
}

// Mirrors `font` in ./index without importing values from it (avoids a runtime import cycle).
const FONTS = {
  display: "Fraunces_700Bold",
  displaySoft: "Fraunces_600SemiBold",
  sans: "Manrope_400Regular",
  sansMedium: "Manrope_500Medium",
  sansSemi: "Manrope_600SemiBold",
  sansBold: "Manrope_700Bold",
};
