import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { useAppState } from "@/state/store";
import type { DocumentType } from "@/types/document";

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
}

const light: Palette = {
  dark: false,
  background: "#F7F5F0",
  surface: "#FFFFFF",
  surfaceAlt: "#EFECE4",
  border: "#E2DDD2",
  text: "#1C1B18",
  textMuted: "#5F5B52",
  textFaint: "#8C877C",
  primary: "#2F5D50",
  onPrimary: "#FFFFFF",
  primarySoft: "#DCE9E3",
  danger: "#B3261E",
  warning: "#8A5A00",
  warningSoft: "#F6E7C8",
  overlay: "rgba(20,18,14,0.45)",
  type: {
    pdf: "#C9372C",
    word: "#2B5FD9",
    sheet: "#1E8045",
    slides: "#D0620A",
    epub: "#7E3FA0",
    text: "#5B6168",
    other: "#7A5A48",
  },
};

const dark: Palette = {
  dark: true,
  background: "#121210",
  surface: "#1C1B18",
  surfaceAlt: "#272622",
  border: "#34322D",
  text: "#F1EEE7",
  textMuted: "#B3AEA3",
  textFaint: "#857F74",
  primary: "#8CC5B2",
  onPrimary: "#0E201A",
  primarySoft: "#1F3530",
  danger: "#F2B8B5",
  warning: "#E9C07A",
  warningSoft: "#3A2F1A",
  overlay: "rgba(0,0,0,0.6)",
  type: {
    pdf: "#F28B82",
    word: "#8AB4F8",
    sheet: "#81C995",
    slides: "#FCAD70",
    epub: "#D7AEFB",
    text: "#BDC1C6",
    other: "#D7B8A5",
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const font = {
  /** A serif display face gives headings a reading-room feel without shipping font files. */
  display: "serif",
  title: 28,
  heading: 20,
  body: 16,
  small: 14,
  tiny: 12,
};

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
