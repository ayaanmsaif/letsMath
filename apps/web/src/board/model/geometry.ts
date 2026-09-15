import { strokeWidth } from "./style";
import type { Box, Shape, Vec } from "./types";

// ---------- vectors ----------

export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s];
export const dist = (a: Vec, b: Vec): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function cross(o: Vec, a: Vec, b: Vec): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Minimum distance between segments ab and cd (0 when they cross). */
export function segmentsDistance(a: Vec, b: Vec, c: Vec, d: Vec): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(distToSegment(a, c, d), distToSegment(b, c, d), distToSegment(c, a, b), distToSegment(d, a, b));
}

/** Snap b so the angle of ab is a multiple of stepDeg. */
export function snapAngle(a: Vec, b: Vec, stepDeg = 15): Vec {
  const len = dist(a, b);
  const step = (stepDeg * Math.PI) / 180;
  const angle = Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) / step) * step;
  return [a[0] + Math.cos(angle) * len, a[1] + Math.sin(angle) * len];
}

export function ellipsePoints(x: number, y: number, w: number, h: number, n = 48): Vec[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [cx + (Math.cos(t) * w) / 2, cy + (Math.sin(t) * h) / 2] as Vec;
  });
}

// ---------- boxes ----------

export function boxFromPoints(points: readonly (readonly number[])[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

/** Normalised box from two corners (in any order). */
export function boxFromCorners(a: Vec, b: Vec): Box {
  return {
    minX: Math.min(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxX: Math.max(a[0], b[0]),
    maxY: Math.max(a[1], b[1]),
  };
}

export const expandBox = (b: Box, r: number): Box => ({
  minX: b.minX - r,
  minY: b.minY - r,
  maxX: b.maxX + r,
  maxY: b.maxY + r,
});

export const boxesIntersect = (a: Box, b: Box): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

export const boxContains = (b: Box, p: Vec): boolean =>
  p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY;

export function unionBoxes(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  return boxes.reduce((u, b) => ({
    minX: Math.min(u.minX, b.minX),
    minY: Math.min(u.minY, b.minY),
    maxX: Math.max(u.maxX, b.maxX),
    maxY: Math.max(u.maxY, b.maxY),
  }));
}

// ---------- shapes ----------

function outline(shape: Shape): Vec[] {
  switch (shape.type) {
    case "ink":
      return shape.points.map((p) => [p[0], p[1]]);
    case "line":
      return [shape.a, shape.b];
    case "rect": {
      const { x, y, w, h } = shape;
      return [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    }
    case "ellipse": {
      const pts = ellipsePoints(shape.x, shape.y, shape.w, shape.h);
      return [...pts, pts[0]];
    }
    case "polygon":
      return shape.closed && shape.points.length > 2 ? [...shape.points, shape.points[0]] : shape.points;
    case "text":
    case "equation":
      return [];
  }
}

export function shapeBounds(shape: Shape): Box {
  if (shape.type === "text" || shape.type === "equation") {
    return { minX: shape.x, minY: shape.y, maxX: shape.x + shape.w, maxY: shape.y + shape.h };
  }
  if (shape.type === "rect" || shape.type === "ellipse") {
    return expandBox(
      { minX: shape.x, minY: shape.y, maxX: shape.x + shape.w, maxY: shape.y + shape.h },
      strokeWidth(shape) / 2,
    );
  }
  return expandBox(boxFromPoints(outline(shape)), strokeWidth(shape) / 2);
}

function polylineDistance(p: Vec, pts: Vec[]): number {
  if (pts.length === 1) return dist(p, pts[0]);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
  return best;
}

function pointInPolygon(p: Vec, pts: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Does a click at p (world units, with tolerance) hit the shape? */
export function hitTestShape(shape: Shape, p: Vec, tolerance: number): boolean {
  if (!boxContains(expandBox(shapeBounds(shape), tolerance), p)) return false;
  if (shape.type === "text" || shape.type === "equation") return true;
  const pts = outline(shape);
  if (polylineDistance(p, pts) <= strokeWidth(shape) / 2 + tolerance) return true;
  const closed = shape.type === "rect" || shape.type === "ellipse" || (shape.type === "polygon" && shape.closed);
  return closed && pointInPolygon(p, pts);
}

/** Does an eraser moving from a to b with the given radius touch the shape? */
export function eraserHitsShape(shape: Shape, a: Vec, b: Vec, radius: number): boolean {
  const reach = radius + strokeWidth(shape) / 2;
  if (!boxesIntersect(expandBox(shapeBounds(shape), radius), expandBox(boxFromCorners(a, b), 0))) return false;
  if (shape.type === "text" || shape.type === "equation") return true;
  const pts = outline(shape);
  if (pts.length === 1) return distToSegment(pts[0], a, b) <= reach;
  for (let i = 1; i < pts.length; i++) {
    if (segmentsDistance(a, b, pts[i - 1], pts[i]) <= reach) return true;
  }
  return false;
}

export function translateShape<S extends Shape>(shape: S, dx: number, dy: number): S {
  const move = (v: Vec): Vec => [v[0] + dx, v[1] + dy];
  switch (shape.type) {
    case "ink":
      return { ...shape, points: shape.points.map((p) => [p[0] + dx, p[1] + dy, p[2]]) };
    case "line":
      return { ...shape, a: move(shape.a), b: move(shape.b) };
    case "polygon":
      return { ...shape, points: shape.points.map(move) };
    default:
      return { ...shape, x: (shape as { x: number }).x + dx, y: (shape as { y: number }).y + dy };
  }
}

/** Map a shape from one box to another (used by resize handles). */
export function transformShape<S extends Shape>(shape: S, from: Box, to: Box): S {
  const sx = (to.maxX - to.minX) / Math.max(from.maxX - from.minX, 1e-6);
  const sy = (to.maxY - to.minY) / Math.max(from.maxY - from.minY, 1e-6);
  const map = (v: readonly number[]): Vec => [to.minX + (v[0] - from.minX) * sx, to.minY + (v[1] - from.minY) * sy];
  switch (shape.type) {
    case "ink":
      return { ...shape, points: shape.points.map((p) => [...map(p), p[2]]) };
    case "line":
      return { ...shape, a: map(shape.a), b: map(shape.b) };
    case "polygon":
      return { ...shape, points: shape.points.map(map) };
    case "text":
    case "equation":
      // Text keeps its proportions; it scales uniformly from its top-left corner.
      {
        const s = Math.min(sx, sy);
        const [x, y] = map([shape.x, shape.y]);
        const scaled = { ...shape, x, y, w: shape.w * s, h: shape.h * s };
        return shape.type === "text" ? { ...scaled, fontSize: (shape as { fontSize: number }).fontSize * s } : scaled;
      }
    default: {
      const s = shape as unknown as { x: number; y: number; w: number; h: number };
      const [x, y] = map([s.x, s.y]);
      return { ...shape, x, y, w: s.w * sx, h: s.h * sy };
    }
  }
}
