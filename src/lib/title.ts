/**
 * Turns a filename into a readable title: "Physics_Notes_v2 (1).pdf" → "Physics Notes v2".
 * The real filename is still shown in document details and is what search matches.
 */
export function displayTitle(fileName: string): string {
  let s = fileName.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  // Copy markers added by file managers and browsers.
  s = s.replace(/\s*\(\d{1,3}\)$/, "").replace(/\s+-\s+Copy(\s*\(\d{1,3}\))?$/i, "");
  s = s.replace(/_+/g, " ");
  if (!/\s/.test(s)) {
    // Single-token names: treat dots and word-joining hyphens as spaces ("react-native.guide" → "react native guide"),
    // but keep dates and versions ("2024-05-10", "v2.1") intact.
    const dots = (s.match(/\./g) ?? []).length;
    if (dots >= 2) s = s.replace(/([A-Za-z])\.(?=[A-Za-z])/g, "$1 ");
    s = s.replace(/([A-Za-z])-(?=[A-Za-z])/g, "$1 ");
  }
  s = s.replace(/\s+/g, " ").trim();
  return s || fileName;
}
