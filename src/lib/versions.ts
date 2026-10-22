/** Words that mark a version rather than a different document. */
const VERSION_WORDS = /\b(final|latest|new|old|edited|revised|updated|copy|corrected)\b/g;
/** A version word followed by a number: "v2", "rev 3", "draft 2", "version 1.4". */
const NUMBERED = /\b(v|ver|version|rev|revision|draft)\s*\.?\s*\d+(\.\d+)*\b|\bdraft\b/g;

const normalize = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Key shared by versions of the same document: "Report v2", "Report final (1)" and "report-v3" all map to
 * "report". Returns null for names that don't look versioned ("Chapter 1" is a chapter, not a version), so
 * ordinary documents are never grouped.
 */
export function versionKey(fileName: string, extension: string): string | null {
  const base = fileName
    .replace(/\.[A-Za-z0-9]{1,8}$/, "")
    .replace(/_+/g, " ")
    .toLowerCase();
  const stripped = normalize(
    base
      .replace(NUMBERED, " ")
      .replace(VERSION_WORDS, " ")
      .replace(/\(\s*\d{1,3}\s*\)/g, " "),
  );
  if (!stripped || stripped === normalize(base)) return null;
  return `${stripped}|${family(extension)}`;
}

/** Word and PDF exports of the same report count as versions of one document. */
function family(ext: string): string {
  const e = ext.toLowerCase();
  if (["doc", "docx", "odt", "rtf", "pdf"].includes(e)) return "doc";
  if (["xls", "xlsx", "ods", "csv"].includes(e)) return "sheet";
  if (["ppt", "pptx", "odp"].includes(e)) return "slides";
  return e;
}

export interface Stackable {
  id: number;
  name: string;
  extension: string;
  modifiedAt: number;
}

export interface StackInfo {
  key: string;
  count: number;
  expanded: boolean;
  /** True for the newest version, which stands for the whole stack when collapsed. */
  head: boolean;
}

/**
 * Collapses versions into their newest member (keeping the list's order), or lists them all when the stack is
 * expanded. Documents with a unique or non-versioned name pass through untouched.
 */
export function stackVersions<T extends Stackable>(docs: T[], expanded: Set<string>): Array<T & { stack?: StackInfo }> {
  const groups = new Map<string, T[]>();
  const keyOf = new Map<number, string>();
  for (const d of docs) {
    const k = versionKey(d.name, d.extension);
    if (!k) continue;
    keyOf.set(d.id, k);
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const heads = new Map<string, number>();
  for (const [k, members] of groups) {
    if (members.length < 2) continue;
    heads.set(k, members.reduce((a, b) => (b.modifiedAt > a.modifiedAt ? b : a)).id);
  }
  const out: Array<T & { stack?: StackInfo }> = [];
  for (const d of docs) {
    const k = keyOf.get(d.id);
    const head = k ? heads.get(k) : undefined;
    if (!k || head === undefined) {
      out.push(d);
      continue;
    }
    const info: StackInfo = { key: k, count: groups.get(k)!.length, expanded: expanded.has(k), head: head === d.id };
    if (info.head || info.expanded) out.push({ ...d, stack: info });
  }
  return out;
}
