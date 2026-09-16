// Corner finder for hand-drawn figures (PLAN.md §3, item 5).
//
// Claude decides what a shape means from the snapshot; this only supplies exact
// positions, so annotations can snap to real corners and sides. Student ink is
// never modified: this reads the strokes and reports what it found.

export type Point = [number, number];

export interface RecognizedSide {
  /** "s1", "s2", … in corner order. */
  id: string;
  a: Point;
  b: Point;
}

export interface Recognition {
  kind: "triangle" | "quadrilateral" | "polygon" | "circle" | "ellipse" | "line" | "none";
  closed: boolean;
  /** Corners in order, starting from the one nearest the top-left. Empty for curves. */
  corners: Point[];
  sides: RecognizedSide[];
  /** Centre and radii for circles and ellipses. */
  centre?: Point;
  radii?: Point;
  /** How closely the points fit that ellipse (0 is perfect). */
  fitError?: number;
}

const NONE: Recognition = { kind: "none", closed: false, corners: [], sides: [] };

/** Simplified strokes keep this fraction of the figure's size as detail. */
const SIMPLIFY_RATIO = 0.02;
/** Ends this close (relative to size) count as meeting. */
const CLOSE_RATIO = 0.15;
/** Separate strokes join up if their ends are at least this close. */
const JOIN_RATIO = 0.25;
/** A direction change this sharp is a corner. */
const MIN_TURN_DEG = 35;
/** Corners closer together than this (relative to size) are the same corner. */
const MERGE_RATIO = 0.08;
/** Below this ellipse fit error, the figure is a curve rather than a polygon. */
const CURVE_FIT = 0.08;

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function diagonalOf(points: Point[]): number {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** Ramer–Douglas–Peucker. */
function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return [...points];
  const first = points[0];
  const last = points[points.length - 1];
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i], first, last);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= epsilon) return [first, last];
  return [...simplify(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplify(points.slice(index), epsilon)];
}

/** Join separate strokes end to end by their nearest endpoints, longest first. */
function chain(strokes: Point[][], gap: number): Point[] {
  const remaining = strokes.filter((s) => s.length > 1).map((s) => [...s]);
  if (remaining.length === 0) return strokes.flat();

  const lengths = remaining.map((s) => s.reduce((sum, p, i) => (i === 0 ? 0 : sum + dist(s[i - 1], p)), 0));
  let joined = remaining.splice(lengths.indexOf(Math.max(...lengths)), 1)[0];

  while (remaining.length > 0) {
    let best = { index: -1, distance: Infinity, reverse: false, atEnd: true };
    const head = joined[0];
    const tail = joined[joined.length - 1];
    remaining.forEach((stroke, index) => {
      const start = stroke[0];
      const end = stroke[stroke.length - 1];
      const options = [
        { distance: dist(tail, start), reverse: false, atEnd: true },
        { distance: dist(tail, end), reverse: true, atEnd: true },
        { distance: dist(head, end), reverse: false, atEnd: false },
        { distance: dist(head, start), reverse: true, atEnd: false },
      ];
      for (const option of options) {
        if (option.distance < best.distance) best = { index, ...option };
      }
    });
    if (best.distance > gap) break;
    const [stroke] = remaining.splice(best.index, 1);
    const piece = best.reverse ? [...stroke].reverse() : stroke;
    joined = best.atEnd ? [...joined, ...piece] : [...piece, ...joined];
  }
  return joined;
}

function turnDegrees(prev: Point, at: Point, next: Point): number {
  const ax = at[0] - prev[0];
  const ay = at[1] - prev[1];
  const bx = next[0] - at[0];
  const by = next[1] - at[1];
  if ((ax === 0 && ay === 0) || (bx === 0 && by === 0)) return 0;
  return Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) * (180 / Math.PI);
}

function findCorners(outline: Point[], closed: boolean, mergeDistance: number): Point[] {
  const pts = closed ? outline.slice(0, -1) : outline;
  const corners: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (!closed && (i === 0 || i === pts.length - 1)) continue;
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const next = pts[(i + 1) % pts.length];
    if (turnDegrees(prev, pts[i], next) >= MIN_TURN_DEG) corners.push(pts[i]);
  }
  // Two detections of the same corner (a wobble) collapse into one.
  return corners.filter((corner, i) => corners.every((other, j) => j >= i || dist(corner, other) > mergeDistance));
}

/** How far the points sit from the ellipse that fills their bounding box (0 is a perfect fit). */
function ellipseFit(points: Point[]): { centre: Point; radii: Point; error: number } {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const centre: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const radii: Point = [
    Math.max((Math.max(...xs) - Math.min(...xs)) / 2, 1e-6),
    Math.max((Math.max(...ys) - Math.min(...ys)) / 2, 1e-6),
  ];
  const squared = points.reduce((sum, [x, y]) => {
    const r = Math.hypot((x - centre[0]) / radii[0], (y - centre[1]) / radii[1]);
    return sum + (r - 1) ** 2;
  }, 0);
  return { centre, radii, error: Math.sqrt(squared / points.length) };
}

/** Corner order starting nearest the top-left, so part ids stay stable between looks. */
function startFromTopLeft(corners: Point[]): Point[] {
  if (corners.length < 3) return corners;
  const scores = corners.map(([x, y]) => x + y);
  const start = scores.indexOf(Math.min(...scores));
  return [...corners.slice(start), ...corners.slice(0, start)];
}

function sidesOf(corners: Point[], closed: boolean): RecognizedSide[] {
  const sides: RecognizedSide[] = [];
  const count = closed ? corners.length : corners.length - 1;
  for (let i = 0; i < count; i++) {
    sides.push({ id: `s${i + 1}`, a: corners[i], b: corners[(i + 1) % corners.length] });
  }
  return sides;
}

/**
 * Work out what a group of hand-drawn strokes looks like. Pass the points of
 * each stroke in the order they were drawn.
 */
export function recognizeShape(strokes: Point[][]): Recognition {
  const usable = strokes.filter((s) => s.length > 1);
  if (usable.length === 0) return NONE;

  const all = usable.flat();
  const diagonal = diagonalOf(all);
  if (diagonal < 1) return NONE;

  const outline = chain(usable, diagonal * JOIN_RATIO);
  if (outline.length < 3) return { ...NONE, kind: "line", corners: [outline[0], outline[outline.length - 1]] };

  const closed = dist(outline[0], outline[outline.length - 1]) <= diagonal * CLOSE_RATIO;
  const simplified = simplify(closed ? [...outline, outline[0]] : outline, diagonal * SIMPLIFY_RATIO);

  if (closed) {
    const fit = ellipseFit(outline);
    if (fit.error < CURVE_FIT) {
      const round = Math.abs(fit.radii[0] - fit.radii[1]) / Math.max(fit.radii[0], fit.radii[1]) < 0.15;
      return {
        kind: round ? "circle" : "ellipse",
        closed: true,
        corners: [],
        sides: [],
        centre: fit.centre,
        radii: fit.radii,
        fitError: fit.error,
      };
    }
  }

  const corners = startFromTopLeft(findCorners(simplified, closed, diagonal * MERGE_RATIO));

  if (closed && corners.length >= 3) {
    const kind = corners.length === 3 ? "triangle" : corners.length === 4 ? "quadrilateral" : "polygon";
    return { kind, closed: true, corners, sides: sidesOf(corners, true) };
  }

  if (!closed && corners.length === 0 && simplified.length === 2) {
    const ends: Point[] = [simplified[0], simplified[1]];
    return { kind: "line", closed: false, corners: ends, sides: sidesOf(ends, false) };
  }

  return NONE;
}

/** One line for the board digest, e.g. "looks like a triangle, corners ≈ (200,500) (600,500) (205,222)". */
export function describeRecognition(recognition: Recognition): string | null {
  const point = ([x, y]: Point) => `(${Math.round(x)},${Math.round(y)})`;
  switch (recognition.kind) {
    case "triangle":
    case "quadrilateral":
    case "polygon":
      return `looks like a ${recognition.kind}, corners ≈ ${recognition.corners.map(point).join(" ")}`;
    case "circle":
    case "ellipse":
      return `looks like a ${recognition.kind}, centre ≈ ${point(recognition.centre!)} radii ≈ ${point(recognition.radii!)}`;
    case "line":
      return `looks like a line, ends ≈ ${recognition.corners.map(point).join(" ")}`;
    default:
      return null;
  }
}
