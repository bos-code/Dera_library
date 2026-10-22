import { searchDocuments } from "@/db/documents";
import { getInboxCount } from "@/db/inbox";
import { getReadingSummary } from "@/db/reading";
import { plural } from "@/lib/format";
import { docTitle } from "@/lib/title";
import { isScannerAvailable, scanner } from "@/native/scanner";

let timer: ReturnType<typeof setTimeout> | null = null;

/** Keeps the app-icon shortcuts and the home-screen widget current. Debounced: call it freely. */
export function refreshHomeScreen(): void {
  if (!isScannerAvailable) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void update(), 2000);
}

async function update(): Promise<void> {
  try {
    const [summary, recent, inbox] = await Promise.all([
      getReadingSummary(),
      searchDocuments({ view: "recent", limit: 3 }),
      getInboxCount(),
    ]);
    const minutes = Math.round(summary.todayMs / 60_000);
    const goal = Math.round(summary.goalMs / 60_000);
    scanner().updateWidget(
      JSON.stringify({
        headline: `Today ${minutes}/${goal} min${summary.current ? ` · ${plural(summary.current, "day")} streak` : ""}`,
        docs: recent.map((d) => ({ id: d.id, title: docTitle(d) })),
      }),
    );
    const last = recent[0];
    scanner().setShortcuts([
      ...(last
        ? [
            {
              id: "continue",
              label: "Continue",
              longLabel: `Continue: ${docTitle(last)}`,
              url: `deralibrary:///document/${last.id}`,
              icon: "doc" as const,
            },
          ]
        : []),
      { id: "search", label: "Search", longLabel: "Search your library", url: "deralibrary:///?search=1", icon: "search" },
      { id: "reading", label: "Reading", longLabel: "Reading and streak", url: "deralibrary:///reading", icon: "book" },
      ...(inbox
        ? [
            {
              id: "inbox",
              label: "Inbox",
              longLabel: `Inbox (${inbox} new)`,
              url: "deralibrary:///inbox",
              icon: "inbox" as const,
            },
          ]
        : []),
    ]);
  } catch {
    // Home-screen extras are best-effort.
  }
}
