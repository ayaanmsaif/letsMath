import { getStroke, type StrokeOptions } from "perfect-freehand";
import { inkWidth } from "../model/style";
import type { InkPoint, InkShape, StrokeSize } from "../model/types";

function strokeOptions(
  tool: "pen" | "highlighter",
  size: StrokeSize,
  simulatePressure: boolean,
  last: boolean,
): StrokeOptions {
  const highlighter = tool === "highlighter";
  return {
    size: inkWidth(tool, size),
    thinning: highlighter ? 0 : simulatePressure ? 0.5 : 0.65,
    smoothing: 0.5,
    streamline: highlighter ? 0.6 : 0.45,
    simulatePressure: highlighter ? false : simulatePressure,
    last,
  };
}

const average = (a: number, b: number) => (a + b) / 2;

/** Outline polygon → smooth closed SVG path (from the perfect-freehand README). */
function pathFromOutline(points: number[][]): string {
  const len = points.length;
  if (len === 0) return "";
  if (len < 4) return `M${points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" L")} Z`;

  let a = points[0];
  let b = points[1];
  const c = points[2];
  let d =
    `M${a[0].toFixed(2)},${a[1].toFixed(2)} ` +
    `Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(b[1], c[1]).toFixed(2)} T`;
  for (let i = 2; i < len - 1; i++) {
    a = points[i];
    b = points[i + 1];
    d += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(2)} `;
  }
  return `${d}Z`;
}

function dotPath([x, y]: InkPoint, r: number): string {
  return `M${x - r},${y} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`;
}

export function inkPathFor(
  points: InkPoint[],
  tool: "pen" | "highlighter",
  size: StrokeSize,
  simulatePressure: boolean,
  last: boolean,
): string {
  if (points.length === 0) return "";
  if (points.length === 1) return dotPath(points[0], inkWidth(tool, size) / 2);
  return pathFromOutline(getStroke(points, strokeOptions(tool, size, simulatePressure, last)));
}

// Shapes are immutable, so a finished stroke's outline is computed once.
const cache = new WeakMap<InkShape, string>();

export function inkPath(shape: InkShape): string {
  let d = cache.get(shape);
  if (d === undefined) {
    d = inkPathFor(shape.points, shape.tool, shape.size, shape.simulatePressure, true);
    cache.set(shape, d);
  }
  return d;
}
