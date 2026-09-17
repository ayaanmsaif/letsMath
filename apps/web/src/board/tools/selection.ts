import { hitTestShape, shapeBounds, unionBoxes } from "../model/geometry";
import { sortedShapes, useBoard } from "../model/store";
import type { Box, Shape, Vec } from "../model/types";

export type Handle = "nw" | "ne" | "sw" | "se";
export const HANDLES: Handle[] = ["nw", "ne", "sw", "se"];

/** Half the handle hit area in screen pixels (44px touch target). */
export const HANDLE_HIT_PX = 22;

/** Which drawing a shape came from, or null for the student's own work. */
const drawingOf = (shape: Shape) => (shape.author === "tutor" ? shape.id.split(/[.#]/)[0] : null);

/**
 * The ids that belong to the same drawings as the ones given.
 *
 * A tutor drawing is made of many shapes — a graph can be eighty — and every
 * part's id carries the drawing it came from: a1.circle_O and a1.xaxis, or a1#2
 * for an annotation's second stroke. Without this, clicking a circle would drag
 * it out of its own axes. The student's own ink (s1, s2, …) belongs to nobody
 * and is always selected on its own.
 */
export function withGroups(ids: string[], shapes: Record<string, Shape>): string[] {
  const drawings = new Set(
    ids
      .map((id) => shapes[id])
      .filter(Boolean)
      .map(drawingOf)
      .filter((key): key is string => key !== null),
  );
  if (drawings.size === 0) return ids;

  const all = new Set(ids);
  for (const shape of Object.values(shapes)) {
    const key = drawingOf(shape);
    if (key !== null && drawings.has(key)) all.add(shape.id);
  }
  return [...all];
}

export function selectionBounds(): Box | null {
  const { shapes, selection } = useBoard.getState();
  return unionBoxes(
    selection
      .map((id) => shapes[id])
      .filter(Boolean)
      .map(shapeBounds),
  );
}

export function handlePosition(box: Box, handle: Handle): Vec {
  return [handle[1] === "w" ? box.minX : box.maxX, handle[0] === "n" ? box.minY : box.maxY];
}

/** The top-most shape under a world point. */
export function topShapeAt(p: Vec, tolerancePx = 6): Shape | null {
  const { shapes, camera } = useBoard.getState();
  const list = sortedShapes(shapes);
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitTestShape(list[i], p, tolerancePx / camera.z)) return list[i];
  }
  return null;
}
