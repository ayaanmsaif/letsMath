import type { Author, Shape } from "./types";

export type Shapes = Record<string, Shape>;

/** Per shape id: [before, after]. null means the shape doesn't exist on that side. */
export type Patch = Record<string, [before: Shape | null, after: Shape | null]>;

export interface HistoryEntry {
  patch: Patch;
  label: string;
  author: Author;
  /**
   * Entries sharing a key merge into one step, so a turn's annotations undo
   * together even though they're drawn one at a time.
   */
  mergeKey?: string;
}

export interface History {
  undo: HistoryEntry[];
  redo: HistoryEntry[];
}

const HISTORY_LIMIT = 300;

export const emptyHistory = (): History => ({ undo: [], redo: [] });

export function applyPatch(shapes: Shapes, patch: Patch, direction: "forward" | "backward"): Shapes {
  const next = { ...shapes };
  for (const [id, [before, after]] of Object.entries(patch)) {
    const target = direction === "forward" ? after : before;
    if (target) next[id] = target;
    else delete next[id];
  }
  return next;
}

export const isEmptyPatch = (patch: Patch): boolean => Object.keys(patch).length === 0;

export function addPatch(shapes: Shape[]): Patch {
  return Object.fromEntries(shapes.map((s) => [s.id, [null, s]]));
}

export function removePatch(shapes: Shape[]): Patch {
  return Object.fromEntries(shapes.map((s) => [s.id, [s, null]]));
}

export function updatePatch(pairs: [before: Shape, after: Shape][]): Patch {
  return Object.fromEntries(pairs.filter(([b, a]) => b !== a).map(([b, a]) => [a.id, [b, a]]));
}

export function pushEntry(history: History, entry: HistoryEntry): History {
  if (isEmptyPatch(entry.patch)) return history;

  const previous = history.undo.at(-1);
  if (entry.mergeKey && previous?.mergeKey === entry.mergeKey) {
    // Keep the oldest "before" for each shape so undo returns to the start of the batch.
    const merged: Patch = { ...entry.patch, ...previous.patch };
    for (const [id, [, after]] of Object.entries(entry.patch)) {
      merged[id] = [previous.patch[id]?.[0] ?? null, after];
    }
    return { undo: [...history.undo.slice(0, -1), { ...previous, patch: merged }], redo: [] };
  }

  return { undo: [...history.undo, entry].slice(-HISTORY_LIMIT), redo: [] };
}

/** Returns the new shapes and history, or null when there's nothing to undo. */
export function undo(shapes: Shapes, history: History): { shapes: Shapes; history: History } | null {
  const entry = history.undo.at(-1);
  if (!entry) return null;
  return {
    shapes: applyPatch(shapes, entry.patch, "backward"),
    history: { undo: history.undo.slice(0, -1), redo: [...history.redo, entry] },
  };
}

export function redo(shapes: Shapes, history: History): { shapes: Shapes; history: History } | null {
  const entry = history.redo.at(-1);
  if (!entry) return null;
  return {
    shapes: applyPatch(shapes, entry.patch, "forward"),
    history: { undo: [...history.undo, entry], redo: history.redo.slice(0, -1) },
  };
}
