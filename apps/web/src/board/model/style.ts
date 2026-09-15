import type { Shape, StrokeSize } from "./types";

export const INK_COLORS = ["#1c1917", "#2563eb", "#dc2626", "#16a34a", "#ea580c", "#0d9488"];
export const HIGHLIGHTER_COLORS = ["#facc15", "#4ade80", "#f472b6", "#60a5fa", "#fb923c", "#c084fc"];

const PEN_WIDTH: Record<StrokeSize, number> = { s: 3, m: 5, l: 9 };
const HIGHLIGHTER_WIDTH: Record<StrokeSize, number> = { s: 14, m: 22, l: 34 };
const LINE_WIDTH: Record<StrokeSize, number> = { s: 1.5, m: 2.5, l: 4 };
export const FONT_SIZE: Record<StrokeSize, number> = { s: 18, m: 26, l: 40 };

export const HIGHLIGHTER_OPACITY = 0.4;

/** Stroke width of a shape in world units. */
export function strokeWidth(shape: Shape): number {
  if (shape.type === "ink") {
    return (shape.tool === "highlighter" ? HIGHLIGHTER_WIDTH : PEN_WIDTH)[shape.size];
  }
  return LINE_WIDTH[shape.size];
}

export function inkWidth(tool: "pen" | "highlighter", size: StrokeSize): number {
  return (tool === "highlighter" ? HIGHLIGHTER_WIDTH : PEN_WIDTH)[size];
}

export function lineWidth(size: StrokeSize): number {
  return LINE_WIDTH[size];
}
