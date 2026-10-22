/**
 * Offline filing suggestions for a new document. Two signals, both explainable:
 * - habit: where the user filed other documents from the same folder
 * - name: a collection or tag name appearing as a word in the file name or folder
 */

export interface Candidate {
  id: string;
  name: string;
}

export interface Suggestion extends Candidate {
  score: number;
  reason: "folder" | "name";
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );

/**
 * @param folderCounts how many documents from this document's folder are already in each candidate
 */
export function suggest(
  doc: { name: string; folder: string | null },
  candidates: Candidate[],
  folderCounts: Map<string, number>,
  limit = 3,
): Suggestion[] {
  const docWords = words(`${doc.name} ${doc.folder ?? ""}`);
  const out: Suggestion[] = [];
  for (const c of candidates) {
    const habit = folderCounts.get(c.id) ?? 0;
    const nameWords = [...words(c.name)];
    const nameHit = nameWords.length > 0 && nameWords.every((w) => docWords.has(w));
    if (!habit && !nameHit) continue;
    // Habit grows with evidence but saturates; an exact name match is a strong, single signal.
    const score = Math.min(habit, 5) * 2 + (nameHit ? 6 : 0);
    out.push({ ...c, score, reason: habit >= (nameHit ? 3 : 1) ? "folder" : "name" });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
