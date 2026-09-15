import { create } from "zustand";
import type { Box, InkPoint, Shape, StrokeSize, Vec } from "./types";

export interface InkDraft {
  tool: "pen" | "highlighter";
  color: string;
  size: StrokeSize;
  simulatePressure: boolean;
  points: InkPoint[];
  predicted: InkPoint[];
}

export interface TextDraft {
  /** Existing text shape being edited, or null for a new one. */
  id: string | null;
  x: number;
  y: number;
  value: string;
  fontSize: number;
  color: string;
}

/**
 * Short-lived UI state for gestures in progress: live strokes, shape
 * previews, marquee, laser trail. Kept out of the board store so updating it
 * every frame never re-renders the finished shapes.
 */
interface DraftState {
  ink: InkDraft | null;
  shape: Shape | null;
  marquee: Box | null;
  eraser: Vec | null;
  /** Laser trail points: world x, y, and timestamp (ms). */
  laser: [number, number, number][];
  text: TextDraft | null;
  /** Where the equation editor is open, in world units. */
  equation: { x: number; y: number; id: string | null; latex: string } | null;
  /** Cursor override from the active tool's hover state (e.g. resize arrows). */
  cursor: string | null;
  set: (partial: Partial<Omit<DraftState, "set">>) => void;
}

export const useDraft = create<DraftState>()((set) => ({
  cursor: null,
  ink: null,
  shape: null,
  marquee: null,
  eraser: null,
  laser: [],
  text: null,
  equation: null,
  set: (partial) => set(partial),
}));
