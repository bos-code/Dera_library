import { getMeta, setMeta } from "@/db/database";
import { DEFAULT_APPEARANCE, getState, setState, type Appearance, type ThemePreference } from "@/state/store";

/** Reads saved appearance, migrating the older single "theme" setting. */
export async function loadAppearance(): Promise<Appearance> {
  const raw = await getMeta("appearance");
  if (raw) {
    try {
      return { ...DEFAULT_APPEARANCE, ...(JSON.parse(raw) as Partial<Appearance>) };
    } catch {
      // Fall through to defaults.
    }
  }
  const legacy = (await getMeta("theme")) as ThemePreference | null;
  return legacy ? { ...DEFAULT_APPEARANCE, mode: legacy } : DEFAULT_APPEARANCE;
}

export function updateAppearance(patch: Partial<Appearance>): void {
  const appearance = { ...getState().appearance, ...patch };
  setState({ appearance });
  void setMeta("appearance", JSON.stringify(appearance));
}
