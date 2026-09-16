export type Vec = [number, number];
/** x, y, pressure (0–1) */
export type InkPoint = [number, number, number];

export type Author = "student" | "tutor";
export type StrokeSize = "s" | "m" | "l";

interface ShapeBase {
  id: string;
  /** Short per-board number. The AI digest refers to shapes by it (#12). */
  num: number;
  /** Stacking order; higher draws on top. */
  z: number;
  author: Author;
  color: string;
  size: StrokeSize;
  createdAt: number;
  /** Overrides the width implied by `size`; used by the tutor's annotations. */
  strokeWidth?: number;
  /** Overrides the default opacity; used for highlighter-style tutor marks. */
  opacity?: number;
}

export interface InkShape extends ShapeBase {
  type: "ink";
  tool: "pen" | "highlighter";
  points: InkPoint[];
  /** Mouse and finger input has no real pressure, so perfect-freehand simulates it. */
  simulatePressure: boolean;
}

export interface LineShape extends ShapeBase {
  type: "line";
  a: Vec;
  b: Vec;
  arrow: boolean;
}

export interface RectShape extends ShapeBase {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EllipseShape extends ShapeBase {
  type: "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PolygonShape extends ShapeBase {
  type: "polygon";
  points: Vec[];
  closed: boolean;
}

export interface TextShape extends ShapeBase {
  type: "text";
  x: number;
  y: number;
  /** Measured when the text is committed, so geometry stays DOM-free. */
  w: number;
  h: number;
  text: string;
  fontSize: number;
}

export interface EquationShape extends ShapeBase {
  type: "equation";
  x: number;
  y: number;
  w: number;
  h: number;
  latex: string;
  /**
   * Inner markup of the self-contained MathJax SVG, cached so rendering and
   * snapshots never need MathJax. Drawn into (x, y, w, h) through viewBox.
   */
  svg: string;
  viewBox: string;
}

export type Shape =
  | InkShape
  | LineShape
  | RectShape
  | EllipseShape
  | PolygonShape
  | TextShape
  | EquationShape;

export type ShapeType = Shape["type"];

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** World → screen: screen = world * z + (x, y). */
export interface Camera {
  x: number;
  y: number;
  z: number;
}
