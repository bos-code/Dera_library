import { notifyLibraryChanged, setState } from "@/state/store";

let nextId = 1;

export function showToast(message: string, action?: { label: string; run: () => void | Promise<void> }): void {
  setState({ toast: { id: nextId++, message, actionLabel: action?.label, action: action?.run } });
}

/** Shows "message · Undo"; undo runs the restore and refreshes the library. */
export function showUndo(message: string, undo: () => Promise<void>): void {
  showToast(message, {
    label: "Undo",
    run: async () => {
      await undo();
      notifyLibraryChanged();
    },
  });
}

export function hideToast(): void {
  setState({ toast: null });
}
