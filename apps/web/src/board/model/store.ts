import { create } from "zustand";
import { translateShape } from "./geometry";
import {
  addPatch,
  applyPatch,
  emptyHistory,
  pushEntry,
  redo,
  removePatch,
  undo,
  type History,
  type Patch,
  type Shapes,
} from "./history";
import { HIGHLIGHTER_COLORS, INK_COLORS } from "./style";
import type { Author, Camera, Shape, StrokeSize } from "./types";

export type ToolId =
  | "select"
  | "hand"
  | "pen"
  | "highlighter"
  | "eraser"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "polygon"
  | "text"
  | "equation"
  | "laser";

export type Background = "blank" | "dots" | "grid" | "lined";

/** The persisted part of the board. */
export interface SavedBoard {
  version: 1;
  shapes: Shapes;
  nextNum: number;
  nextZ: number;
  camera: Camera;
  background: Background;
}

interface BoardState {
  shapes: Shapes;
  nextNum: number;
  nextZ: number;
  history: History;
  camera: Camera;
  background: Background;

  tool: ToolId;
  inkColor: string;
  highlighterColor: string;
  size: StrokeSize;

  selection: string[];
  /** Shapes the eraser has touched in the current drag; hidden until the erase commits. */
  erasing: Record<string, true>;
  tutorVisible: boolean;

  setTool: (tool: ToolId) => void;
  setCamera: (camera: Camera) => void;
  setBackground: (background: Background) => void;
  setColor: (color: string) => void;
  setSize: (size: StrokeSize) => void;
  setSelection: (ids: string[]) => void;
  setErasing: (ids: Record<string, true>) => void;
  toggleTutorVisible: () => void;

  /** Reserve an id, number, and stacking order for a new shape. */
  allocate: () => Pick<Shape, "id" | "num" | "z" | "createdAt">;
  /** Apply a patch and record it as one undo step; a shared mergeKey joins steps. */
  commit: (patch: Patch, label: string, author?: Author, mergeKey?: string) => void;
  /** Change shapes without recording history (live drags); pair with record(). */
  setShapesTransient: (shapes: Shape[]) => void;
  /** Record a patch whose changes are already applied. */
  record: (patch: Patch, label: string, author?: Author) => void;
  undo: () => void;
  redo: () => void;

  deleteSelection: () => void;
  duplicateSelection: () => void;
  selectAll: () => void;
  clearBoard: () => void;
  load: (saved: SavedBoard) => void;
}

export const useBoard = create<BoardState>()((set, get) => ({
  shapes: {},
  nextNum: 1,
  nextZ: 1,
  history: emptyHistory(),
  camera: { x: 0, y: 0, z: 1 },
  background: "dots",

  tool: "pen",
  inkColor: INK_COLORS[0],
  highlighterColor: HIGHLIGHTER_COLORS[0],
  size: "m",

  selection: [],
  erasing: {},
  tutorVisible: true,

  setTool: (tool) => set({ tool, selection: tool === "select" ? get().selection : [] }),
  setCamera: (camera) => set({ camera }),
  setBackground: (background) => set({ background }),
  setColor: (color) => (get().tool === "highlighter" ? set({ highlighterColor: color }) : set({ inkColor: color })),
  setSize: (size) => set({ size }),
  setSelection: (selection) => set({ selection }),
  setErasing: (erasing) => set({ erasing }),
  toggleTutorVisible: () => set({ tutorVisible: !get().tutorVisible }),

  allocate: () => {
    const { nextNum, nextZ } = get();
    set({ nextNum: nextNum + 1, nextZ: nextZ + 1 });
    return { id: `s${nextNum}`, num: nextNum, z: nextZ, createdAt: Date.now() };
  },

  commit: (patch, label, author = "student", mergeKey) => {
    const { shapes, history } = get();
    set({
      shapes: applyPatch(shapes, patch, "forward"),
      history: pushEntry(history, { patch, label, author, mergeKey }),
    });
  },

  setShapesTransient: (changed) => {
    const shapes = { ...get().shapes };
    for (const s of changed) shapes[s.id] = s;
    set({ shapes });
  },

  record: (patch, label, author = "student") => set({ history: pushEntry(get().history, { patch, label, author }) }),

  undo: () => {
    const result = undo(get().shapes, get().history);
    if (result) set({ ...result, selection: get().selection.filter((id) => result.shapes[id]) });
  },

  redo: () => {
    const result = redo(get().shapes, get().history);
    if (result) set({ ...result, selection: get().selection.filter((id) => result.shapes[id]) });
  },

  deleteSelection: () => {
    const { shapes, selection, commit } = get();
    const doomed = selection.map((id) => shapes[id]).filter(Boolean);
    if (doomed.length === 0) return;
    commit(removePatch(doomed), "delete");
    set({ selection: [] });
  },

  duplicateSelection: () => {
    const { shapes, selection, allocate, commit } = get();
    const copies = selection
      .map((id) => shapes[id])
      .filter(Boolean)
      .sort((a, b) => a.z - b.z)
      .map((s) => ({ ...translateShape(s, 16, 16), ...allocate() }) as Shape);
    if (copies.length === 0) return;
    commit(addPatch(copies), "duplicate");
    set({ selection: copies.map((s) => s.id) });
  },

  selectAll: () => set({ tool: "select", selection: Object.keys(get().shapes) }),

  clearBoard: () => {
    const all = Object.values(get().shapes);
    if (all.length === 0) return;
    get().commit(removePatch(all), "clear board");
    set({ selection: [] });
  },

  load: (saved) =>
    set({
      shapes: saved.shapes,
      nextNum: saved.nextNum,
      nextZ: saved.nextZ,
      camera: saved.camera,
      background: saved.background,
      history: emptyHistory(),
      selection: [],
    }),
}));

/** Shapes sorted by stacking order. Memoised on the shapes object identity. */
let sortedCache: { shapes: Shapes; sorted: Shape[] } | null = null;
export function sortedShapes(shapes: Shapes): Shape[] {
  if (sortedCache?.shapes !== shapes) {
    sortedCache = { shapes, sorted: Object.values(shapes).sort((a, b) => a.z - b.z) };
  }
  return sortedCache.sorted;
}
