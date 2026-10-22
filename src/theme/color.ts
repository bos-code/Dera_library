/** Small colour toolkit for deriving themes. Hex in, hex/rgba out; no dependencies. */

type RGB = [number, number, number];

export function parseHex(hex: string): RGB {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

/** Linear blend from a to b; amount 0 = a, 1 = b. */
export function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * amount) as RGB);
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${Math.round(alpha * 1000) / 1000})`;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white text, whichever reads better on bg. */
export function readableOn(bg: string, light = "#FFFFFF", dark = "#0B0C0B"): string {
  return contrast(light, bg) >= contrast(dark, bg) ? light : dark;
}

/**
 * Nudges fg towards black or white until it reaches the target contrast on bg.
 * Lets users pick any accent without producing unreadable links or icons.
 */
export function ensureContrast(fg: string, bg: string, target = 4.5): string {
  if (contrast(fg, bg) >= target) return fg;
  const toward = luminance(bg) > 0.4 ? "#000000" : "#FFFFFF";
  for (let step = 0.05; step <= 1; step += 0.05) {
    const candidate = mix(fg, toward, step);
    if (contrast(candidate, bg) >= target) return candidate;
  }
  return toward;
}
