import { boxesIntersect, expandBox, shapeBounds, unionBoxes } from "./geometry";
import type { Box, InkPoint, InkShape, Shape } from "./types";

export interface InkGroup {
  /** "g" + the lowest stroke number in the group, so ids stay stable as strokes are added. */
  id: string;
  strokeIds: string[];
  box: Box;
  lastAt: number;
}

/** Writing height of a stroke, used to judge what counts as "close". */
function strokeSize(box: Box): number {
  return Math.min(80, Math.max(8, box.maxY - box.minY));
}

/**
 * Vertical distance counts for more than horizontal: letters on a line sit
 * closer together sideways than separate lines of working do vertically.
 */
const VERTICAL_TIGHTNESS = 0.45;

/**
 * Closest approach between two strokes' ink, with vertical distance weighted.
 * Sampled, and only attempted for strokes already near each other, so this
 * stays cheap on a full board.
 */
function inkGap(a: InkPoint[], b: InkPoint[]): number {
  const stepFor = (points: InkPoint[]) => Math.max(1, Math.floor(points.length / 24));
  const stepA = stepFor(a);
  const stepB = stepFor(b);
  let best = Infinity;

  for (let i = 0; i < a.length; i += stepA) {
    for (let j = 0; j < b.length; j += stepB) {
      const dx = a[i][0] - b[j][0];
      const dy = (a[i][1] - b[j][1]) / VERTICAL_TIGHTNESS;
      best = Math.min(best, Math.hypot(dx, dy));
    }
  }
  return best;
}

/** How far apart the two strokes' ends are: strokes of one figure meet at corners. */
function endpointGap(a: InkPoint[], b: InkPoint[]): number {
  const ends = (points: InkPoint[]) => [points[0], points[points.length - 1]];
  let best = Infinity;
  for (const p of ends(a)) {
    for (const q of ends(b)) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
  }
  return best;
}

/**
 * Cluster the student's pen strokes into groups the tutor can refer to, roughly
 * one line of working or one figure each.
 *
 * Strokes join when their *ink* comes close, measured against the smaller of
 * the two. Boxes alone won't do: a large figure's box swallows anything written
 * inside it, which would leave the tutor unable to point at a label on its own.
 */
export function groupInk(shapes: Shape[]): InkGroup[] {
  const strokes = shapes.filter(
    (s): s is InkShape => s.type === "ink" && s.tool === "pen" && s.author === "student",
  );
  if (strokes.length === 0) return [];

  const boxes = strokes.map(shapeBounds);
  const sizes = boxes.map(strokeSize);
  /** Overall reach of a stroke, for telling a label apart from what it labels. */
  const extents = boxes.map((b) => Math.hypot(b.maxX - b.minX, b.maxY - b.minY));

  const parent = strokes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      if (find(i) === find(j)) continue;
      const smaller = Math.min(sizes[i], sizes[j]);
      /** Ends that meet: one figure drawn in several strokes. */
      const connects = Math.max(12, smaller * 0.6);
      /** Strokes side by side: writing on the same line. */
      const alongside = Math.max(12, smaller * 0.9);
      if (!boxesIntersect(expandBox(boxes[i], alongside), boxes[j])) continue;

      // A figure's strokes meet at their ends. A label merely sits near a line,
      // so proximity alone would swallow it: it must also be of similar size to
      // count as writing alongside.
      const ratio = Math.max(extents[i], extents[j]) / Math.max(1, Math.min(extents[i], extents[j]));
      const joins =
        endpointGap(strokes[i].points, strokes[j].points) <= connects ||
        (ratio <= 3 && inkGap(strokes[i].points, strokes[j].points) <= alongside);

      if (joins) parent[find(i)] = find(j);
    }
  }

  const members = new Map<number, number[]>();
  strokes.forEach((_, i) => {
    const root = find(i);
    members.set(root, [...(members.get(root) ?? []), i]);
  });

  return [...members.values()]
    .map((indices) => {
      const group = indices.map((i) => strokes[i]);
      return {
        id: `g${Math.min(...group.map((s) => s.num))}`,
        strokeIds: group.map((s) => s.id),
        box: unionBoxes(indices.map((i) => boxes[i]))!,
        lastAt: Math.max(...group.map((s) => s.createdAt)),
      };
    })
    .sort((a, b) => a.box.minY - b.box.minY || a.box.minX - b.box.minX);
}
