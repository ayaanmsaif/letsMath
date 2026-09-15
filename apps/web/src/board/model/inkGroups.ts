import { boxesIntersect, shapeBounds, unionBoxes } from "./geometry";
import type { Box, InkShape, Shape } from "./types";

export interface InkGroup {
  /** "g" + the lowest stroke number in the group, so ids stay stable as strokes are added. */
  id: string;
  strokeIds: string[];
  box: Box;
  lastAt: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Cluster the student's pen strokes into groups the tutor can refer to, roughly
 * one line of working each. Strokes join when their boxes, padded generously
 * sideways and only slightly up and down, overlap: letters and words on a line
 * merge, separate lines don't.
 */
export function groupInk(shapes: Shape[]): InkGroup[] {
  const strokes = shapes.filter(
    (s): s is InkShape => s.type === "ink" && s.tool === "pen" && s.author === "student",
  );
  if (strokes.length === 0) return [];

  const boxes = strokes.map(shapeBounds);
  // Typical writing height sets the padding, so small and large handwriting both group sensibly.
  const letter = Math.min(80, Math.max(12, median(boxes.map((b) => b.maxY - b.minY))));
  const padded = boxes.map((b) => ({
    minX: b.minX - letter * 0.45,
    maxX: b.maxX + letter * 0.45,
    minY: b.minY - letter * 0.1,
    maxY: b.maxY + letter * 0.1,
  }));

  const parent = strokes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      if (boxesIntersect(padded[i], padded[j])) parent[find(i)] = find(j);
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
